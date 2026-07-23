/* ===================== 生成 ===================== */
let statusElapsedTimer=null;
function setStatusVisible(visible){
  els.status.hidden=!visible;
  syncSidebarHistoryState();
  if(visible){
    els.generationModelName.textContent=MODEL_NAMES[activeModel];
    els.generationPrompt.textContent=(modelState[activeModel].promptText||els.promptInput.value||'准备生成').trim();
    clearInterval(statusElapsedTimer);
    const refresh=()=>{els.statusElapsed.textContent=formatDuration(performance.now()-(modelState[activeModel].progressStartedAt||performance.now()))};
    refresh();statusElapsedTimer=setInterval(refresh,1000);
  }else{
    clearInterval(statusElapsedTimer);statusElapsedTimer=null;
  }
}
function cancelGeneration(key=activeModel){
  const state=modelState[key];
  if(!state?.generating||!state.controller)return;
  state.cancelledByUser=true;state.controller.abort();
  if(key===activeModel){setStatusVisible(true);els.loadingModelName.textContent='神经演算正在终止…';els.status.querySelector('.status-text').textContent='终止中'}
}
async function doGenerate(options={}){
  options=options&&typeof options==='object'?options:{};
  const fromCanvasEdit=options.fromCanvasEdit===true;
  const canvasItemId=options.canvasItemId||null;
  const key=activeModel,state=modelState[key];
  if(state.generating){cancelGeneration(key);return}
  hideComposerError();
  const apiKey=Settings.getKey(),prompt=els.promptInput.value.trim();
  if(!apiKey){Settings.openModal(els);toast('请先保存 API Key');return}
  if(!prompt){showComposerError('请填写提示词。');return}
  if(fromCanvasEdit){
    els.resultWrap.style.display='none';els.actions.style.display='none';
  }
  const refMgr=refManagers[key];
  const refCount=refMgr?refMgr.count():0;

  state.generating=true;state.cancelledByUser=false;
  setStatusVisible(true);
  await ensureNotificationPermission();
  const controller=new AbortController(),timeoutId=setTimeout(()=>controller.abort(),300000);
  state.controller=controller;
  updateSendButton();
  els.empty.style.display='none';els.resultWrap.style.display='none';els.actions.style.display='none';
  els.loading.style.display='flex';
  els.status.classList.remove('ready');
  els.status.classList.add('generating');
  els.loadingModelName.textContent=MODEL_NAMES[key]+' · 神经矩阵运行中';
  els.status.querySelector('.status-text').textContent='神经演算中';
  Progress.start(els,state);
  const historySettings=snapshotCreationState(key);
  let taskDone=false;
  try{
    // 构建请求体
    let body,endpoint;
    if(key==='mj'){
      endpoint='/midjourney/generations';
      body={prompt,version:state.version,niji:false,speed:state.speed,size:state.ratio,
            quality:state.quality,stylize:state.stylize,chaos:state.chaos};
      if(state.style)body.style=state.style;
      const neg=$('#mjNegativePrompt').value.trim();if(neg)body.negative_prompt=neg;
      const sv=$('#mjSeed').value.trim();if(sv)body.seed=parseInt(sv);
      if(refCount>0){body.image_urls=await refMgr.getDataURIs();body.iw=state.iw}
    }else if(key==='gpt'){
      endpoint='/images/generations';
      body={model:'gpt-image-2',prompt,size:state.ratio,resolution:state.resolution,n:1};
      if(refCount>0)body.image_urls=await refMgr.getDataURIs();
    }else if(key==='nano'){
      endpoint='/images/generations';
      body={model:'nano-banana-2-ext',prompt,size:state.ratio,resolution:state.resolution,n:1};
      if(refCount>0)body.image_urls=await refMgr.getDataURIs();
    }else if(key==='grok'){
      endpoint='/images/generations';
      const isEdit=refCount>0;
      body={
        model:isEdit?'grok-imagine-1.5-edit-ext':'grok-imagine-1.5-ext',
        prompt,
        size:isEdit?(GROK_EDIT_SIZES[state.ratio]||'1024x1024'):state.ratio,
        n:1
      };
      if(isEdit)body.image_urls=await refMgr.getDataURIs();
    }
    const url=await Apimart.generate({
      apiKey,body,endpoint,signal:controller.signal,
      onProgress:(status,progress,retryMsg)=>{
        if(typeof retryMsg==='string'&&retryMsg){
          if(key===activeModel){els.loadingModelName.textContent=retryMsg;els.status.querySelector('.status-text').textContent='链路重构中'}
          return;
        }
        if(progress>0){
          state.realProgress=progress;state.progressStatus=status;
          if(key===activeModel)Progress.updateReal(els,state,progress,status);
        }
        if(key===activeModel)els.status.querySelector('.status-text').textContent='神经演算中 · '+formatDuration(performance.now()-state.progressStartedAt);
      }
    });
    const duration=state.progressStartedAt?performance.now()-state.progressStartedAt:0;taskDone=true;
    state.useRealProgress=true;state.realProgress=100;state.progressStatus='completed';
    if(key===activeModel)Progress.finish(els,state,true);
    // 直接用临时 URL 加入历史（72 小时有效期）
    const historyItem=addHistory(url,prompt,key,historySettings,duration);
    if(fromCanvasEdit){
      sendHistoryToCanvas(historyItem,{silent:true,replaceId:canvasItemId});
      toast('画布图片已更新 · '+formatDuration(duration));
    }else if(key===activeModel){showResult(url,key,'矩阵已固化');toast('视觉矩阵已固化 · '+formatDuration(duration))}
    else toast(MODEL_NAMES[key]+' · 视觉矩阵已在后台固化');
    notifyGenerated(MODEL_NAMES[key]);
  }catch(e){
    if(!taskDone&&key===activeModel)Progress.finish(els,state,false);
    if(key===activeModel){
      els.loading.style.display='none';
      if(currentResultUrl){els.resultWrap.style.display='flex';els.actions.style.display='flex'}
      else els.empty.style.display='flex';
      els.status.classList.remove('ready','generating');
      const cancelled=state.cancelledByUser&&e.name==='AbortError';
      els.status.querySelector('.status-text').textContent=cancelled?'演算已终止':'生成失败';
      if(cancelled)toast('神经演算已终止');
      else{
        const msg=e.name==='AbortError'?'请求超时，请稍后重试。':(e.message||'生成失败');
        showComposerError(msg.includes('Failed to fetch')?'浏览器无法连接 APIMart，可能是网络或跨域限制。':msg);
      }
    }
  }finally{
    clearTimeout(timeoutId);
    state.generating=false;state.controller=null;
    if(key===activeModel){Progress.stop();setStatusVisible(false);updateSendButton()}
    if(fromCanvasEdit&&!taskDone&&pendingCanvasEditSource){
      const original=getCanvasItem(pendingCanvasEditSource.id);
      if(original){
        original.url=pendingCanvasEditSource.url;original.model=pendingCanvasEditSource.model;original.prompt=pendingCanvasEditSource.prompt;
        const img=els.canvasLayer.querySelector('[data-canvas-id="'+original.id+'"] img');
        if(img)img.src=original.url;
        selectCanvasItem(original.id);
      }
      syncCanvasMode();
    }
    if(fromCanvasEdit)pendingCanvasEditSource=null;
  }
}

els.sendBtn.onclick=doGenerate;
els.promptInput.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();doGenerate()}
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(canvasEditModal.classList.contains('open')){e.preventDefault();closeCanvasEdit();return}
  if(openPop){e.preventDefault();closeAllPops()}
});

