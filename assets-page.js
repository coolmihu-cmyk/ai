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
  if(job.scope==='editor')return {label:'编辑任务',kind:'editor'};
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
    if(job.scope==='editor'){
      const open=document.createElement('button');open.type='button';open.textContent='前往编辑';open.onclick=()=>navigateWithLoading('edit.html');actions.appendChild(open);
    }else if(job.failedAt){
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
function openAssetEditor(item){
  try{
    sessionStorage.setItem('mihu_edit_payload',JSON.stringify({
      url:item.url,prompt:item.prompt||'',model:MODEL_CONFIG[item.model]?item.model:'gpt'
    }));
  }catch(_){}
  navigateWithLoading('edit.html');
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
    favorite.appendChild(assetIcon(['M12 20.5 4.8 16A5 5 0 0 1 12 9.1 5 5 0 0 1 19.2 16L12 20.5Z']));const favoriteText=document.createElement('span');favoriteText.textContent='收藏';favorite.appendChild(favoriteText);favorite.onclick=()=>favoriteAsset(item);actions.appendChild(favorite);
    const edit=document.createElement('button');edit.type='button';edit.className='asset-edit';edit.title='进入编辑页面';
    edit.appendChild(assetIcon(['m4 16-.8 4.8L8 20l11-11-4-4L4 16Z','m13.5 6.5 4 4']));
    const editText=document.createElement('span');editText.textContent='编辑';edit.appendChild(editText);
    edit.onclick=()=>openAssetEditor(item);actions.appendChild(edit);
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
