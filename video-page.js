"use strict";

(() => {
  const VIDEO_MODEL='doubao-seedance-2.0';
  const VIDEO_JOB_KEY='mihu_seedance_video_job';
  const MAX_IMAGE_BYTES=20*1024*1024;
  const MAX_REFERENCES=9;
  const MAX_WAIT_MS=15*60*1000;
  const POLL_INTERVAL=2500;
  const ALLOWED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
  // APIMart 2026-07-27 公开定价；页面当前促销换算后为 Credits/秒。
  const VIDEO_CREDITS_PER_SECOND={
    output:{'480p':0.66,'720p':1.42,'1080p':3.544,'4k':7.22},
    input:{'480p':0.4,'720p':0.8584,'1080p':2.1568,'4k':4.4432}
  };

  const el={
    prompt:$('#videoPrompt'),promptCount:$('#videoPromptCount'),
    duration:$('#videoDuration'),durationValue:$('#videoDurationValue'),
    size:$('#videoSize'),resolution:$('#videoResolution'),seed:$('#videoSeed'),
    generateAudio:$('#videoGenerateAudio'),returnLastFrame:$('#videoReturnLastFrame'),webSearch:$('#videoWebSearch'),
    referenceUrls:$('#videoReferenceUrls'),audioUrls:$('#videoAudioUrls'),
    referenceButton:$('#videoReferenceButton'),referenceInput:$('#videoReferenceInput'),referenceGrid:$('#videoReferenceGrid'),
    firstButton:$('#videoFirstFrameButton'),firstInput:$('#videoFirstFrameInput'),
    lastButton:$('#videoLastFrameButton'),lastInput:$('#videoLastFrameInput'),
    error:$('#videoError'),generate:$('#videoGenerateButton'),
    empty:$('#videoEmptyState'),progress:$('#videoProgressState'),resultState:$('#videoResultState'),
    progressStatus:$('#videoProgressStatus'),progressPercent:$('#videoProgressPercent'),
    progressBar:$('#videoProgressBar'),progressTime:$('#videoProgressTime'),stop:$('#videoStopWaiting'),
    result:$('#videoResult'),openResult:$('#videoOpenResult'),downloadResult:$('#videoDownloadResult'),
    lastFrame:$('#videoLastFrameResult'),outputMeta:$('#videoOutputMeta'),
    creditEstimate:$('#videoCreditEstimate'),creditNote:$('#videoCreditNote')
  };

  const state={
    mode:'reference',
    references:[],
    firstFrame:null,
    lastFrame:null,
    controller:null
  };

  function setError(message=''){
    el.error.textContent=message;
    el.error.hidden=!message;
  }

  function parseApiError(text,status){
    let message=text;
    try{
      const json=JSON.parse(text);
      message=json.error?.message||json.message||text;
    }catch(_){}
    if(status===401)return 'API Key 无效，请前往设置页检查。';
    if(status===402)return '账户余额不足，请充值后再试。';
    if(status===429)return '请求过于频繁，请稍后再试。';
    return message?`请求失败（HTTP ${status}）：${String(message).slice(0,260)}`:`请求失败（HTTP ${status}）`;
  }

  function validateImage(file){
    if(!file)return '没有选择图片。';
    if(!ALLOWED_IMAGE_TYPES.has(file.type))return '仅支持 JPG、PNG、WebP 或 GIF 图片。';
    if(file.size>MAX_IMAGE_BYTES)return '单张图片不能超过20MB。';
    return '';
  }

  function parseUrlList(value,label){
    const urls=value.split(/\r?\n|,/).map(item=>item.trim()).filter(Boolean);
    if(urls.length>3)throw new Error(`${label}最多填写3个。`);
    for(const url of urls){
      if(!/^(?:https?:\/\/|asset:\/\/)/i.test(url))throw new Error(`${label}必须使用 http、https 或 asset:// URL。`);
    }
    return urls;
  }

  function videoRatioVisual(value){
    if(value==='adaptive'){
      const mark=document.createElement('span');
      mark.className='video-adaptive-mark';
      mark.textContent='AUTO';
      return mark;
    }
    const [width=1,height=1]=value.split(':').map(Number);
    const scale=Math.min(20/width,16/height);
    const frame=document.createElement('i');
    frame.className='ratio-frame';
    frame.style.width=Math.max(5,Math.round(width*scale))+'px';
    frame.style.height=Math.max(5,Math.round(height*scale))+'px';
    return frame;
  }

  function videoParameterVisual(type,value){
    if(type==='ratio')return videoRatioVisual(value);
    const mark=document.createElement('span');
    mark.className='video-resolution-mark-text';
    mark.textContent=String(value||'720p').toUpperCase();
    return mark;
  }

  function closeVideoDropdowns(except){
    document.querySelectorAll('[data-video-dropdown].open').forEach(dropdown=>{
      if(dropdown===except)return;
      dropdown.classList.remove('open');
      dropdown.querySelector('.creation-select-trigger')?.setAttribute('aria-expanded','false');
    });
  }

  function syncVideoDropdown(dropdown){
    const type=dropdown.dataset.videoDropdown;
    const select=dropdown.querySelector('select');
    const current=select.options[select.selectedIndex]||select.options[0];
    dropdown.querySelector('[data-video-current]').textContent=current?.textContent||'';
    const triggerVisual=dropdown.querySelector('[data-video-visual]');
    triggerVisual.replaceChildren(videoParameterVisual(type,current?.value||''));
    triggerVisual.classList.toggle('creation-resolution-mark',type==='resolution');

    const menu=dropdown.querySelector('.creation-select-menu');
    menu.replaceChildren();
    Array.from(select.options).forEach(option=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='creation-select-option';
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(option.value===select.value));

      const visual=document.createElement('span');
      visual.className='creation-option-visual';
      visual.appendChild(videoParameterVisual(type,option.value));
      const copy=document.createElement('span');
      copy.className='creation-option-copy';
      const title=document.createElement('strong');
      title.textContent=option.textContent;
      copy.appendChild(title);
      const check=document.createElementNS('http://www.w3.org/2000/svg','svg');
      check.setAttribute('class','creation-option-check');
      check.setAttribute('viewBox','0 0 16 16');
      check.setAttribute('fill','none');
      check.innerHTML='<path d="m3.5 8.2 2.7 2.7 6.3-6.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
      button.append(visual,copy,check);
      button.onclick=()=>{
        select.value=option.value;
        syncVideoDropdown(dropdown);
        closeVideoDropdowns();
        select.dispatchEvent(new Event('change',{bubbles:true}));
      };
      menu.appendChild(button);
    });
  }

  function initVideoDropdowns(){
    document.querySelectorAll('[data-video-dropdown]').forEach(dropdown=>{
      const trigger=dropdown.querySelector('.creation-select-trigger');
      trigger.onclick=event=>{
        event.stopPropagation();
        const opening=!dropdown.classList.contains('open');
        closeVideoDropdowns(dropdown);
        dropdown.classList.toggle('open',opening);
        trigger.setAttribute('aria-expanded',String(opening));
        if(opening)syncVideoDropdown(dropdown);
      };
      trigger.onkeydown=event=>{
        if(event.key!=='ArrowDown')return;
        event.preventDefault();
        if(!dropdown.classList.contains('open'))trigger.click();
        dropdown.querySelector('.creation-select-option[aria-selected="true"]')?.focus();
      };
      syncVideoDropdown(dropdown);
    });
    document.addEventListener('click',()=>closeVideoDropdowns());
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape')closeVideoDropdowns();
    });
  }

  function makeFileEntry(file){
    return {file,preview:URL.createObjectURL(file)};
  }

  function releaseEntry(entry){
    if(entry?.preview)URL.revokeObjectURL(entry.preview);
  }

  function renderReferences(){
    el.referenceGrid.innerHTML='';
    state.references.forEach((entry,index)=>{
      const item=document.createElement('div');
      item.className='video-reference-item';
      const img=document.createElement('img');
      img.src=entry.preview;
      img.alt=`参考图 ${index+1}`;
      const remove=document.createElement('button');
      remove.type='button';
      remove.setAttribute('aria-label',`移除参考图 ${index+1}`);
      remove.textContent='×';
      remove.onclick=()=>{
        releaseEntry(entry);
        state.references.splice(index,1);
        renderReferences();
      };
      item.append(img,remove);
      el.referenceGrid.appendChild(item);
    });
    el.referenceButton.querySelector('strong').textContent=state.references.length?`继续添加参考图（${state.references.length}/${MAX_REFERENCES}）`:'添加参考图';
    updateCreditEstimate();
  }

  function renderFrame(kind){
    const entry=kind==='first'?state.firstFrame:state.lastFrame;
    const button=kind==='first'?el.firstButton:el.lastButton;
    button.querySelector('.video-frame-preview')?.remove();
    if(!entry){
      updateCreditEstimate();
      return;
    }
    const preview=document.createElement('div');
    preview.className='video-frame-preview';
    const img=document.createElement('img');
    img.src=entry.preview;
    img.alt=kind==='first'?'首帧图':'尾帧图';
    const label=document.createElement('em');
    label.textContent=kind==='first'?'首帧':'尾帧';
    const remove=document.createElement('button');
    remove.type='button';
    remove.setAttribute('aria-label',kind==='first'?'移除首帧图':'移除尾帧图');
    remove.textContent='×';
    remove.onclick=event=>{
      event.stopPropagation();
      releaseEntry(entry);
      if(kind==='first')state.firstFrame=null;
      else state.lastFrame=null;
      renderFrame(kind);
    };
    preview.append(img,label,remove);
    button.appendChild(preview);
    updateCreditEstimate();
  }

  function updateCreditEstimate(actualCredits){
    if(Number.isFinite(Number(actualCredits))){
      el.creditEstimate.textContent=`${Number(actualCredits).toFixed(2)} Credits`;
      el.creditNote.textContent='任务实际消耗';
      return;
    }
    const hasVideoReference=el.referenceUrls.value.trim().length>0;
    const hasImageReference=state.mode==='reference'
      ?state.references.length>0
      :!!(state.firstFrame||state.lastFrame);
    const rateGroup=hasVideoReference||hasImageReference?'input':'output';
    const rate=VIDEO_CREDITS_PER_SECOND[rateGroup][el.resolution.value]||0;
    const estimate=rate*Number(el.duration.value);
    el.creditEstimate.textContent=`${estimate.toFixed(2)} Credits`;
    el.creditNote.textContent=hasVideoReference
      ?'未含参考视频时长'
      :hasImageReference?'按参考素材费率估算':'按生成时长估算';
  }

  function addReferenceFiles(files){
    setError();
    for(const file of files){
      if(state.references.length>=MAX_REFERENCES){setError(`参考图最多${MAX_REFERENCES}张。`);break}
      const error=validateImage(file);
      if(error){setError(error);continue}
      state.references.push(makeFileEntry(file));
    }
    renderReferences();
  }

  function setFrame(kind,file){
    setError();
    const error=validateImage(file);
    if(error){setError(error);return}
    const previous=kind==='first'?state.firstFrame:state.lastFrame;
    releaseEntry(previous);
    if(kind==='first')state.firstFrame=makeFileEntry(file);
    else state.lastFrame=makeFileEntry(file);
    renderFrame(kind);
  }

  function setMode(mode){
    state.mode=mode;
    document.querySelectorAll('[data-video-mode]').forEach(button=>{
      const active=button.dataset.videoMode===mode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-video-panel]').forEach(panel=>{
      panel.hidden=panel.dataset.videoPanel!==mode;
    });
    updateCreditEstimate();
  }

  async function uploadImage(file,apiKey,signal){
    const form=new FormData();
    form.append('file',file);
    const response=await fetch(APIMART_BASE+'/uploads/images',{
      method:'POST',
      headers:{'Authorization':'Bearer '+apiKey},
      body:form,
      signal
    });
    if(!response.ok)throw new Error(parseApiError(await response.text(),response.status));
    const data=await response.json();
    if(!data.url)throw new Error('图片上传成功，但接口没有返回图片 URL。');
    return data.url;
  }

  function showEmpty(){
    el.empty.hidden=false;
    el.progress.hidden=true;
    el.resultState.hidden=true;
    el.outputMeta.textContent='等待创作';
  }

  function showProgress(status='正在提交任务',progress=0,detail='通常需要30–120秒'){
    const value=Number.isFinite(Number(progress))?Math.max(0,Math.min(100,Math.round(Number(progress)))):0;
    el.empty.hidden=true;
    el.progress.hidden=false;
    el.resultState.hidden=true;
    el.progressStatus.textContent=status;
    el.progressPercent.textContent=value+'%';
    el.progressBar.style.width=value+'%';
    el.progressTime.textContent=detail;
    el.outputMeta.textContent='生成中';
  }

  function extractUrl(item){
    if(!item)return '';
    const value=item.url||item.video_url||item.videoUrl||item.uri;
    if(Array.isArray(value))return value[0]||'';
    return typeof value==='string'?value:'';
  }

  function showResult(data){
    const videos=data.result?.videos||[];
    const videoUrl=extractUrl(videos[0])||extractUrl(data.result);
    if(!videoUrl)throw new Error('任务已完成，但接口没有返回视频 URL。');
    const images=data.result?.images||[];
    const lastFrameUrl=extractUrl(images[images.length-1]);

    el.empty.hidden=true;
    el.progress.hidden=true;
    el.resultState.hidden=false;
    el.result.src=videoUrl;
    el.result.load();
    el.openResult.href=videoUrl;
    el.downloadResult.href=videoUrl;
    el.lastFrame.hidden=!lastFrameUrl;
    if(lastFrameUrl)el.lastFrame.querySelector('img').src=lastFrameUrl;
    el.outputMeta.textContent=data.actual_time?`${data.actual_time}秒完成`:'生成完成';
    updateCreditEstimate(data.credits_cost);
    return {videoUrl,lastFrameUrl};
  }

  async function saveVideoAsset(data,payload){
    const result=showResult(data);
    await History.save({
      id:Date.now(),
      type:'video',
      url:result.videoUrl,
      thumbnailUrl:result.lastFrameUrl||'',
      prompt:payload?.prompt||'',
      model:VIDEO_MODEL,
      settings:{
        duration:payload?.duration,
        size:payload?.size,
        resolution:payload?.resolution,
        generateAudio:payload?.generate_audio
      },
      createdAt:new Date().toISOString(),
      durationMs:Number(data.actual_time||0)*1000
    });
  }

  function statusLabel(status){
    return {
      submitted:'任务已提交',
      pending:'正在排队',
      processing:'正在生成视频',
      retrying:'服务繁忙，正在重试'
    }[status]||'正在生成视频';
  }

  async function pollTask(apiKey,taskId,signal){
    const started=performance.now();
    while(true){
      if(signal.aborted)throw new DOMException('已停止等待','AbortError');
      if(performance.now()-started>MAX_WAIT_MS)throw new DOMException('等待超过15分钟，请稍后刷新页面继续查询。','TimeoutError');
      const response=await fetch(APIMART_BASE+'/tasks/'+encodeURIComponent(taskId)+'?language=zh',{
        headers:{'Authorization':'Bearer '+apiKey,'Accept':'application/json'},
        signal
      });
      if(!response.ok)throw new Error(parseApiError(await response.text(),response.status));
      const json=await response.json();
      const data=json.data||json;
      showProgress(statusLabel(data.status),Number(data.progress)||0,data.estimated_time?`预计约${data.estimated_time}秒完成`:'通常需要30–120秒');
      if(data.status==='completed')return data;
      if(data.status==='failed')throw new Error(data.error?.message||'视频生成失败。');
      if(data.status==='cancelled')throw new Error('视频生成任务已取消。');
      await new Promise(resolve=>setTimeout(resolve,POLL_INTERVAL));
    }
  }

  function savePendingJob(taskId,payload){
    localStorage.setItem(VIDEO_JOB_KEY,JSON.stringify({taskId,payload,createdAt:Date.now()}));
  }

  function loadPendingJob(){
    try{
      const job=JSON.parse(localStorage.getItem(VIDEO_JOB_KEY)||'null');
      if(!job?.taskId)return null;
      if(Date.now()-Number(job.createdAt||0)>72*60*60*1000){
        localStorage.removeItem(VIDEO_JOB_KEY);
        return null;
      }
      return job;
    }catch(_){
      localStorage.removeItem(VIDEO_JOB_KEY);
      return null;
    }
  }

  async function waitForJob(taskId,payload){
    const apiKey=Settings.getKey();
    if(!apiKey){Settings.openPage();return}
    state.controller?.abort();
    state.controller=new AbortController();
    el.generate.disabled=true;
    el.generate.querySelector('span').textContent='生成中';
    try{
      const data=await pollTask(apiKey,taskId,state.controller.signal);
      localStorage.removeItem(VIDEO_JOB_KEY);
      await saveVideoAsset(data,payload);
      toast('视频生成完成');
    }catch(error){
      if(error.name==='AbortError'){
        showProgress('已停止等待',0,'任务仍在服务器生成，刷新页面可继续查询。');
        return;
      }
      setError(error.message||'视频生成失败。');
      showEmpty();
      localStorage.removeItem(VIDEO_JOB_KEY);
    }finally{
      el.generate.disabled=false;
      el.generate.querySelector('span').textContent='生成视频';
    }
  }

  async function buildPayload(apiKey,signal){
    const prompt=el.prompt.value.trim();
    if(!prompt)throw new Error('请先描述想生成的视频镜头。');
    const videoUrls=parseUrlList(el.referenceUrls.value,'参考视频 URL');
    const audioUrls=parseUrlList(el.audioUrls.value,'参考音频 URL');
    const hasImageInput=state.mode==='reference'?state.references.length>0:!!(state.firstFrame||state.lastFrame);
    const hasInput=hasImageInput||videoUrls.length>0;
    if(el.size.value==='adaptive'&&!hasInput)throw new Error('自适应比例需要先添加参考图片或参考视频。');
    if(state.mode==='frames'&&(videoUrls.length||audioUrls.length))throw new Error('首尾帧模式不能同时使用参考视频或参考音频。');
    if(audioUrls.length&&!hasInput)throw new Error('参考音频必须与参考图片或参考视频一起使用。');

    const payload={
      model:VIDEO_MODEL,
      prompt,
      resolution:el.resolution.value,
      size:el.size.value,
      duration:Number(el.duration.value),
      generate_audio:el.generateAudio.checked,
      return_last_frame:el.returnLastFrame.checked
    };
    const seed=el.seed.value.trim();
    if(seed)payload.seed=Number(seed);
    if(el.webSearch.checked)payload.tools=[{type:'web_search'}];
    if(videoUrls.length)payload.video_urls=videoUrls;
    if(audioUrls.length)payload.audio_urls=audioUrls;

    if(state.mode==='reference'&&state.references.length){
      const urls=[];
      for(let index=0;index<state.references.length;index++){
        showProgress('正在上传参考图',0,`正在上传 ${index+1}/${state.references.length}`);
        urls.push(await uploadImage(state.references[index].file,apiKey,signal));
      }
      payload.image_urls=urls;
    }

    if(state.mode==='frames'&&(state.firstFrame||state.lastFrame)){
      const frames=[];
      if(state.firstFrame){
        showProgress('正在上传首帧图',0,'上传完成后将自动提交任务');
        frames.push({url:await uploadImage(state.firstFrame.file,apiKey,signal),role:'first_frame'});
      }
      if(state.lastFrame){
        showProgress('正在上传尾帧图',0,'上传完成后将自动提交任务');
        frames.push({url:await uploadImage(state.lastFrame.file,apiKey,signal),role:'last_frame'});
      }
      payload.image_with_roles=frames;
    }
    return payload;
  }

  async function generateVideo(){
    setError();
    const apiKey=Settings.getKey();
    if(!apiKey){Settings.openPage();return}
    state.controller?.abort();
    state.controller=new AbortController();
    el.generate.disabled=true;
    el.generate.querySelector('span').textContent='准备中';
    try{
      showProgress('正在准备任务',0);
      const payload=await buildPayload(apiKey,state.controller.signal);
      showProgress('正在提交任务',0);
      const taskId=await Apimart.submitTask(apiKey,payload,'/videos/generations',state.controller.signal);
      savePendingJob(taskId,payload);
      await waitForJob(taskId,payload);
    }catch(error){
      if(error.name!=='AbortError'){
        setError(error.message||'视频任务提交失败。');
        showEmpty();
      }
      el.generate.disabled=false;
      el.generate.querySelector('span').textContent='生成视频';
    }
  }

  el.prompt.addEventListener('input',()=>{el.promptCount.textContent=el.prompt.value.length});
  el.duration.addEventListener('input',()=>{
    el.durationValue.value=el.duration.value+' 秒';
    updateCreditEstimate();
  });
  el.resolution.addEventListener('change',()=>updateCreditEstimate());
  el.referenceUrls.addEventListener('input',()=>updateCreditEstimate());
  document.querySelectorAll('[data-video-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.videoMode));
  el.referenceButton.onclick=()=>el.referenceInput.click();
  el.referenceInput.onchange=event=>{addReferenceFiles(Array.from(event.target.files||[]));event.target.value=''};
  el.firstButton.onclick=()=>el.firstInput.click();
  el.lastButton.onclick=()=>el.lastInput.click();
  el.firstInput.onchange=event=>{setFrame('first',event.target.files?.[0]);event.target.value=''};
  el.lastInput.onchange=event=>{setFrame('last',event.target.files?.[0]);event.target.value=''};
  el.referenceButton.addEventListener('dragover',event=>{event.preventDefault();el.referenceButton.classList.add('is-dragover')});
  el.referenceButton.addEventListener('dragleave',()=>el.referenceButton.classList.remove('is-dragover'));
  el.referenceButton.addEventListener('drop',event=>{
    event.preventDefault();
    el.referenceButton.classList.remove('is-dragover');
    addReferenceFiles(Array.from(event.dataTransfer?.files||[]));
  });
  el.generate.onclick=generateVideo;
  el.stop.onclick=()=>state.controller?.abort();
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&!el.generate.disabled)generateVideo();
  });
  window.addEventListener('beforeunload',()=>{
    [...state.references,state.firstFrame,state.lastFrame].filter(Boolean).forEach(releaseEntry);
  });

  initCommonPage();
  initVideoDropdowns();
  setMode('reference');
  renderReferences();
  updateCreditEstimate();
  const pending=loadPendingJob();
  if(pending){
    showProgress('正在恢复视频任务',0);
    waitForJob(pending.taskId,pending.payload);
  }else{
    showEmpty();
  }
})();
