"use strict";

const ASSET_MODEL_NAMES=Object.fromEntries(
  Object.entries(MODEL_CONFIG).map(([key,config])=>[key,config.name])
);
ASSET_MODEL_NAMES.midjourney='Midjourney';
const assetsEls={
  grid:$('#assetsGrid'),loading:$('#assetsLoading'),empty:$('#assetsEmpty'),count:$('#assetsCount'),
  generation:$('#assetsGeneration'),generationModel:$('#assetsGenerationModel'),
  generationElapsed:$('#assetsGenerationElapsed'),generationQueue:$('#assetsGenerationQueue'),generationPrompt:$('#assetsGenerationPrompt'),
  generationStatus:$('#assetsGenerationStatus'),generationPercent:$('#assetsGenerationPercent'),
  generationBar:$('#assetsGenerationBar'),generationError:$('#assetsGenerationError'),
  generationVisual:$('#assetsGenerationVisual'),generationReference:$('#assetsGenerationReference')
};
let assetItems=[],generationElapsedTimer=null,queueAdvancing=false;
let unavailableAssetIds=new Set(),assetImageObserver=null;
const REFERENCE_LIBRARY_KEY='mihu-reference-library-v1',REFERENCE_LIBRARY_LIMIT=300;
const ASSET_HD_PROMPT='基于提供的参考图像进行严格的超高分辨率4K增强。必须绝对忠实于原始画面部结构、比例和身份特征。在表情、视线、姿势、相机角度、画面构图和透视关系上保持零偏差。服装、头发、皮肤以及背景元素的结构、位置和设计都必须保持不变。恢复细微层级的细节，呈现自然写实效果。增强毛孔、细纹、发丝、睫毛、织物纹理、缝线以及材质边缘，但不得引入任何风格化处理。颜色科学、白平衡以及整体色调关系必须与原图完全一致。光线方向、强度、对比度以及阴影表现必须与原始图像精确匹配，只允许提升清晰度并扩展动态范围。禁止重新布光，禁止改变形体';

function sortAssets(items){
  return items.sort((a,b)=>{
    const dateDiff=new Date(b.createdAt||0)-new Date(a.createdAt||0);
    return dateDiff||Number(b.id||0)-Number(a.id||0);
  });
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
  const createdAt=new Date(item.createdAt||0).getTime();
  const remaining=createdAt+HISTORY_RETENTION_MS-Date.now();
  if(unavailableAssetIds.has(String(item.id)))return {label:'原图已过期',expired:true};
  if(remaining<=0)return {label:'原图可能已过期',expired:true};
  const hours=Math.ceil(remaining/(60*60*1000));
  return {label:hours<=12?'还剩 '+hours+' 小时':'还剩 '+Math.ceil(hours/24)+' 天',expired:false};
}
function markAssetUnavailable(id){
  unavailableAssetIds.add(String(id));
  const card=[...assetsEls.grid.querySelectorAll('[data-asset-id]')].find(node=>node.dataset.assetId===String(id));
  if(!card)return;
  card.classList.add('is-expired');
  const state=card.querySelector('.asset-expiry');if(state)state.textContent='原图已过期';
}
function setupAssetImageLoading(){
  assetImageObserver?.disconnect();
  const images=[...assetsEls.grid.querySelectorAll('img[data-src]')];
  const load=image=>{
    if(!image.dataset.src)return;
    image.onload=()=>image.classList.remove('is-loading');
    image.onerror=()=>{image.classList.remove('is-loading');markAssetUnavailable(image.closest('[data-asset-id]')?.dataset.assetId)};
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
  const jobs=await PendingGeneration.loadAll({includeEditor:true});
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
    const cancel=document.createElement('button');cancel.type='button';cancel.className='is-quiet';cancel.textContent='取消';cancel.onclick=async()=>{cancel.disabled=true;await PendingGeneration.delete(job.id);renderTaskCenter();syncGenerationQueue(job).catch(()=>{})};actions.appendChild(cancel);
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
async function enqueueAssetGeneration(item,{mode}={}){
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  const sourceModel=MODEL_CONFIG[item.model]?item.model:'gpt';
  const model=mode==='hd'?'gpt':sourceModel;
  const config=MODEL_CONFIG[model],settings=mode==='hd'?{ratio:assetSettings(item,'gpt').ratio,resolution:'4k'}:assetSettings(item,model);
  const prompt=mode==='hd'?ASSET_HD_PROMPT:(item.prompt||'');
  if(!prompt){toast('这张图片没有可用的提示词');return}
  const body={model:config.generationModel,prompt,size:settings.ratio,n:1};
  if(settings.resolution)body.resolution=settings.resolution;
  if(model==='gpt'&&/background\s*=\s*["']transparent["']/i.test(prompt)){
    body.background='transparent';body.output_format='png';
  }
  if(model==='grok'){
    delete body.size;body.resolution='quality';body.response_format='url';
  }else{
    body.image_urls=[item.url];
  }
  const job={
    id:'asset-'+mode+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
    body,endpoint:'/images/generations',prompt,model,settings,
    createdAt:new Date().toISOString(),taskId:null
  };
  await PendingGeneration.save(job);
  toast(mode==='hd'?'已加入高清队列':'已加入重新生成队列');
  runNextPendingGeneration().catch(()=>{});
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
    image.dataset.src=item.url;image.alt=item.prompt||'生成图片';image.loading='lazy';image.decoding='async';image.className='is-loading';media.appendChild(image);
    media.onclick=()=>openImage(item.url);
    const meta=document.createElement('div');meta.className='asset-meta';
    const model=document.createElement('span');model.className='asset-model';model.textContent=ASSET_MODEL_NAMES[item.model]||item.model;
    const state=document.createElement('span');state.className='asset-expiry';state.textContent=expiry.label;
    meta.append(model,state);
    const actions=document.createElement('div');actions.className='asset-actions';
    const favorite=document.createElement('button');favorite.type='button';favorite.className='asset-favorite';favorite.title='收藏到参考';
    favorite.setAttribute('aria-label','收藏到参考');favorite.appendChild(assetIcon(['M12 20.5 4.8 16A5 5 0 0 1 12 9.1 5 5 0 0 1 19.2 16L12 20.5Z']));favorite.onclick=()=>favoriteAsset(item);actions.appendChild(favorite);
    const hd=document.createElement('button');hd.type='button';hd.className='asset-hd';hd.title='一键高清';hd.setAttribute('aria-label','一键高清');
    hd.appendChild(assetIcon(['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5','m12 7 1.25 3.75L17 12l-3.75 1.25L12 17l-1.25-3.75L7 12l3.75-1.25L12 7Z']));
    hd.onclick=()=>enqueueAssetGeneration(item,{mode:'hd'});actions.appendChild(hd);
    const regenerate=document.createElement('button');regenerate.type='button';regenerate.className='asset-regenerate';regenerate.title='重新生成';regenerate.setAttribute('aria-label','重新生成');
    regenerate.appendChild(assetIcon(['M20 7v5h-5','M4 17v-5h5','M6.8 9A6.5 6.5 0 0 1 18.5 7M17.2 15A6.5 6.5 0 0 1 5.5 17']));
    regenerate.onclick=()=>enqueueAssetGeneration(item,{mode:'regenerate'});actions.appendChild(regenerate);
    const remove=document.createElement('button');remove.type='button';remove.className='asset-delete';remove.title='删除记录';
    remove.appendChild(assetIcon(['M4 7h16','M9 7V5h6v2','M7 7l1 13h8l1-13','M10 11v5','M14 11v5']));
    remove.onclick=async()=>{
      remove.disabled=true;
      if(!await History.delete(item.id)){remove.disabled=false;toast('删除失败');return}
      assetItems=assetItems.filter(asset=>asset.id!==item.id);renderAssets();toast('已删除记录');
    };
    actions.appendChild(remove);card.append(media,meta,actions);dayGrid.appendChild(card);
  }
  assetsEls.grid.appendChild(fragment);
  setupAssetImageLoading();
}

async function syncGenerationQueue(currentJob){
  const jobs=await PendingGeneration.loadAll();
  const position=Math.max(0,jobs.findIndex(job=>job.id===currentJob.id));
  const waiting=Math.max(0,jobs.length-position-1);
  assetsEls.generationQueue.hidden=waiting===0;
  assetsEls.generationQueue.textContent=waiting?'队列中 · '+waiting+' 个等待':'';
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
    assetsEls.generationReference.src=reference;
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
  syncGenerationQueue(job).catch(()=>{});
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
    const item={
      id:Date.now(),url,prompt:job.prompt||'',model:job.model||'gpt',settings:job.settings||{},
      createdAt:new Date().toISOString(),durationMs:Math.round(performance.now()-startedAt)
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
