/* ===================== 生成任务交接 ===================== */
let preparingGeneration=false;
const TRANSPARENT_ELEMENT_PROMPT='透明背景,background="transparent"';

function snapshotCreationState(model){
  const state=modelState[model],snapshot={ratio:state.ratio};
  if(state.resolution)snapshot.resolution=state.resolution;
  if(state.quality)snapshot.quality=state.quality;
  if(state.moderation)snapshot.moderation=state.moderation;
  return snapshot;
}

async function buildPendingGeneration(){
  const key=activeModel,state=modelState[key];
  let prompt=els.promptInput.value.trim();
  const refMgr=refManagers[key],refCount=refMgr?refMgr.count():0;
  const referenceUrls=refCount?await refMgr.persist():[];
  const config=MODEL_CONFIG[key];
  if(!config)throw new Error('当前图片模型不可用，请重新选择。');
  const endpoint='/images/generations';
  if(config.supportsTransparent&&els.transparentBgBtn.checked){
    prompt+=','+TRANSPARENT_ELEMENT_PROMPT;
    if(!/background\s*=\s*["']transparent["']/i.test(prompt))prompt+='\nbackground="transparent"';
  }
  const body={model:config.generationModel,prompt,size:state.ratio,resolution:state.resolution,n:1};
  if(state.quality)body.quality=state.quality;
  if(state.moderation)body.moderation=state.moderation;
  if(config.supportsTransparent&&els.transparentBgBtn.checked){body.background='transparent';body.output_format='png'}
  if(referenceUrls.length)body.image_urls=referenceUrls;

  return {
    id:'generation-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
    body,endpoint,prompt,model:key,
    settings:snapshotCreationState(key),referenceUrls,
    createdAt:new Date().toISOString(),
    taskId:null
  };
}

async function doGenerate(){
  if(preparingGeneration)return;
  hideComposerError();
  const apiKey=Settings.getKey(),initialPrompt=els.promptInput.value.trim();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  if(!initialPrompt){showComposerError('请填写提示词。');return}

  preparingGeneration=true;
  els.sendBtn.disabled=true;
  ensureNotificationPermission();
  try{

    if(els.enhanceBtn.checked){
      if(typeof window.optimizeCurrentPrompt!=='function')throw new Error('提示词优化功能尚未就绪，请刷新页面后重试。');
      const optimized=await window.optimizeCurrentPrompt();
      if(!optimized)return;
    }
    const prompt=els.promptInput.value.trim();
    modelState[activeModel].promptText=prompt;
    const job=await buildPendingGeneration();
    job.promptLogId=await PromptLog.create(job);
    await PendingGeneration.save(job);
    navigateWithLoading('assets.html');
  }catch(error){
    const message=error?.message||'任务准备失败，请重试。';
    showComposerError(message);
    toast('任务准备失败');
  }finally{
    preparingGeneration=false;
    els.sendBtn.disabled=false;
  }
}

els.sendBtn.onclick=doGenerate;
els.promptInput.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){
    event.preventDefault();doGenerate();
  }
});
