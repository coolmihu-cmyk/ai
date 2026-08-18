/* ===================== 生成任务交接 ===================== */
let preparingGeneration=false;

function snapshotCreationState(model){
  const state=modelState[model],snapshot={ratio:state.ratio};
  if(state.resolution)snapshot.resolution=state.resolution;
  return snapshot;
}

async function buildPendingGeneration(){
  const key=activeModel,state=modelState[key];
  const prompt=els.promptInput.value.trim();
  const refMgr=refManagers[key],refCount=refMgr?refMgr.count():0;
  let body,endpoint;

  if(key==='gpt'){
    endpoint='/images/generations';
    body={model:MODEL_CONFIG.gpt.generationModel,prompt,size:state.ratio,resolution:state.resolution,n:1};
    if(refCount>0)body.image_urls=await refMgr.getDataURIs();
  }else if(key==='nano'){
    endpoint='/images/generations';
    body={model:MODEL_CONFIG.nano.generationModel,prompt,size:state.ratio,resolution:state.resolution,n:1};
    if(refCount>0)body.image_urls=await refMgr.getDataURIs();
  }else if(key==='grok'){
    if(refCount)throw new Error('Grok Imagine 2.0 仅支持文生图，请移除参考图或切换 Image 2 / NB2。');
    endpoint='/images/generations';
    body={model:MODEL_CONFIG.grok.generationModel,prompt,size:state.ratio,resolution:'quality',response_format:'url',n:1};
  }

  return {
    id:'generation-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),
    body,endpoint,prompt,model:key,
    settings:snapshotCreationState(key),
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
