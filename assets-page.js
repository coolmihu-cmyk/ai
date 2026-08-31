"use strict";

const ASSET_MODEL_NAMES=Object.fromEntries(
  Object.entries(MODEL_CONFIG).map(([key,config])=>[key,config.name])
);
ASSET_MODEL_NAMES.midjourney='Midjourney';
ASSET_MODEL_NAMES.inpaint='GPT · 局部编辑';
const assetsEls={
  grid:$('#assetsGrid'),loading:$('#assetsLoading'),empty:$('#assetsEmpty'),count:$('#assetsCount'),
  generation:$('#assetsGeneration'),generationModel:$('#assetsGenerationModel'),
  generationElapsed:$('#assetsGenerationElapsed'),generationPrompt:$('#assetsGenerationPrompt'),
  generationStatus:$('#assetsGenerationStatus'),generationPercent:$('#assetsGenerationPercent'),
  generationBar:$('#assetsGenerationBar'),generationError:$('#assetsGenerationError'),
  generationVisual:$('#assetsGenerationVisual'),generationReference:$('#assetsGenerationReference'),
  taskCenter:$('#assetsTaskCenter'),taskCount:$('#assetsTaskCount'),taskList:$('#assetsTaskList')
};
let assetItems=[],generationElapsedTimer=null,queueAdvancing=false;
let unavailableAssetIds=new Set(),assetImageObserver=null;
const REFERENCE_LIBRARY_KEY='mihu-reference-library-v1',REFERENCE_LIBRARY_LIMIT=300;
const ASSET_HD_PROMPT='基于提供的参考图像进行严格的超高分辨率4K增强。必须绝对忠实于原始画面部结构、比例和身份特征。在表情、视线、姿势、相机角度、画面构图和透视关系上保持零偏差。服装、头发、皮肤以及背景元素的结构、位置和设计都必须保持不变。恢复细微层级的细节，呈现自然写实效果。增强毛孔、细纹、发丝、睫毛、织物纹理、缝线以及材质边缘，但不得引入任何风格化处理。颜色科学、白平衡以及整体色调关系必须与原图完全一致。光线方向、强度、对比度以及阴影表现必须与原始图像精确匹配，只允许提升清晰度并扩展动态范围。禁止重新布光，禁止改变形体';
const LOCAL_EDIT_MODEL='gpt-image-2-official';

const localEdit={
  layer:$('#localEditLayer'),close:$('#localEditClose'),cancel:$('#localEditCancel'),image:$('#localEditImage'),
  canvas:$('#localEditCanvas'),loading:$('#localEditLoading'),brush:$('#localEditBrush'),eraser:$('#localEditEraser'),
  size:$('#localEditSize'),sizeValue:$('#localEditSizeValue'),undo:$('#localEditUndo'),clear:$('#localEditClear'),
  prompt:$('#localEditPrompt'),promptCount:$('#localEditPromptCount'),error:$('#localEditError'),submit:$('#localEditSubmit'),
  item:null,tool:'brush',strokes:[],activeStroke:null,maskCanvas:document.createElement('canvas'),ratio:'1:1',submitting:false,lastFocus:null
};

function localEditSetError(message=''){localEdit.error.hidden=!message;localEdit.error.textContent=message}
function localEditSetTool(tool){
  localEdit.tool=tool;const brush=tool==='brush';
  localEdit.brush.classList.toggle('is-active',brush);localEdit.brush.setAttribute('aria-pressed',String(brush));
  localEdit.eraser.classList.toggle('is-active',!brush);localEdit.eraser.setAttribute('aria-pressed',String(!brush));
}
function localEditDrawStroke(context,stroke,isMask){
  if(!stroke.points.length)return;
  const scale=localEdit.canvas.width/Math.max(1,localEdit.canvas.getBoundingClientRect().width);
  context.save();context.lineCap='round';context.lineJoin='round';context.lineWidth=stroke.size*scale;
  if(isMask){context.globalCompositeOperation=stroke.tool==='brush'?'destination-out':'source-over';context.strokeStyle='#000';context.fillStyle='#000'}
  else{context.globalCompositeOperation=stroke.tool==='brush'?'source-over':'destination-out';context.strokeStyle='rgba(255,74,74,.68)';context.fillStyle='rgba(255,74,74,.68)'}
  const first=stroke.points[0];context.beginPath();context.arc(first.x,first.y,context.lineWidth/2,0,Math.PI*2);context.fill();
  if(stroke.points.length>1){context.beginPath();context.moveTo(first.x,first.y);for(const point of stroke.points.slice(1))context.lineTo(point.x,point.y);context.stroke()}
  context.restore();
}
function localEditRenderMask(){
  const visible=localEdit.canvas.getContext('2d'),mask=localEdit.maskCanvas.getContext('2d');
  visible.clearRect(0,0,localEdit.canvas.width,localEdit.canvas.height);
  mask.globalCompositeOperation='source-over';mask.fillStyle='#000';mask.fillRect(0,0,localEdit.maskCanvas.width,localEdit.maskCanvas.height);
  for(const stroke of localEdit.strokes){localEditDrawStroke(visible,stroke,false);localEditDrawStroke(mask,stroke,true)}
  localEdit.undo.disabled=!localEdit.strokes.length;localEdit.clear.disabled=!localEdit.strokes.length;
}
function localEditPoint(event){
  const rect=localEdit.canvas.getBoundingClientRect();
  return {x:(event.clientX-rect.left)*localEdit.canvas.width/rect.width,y:(event.clientY-rect.top)*localEdit.canvas.height/rect.height};
}
function localEditClosestRatio(width,height){
  const ratios=['1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','2:1','1:2','3:1','1:3','21:9','9:21'];
  const target=width/height;
  return ratios.reduce((best,ratio)=>{
    const [w,h]=ratio.split(':').map(Number);
    return Math.abs(Math.log(w/h/target))<Math.abs(Math.log(best.value/target))?{name:ratio,value:w/h}:best;
  },{name:'1:1',value:1}).name;
}
function localEditFitCanvas(){
  if(localEdit.canvas.hidden||!localEdit.image.naturalWidth)return;
  const stage=localEdit.image.parentElement.getBoundingClientRect(),ratio=localEdit.image.naturalWidth/localEdit.image.naturalHeight;
  let width=stage.width,height=width/ratio;
  if(height>stage.height){height=stage.height;width=height*ratio}
  localEdit.canvas.style.width=width+'px';localEdit.canvas.style.height=height+'px';
  localEdit.canvas.style.left=(stage.width-width)/2+'px';localEdit.canvas.style.top=(stage.height-height)/2+'px';
}
function closeLocalEdit(){
  if(localEdit.submitting)return;
  localEdit.layer.hidden=true;document.body.classList.remove('local-edit-open');localEdit.item=null;localEdit.image.removeAttribute('src');localEdit.lastFocus?.focus?.();
}
function openLocalEdit(item,trigger){
  if(assetExpiry(item).expired){toast('原图已过期，无法局部编辑');return}
  localEdit.lastFocus=trigger||document.activeElement;localEdit.item=item;localEdit.strokes=[];localEdit.activeStroke=null;
  localEdit.prompt.value='';localEdit.promptCount.textContent='0/3000';localEditSetTool('brush');localEditSetError();
  localEdit.loading.hidden=false;localEdit.canvas.hidden=true;localEdit.submit.disabled=true;localEdit.layer.hidden=false;document.body.classList.add('local-edit-open');
  localEdit.image.onload=()=>{
    const width=localEdit.image.naturalWidth,height=localEdit.image.naturalHeight;
    if(!width||!height){localEditSetError('无法读取原图尺寸。');return}
    localEdit.canvas.width=width;localEdit.canvas.height=height;localEdit.maskCanvas.width=width;localEdit.maskCanvas.height=height;localEdit.ratio=localEditClosestRatio(width,height);
    localEdit.canvas.hidden=false;localEdit.loading.hidden=true;localEdit.submit.disabled=false;localEditFitCanvas();localEditRenderMask();localEdit.canvas.focus();
  };
  localEdit.image.onerror=()=>{localEdit.loading.hidden=true;localEditSetError('原图加载失败，可能已经过期。');localEdit.submit.disabled=true};
  localEdit.image.src=item.url;
}
function canvasToBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('无法生成蒙版图片。')),'image/png'))}
async function uploadLocalEditMask(apiKey,blob){
  const form=new FormData();form.append('file',blob,'mihu-local-edit-mask.png');
  const response=await fetch(APIMART_BASE+'/uploads/images',{method:'POST',headers:{'Authorization':'Bearer '+apiKey,'Accept':'application/json'},body:form});
  const text=await response.text();let data={};try{data=JSON.parse(text)}catch(_){}
  if(!response.ok)throw new Error(data.error?.message||data.message||('蒙版上传失败（HTTP '+response.status+'）'));
  const url=data.url||data.data?.url;if(!url)throw new Error('蒙版上传成功，但接口没有返回图片地址。');
  return url;
}
async function submitLocalEdit(){
  if(localEdit.submitting)return;
  const apiKey=Settings.getKey(),prompt=localEdit.prompt.value.trim();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  if(!localEdit.strokes.some(stroke=>stroke.tool==='brush')){localEditSetError('请先涂抹需要修改的区域。');return}
  if(!prompt){localEditSetError('请填写希望如何修改涂抹区域。');localEdit.prompt.focus();return}
  localEdit.submitting=true;localEdit.submit.disabled=true;localEdit.close.disabled=true;localEdit.cancel.disabled=true;localEdit.submit.textContent='正在上传蒙版';localEditSetError();
  try{
    const maskUrl=await uploadLocalEditMask(apiKey,await canvasToBlob(localEdit.maskCanvas));
    const editPrompt=prompt+'。仅修改蒙版透明区域，未涂抹区域必须保持原图不变。';
    const body={model:LOCAL_EDIT_MODEL,prompt:editPrompt,size:localEdit.ratio,resolution:'1k',quality:'medium',n:1,image_urls:[localEdit.item.url],mask_url:maskUrl};
    const job={id:'local-edit-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),body,endpoint:'/images/generations',prompt,model:'inpaint',settings:{ratio:localEdit.ratio,resolution:'1k'},createdAt:new Date().toISOString(),taskId:null};
    await PendingGeneration.save(job);toast('局部编辑已加入任务列表');
    localEdit.submitting=false;localEdit.submit.textContent='加入任务列表';localEdit.close.disabled=false;localEdit.cancel.disabled=false;closeLocalEdit();runNextPendingGeneration().catch(()=>{});
  }catch(error){
    localEditSetError(error?.message||'局部编辑任务创建失败。');localEdit.submitting=false;localEdit.submit.disabled=false;localEdit.close.disabled=false;localEdit.cancel.disabled=false;localEdit.submit.textContent='加入任务列表';
  }
}

localEdit.canvas.tabIndex=0;
localEdit.canvas.addEventListener('pointerdown',event=>{
  if(localEdit.canvas.hidden)return;event.preventDefault();localEdit.canvas.setPointerCapture(event.pointerId);
  localEdit.activeStroke={tool:localEdit.tool,size:Number(localEdit.size.value),points:[localEditPoint(event)]};localEdit.strokes.push(localEdit.activeStroke);localEditRenderMask();
});
localEdit.canvas.addEventListener('pointermove',event=>{
  if(!localEdit.activeStroke)return;event.preventDefault();localEdit.activeStroke.points.push(localEditPoint(event));
  const segment={...localEdit.activeStroke,points:localEdit.activeStroke.points.slice(-2)};
  localEditDrawStroke(localEdit.canvas.getContext('2d'),segment,false);localEditDrawStroke(localEdit.maskCanvas.getContext('2d'),segment,true);
});
['pointerup','pointercancel'].forEach(type=>localEdit.canvas.addEventListener(type,()=>{localEdit.activeStroke=null}));
localEdit.brush.onclick=()=>localEditSetTool('brush');localEdit.eraser.onclick=()=>localEditSetTool('eraser');
localEdit.size.oninput=()=>localEdit.sizeValue.textContent=localEdit.size.value;localEdit.undo.onclick=()=>{localEdit.strokes.pop();localEditRenderMask()};localEdit.clear.onclick=()=>{localEdit.strokes=[];localEditRenderMask()};
localEdit.prompt.addEventListener('input',()=>{localEdit.promptCount.textContent=localEdit.prompt.value.length+'/3000';localEditSetError()});
localEdit.close.onclick=closeLocalEdit;localEdit.cancel.onclick=closeLocalEdit;localEdit.submit.onclick=submitLocalEdit;
localEdit.layer.addEventListener('pointerdown',event=>{if(event.target===localEdit.layer)closeLocalEdit()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!localEdit.layer.hidden)closeLocalEdit()});
window.addEventListener('resize',localEditFitCanvas,{passive:true});

function sortAssets(items){
  return items.sort((a,b)=>{
    const dateDiff=new Date(b.createdAt||0)-new Date(a.createdAt||0);
    return dateDiff||Number(b.id||0)-Number(a.id||0);
  });
}
function mergeAssets(...groups){
  const merged=new Map();
  for(const group of groups)for(const item of group||[])if(item?.id!=null)merged.set(String(item.id),item);
  return sortAssets([...merged.values()]);
}
async function syncCloudHistory(){
  if(!await CloudHistory.token())return;
  try{
    const cloudRecords=[];
    let cursor=null;
    for(let pageNumber=0;pageNumber<20;pageNumber+=1){
      const page=await CloudHistory.list(cursor);
      cloudRecords.push(...(page.items||[]));
      if(page.complete||!page.cursor)break;
      cursor=page.cursor;
    }
    const deletedIds=new Set(cloudRecords.filter(item=>item?.deleted&&item.id!=null).map(item=>String(item.id)));
    if(deletedIds.size){
      assetItems=assetItems.filter(item=>!deletedIds.has(String(item.id)));
      await Promise.all([...deletedIds].map(id=>History.delete(id)));
    }
    const cloudItems=cloudRecords.filter(item=>!item?.deleted&&(item.type||'image')==='image'&&!deletedIds.has(String(item.id)));
    const cloudIds=new Set([...cloudItems.map(item=>String(item.id)),...deletedIds]);
    assetItems=mergeAssets(assetItems,cloudItems);
    await Promise.all(cloudItems.map(item=>History.save(item)));
    renderAssets();
    const pending=assetItems.filter(item=>!cloudIds.has(String(item.id))&&ImageDelivery.isArchivedUrl(item.url)).slice(0,60);
    for(const item of pending){
      const saved=await CloudHistory.save(item);
      item.historyKey=saved.historyKey||item.historyKey;
      await History.save(item);
    }
  }catch(error){console.warn('云端历史同步失败',error)}
}
function syncAssetsSummary(){
  assetsEls.count.textContent=`${assetItems.length} 张图片`;
  assetsEls.empty.hidden=assetItems.length>0||!assetsEls.generation.hidden;
}
function assetDay(value){
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return {key:'unknown',label:'日期未知'};
  const key=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  const label=new Intl.DateTimeFormat('zh-CN',{
    year:'numeric',month:'long',day:'numeric',weekday:'long'
  }).format(date);
  return {key,label};
}
function assetExpiry(item){
  if(unavailableAssetIds.has(String(item.id)))return {archived:false,expired:true};
  if(item.archived||ImageDelivery.isArchivedUrl(item.url))return {archived:true,expired:false};
  return {archived:false,expired:false};
}
function markAssetUnavailable(id){
  unavailableAssetIds.add(String(id));
  const card=[...assetsEls.grid.querySelectorAll('[data-asset-id]')].find(node=>node.dataset.assetId===String(id));
  if(!card)return;
  card.classList.add('is-expired');
  card.querySelector('.asset-model')?.classList.add('is-warning');
}
function setupAssetImageLoading(){
  assetImageObserver?.disconnect();
  const images=[...assetsEls.grid.querySelectorAll('img[data-src]')];
  const load=image=>{
    if(!image.dataset.src)return;
    image.onload=()=>image.classList.remove('is-loading');
    image.onerror=()=>{
      if(image.dataset.original&&image.src!==image.dataset.original){
        const original=image.dataset.original;delete image.dataset.original;image.src=original;return;
      }
      image.classList.remove('is-loading');markAssetUnavailable(image.closest('[data-asset-id]')?.dataset.assetId);
    };
    image.src=image.dataset.src;delete image.dataset.src;
  };
  if(!('IntersectionObserver' in window)){images.forEach(load);return}
  assetImageObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){assetImageObserver.unobserve(entry.target);load(entry.target)}})
  },{root:assetsEls.shell,rootMargin:'480px 0px',threshold:.01});
  images.forEach(image=>assetImageObserver.observe(image));
}
function taskState(job){
  if(job.failedAt)return {label:'等待处理',kind:'failed'};
  if(job.scope==='editor')return {label:'旧编辑任务',kind:'editor'};
  return job.taskId?{label:'正在生成',kind:'running'}:{label:'排队中',kind:'queued'};
}
async function renderTaskCenter(){
  if(!assetsEls.taskCenter)return;
  const currentJob=await PendingGeneration.load();
  const jobs=(await PendingGeneration.loadAll({includeEditor:true}))
    .filter(job=>job.id!==currentJob?.id);
  assetsEls.taskCenter.hidden=!jobs.length;
  assetsEls.taskCount.textContent=jobs.length+' 项';
  assetsEls.taskList.replaceChildren();
  for(const job of jobs){
    const state=taskState(job),row=document.createElement('article');
    row.className='asset-task-row is-'+state.kind;
    const copy=document.createElement('div');copy.className='asset-task-copy';
    const head=document.createElement('div');head.className='asset-task-row-head';
    const model=document.createElement('b');model.textContent=ASSET_MODEL_NAMES[job.model]||job.model||'图片任务';
    const badge=document.createElement('span');badge.textContent=state.label;head.append(model,badge);
    const prompt=document.createElement('p');prompt.textContent=job.prompt||'正在准备图片任务';copy.append(head,prompt);
    const actions=document.createElement('div');actions.className='asset-task-actions';
    if(job.scope!=='editor'&&job.failedAt){
      const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.onclick=async()=>{retry.disabled=true;delete job.failedAt;delete job.lastError;await PendingGeneration.save(job);runNextPendingGeneration().catch(()=>{})};actions.appendChild(retry);
    }
    const cancel=document.createElement('button');cancel.type='button';cancel.className='is-quiet';cancel.textContent='取消';cancel.onclick=async()=>{cancel.disabled=true;await PendingGeneration.delete(job.id);renderTaskCenter()};actions.appendChild(cancel);
    row.append(copy,actions);assetsEls.taskList.appendChild(row);
  }
}
function assetIcon(paths){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');
  for(const d of paths){
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);svg.appendChild(path);
  }
  return svg;
}
function favoriteAsset(item){
  try{
    const references=JSON.parse(localStorage.getItem(REFERENCE_LIBRARY_KEY)||'[]');
    if(!Array.isArray(references))throw new Error('invalid reference library');
    if(references.some(reference=>reference.imageUrl===item.url)){toast('这张图片已收藏到参考');return}
    references.unshift({id:'reference-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),imageUrl:item.url,prompt:item.prompt||'',createdAt:new Date().toISOString()});
    localStorage.setItem(REFERENCE_LIBRARY_KEY,JSON.stringify(references.slice(0,REFERENCE_LIBRARY_LIMIT)));
    toast('已收藏到参考');
  }catch(error){console.warn('收藏到参考失败',error);toast('收藏失败，请检查浏览器本地存储')}
}
function assetSettings(item,model){
  const config=MODEL_CONFIG[model];
  const saved=item.settings||{};
  return {
    ratio:config.ratios.includes(saved.ratio)?saved.ratio:config.ratios[0],
    resolution:config.resolutions?.some(option=>option.v===saved.resolution)?saved.resolution:config.defaultResolution
  };
}
async function enqueueAssetHD(item){
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  const model='gpt',config=MODEL_CONFIG.gpt,settings={ratio:assetSettings(item,'gpt').ratio,resolution:'4k'},prompt=ASSET_HD_PROMPT;
  const body={model:config.generationModel,prompt,size:settings.ratio,n:1};
  body.resolution=settings.resolution;body.image_urls=[item.url];
  const job={
    id:'asset-hd-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
    body,endpoint:'/images/generations',prompt,model,settings,
    createdAt:new Date().toISOString(),taskId:null
  };
  await PendingGeneration.save(job);
  toast('已加入高清队列');
  runNextPendingGeneration().catch(()=>{});
}
function sendAssetToComposer(item){
  try{
    sessionStorage.setItem('mihu_reference_payload',JSON.stringify({url:item.url,prompt:item.prompt||'',replacePrompt:true}));
    navigateWithLoading('index.html');
  }catch(_){toast('无法带入图片，请重试')}
}
function renderAssets(){
  assetsEls.grid.innerHTML='';
  syncAssetsSummary();
  if(!assetItems.length)return;
  const fragment=document.createDocumentFragment();
  let currentDayKey='',dayGrid=null;
  for(const item of assetItems){
    const day=assetDay(item.createdAt);
    if(day.key!==currentDayKey){
      currentDayKey=day.key;
      const group=document.createElement('section');group.className='asset-date-group';
      const heading=document.createElement('div');heading.className='asset-date-heading';
      const title=document.createElement('h2');title.textContent=day.label;
      const dayCount=document.createElement('span');
      dayCount.textContent=assetItems.filter(asset=>assetDay(asset.createdAt).key===day.key).length+' 项';
      heading.append(title,dayCount);
      dayGrid=document.createElement('div');dayGrid.className='asset-date-grid';
      group.append(heading,dayGrid);fragment.appendChild(group);
    }
    const expiry=assetExpiry(item);
    const card=document.createElement('article');card.className='asset-card'+(expiry.expired?' is-expired':'');card.dataset.assetId=item.id;
    const media=document.createElement('button');
    media.type='button';media.className='asset-media';media.title='在新标签页打开图片';
    const image=document.createElement('img');
    image.dataset.src=ImageDelivery.thumbnail(item.url);image.dataset.original=item.url;image.alt=item.prompt||'生成图片';image.loading='lazy';image.decoding='async';image.className='is-loading';media.appendChild(image);
    media.onclick=()=>openImage(item.url);
    const meta=document.createElement('div');meta.className='asset-meta';
    const model=document.createElement('span');model.className='asset-model';model.textContent=ASSET_MODEL_NAMES[item.model]||item.model;
    if(!expiry.archived)model.classList.add('is-warning');
    meta.append(model);
    const actions=document.createElement('div');actions.className='asset-actions';
    const favorite=document.createElement('button');favorite.type='button';favorite.className='asset-favorite';favorite.title='收藏到参考';
    favorite.setAttribute('aria-label','收藏到参考');favorite.appendChild(assetIcon(['M12 20.5 4.8 16A5 5 0 0 1 12 9.1 5 5 0 0 1 19.2 16L12 20.5Z']));favorite.onclick=()=>favoriteAsset(item);actions.appendChild(favorite);
    const hd=document.createElement('button');hd.type='button';hd.className='asset-hd';hd.title='一键高清';hd.setAttribute('aria-label','一键高清');
    hd.appendChild(assetIcon(['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5','m12 7 1.25 3.75L17 12l-3.75 1.25L12 17l-1.25-3.75L7 12l3.75-1.25L12 7Z']));
    hd.onclick=()=>enqueueAssetHD(item);actions.appendChild(hd);
    const edit=document.createElement('button');edit.type='button';edit.className='asset-local-edit';edit.title='局部编辑';edit.setAttribute('aria-label','局部编辑');
    edit.appendChild(assetIcon(['M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z','m13-13 3 3']));
    edit.onclick=()=>openLocalEdit(item,edit);actions.appendChild(edit);
    const send=document.createElement('button');send.type='button';send.className='asset-send';send.title='重新生成';send.setAttribute('aria-label','重新生成');
    send.appendChild(assetIcon(['M12 3v12','m7 8 5-5 5 5','M5 21h14']));
    send.onclick=()=>sendAssetToComposer(item);actions.appendChild(send);
    const remove=document.createElement('button');remove.type='button';remove.className='asset-delete';remove.title='删除记录';
    remove.appendChild(assetIcon(['M4 7h16','M9 7V5h6v2','M7 7l1 13h8l1-13','M10 11v5','M14 11v5']));
    remove.onclick=async()=>{
      remove.disabled=true;
      if(item.historyKey||ImageDelivery.isArchivedUrl(item.url)){
        try{
          if(await CloudHistory.token())await CloudHistory.remove(item.historyKey||'',item.id);
        }catch(error){console.warn('云端历史删除失败',error);remove.disabled=false;toast('云端删除失败，请稍后重试');return}
      }
      if(!await History.delete(item.id)){remove.disabled=false;toast('删除失败');return}
      assetItems=assetItems.filter(asset=>asset.id!==item.id);renderAssets();toast('已删除记录');
    };
    actions.appendChild(remove);card.append(media,meta,actions);dayGrid.appendChild(card);
  }
  assetsEls.grid.appendChild(fragment);
  setupAssetImageLoading();
}

function showGeneration(job){
  assetsEls.generation.hidden=false;
  assetsEls.generation.className='assets-generation is-running';
  const imageUrls=job.body?.image_urls;
  const references=Array.isArray(imageUrls)?imageUrls:(typeof imageUrls==='string'?[imageUrls]:[]);
  const reference=references.find(url=>typeof url==='string'&&url);
  assetsEls.generation.classList.toggle('has-reference',!!reference);
  assetsEls.generationVisual.hidden=!reference;
  assetsEls.generationReference.hidden=!reference;
  assetsEls.generationReference.onerror=()=>{
    assetsEls.generationVisual.hidden=true;
    assetsEls.generationReference.hidden=true;
    assetsEls.generationReference.removeAttribute('src');
    assetsEls.generation.classList.remove('has-reference');
  };
  if(reference){
    assetsEls.generationReference.hidden=false;
    assetsEls.generationReference.src=ImageDelivery.thumbnail(reference);
  }else{
    assetsEls.generationReference.removeAttribute('src');
  }
  assetsEls.generationModel.textContent=ASSET_MODEL_NAMES[job.model]||job.model||'生成任务';
  assetsEls.generationPrompt.textContent=job.prompt||'正在生成图片';
  assetsEls.generationStatus.textContent=job.taskId?'正在恢复任务':'正在提交任务';
  assetsEls.generationPercent.textContent='0%';
  assetsEls.generationBar.style.width='0%';
  assetsEls.generationError.hidden=true;
  assetsEls.generationError.replaceChildren();
  const startedAt=new Date(job.createdAt||Date.now()).getTime();
  clearInterval(generationElapsedTimer);
  const updateElapsed=()=>assetsEls.generationElapsed.textContent=formatDuration(Date.now()-startedAt);
  updateElapsed();generationElapsedTimer=setInterval(updateElapsed,1000);
  syncAssetsSummary();
}
function updateGeneration(status,progress,retryMessage){
  const numeric=Math.max(0,Math.min(100,Number(progress)||0));
  assetsEls.generation.classList.toggle('is-indeterminate',numeric<=0);
  assetsEls.generationStatus.textContent=retryMessage||(
    status==='queued'?'等待模型响应':
    status==='processing'?'正在生成图片':
    status==='running'?'正在生成图片':'生成处理中'
  );
  assetsEls.generationPercent.textContent=numeric>0?Math.round(numeric)+'%':'处理中';
  assetsEls.generationBar.style.width=numeric>0?numeric+'%':'28%';
}
function showGenerationFailure(job,message){
  assetsEls.generation.classList.remove('is-running','is-complete');
  assetsEls.generation.classList.add('is-failed');
  assetsEls.generationStatus.textContent='生成失败';
  assetsEls.generationPercent.textContent='—';
  assetsEls.generationError.hidden=false;
  assetsEls.generationError.replaceChildren();

  const text=document.createElement('span');
  text.textContent=message;
  const actions=document.createElement('span');
  actions.className='assets-generation-error-actions';
  const retry=document.createElement('button');
  retry.type='button';retry.textContent='重试';
  const cancel=document.createElement('button');
  cancel.type='button';cancel.textContent='取消任务';
  retry.onclick=async()=>{
    retry.disabled=true;cancel.disabled=true;
    delete job.failedAt;delete job.lastError;
    await PendingGeneration.save(job);
    showGeneration(job);
    runNextPendingGeneration().catch(()=>{});
  };
  cancel.onclick=async()=>{
    retry.disabled=true;cancel.disabled=true;
    await PendingGeneration.delete(job.id);
    assetsEls.generation.hidden=true;
    clearInterval(generationElapsedTimer);
    syncAssetsSummary();
    runNextPendingGeneration().catch(()=>{});
  };
  actions.append(retry,cancel);
  assetsEls.generationError.append(text,actions);
}
async function runNextPendingGeneration(){
  if(queueAdvancing)return;
  const acquired=await GenerationExecutionLock.run(()=>runNextPendingGenerationUnlocked());
  if(!acquired)renderTaskCenter();
}async function runNextPendingGenerationUnlocked(){
  if(queueAdvancing)return;
  queueAdvancing=true;
  try{
    while(true){
      const next=await PendingGeneration.load();
      if(!next){assetsEls.generation.hidden=true;syncAssetsSummary();break}
      if(next.failedAt){showGeneration(next);showGenerationFailure(next,next.lastError||'上次生成未完成。');break}
      showGeneration(next);
      if(!await runPendingGeneration(next))break;
    }
  }finally{queueAdvancing=false}
}
async function runPendingGeneration(job){
  const apiKey=Settings.getKey();
  if(!apiKey){
    assetsEls.generation.classList.remove('is-running','is-complete');
    assetsEls.generation.classList.add('is-failed');
    assetsEls.generationStatus.textContent='等待接口设置';
    assetsEls.generationPercent.textContent='—';
    assetsEls.generationError.hidden=false;
    assetsEls.generationError.innerHTML='尚未配置 API Key。<a href="settings.html">前往设置</a>';
    clearInterval(generationElapsedTimer);return;
  }
  const maxWaitMs=Math.max(300000,Math.min(Number(job.maxWaitMs)||300000,30*60*1000));
  const controller=new AbortController(),timeoutId=setTimeout(()=>controller.abort(),maxWaitMs+15000);
  const startedAt=performance.now();
  try{
    let url;
    if(job.taskId){
      url=await Apimart.pollTask(apiKey,job.taskId,updateGeneration,controller.signal,maxWaitMs);
    }else{
      url=await Apimart.generate({
        apiKey,body:job.body,endpoint:job.endpoint,signal:controller.signal,
        onSubmitted:taskId=>{
          job.taskId=taskId;
          PendingGeneration.save(job).catch(()=>{});
          assetsEls.generationStatus.textContent='任务已提交';
        },
        onProgress:updateGeneration
      });
    }
    const itemId=Date.now(),createdAt=new Date().toISOString();
    let archived=false,historyKey='';
    if(Archive.isAvailable()){
      try{
        const archive=await Archive.image(url,{
          id:itemId,prompt:job.prompt||'',model:job.model||'gpt',settings:job.settings||{},createdAt,type:'image'
        });
        url=archive.url;archived=true;historyKey=archive.historyKey||'';
      }catch(error){
        console.warn('图片归档失败，暂时保留 APIMart 临时地址',error);
        toast('图片已生成，但永久归档失败；请先下载原图。');
      }
    }
    const item={
      id:itemId,url,prompt:job.prompt||'',model:job.model||'gpt',settings:job.settings||{},archived,historyKey,
      createdAt,durationMs:Math.round(performance.now()-startedAt)
    };
    await History.save(item);
    await PendingGeneration.delete(job.id);
    assetItems=sortAssets([item,...assetItems.filter(asset=>asset.id!==item.id)]);
    renderAssets();
    assetsEls.generation.classList.remove('is-running','is-failed');
    assetsEls.generation.classList.add('is-complete');
    assetsEls.generationStatus.textContent='生成完成';
    assetsEls.generationPercent.textContent='100%';
    assetsEls.generationBar.style.width='100%';
    clearInterval(generationElapsedTimer);
    notifyGenerated(ASSET_MODEL_NAMES[item.model]||item.model);
    return true;
  }catch(error){
    const message=error?.name==='AbortError'?'请求超时，可以重试当前任务。':(error?.message||'生成失败，请重试。');
    job.failedAt=new Date().toISOString();
    job.lastError=message;
    await PendingGeneration.save(job);
    showGenerationFailure(job,message);
    clearInterval(generationElapsedTimer);
    return false;
  }finally{
    clearTimeout(timeoutId);
  }
}

window.addEventListener('mihu-pending-generation-change',()=>renderTaskCenter().catch(()=>{}));

requestAnimationFrame(async()=>{
  const pendingJob=await PendingGeneration.load();
  renderTaskCenter().catch(()=>{});
  if(pendingJob)showGeneration(pendingJob);
  try{assetItems=sortAssets((await History.load()).filter(item=>(item.type||'image')==='image'))}
  finally{
    assetsEls.loading.hidden=true;renderAssets();
  }
  syncCloudHistory();
  History.validate([...assetItems],{concurrency:3})
    .then(unavailable=>{
      unavailableAssetIds=new Set(unavailable.map(item=>String(item.id)));
      if(unavailable.length)renderAssets();
    })
    .catch(error=>console.warn('历史记录后台检查失败',error));
  if(pendingJob){
    if(pendingJob.failedAt)showGenerationFailure(pendingJob,pendingJob.lastError||'上次生成未完成。');
    else runNextPendingGeneration();
  }
});
