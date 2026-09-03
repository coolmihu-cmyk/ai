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
  loading:$('#localEditLoading'),download:$('#localEditDownload'),
  prompt:$('#localEditPrompt'),promptCount:$('#localEditPromptCount'),upload:$('#localEditUpload'),fileInput:$('#localEditFileInput'),error:$('#localEditError'),submit:$('#localEditSubmit'),
  modelSelect:$('#localEditModel'),modelPicker:$('#localEditModelPicker'),modelTrigger:$('#localEditModelTrigger'),modelMenu:$('#localEditModelMenu'),resolutionSelect:$('#localEditResolution'),resolutionPicker:$('#localEditResolutionPicker'),resolutionTrigger:$('#localEditResolutionTrigger'),resolutionMenu:$('#localEditResolutionMenu'),
  thread:$('#localEditThread'),status:$('#localEditStatus'),versionsNode:$('#localEditVersions'),
  item:null,model:'gpt',ratio:'auto',resolution:'1k',editRootId:null,editGroupId:null,referenceData:null,referenceUrl:'',submitting:false,lastFocus:null,versions:[],messages:[]
};

function localEditSetError(message=''){localEdit.error.hidden=!message;localEdit.error.textContent=message}
function localEditSetStatus(message=''){
  localEdit.status.textContent='';
  if(!message)return;
  const last=localEdit.messages[localEdit.messages.length-1];
  if(last?.role==='assistant'&&last.text===message)return;
  localEdit.messages.push({role:'assistant',text:message});localEditRenderThread();
}
function localEditClearReference(){localEdit.referenceData=null;localEdit.referenceUrl='';localEdit.fileInput.value='';localEdit.upload.classList.remove('is-attached');localEdit.upload.setAttribute('aria-label','添加参考图片');localEdit.upload.title='添加参考图片'}
function localEditModelKey(value){return MODEL_CONFIG[value]?value:'gpt'}
function localEditUpdatePromptCount(){localEdit.promptCount.textContent=localEdit.prompt.value.length+'/'+localEdit.prompt.maxLength}
function localEditRenderModelPicker(){
  const current=MODEL_CONFIG[localEdit.model];
  const icon=document.createElement('img');icon.src=current.icon;icon.alt='';icon.className='model-mark model-mark-'+localEdit.model;
  const label=document.createElement('span');label.textContent=current.name;localEdit.modelTrigger.replaceChildren(icon,label);
  localEdit.modelTrigger.title=current.name;localEdit.modelTrigger.setAttribute('aria-label','编辑模型：'+current.name);
  localEdit.modelMenu.replaceChildren(...Object.entries(MODEL_CONFIG).map(([key,config])=>{
    const button=document.createElement('button');button.type='button';button.className='creation-select-option';button.setAttribute('role','option');button.setAttribute('aria-selected',String(key===localEdit.model));button.title=config.name;button.setAttribute('aria-label',config.name);
    const optionIcon=document.createElement('img');optionIcon.src=config.icon;optionIcon.alt='';optionIcon.className='model-mark model-mark-'+key;
    const optionLabel=document.createElement('span');optionLabel.textContent=config.name;button.append(optionIcon,optionLabel);
    button.onclick=()=>{localEdit.model=key;localEdit.modelSelect.value=key;localEdit.modelPicker.classList.remove('open');localEdit.modelTrigger.setAttribute('aria-expanded','false');localEditSyncSettings()};return button;
  }));
}
function localEditRenderResolutionPicker(config){
  const current=config.resolutions.find(item=>item.v===localEdit.resolution)||config.resolutions[0];
  localEdit.resolutionTrigger.textContent=current.v.toUpperCase();localEdit.resolutionTrigger.title=current.v;localEdit.resolutionTrigger.setAttribute('aria-label','编辑分辨率：'+current.v);
  localEdit.resolutionMenu.replaceChildren(...config.resolutions.map(item=>{
    const button=document.createElement('button');button.type='button';button.className='creation-select-option';button.textContent=item.v.toUpperCase();button.setAttribute('role','option');button.setAttribute('aria-selected',String(item.v===localEdit.resolution));button.title=item.v;button.setAttribute('aria-label',item.v);
    button.onclick=()=>{localEdit.resolution=item.v;localEdit.resolutionSelect.value=item.v;localEdit.resolutionPicker.classList.remove('open');localEdit.resolutionTrigger.setAttribute('aria-expanded','false');localEditRenderResolutionPicker(config)};return button;
  }));
}
function localEditSyncSettings(){
  const config=MODEL_CONFIG[localEdit.model];
  localEdit.ratio='auto';
  if(!config.resolutions.some(option=>option.v===localEdit.resolution))localEdit.resolution=config.defaultResolution||config.resolutions[0]?.v||'';
  localEdit.modelSelect.replaceChildren(...Object.keys(MODEL_CONFIG).map(key=>new Option(key[0].toUpperCase(),key,key===localEdit.model,key===localEdit.model)));
  localEditRenderModelPicker();
  localEdit.resolutionSelect.replaceChildren(...config.resolutions.map(item=>new Option(item.v.toUpperCase(),item.v,item.v===localEdit.resolution,item.v===localEdit.resolution)));localEditRenderResolutionPicker(config);
  localEdit.prompt.maxLength=config.promptLimit;localEdit.prompt.value=localEdit.prompt.value.slice(0,config.promptLimit);localEditUpdatePromptCount();
}
function localEditSetInitialSettings(item){
  const config=MODEL_CONFIG[localEditModelKey(item.model)],settings=item.settings||{};
  localEdit.model=localEditModelKey(item.model);
  localEdit.ratio='auto';
  localEdit.resolution=config.resolutions.some(option=>option.v===settings.resolution)?settings.resolution:(config.defaultResolution||config.resolutions[0]?.v||'');
  localEdit.prompt.value='';localEditSyncSettings();
}
function localEditRenderThread(){
  localEdit.thread.replaceChildren(...localEdit.messages.map(message=>{
    const row=document.createElement('div');row.className='local-edit-message-row is-'+message.role;
    const avatar=document.createElement('img');avatar.className='local-edit-avatar';avatar.src=message.role==='assistant'?'image/chat-admin.png':'image/chat-user.png';avatar.alt=message.role==='assistant'?'助手头像':'用户头像';
    const node=document.createElement('p');node.className='local-edit-message is-'+message.role;node.textContent=message.text;row.append(avatar,node);return row;
  }));
  localEdit.thread.scrollTop=localEdit.thread.scrollHeight;
}
function localEditMessagesForVersions(versions){
  return versions.slice(1).flatMap((version,index)=>[
    {role:'user',text:version.prompt||'继续编辑这张图片。'},
    {role:'assistant',text:'第 '+(index+1)+' 版已就绪，可继续编辑。'}
  ]);
}
const LOCAL_EDIT_WELCOME='例如：把背景换成雨后的城市街道，保留人物的姿势、服装和构图。';
function localEditRenderVersions(){
  localEdit.versionsNode.replaceChildren(...localEdit.versions.map((version,index)=>{
    const button=document.createElement('button');button.type='button';button.className='local-edit-version'+(version===localEdit.item?' is-current':'');
    button.title='在预览区查看'+(index===0?'原图':'第 '+index+' 版');button.setAttribute('aria-label',button.title);
    button.onclick=()=>loadLocalEditImage(version).catch(()=>{});
    const image=document.createElement('img');image.src=ImageDelivery.thumbnail(version.url);image.alt='';button.append(image);
    const label=document.createElement('span');label.textContent=index===0?'原':'V'+index;button.append(label);return button;
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
  localEdit.layer.hidden=true;document.body.classList.remove('local-edit-open');localEdit.item=null;localEdit.versions=[];localEdit.messages=[];localEditClearReference();localEdit.image.removeAttribute('src');localEdit.lastFocus?.focus?.();
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
  localEdit.lastFocus=trigger||document.activeElement;localEdit.versions=orderedVersions;localEdit.editRootId=String(orderedVersions[0]?.id||item.editRootId||item.id);localEdit.editGroupId=item.editGroupId||'edit-'+localEdit.editRootId;localEdit.messages=resume?localEditMessagesForVersions(orderedVersions):[{role:'assistant',text:LOCAL_EDIT_WELCOME}];localEditClearReference();localEdit.referenceUrl=[...orderedVersions].reverse().find(version=>version.referenceUrl)?.referenceUrl||'';if(localEdit.referenceUrl){localEdit.upload.classList.add('is-attached');localEdit.upload.setAttribute('aria-label','已恢复参考图片，点击替换');localEdit.upload.title='已恢复参考图片，点击替换'}
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
  localEdit.submitting=true;localEdit.submit.disabled=true;localEdit.close.disabled=true;localEdit.submit.textContent='提交中';localEditSetError();
  localEdit.messages.push({role:'user',text:prompt});localEdit.prompt.value='';localEditUpdatePromptCount();localEditRenderThread();localEditSetStatus('正在提交图片编辑请求');
  try{
    const editPrompt=prompt+'。以输入图片为基础进行编辑，保留用户未明确要求改变的主体、构图和重要视觉特征。';
    const config=MODEL_CONFIG[localEdit.model];
    const body={model:config.editModel||config.generationModel,prompt:editPrompt,size:localEdit.ratio,resolution:localEdit.resolution,n:1,image_urls:[localEdit.item.url,...(localEdit.referenceUrl?[localEdit.referenceUrl]:(localEdit.referenceData?[localEdit.referenceData]:[]))]};
    let url=await Apimart.generate({apiKey,body,endpoint:'/images/generations',onProgress:(status,progress)=>{
      const percent=Math.max(0,Math.min(100,Number(progress)||0));localEdit.submit.textContent=percent?'生成 '+percent+'%':'生成中';localEditSetStatus(status==='processing'?'模型正在生成新版本':'正在处理图片');
    }});
    const itemId=Date.now(),createdAt=new Date().toISOString();let archived=false,historyKey='';
    if(Archive.isAvailable()){
      try{
        const archive=await Archive.image(url,{id:itemId,prompt,model:localEdit.model,settings:{ratio:localEdit.ratio,resolution:localEdit.resolution},referenceUrl:localEdit.referenceUrl,editRootId:localEdit.editRootId,editGroupId:localEdit.editGroupId,createdAt,type:'image'});
        url=archive.url;archived=true;historyKey=archive.historyKey||'';
      }catch(error){console.warn('图片编辑归档失败',error);localEditSetStatus('新版本已生成，但永久归档失败；请及时下载。')}
    }
    const version={id:itemId,url,prompt,model:localEdit.model,settings:{ratio:localEdit.ratio,resolution:localEdit.resolution},referenceUrl:localEdit.referenceUrl,editRootId:localEdit.editRootId,editGroupId:localEdit.editGroupId,archived,historyKey,createdAt,type:'image'};
    await History.save(version);assetItems=sortAssets([version,...assetItems.filter(asset=>asset.id!==version.id)]);renderAssets();
    localEdit.versions.push(version);
    localEditSetStatus('第 '+(localEdit.versions.length-1)+' 版已就绪，可继续编辑。');
    await loadLocalEditImage(version,{focus:true});toast('新版本已生成');
  }catch(error){
    localEditSetError(error?.message||'图片编辑任务创建失败。');localEditSetStatus('生成未完成，请修改描述后重试。');
  }finally{
    localEdit.submitting=false;localEdit.submit.disabled=false;localEdit.close.disabled=false;localEdit.submit.textContent='生成';
  }
}

localEdit.prompt.addEventListener('input',()=>{localEditUpdatePromptCount();localEditSetError()});
localEdit.prompt.addEventListener('keydown',event=>{if(event.ctrlKey&&event.key==='Enter'){event.preventDefault();submitLocalEdit()}});
localEdit.upload.onclick=()=>localEdit.fileInput.click();
localEdit.fileInput.onchange=async()=>{
  const file=localEdit.fileInput.files?.[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){localEditSetError('仅支持 JPG、PNG 或 WebP 图片。');localEdit.fileInput.value='';return}
  if(file.size>10*1024*1024){localEditSetError('参考图片不能超过 10MB。');localEdit.fileInput.value='';return}
  try{localEdit.referenceData=await fileToDataURI(file);localEdit.upload.classList.add('is-attached');localEdit.upload.setAttribute('aria-label','已添加参考图片，点击替换');localEdit.upload.title='已添加参考图片，点击替换';localEditSetError();if(Archive.isAvailable()){localEditSetStatus('正在保存参考图片');try{const uploaded=await Archive.reference(file);localEdit.referenceUrl=uploaded.url;localEditSetStatus('参考图片已保存，可在后续编辑中继续使用。')}catch(error){localEditSetError(error.message||'参考图片保存失败，本次生成仍可使用。');localEditSetStatus('参考图片暂存于本次编辑。')}}toast('已添加参考图片')}
  catch(_){localEditSetError('参考图片读取失败，请重试。')}
};
localEdit.modelTrigger.onclick=event=>{event.stopPropagation();const opening=!localEdit.modelPicker.classList.contains('open');localEdit.resolutionPicker.classList.remove('open');localEdit.resolutionTrigger.setAttribute('aria-expanded','false');localEdit.modelPicker.classList.toggle('open',opening);localEdit.modelTrigger.setAttribute('aria-expanded',String(opening))};
localEdit.resolutionTrigger.onclick=event=>{event.stopPropagation();const opening=!localEdit.resolutionPicker.classList.contains('open');localEdit.modelPicker.classList.remove('open');localEdit.modelTrigger.setAttribute('aria-expanded','false');localEdit.resolutionPicker.classList.toggle('open',opening);localEdit.resolutionTrigger.setAttribute('aria-expanded',String(opening))};
localEdit.modelSelect.onchange=()=>{localEdit.model=localEditModelKey(localEdit.modelSelect.value);localEditSyncSettings()};
localEdit.resolutionSelect.onchange=()=>{localEdit.resolution=localEdit.resolutionSelect.value;localEditRenderResolutionPicker(MODEL_CONFIG[localEdit.model])};
localEdit.close.onclick=closeLocalEdit;localEdit.submit.onclick=submitLocalEdit;
localEdit.download.onclick=()=>{if(localEdit.item)downloadImage(localEdit.item.url)};
localEdit.layer.addEventListener('pointerdown',event=>{if(event.target===localEdit.layer)closeLocalEdit()});document.addEventListener('click',()=>{localEdit.modelPicker.classList.remove('open');localEdit.modelTrigger.setAttribute('aria-expanded','false');localEdit.resolutionPicker.classList.remove('open');localEdit.resolutionTrigger.setAttribute('aria-expanded','false')});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!localEdit.layer.hidden){localEdit.modelPicker.classList.remove('open');localEdit.modelTrigger.setAttribute('aria-expanded','false');localEdit.resolutionPicker.classList.remove('open');localEdit.resolutionTrigger.setAttribute('aria-expanded','false');closeLocalEdit()}});

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
function assetImageIcon(name){
  const image=document.createElement('img');image.src='icon/asset-'+name+'.svg';image.alt='';image.setAttribute('aria-hidden','true');return image;
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
async function deleteAssetRecords(items,button){
  const ids=new Set(items.map(item=>String(item.id)));
  button.disabled=true;
  try{
    const needsCloudDelete=items.filter(item=>item.historyKey||ImageDelivery.isArchivedUrl(item.url));
    if(needsCloudDelete.length&&await CloudHistory.token()){
      await Promise.all(needsCloudDelete.map(item=>CloudHistory.remove(item.historyKey||'',item.id)));
    }
    const results=await Promise.all(items.map(item=>History.delete(item.id)));
    if(results.some(result=>!result))throw new Error('删除失败');
    assetItems=assetItems.filter(item=>!ids.has(String(item.id)));renderAssets();
    toast(items.length>1?'已删除图组记录和文件':'已删除记录和文件');
  }catch(error){
    console.warn('历史删除失败',error);button.disabled=false;toast('删除失败，请稍后重试');
  }
}
function buildEditGroupCard(root,edits){
  const versions=[root,...edits].sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
  const card=document.createElement('article');card.className='asset-card asset-edit-group';card.dataset.assetId=root.id;
  const media=document.createElement('button');media.type='button';media.className='asset-group-media';media.title='恢复图组对话';media.onclick=()=>openLocalEditGroup(root,edits,media);
  const image=document.createElement('img');image.src=ImageDelivery.thumbnail(root.url);image.alt='原始图片';image.loading='lazy';image.decoding='async';media.appendChild(image);
  const badge=document.createElement('span');badge.className='asset-group-badge';badge.textContent='图组 · '+versions.length+' 张';media.appendChild(badge);
  const actions=document.createElement('div');actions.className='asset-actions';
  const edit=document.createElement('button');edit.type='button';edit.className='asset-local-edit';edit.title='恢复图组对话';edit.setAttribute('aria-label','恢复图组对话');edit.appendChild(assetImageIcon('edit'));edit.onclick=()=>openLocalEditGroup(root,edits,edit);actions.appendChild(edit);
  const remove=document.createElement('button');remove.type='button';remove.className='asset-delete';remove.title='删除图组记录和文件';remove.setAttribute('aria-label','删除图组记录和文件');remove.appendChild(assetImageIcon('delete'));
  remove.onclick=()=>{if(confirm('删除这个图组的全部 '+versions.length+' 张图片、记录和 COS 文件？'))deleteAssetRecords(versions,remove)};actions.appendChild(remove);
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
    favorite.setAttribute('aria-label','收藏到参考');favorite.appendChild(assetImageIcon('favorite'));favorite.onclick=()=>favoriteAsset(item);meta.append(favorite);
    const edit=document.createElement('button');edit.type='button';edit.className='asset-local-edit';edit.title='编辑图片';edit.setAttribute('aria-label','编辑图片');
    edit.appendChild(assetImageIcon('edit'));
    edit.onclick=()=>openLocalEdit(item,edit);actions.appendChild(edit);
    const send=document.createElement('button');send.type='button';send.className='asset-send';send.title='重新生成';send.setAttribute('aria-label','重新生成');
    send.appendChild(assetImageIcon('redo'));
    send.onclick=()=>sendAssetToComposer(item);actions.appendChild(send);
    const download=document.createElement('button');download.type='button';download.className='asset-download';download.title='下载图片';download.setAttribute('aria-label','下载图片');
    download.appendChild(assetImageIcon('download'));download.onclick=()=>downloadImage(item.url);actions.appendChild(download);
    const remove=document.createElement('button');remove.type='button';remove.className='asset-delete';remove.title='删除记录和文件';remove.setAttribute('aria-label','删除记录和文件');
    remove.appendChild(assetImageIcon('delete'));
    remove.onclick=()=>deleteAssetRecords([item],remove);
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
