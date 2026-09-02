"use strict";

const ASSET_MODEL_NAMES=Object.fromEntries(
  Object.entries(MODEL_CONFIG).map(([key,config])=>[key,config.name])
);
ASSET_MODEL_NAMES.midjourney='Midjourney';
ASSET_MODEL_NAMES.grok='Grok';
ASSET_MODEL_NAMES.edit='GPT Image2 · 图片编辑';
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

const localEdit={
  layer:$('#localEditLayer'),close:$('#localEditClose'),image:$('#localEditImage'),
  loading:$('#localEditLoading'),
  prompt:$('#localEditPrompt'),promptCount:$('#localEditPromptCount'),clearPrompt:$('#localEditClearPrompt'),error:$('#localEditError'),submit:$('#localEditSubmit'),
  modelSelect:$('#localEditModel'),ratioSelect:$('#localEditRatio'),resolutionSelect:$('#localEditResolution'),
  thread:$('#localEditThread'),status:$('#localEditStatus'),versionsNode:$('#localEditVersions'),
  item:null,model:'gpt',ratio:'1:1',resolution:'1k',editRootId:null,editGroupId:null,submitting:false,lastFocus:null,versions:[],messages:[]
};

function localEditSetError(message=''){localEdit.error.hidden=!message;localEdit.error.textContent=message}
function localEditSetStatus(message=''){localEdit.status.textContent=message}
function localEditModelKey(value){return MODEL_CONFIG[value]?value:'gpt'}
function localEditUpdatePromptCount(){localEdit.promptCount.textContent=localEdit.prompt.value.length+'/'+localEdit.prompt.maxLength}
function localEditSyncSettings(){
  const config=MODEL_CONFIG[localEdit.model];
  if(!config.ratios.includes(localEdit.ratio))localEdit.ratio=config.ratios.includes('auto')?'auto':config.ratios[0];
  if(!config.resolutions.some(option=>option.v===localEdit.resolution))localEdit.resolution=config.defaultResolution||config.resolutions[0]?.v||'';
  localEdit.modelSelect.replaceChildren(...Object.keys(MODEL_CONFIG).map(key=>new Option(key[0].toUpperCase(),key,key===localEdit.model,key===localEdit.model)));
  localEdit.ratioSelect.replaceChildren(...config.ratios.map(value=>new Option(value,value,value===localEdit.ratio,value===localEdit.ratio)));
  localEdit.resolutionSelect.replaceChildren(...config.resolutions.map(item=>new Option(item.v+' · '+item.l,item.v,item.v===localEdit.resolution,item.v===localEdit.resolution)));
  localEdit.prompt.maxLength=config.promptLimit;localEdit.prompt.value=localEdit.prompt.value.slice(0,config.promptLimit);localEditUpdatePromptCount();
}
function localEditSetInitialSettings(item){
  const config=MODEL_CONFIG[localEditModelKey(item.model)],settings=item.settings||{};
  localEdit.model=localEditModelKey(item.model);
  localEdit.ratio=config.ratios.includes(settings.ratio)?settings.ratio:(config.ratios.includes('auto')?'auto':config.ratios[0]);
  localEdit.resolution=config.resolutions.some(option=>option.v===settings.resolution)?settings.resolution:(config.defaultResolution||config.resolutions[0]?.v||'');
  localEdit.prompt.value='';localEditSyncSettings();
}
function localEditRenderThread(){
  localEdit.thread.replaceChildren(...localEdit.messages.map(message=>{
    const node=document.createElement('p');node.className='local-edit-message is-'+message.role;node.textContent=message.text;return node;
  }));
  localEdit.thread.scrollTop=localEdit.thread.scrollHeight;
}
function localEditMessagesForVersions(versions){
  return versions.slice(1).flatMap((version,index)=>[
    {role:'user',text:version.prompt||'继续编辑这张图片。'},
    {role:'assistant',text:'已生成第 '+(index+1)+' 版。'}
  ]);
}
function localEditRenderVersions(){
  localEdit.versionsNode.replaceChildren(...localEdit.versions.map((version,index)=>{
    const link=document.createElement('a');link.className='local-edit-version'+(version===localEdit.item?' is-current':'');link.href=version.url;link.target='_blank';link.rel='noopener';
    link.title=(index===0?'原图':'第 '+index+' 版')+'（新标签页打开）';link.setAttribute('aria-label',link.title);
    const image=document.createElement('img');image.src=ImageDelivery.thumbnail(version.url);image.alt='';link.append(image);
    const label=document.createElement('span');label.textContent=index===0?'原':'V'+index;link.append(label);return link;
  }));
}
function localEditClosestRatio(width,height){
  const ratios=['1:1','3:2','2:3','4:3','3:4','5:4','4:5','16:9','9:16','2:1','1:2','3:1','1:3','21:9','9:21'];
  const target=width/height;
  return ratios.reduce((best,ratio)=>{
    const [w,h]=ratio.split(':').map(Number);
    return Math.abs(Math.log(w/h/target))<Math.abs(Math.log(best.value/target))?{name:ratio,value:w/h}:best;
  },{name:'1:1',value:1}).name;
}
function closeLocalEdit(){
  if(localEdit.submitting)return;
  localEdit.layer.hidden=true;document.body.classList.remove('local-edit-open');localEdit.item=null;localEdit.versions=[];localEdit.messages=[];localEdit.image.removeAttribute('src');localEdit.lastFocus?.focus?.();
}
function loadLocalEditImage(item,{focus=false}={}){
  return new Promise((resolve,reject)=>{
    localEdit.item=item;localEdit.loading.hidden=false;localEdit.submit.disabled=true;localEditRenderVersions();
    localEdit.image.onload=()=>{
      const width=localEdit.image.naturalWidth,height=localEdit.image.naturalHeight;
      if(!width||!height){const error=new Error('无法读取图片尺寸。');localEditSetError(error.message);reject(error);return}
      localEdit.loading.hidden=true;localEdit.submit.disabled=false;localEditRenderVersions();
      if(focus)localEdit.prompt.focus();resolve();
    };
    localEdit.image.onerror=()=>{const error=new Error('图片加载失败，可能已经过期。');localEdit.loading.hidden=true;localEditSetError(error.message);localEdit.submit.disabled=true;reject(error)};
    localEdit.image.src=item.url;
  });
}
function openLocalEdit(item,trigger,{versions=[item],resume=false}={}){
  if(assetExpiry(item).expired){toast('原图已过期，无法编辑');return}
  const orderedVersions=[...versions].sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
  localEdit.lastFocus=trigger||document.activeElement;localEdit.versions=orderedVersions;localEdit.editRootId=String(orderedVersions[0]?.id||item.editRootId||item.id);localEdit.editGroupId=item.editGroupId||'edit-'+localEdit.editRootId;localEdit.messages=resume?localEditMessagesForVersions(orderedVersions):[];
  localEditSetInitialSettings(item);localEditSetError();localEditSetStatus('');localEditRenderThread();localEditRenderVersions();
  localEdit.layer.hidden=false;document.body.classList.add('local-edit-open');
  loadLocalEditImage(item,{focus:true}).catch(()=>{});
}
function openLocalEditGroup(root,edits,trigger){
  const versions=[root,...edits].sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
  openLocalEdit(versions[versions.length-1],trigger,{versions,resume:true});
}
async function submitLocalEdit(){
  if(localEdit.submitting)return;
  const apiKey=Settings.getKey(),prompt=localEdit.prompt.value.trim();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  if(!prompt){localEditSetError('请描述你希望怎样修改这张图片。');localEdit.prompt.focus();return}
  localEdit.submitting=true;localEdit.submit.disabled=true;localEdit.close.disabled=true;localEdit.submit.textContent='正在提交';localEditSetError();
  localEdit.messages.push({role:'user',text:prompt});localEditRenderThread();localEditSetStatus('正在提交图片编辑请求');
  try{
    const editPrompt=prompt+'。以输入图片为基础进行编辑，保留用户未明确要求改变的主体、构图和重要视觉特征。';
    const config=MODEL_CONFIG[localEdit.model];
    const body={model:config.editModel||config.generationModel,prompt:editPrompt,size:localEdit.ratio,resolution:localEdit.resolution,n:1,image_urls:[localEdit.item.url]};
    let url=await Apimart.generate({apiKey,body,endpoint:'/images/generations',onProgress:(status,progress)=>{
      const percent=Math.max(0,Math.min(100,Number(progress)||0));localEdit.submit.textContent=percent?'生成中 '+percent+'%':'正在生成';localEditSetStatus(status==='processing'?'模型正在生成新版本':'正在处理图片');
    }});
    const itemId=Date.now(),createdAt=new Date().toISOString();let archived=false,historyKey='';
    if(Archive.isAvailable()){
      try{
        const archive=await Archive.image(url,{id:itemId,prompt,model:localEdit.model,settings:{ratio:localEdit.ratio,resolution:localEdit.resolution},editRootId:localEdit.editRootId,editGroupId:localEdit.editGroupId,createdAt,type:'image'});
        url=archive.url;archived=true;historyKey=archive.historyKey||'';
      }catch(error){console.warn('图片编辑归档失败',error);localEditSetStatus('新版本已生成，但永久归档失败；请及时下载。')}
    }
    const version={id:itemId,url,prompt,model:localEdit.model,settings:{ratio:localEdit.ratio,resolution:localEdit.resolution},editRootId:localEdit.editRootId,editGroupId:localEdit.editGroupId,archived,historyKey,createdAt,type:'image'};
    await History.save(version);assetItems=sortAssets([version,...assetItems.filter(asset=>asset.id!==version.id)]);renderAssets();
    localEdit.versions.push(version);localEdit.messages.push({role:'assistant',text:'已生成第 '+(localEdit.versions.length-1)+' 版。'});localEditRenderThread();
    localEdit.prompt.value='';localEditUpdatePromptCount();localEditSetStatus('第 '+(localEdit.versions.length-1)+' 版已就绪，可继续编辑。');
    await loadLocalEditImage(version,{focus:true});toast('新版本已生成');
  }catch(error){
    localEditSetError(error?.message||'图片编辑任务创建失败。');localEditSetStatus('生成未完成，请修改描述后重试。');
  }finally{
    localEdit.submitting=false;localEdit.submit.disabled=false;localEdit.close.disabled=false;localEdit.submit.textContent='生成';
  }
}

localEdit.prompt.addEventListener('input',()=>{localEditUpdatePromptCount();localEditSetError()});
localEdit.clearPrompt.onclick=()=>{localEdit.prompt.value='';localEditUpdatePromptCount();localEditSetError();localEdit.prompt.focus()};
localEdit.modelSelect.onchange=()=>{localEdit.model=localEditModelKey(localEdit.modelSelect.value);localEditSyncSettings()};
localEdit.ratioSelect.onchange=()=>{localEdit.ratio=localEdit.ratioSelect.value};
localEdit.resolutionSelect.onchange=()=>{localEdit.resolution=localEdit.resolutionSelect.value};
localEdit.close.onclick=closeLocalEdit;localEdit.submit.onclick=submitLocalEdit;
localEdit.layer.addEventListener('pointerdown',event=>{if(event.target===localEdit.layer)closeLocalEdit()});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!localEdit.layer.hidden)closeLocalEdit()});

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
function sendAssetToComposer(item){
  try{
    sessionStorage.setItem('mihu_reference_payload',JSON.stringify({
      url:item.url,
      prompt:item.prompt||'',
      replacePrompt:true,
      model:item.model,
      settings:item.settings||{}
    }));
    navigateWithLoading('index.html');
  }catch(_){toast('无法带入图片，请重试')}
}
function buildEditGroupCard(root,edits){
  const versions=[root,...edits].sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
  const card=document.createElement('article');card.className='asset-card asset-edit-group';card.dataset.assetId=root.id;
  const media=document.createElement('button');media.type='button';media.className='asset-group-media';media.title='恢复图组对话';media.onclick=()=>openLocalEditGroup(root,edits,media);
  const image=document.createElement('img');image.src=ImageDelivery.thumbnail(root.url);image.alt='原始图片';image.loading='lazy';image.decoding='async';media.appendChild(image);
  const badge=document.createElement('span');badge.className='asset-group-badge';badge.textContent='图组 · '+versions.length+' 张';media.appendChild(badge);
  const actions=document.createElement('div');actions.className='asset-actions';
  const edit=document.createElement('button');edit.type='button';edit.className='asset-local-edit';edit.title='恢复图组对话';edit.setAttribute('aria-label','恢复图组对话');edit.appendChild(assetIcon(['M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z','m13-13 3 3']));edit.onclick=()=>openLocalEditGroup(root,edits,edit);actions.appendChild(edit);
  card.append(media,actions);return card;
}
function renderAssets(){
  assetsEls.grid.innerHTML='';
  syncAssetsSummary();
  if(!assetItems.length)return;
  const fragment=document.createDocumentFragment();
  const editGroups=new Map(),rootIds=new Set(assetItems.map(item=>String(item.id)));
  assetItems.forEach(item=>{if(item.editRootId&&rootIds.has(String(item.editRootId))){const key=String(item.editRootId);if(!editGroups.has(key))editGroups.set(key,[]);editGroups.get(key).push(item)}});
  let currentDayKey='',dayGrid=null;
  for(const item of assetItems){
    if(item.editRootId&&rootIds.has(String(item.editRootId)))continue;
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
    const edits=editGroups.get(String(item.id));
    if(edits?.length){dayGrid.appendChild(buildEditGroupCard(item,edits));continue}
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
    const edit=document.createElement('button');edit.type='button';edit.className='asset-local-edit';edit.title='编辑图片';edit.setAttribute('aria-label','编辑图片');
    edit.appendChild(assetIcon(['M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3Z','m13-13 3 3']));
    edit.onclick=()=>openLocalEdit(item,edit);actions.appendChild(edit);
    const send=document.createElement('button');send.type='button';send.className='asset-send';send.title='重新生成';send.setAttribute('aria-label','重新生成');
    send.appendChild(assetIcon(['M20 11a8 8 0 0 0-14.9-4L3 10','M3 4v6h6','M4 13a8 8 0 0 0 14.9 4L21 14','M21 20v-6h-6']));
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
