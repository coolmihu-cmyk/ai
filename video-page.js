"use strict";

(() => {
  const VIDEO_MODEL='doubao-seedance-2.0';
  const VIDEO_JOB_KEY='mihu_seedance_video_job';
  const REVIEW_JOB_KEY='mihu_seedance_review_job';
  const MATERIAL_LIBRARY_KEY='mihu_seedance_material_library_v1';
  const MAX_IMAGE_BYTES=20*1024*1024;
  const MAX_REFERENCES=9;
  const MAX_WAIT_MS=15*60*1000;
  const POLL_INTERVAL=2500;
  const ALLOWED_IMAGE_TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
  const el={
    prompt:$('#videoPrompt'),promptCount:$('#videoPromptCount'),
    mentionMenu:$('#videoMentionMenu'),mentionList:$('#videoMentionList'),mentionEmpty:$('#videoMentionEmpty'),
    duration:$('#videoDuration'),durationValue:$('#videoDurationValue'),
    size:$('#videoSize'),resolution:$('#videoResolution'),seed:$('#videoSeed'),
    generateAudio:$('#videoGenerateAudio'),returnLastFrame:$('#videoReturnLastFrame'),webSearch:$('#videoWebSearch'),
    referenceUrls:$('#videoReferenceUrls'),audioUrls:$('#videoAudioUrls'),
    virtualImageUrls:$('#videoVirtualImageUrls'),virtualVideoUrls:$('#videoVirtualVideoUrls'),
    virtualAudioUrls:$('#videoVirtualAudioUrls'),
    materialPicker:$('#videoMaterialPicker'),materialPickerTrigger:$('#videoMaterialPickerTrigger'),
    materialPickerMenu:$('#videoMaterialPickerMenu'),materialPickerList:$('#videoMaterialPickerList'),
    materialPickerEmpty:$('#videoMaterialPickerEmpty'),materialPickerCount:$('#videoMaterialPickerCount'),
    referenceButton:$('#videoReferenceButton'),referenceInput:$('#videoReferenceInput'),referenceGrid:$('#videoReferenceGrid'),
    firstButton:$('#videoFirstFrameButton'),firstInput:$('#videoFirstFrameInput'),
    lastButton:$('#videoLastFrameButton'),lastInput:$('#videoLastFrameInput'),
    error:$('#videoError'),generate:$('#videoGenerateButton'),
    empty:$('#videoEmptyState'),progress:$('#videoProgressState'),resultState:$('#videoResultState'),
    progressStatus:$('#videoProgressStatus'),progressPercent:$('#videoProgressPercent'),
    progressBar:$('#videoProgressBar'),progressTime:$('#videoProgressTime'),stop:$('#videoStopWaiting'),
    result:$('#videoResult'),openResult:$('#videoOpenResult'),downloadResult:$('#videoDownloadResult'),
    lastFrame:$('#videoLastFrameResult'),outputMeta:$('#videoOutputMeta'),
    reviewAssetType:$('#videoReviewAssetType'),reviewProject:$('#videoReviewProject'),
    reviewGroupName:$('#videoReviewGroupName'),reviewGroupDescription:$('#videoReviewGroupDescription'),
    reviewNewGroup:$('#videoReviewNewGroup'),reviewAppendMode:$('#videoReviewAppendMode'),
    reviewAppendName:$('#videoReviewAppendName'),reviewAppendId:$('#videoReviewAppendId'),
    reviewAppendDescription:$('#videoReviewAppendDescription'),reviewAppendCancel:$('#videoReviewAppendCancel'),
    reviewAssets:$('#videoReviewAssets'),
    reviewLocalBlock:$('#videoReviewLocalBlock'),reviewLocalButton:$('#videoReviewLocalButton'),
    reviewLocalInput:$('#videoReviewLocalInput'),reviewLocalGrid:$('#videoReviewLocalGrid'),
    reviewAssetCount:$('#videoReviewAssetCount'),reviewError:$('#videoReviewError'),
    reviewSubmit:$('#videoReviewSubmit'),reviewEmpty:$('#videoReviewEmpty'),
    reviewProgress:$('#videoReviewProgress'),reviewResults:$('#videoReviewResults'),
    reviewProgressStatus:$('#videoReviewProgressStatus'),reviewProgressPercent:$('#videoReviewProgressPercent'),
    reviewProgressBar:$('#videoReviewProgressBar'),reviewProgressDetail:$('#videoReviewProgressDetail'),
    reviewStop:$('#videoReviewStop'),reviewMeta:$('#videoReviewMeta'),
    reviewSummary:$('#videoReviewSummary'),reviewResultList:$('#videoReviewResultList'),
    materialHistoryList:$('#videoMaterialHistoryList'),materialHistoryEmpty:$('#videoMaterialHistoryEmpty'),
    materialHistoryCount:$('#videoMaterialHistoryCount')
  };

  const state={
    mode:'reference',
    references:[],
    firstFrame:null,
    lastFrame:null,
    controller:null,
    workspace:'generation',
    appendGroup:null,
    reviewController:null,
    reviewFiles:[],
    materials:[],
    mentionGroups:[],
    mentionIndex:0,
    mentionRange:null
  };

  function setError(message=''){
    el.error.textContent=message;
    el.error.hidden=!message;
  }

  function setReviewError(message=''){
    el.reviewError.textContent=message;
    el.reviewError.hidden=!message;
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

  function isNetworkError(error){
    return error?.code==='NETWORK_ERROR'
      ||(error instanceof TypeError&&/fetch|network|load/i.test(error.message||''));
  }

  async function fetchApi(url,options,stage){
    try{
      return await fetch(url,options);
    }catch(error){
      if(error?.name==='AbortError')throw error;
      const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
      const submitWarning=stage==='提交素材审核'
        ?' 请求可能已经到达服务端，请勿连续点击提交；可稍等后再确认。'
        :'';
      const wrapped=new Error(offline
        ?`${stage}失败：当前设备已离线。`
        :`${stage}失败：浏览器未能连接到 APIMart。请检查网络、代理或 Clash TUN。${submitWarning}`);
      wrapped.code='NETWORK_ERROR';
      wrapped.original=error;
      throw wrapped;
    }
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

  function parseVirtualAssetList(value,label,limit){
    const urls=value.split(/\r?\n|,/).map(item=>item.trim()).filter(Boolean);
    if(urls.length>limit)throw new Error(`${label}最多填写 ${limit} 个。`);
    for(const url of urls){
      if(!/^asset:\/\//i.test(url))throw new Error(`${label}必须使用审核通过的 asset:// 地址。`);
    }
    return [...new Set(urls)];
  }

  function setWorkspace(workspace){
    state.workspace=workspace;
    if(workspace!=='generation'&&el.materialPicker)setMaterialPicker(false);
    document.querySelectorAll('[data-video-workspace]').forEach(button=>{
      const active=button.dataset.videoWorkspace===workspace;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-video-workspace-panel]').forEach(panel=>{
      panel.hidden=panel.dataset.videoWorkspacePanel!==workspace;
    });
  }

  function setAppendGroup(group){
    state.appendGroup=group?.id?{
      id:String(group.id),
      name:group.name||'未命名素材组',
      description:group.description||'',
      projectName:group.projectName||''
    }:null;
    el.reviewAppendMode.hidden=!state.appendGroup;
    el.reviewNewGroup.hidden=!!state.appendGroup;
    el.reviewProject.disabled=!!state.appendGroup;
    if(!state.appendGroup)return;
    el.reviewProject.value=state.appendGroup.projectName;
    el.reviewAppendName.textContent=state.appendGroup.name;
    el.reviewAppendId.textContent=state.appendGroup.id;
    el.reviewAppendDescription.textContent=state.appendGroup.description||'暂无素材组说明';
  }

  function defaultReviewGroupName(){
    const now=new Date();
    const part=value=>String(value).padStart(2,'0');
    return `MIHU-${now.getFullYear()}${part(now.getMonth()+1)}${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}`;
  }

  function deriveAssetName(url,index){
    try{
      const path=new URL(url).pathname;
      const filename=decodeURIComponent(path.split('/').filter(Boolean).pop()||'');
      const name=filename.replace(/\.[^.]+$/,'').trim();
      return (name||`素材-${index+1}`).slice(0,80);
    }catch(_){
      return `素材-${index+1}`;
    }
  }

  function parseReviewAssets(){
    const lines=el.reviewAssets.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    if(lines.length>20)throw new Error('每次最多审核 20 个素材。');
    const seen=new Set();
    return lines.map((line,index)=>{
      const separator=line.indexOf('|');
      const suppliedName=separator>=0?line.slice(0,separator).trim():'';
      const url=(separator>=0?line.slice(separator+1):line).trim();
      if(!/^https?:\/\//i.test(url))throw new Error(`第 ${index+1} 行必须是 http 或 https 公网 URL。`);
      if(seen.has(url))throw new Error(`第 ${index+1} 行与前面的 URL 重复。`);
      seen.add(url);
      return {url,name:(suppliedName||deriveAssetName(url,index)).slice(0,80)};
    });
  }

  function reviewLocalCount(){
    return el.reviewAssetType.value==='Image'?state.reviewFiles.length:0;
  }

  function updateReviewAssetCount(){
    const urlCount=el.reviewAssets.value.split(/\r?\n/).filter(line=>line.trim()).length;
    const count=urlCount+reviewLocalCount();
    el.reviewAssetCount.textContent=count;
    el.reviewAssetCount.parentElement.classList.toggle('is-over-limit',count>20);
  }

  function renderReviewFiles(){
    el.reviewLocalGrid.replaceChildren();
    state.reviewFiles.forEach((entry,index)=>{
      const item=document.createElement('div');
      item.className='video-review-local-item';
      const image=document.createElement('img');
      image.src=entry.preview;
      image.alt=entry.file.name||`本地图片 ${index+1}`;
      const name=document.createElement('span');
      name.textContent=entry.file.name;
      const remove=document.createElement('button');
      remove.type='button';
      remove.setAttribute('aria-label',`移除 ${entry.file.name}`);
      remove.textContent='×';
      remove.onclick=()=>{
        releaseEntry(entry);
        state.reviewFiles.splice(index,1);
        renderReviewFiles();
      };
      item.append(image,name,remove);
      el.reviewLocalGrid.appendChild(item);
    });
    el.reviewLocalGrid.hidden=!state.reviewFiles.length;
    el.reviewLocalButton.textContent=state.reviewFiles.length?`继续添加（${state.reviewFiles.length}）`:'选择图片';
    updateReviewAssetCount();
  }

  function addReviewFiles(files){
    setReviewError();
    const urlCount=el.reviewAssets.value.split(/\r?\n/).filter(line=>line.trim()).length;
    for(const file of files){
      if(state.reviewFiles.length+urlCount>=20){
        setReviewError('本地图片与公网 URL 合计最多 20 个。');
        break;
      }
      const error=validateImage(file);
      if(error){
        setReviewError(error);
        continue;
      }
      state.reviewFiles.push(makeFileEntry(file));
    }
    renderReviewFiles();
  }

  function syncReviewLocalVisibility(){
    const imageMode=el.reviewAssetType.value==='Image';
    el.reviewLocalBlock.hidden=!imageMode;
    updateReviewAssetCount();
  }

  function reviewStatusLabel(status){
    return {
      submitted:'审核任务已提交',
      pending:'正在排队',
      processing:'正在审核素材',
      retrying:'服务繁忙，正在重试'
    }[status]||'正在审核素材';
  }

  function showReviewEmpty(){
    el.reviewEmpty.hidden=false;
    el.reviewProgress.hidden=true;
    el.reviewResults.hidden=true;
    el.reviewMeta.textContent='等待提交';
  }

  function showReviewProgress(status='正在提交审核',progress=0,detail='审核时间取决于素材数量'){
    const value=Number.isFinite(Number(progress))?Math.max(0,Math.min(100,Math.round(Number(progress)))):0;
    el.reviewEmpty.hidden=true;
    el.reviewProgress.hidden=false;
    el.reviewResults.hidden=true;
    el.reviewProgressStatus.textContent=status;
    el.reviewProgressPercent.textContent=value+'%';
    el.reviewProgressBar.style.width=value+'%';
    el.reviewProgressDetail.textContent=detail;
    el.reviewMeta.textContent='审核中';
  }

  function appendReviewedUrl(field,url,label,limit){
    const urls=field.value.split(/\r?\n|,/).map(value=>value.trim()).filter(Boolean);
    if(urls.includes(url)){
      toast(`${label}已加入素材`);
      setWorkspace('generation');
      setMode('virtual');
      return;
    }
    if(urls.length>=limit){
      setError(`${label}最多添加 ${limit} 个，请先移除一个。`);
      setWorkspace('generation');
      setMode('virtual');
      return;
    }
    urls.push(url);
    field.value=urls.join('\n');
    field.dispatchEvent(new Event('input',{bubbles:true}));
    setWorkspace('generation');
    setMode('virtual');
    toast(`已加入虚拟${label}`);
  }

  function useReviewedAsset(type,url){
    setError();
    const config={
      Image:[el.virtualImageUrls,'图片',9],
      Video:[el.virtualVideoUrls,'视频',3],
      Audio:[el.virtualAudioUrls,'音频',3]
    }[type];
    if(!config){
      setReviewError('无法识别这个素材的类型。');
      return;
    }
    appendReviewedUrl(config[0],url,config[1],config[2]);
  }

  async function copyText(value){
    try{
      await navigator.clipboard.writeText(value);
      toast('地址已复制');
    }catch(_){
      const input=document.createElement('textarea');
      input.value=value;
      input.style.position='fixed';
      input.style.opacity='0';
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
      toast('地址已复制');
    }
  }

  function materialTypeLabel(type){
    return {Image:'图片',Video:'视频',Audio:'音频'}[type]||'素材';
  }

  function materialGroups(){
    const groups=new Map();
    state.materials.forEach(item=>{
      const name=String(item.groupName||'').trim();
      if(item.type!=='Image'||!name||!/^asset:\/\//i.test(item.assetUrl||''))return;
      const key=name.toLocaleLowerCase();
      const existing=groups.get(key);
      if(existing&&existing.groupId&&item.groupId&&existing.groupId!==item.groupId)return;
      const group=existing||{
        key,
        name,
        groupId:item.groupId||'',
        projectName:item.projectName||'',
        description:item.groupDescription||'',
        urls:new Set()
      };
      group.urls.add(item.assetUrl);
      groups.set(key,group);
    });
    return [...groups.values()].map(group=>({...group,urls:[...group.urls]}));
  }

  function mentionContext(){
    const caret=el.prompt.selectionStart;
    if(caret===null)return null;
    const before=el.prompt.value.slice(0,caret);
    const start=before.lastIndexOf('@');
    if(start<0)return null;
    const query=before.slice(start+1);
    if(query.includes('\n')||query.length>60)return null;
    const groups=materialGroups();
    if(groups.some(group=>query.startsWith(group.name)&&/\s/.test(query.charAt(group.name.length))))return null;
    return {start,end:caret,query};
  }

  function closeMentionMenu(){
    state.mentionGroups=[];
    state.mentionRange=null;
    state.mentionIndex=0;
    el.mentionMenu.hidden=true;
    el.prompt.setAttribute('aria-expanded','false');
  }

  function renderMentionMenu(){
    const context=mentionContext();
    if(!context){
      closeMentionMenu();
      return;
    }
    const query=context.query.trim().toLocaleLowerCase();
    state.mentionGroups=materialGroups().filter(group=>!query||group.name.toLocaleLowerCase().includes(query));
    state.mentionRange=context;
    state.mentionIndex=Math.min(state.mentionIndex,Math.max(0,state.mentionGroups.length-1));
    el.mentionList.replaceChildren();
    state.mentionGroups.forEach((group,index)=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='video-mention-item';
      if(index===state.mentionIndex)button.classList.add('is-active');
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(index===state.mentionIndex));
      const mark=document.createElement('span');
      mark.className='video-mention-mark';
      mark.textContent='@';
      const copy=document.createElement('span');
      copy.className='video-mention-copy';
      const name=document.createElement('strong');
      name.textContent=group.name;
      const meta=document.createElement('small');
      meta.textContent=group.description||group.projectName||group.groupId||'图片素材组';
      copy.append(name,meta);
      button.append(mark,copy);
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.onclick=()=>selectMentionGroup(group);
      el.mentionList.appendChild(button);
    });
    el.mentionEmpty.hidden=state.mentionGroups.length>0;
    el.mentionMenu.hidden=false;
    el.prompt.setAttribute('aria-expanded','true');
  }

  function selectMentionGroup(group){
    const range=state.mentionRange||mentionContext();
    if(!range)return;
    const value=el.prompt.value;
    const insertion=`@${group.name} `;
    el.prompt.value=value.slice(0,range.start)+insertion+value.slice(range.end);
    const caret=range.start+insertion.length;
    el.prompt.setSelectionRange(caret,caret);
    el.promptCount.textContent=el.prompt.value.length;
    closeMentionMenu();
    el.prompt.focus();
  }

  function mentionedMaterialGroups(prompt=el.prompt.value){
    return materialGroups().filter(group=>prompt.includes(`@${group.name}`));
  }

  function promptForApi(prompt,groups){
    return groups
      .sort((a,b)=>b.name.length-a.name.length)
      .reduce((value,group)=>value.split(`@${group.name}`).join(group.name),prompt);
  }

  function loadMaterialLibrary(){
    try{
      const items=JSON.parse(localStorage.getItem(MATERIAL_LIBRARY_KEY)||'[]');
      state.materials=Array.isArray(items)
        ?items.filter(item=>item?.assetUrl&&item?.type).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))
        :[];
    }catch(_){
      state.materials=[];
    }
  }

  function persistMaterialLibrary(){
    try{
      state.materials=state.materials
        .filter(item=>item?.assetUrl&&item?.type)
        .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))
        .slice(0,500);
      localStorage.setItem(MATERIAL_LIBRARY_KEY,JSON.stringify(state.materials));
      return true;
    }catch(error){
      console.warn('素材历史保存失败',error);
      toast('素材历史保存失败');
      return false;
    }
  }

  function selectedMaterialUrls(){
    return new Set([
      ...el.virtualImageUrls.value.split(/\r?\n|,/),
      ...el.virtualVideoUrls.value.split(/\r?\n|,/),
      ...el.virtualAudioUrls.value.split(/\r?\n|,/)
    ].map(value=>value.trim()).filter(Boolean));
  }

  function materialDate(value){
    const date=new Date(value||0);
    if(Number.isNaN(date.getTime()))return '';
    return new Intl.DateTimeFormat('zh-CN',{
      month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
    }).format(date);
  }

  function materialVisual(item,className){
    const visual=document.createElement('span');
    visual.className=className;
    if(item.type==='Image'&&/^https?:\/\//i.test(item.sourceUrl||'')){
      const image=document.createElement('img');
      image.src=item.sourceUrl;
      image.alt=item.name||'素材图片';
      image.loading='lazy';
      image.onerror=()=>image.remove();
      visual.appendChild(image);
    }
    const mark=document.createElement('b');
    mark.textContent={Image:'IMG',Video:'VID',Audio:'AUD'}[item.type]||'AST';
    visual.appendChild(mark);
    return visual;
  }

  function renderMaterialPicker(){
    const selected=selectedMaterialUrls();
    el.materialPickerCount.textContent=state.materials.length;
    el.materialPickerList.replaceChildren();
    el.materialPickerEmpty.hidden=state.materials.length>0;
    state.materials.forEach(item=>{
      const button=document.createElement('button');
      button.type='button';
      button.className='video-material-picker-item';
      button.setAttribute('role','option');
      button.setAttribute('aria-selected',String(selected.has(item.assetUrl)));
      if(selected.has(item.assetUrl))button.classList.add('is-selected');
      const visual=materialVisual(item,'video-material-picker-visual');
      const copy=document.createElement('span');
      const name=document.createElement('strong');
      name.textContent=item.name||materialTypeLabel(item.type);
      const meta=document.createElement('small');
      meta.textContent=`${materialTypeLabel(item.type)} · ${materialDate(item.createdAt)}`;
      copy.append(name,meta);
      const check=document.createElement('i');
      check.textContent=selected.has(item.assetUrl)?'✓':'+';
      button.append(visual,copy,check);
      button.onclick=event=>{
        event.stopPropagation();
        useReviewedAsset(item.type,item.assetUrl);
        renderMaterialPicker();
      };
      el.materialPickerList.appendChild(button);
    });
  }

  function continueMaterialGroup(item){
    if(!item.groupId){
      toast('这条历史没有 group_id，无法继续追加素材');
      return;
    }
    if(!item.projectName){
      toast('这条旧记录没有 project_name，无法安全追加素材');
      return;
    }
    setAppendGroup({
      id:item.groupId,
      name:item.groupName,
      description:item.groupDescription,
      projectName:item.projectName
    });
    el.reviewAssetType.value=item.type||'Image';
    syncReviewLocalVisibility();
    setWorkspace('review');
    el.reviewNewGroup.closest('.video-review-form')?.scrollIntoView({behavior:'smooth',block:'start'});
    toast(`继续添加到「${item.groupName||'素材组'}」`);
  }

  function renderMaterialHistory(){
    el.materialHistoryCount.textContent=`${state.materials.length} 个`;
    el.materialHistoryEmpty.hidden=state.materials.length>0;
    el.materialHistoryList.replaceChildren();
    state.materials.forEach(item=>{
      const card=document.createElement('article');
      card.className='video-material-history-item';
      const visual=materialVisual(item,'video-material-history-visual');
      const body=document.createElement('div');
      body.className='video-material-history-copy';
      const top=document.createElement('div');
      const name=document.createElement('strong');
      name.textContent=item.name||materialTypeLabel(item.type);
      const date=document.createElement('small');
      date.textContent=materialDate(item.createdAt);
      top.append(name,date);
      const address=document.createElement('code');
      address.textContent=`素材：${item.assetUrl}`;
      const group=document.createElement('p');
      group.textContent=item.groupName
        ?`素材组：${item.groupName}${item.projectName?` · 项目：${item.projectName}`:''}${item.groupDescription?` · ${item.groupDescription}`:''}`
        :'素材组：未记录';
      body.append(top,group,address);
      const actions=document.createElement('div');
      actions.className='video-material-history-actions';
      const copyButton=document.createElement('button');
      copyButton.type='button';
      copyButton.textContent='复制';
      copyButton.onclick=()=>copyText(item.assetUrl);
      const useButton=document.createElement('button');
      useButton.type='button';
      useButton.className='primary';
      useButton.textContent='用于视频';
      useButton.onclick=()=>useReviewedAsset(item.type,item.assetUrl);
      const continueButton=document.createElement('button');
      continueButton.type='button';
      continueButton.className='continue';
      continueButton.textContent='继续添加素材';
      continueButton.disabled=!item.groupId||!item.projectName;
      continueButton.title=!item.groupId
        ?'接口没有返回这个素材组的 group_id'
        :!item.projectName
          ?'旧记录没有保存 project_name，不能安全追加'
          :'按文档要求向这个素材组追加素材';
      continueButton.onclick=()=>continueMaterialGroup(item);
      const removeButton=document.createElement('button');
      removeButton.type='button';
      removeButton.className='danger';
      removeButton.title='删除素材记录';
      removeButton.setAttribute('aria-label',`删除 ${item.name||'素材'} 的记录`);
      removeButton.textContent='×';
      removeButton.onclick=()=>{
        state.materials=state.materials.filter(material=>material.assetUrl!==item.assetUrl);
        persistMaterialLibrary();
        renderMaterialHistory();
        renderMaterialPicker();
        renderMentionMenu();
      };
      actions.append(copyButton,useButton,continueButton,removeButton);
      card.append(visual,body,actions);
      el.materialHistoryList.appendChild(card);
    });
  }

  function resolveMaterialGroup(data,context={},usable=[]){
    const result=data?.result||{};
    const first=usable[0]||{};
    const responseGroup=result.group||data?.group||{};
    const id=context.group?.id
      ||result.group_id||result.groupId||result.GroupId
      ||data?.group_id||data?.groupId||data?.GroupId
      ||responseGroup.id||responseGroup.group_id||responseGroup.GroupId
      ||first.group_id||first.groupId||first.GroupId
      ||'';
    return {
      id:String(id||''),
      name:context.group?.name||responseGroup.name||responseGroup.group_name||'',
      description:context.group?.description||responseGroup.description||'',
      projectName:context.group?.projectName||data?.project_name||result.project_name||responseGroup.project_name||''
    };
  }

  function storeReviewedMaterials(usable,context={}){
    const now=new Date().toISOString();
    const additions=usable.map((asset,index)=>{
      const assetUrl=asset.asset_url||asset.url||'';
      const source=context.assets?.find(candidate=>candidate.name&&candidate.name===asset.name)
        ||context.assets?.[index]
        ||{};
      return {
        id:asset.asset_id||asset.id||assetUrl,
        assetUrl,
        sourceUrl:asset.source_url||asset.original_url||source.url||'',
        name:asset.name||source.name||`${materialTypeLabel(context.assetType)} ${index+1}`,
        type:context.assetType,
        groupId:context.group?.id||'',
        groupName:context.group?.name||'',
        groupDescription:context.group?.description||'',
        projectName:context.group?.projectName||'',
        createdAt:now
      };
    }).filter(item=>item.assetUrl);
    if(!additions.length)return;
    const merged=new Map(state.materials.map(item=>[item.assetUrl,item]));
    additions.forEach(item=>merged.set(item.assetUrl,{...merged.get(item.assetUrl),...item}));
    state.materials=[...merged.values()];
    persistMaterialLibrary();
    renderMaterialHistory();
    renderMaterialPicker();
  }

  function setMaterialPicker(open){
    el.materialPicker.classList.toggle('open',open);
    el.materialPickerMenu.hidden=!open;
    el.materialPickerTrigger.setAttribute('aria-expanded',String(open));
    if(open)renderMaterialPicker();
  }

  function renderReviewResults(data,context){
    const result=data.result||{};
    let usable=Array.isArray(result.usable_assets)?result.usable_assets:[];
    const failed=Array.isArray(result.failed_assets)?result.failed_assets:[];
    if(!usable.length&&typeof result.asset_url==='string'){
      usable=[{asset_url:result.asset_url,name:context.assets?.[0]?.name||'素材'}];
    }
    context={...context,group:resolveMaterialGroup(data,context,usable)};
    storeReviewedMaterials(usable,context);
    el.reviewEmpty.hidden=true;
    el.reviewProgress.hidden=true;
    el.reviewResults.hidden=false;
    el.reviewResultList.replaceChildren();

    const passed=document.createElement('strong');
    passed.textContent=`${usable.length} 个可用`;
    const failedCount=document.createElement('span');
    failedCount.textContent=failed.length?` · ${failed.length} 个未通过`:'';
    el.reviewSummary.replaceChildren(passed,failedCount);

    usable.forEach((asset,index)=>{
      const url=asset.asset_url||asset.url||'';
      if(!url)return;
      const item=document.createElement('article');
      item.className='video-review-result-item';
      const copy=document.createElement('div');
      const name=document.createElement('strong');
      name.textContent=asset.name||context.assets?.[index]?.name||`可用素材 ${index+1}`;
      const address=document.createElement('code');
      address.textContent=url;
      copy.append(name,address);
      const actions=document.createElement('div');
      const copyButton=document.createElement('button');
      copyButton.type='button';
      copyButton.textContent='复制';
      copyButton.onclick=()=>copyText(url);
      const useButton=document.createElement('button');
      useButton.type='button';
      useButton.className='primary';
      useButton.textContent='用于视频';
      useButton.onclick=()=>useReviewedAsset(context.assetType,url);
      actions.append(copyButton,useButton);
      item.append(copy,actions);
      el.reviewResultList.appendChild(item);
    });

    failed.forEach((asset,index)=>{
      const item=document.createElement('article');
      item.className='video-review-result-item is-failed';
      const copy=document.createElement('div');
      const name=document.createElement('strong');
      name.textContent=asset.name||`未通过素材 ${index+1}`;
      const reason=document.createElement('small');
      reason.textContent=asset.reason||asset.error?.message||asset.message||'素材未通过审核';
      copy.append(name,reason);
      item.appendChild(copy);
      el.reviewResultList.appendChild(item);
    });
    el.reviewMeta.textContent=failed.length?(usable.length?'部分完成':'审核未通过'):'审核完成';
    if(!usable.length&&failed.length)setReviewError('本次没有可用素材，请检查失败原因后重新提交。');
  }

  function savePendingReview(taskId,context){
    localStorage.setItem(REVIEW_JOB_KEY,JSON.stringify({taskId,context,createdAt:Date.now()}));
  }

  function loadPendingReview(){
    try{
      const job=JSON.parse(localStorage.getItem(REVIEW_JOB_KEY)||'null');
      if(!job?.taskId)return null;
      if(Date.now()-Number(job.createdAt||0)>72*60*60*1000){
        localStorage.removeItem(REVIEW_JOB_KEY);
        return null;
      }
      return job;
    }catch(_){
      localStorage.removeItem(REVIEW_JOB_KEY);
      return null;
    }
  }

  async function pollReviewTask(apiKey,taskId,signal){
    const started=performance.now();
    let networkFailures=0;
    while(true){
      if(signal.aborted)throw new DOMException('已停止等待','AbortError');
      if(performance.now()-started>MAX_WAIT_MS)throw new DOMException('等待超过15分钟，请稍后刷新页面继续查询。','TimeoutError');
      let response;
      try{
        response=await fetchApi(APIMART_BASE+'/tasks/'+encodeURIComponent(taskId)+'?language=zh',{
          headers:{'Authorization':'Bearer '+apiKey,'Accept':'application/json'},
          signal
        },'查询素材任务');
      }catch(error){
        if(!isNetworkError(error))throw error;
        networkFailures++;
        if(networkFailures>5)throw error;
        showReviewProgress('网络波动，正在重新连接',0,`第 ${networkFailures}/5 次重试，任务不会丢失`);
        await new Promise(resolve=>setTimeout(resolve,POLL_INTERVAL));
        continue;
      }
      networkFailures=0;
      if(!response.ok)throw new Error(parseApiError(await response.text(),response.status));
      const json=await response.json();
      const data=json.data||json;
      showReviewProgress(reviewStatusLabel(data.status),Number(data.progress)||0,data.estimated_time?`预计约 ${data.estimated_time} 秒完成`:'审核时间取决于素材数量');
      if(data.status==='completed'||data.status==='failed')return data;
      if(data.status==='cancelled')throw new Error('素材审核任务已取消。');
      await new Promise(resolve=>setTimeout(resolve,POLL_INTERVAL));
    }
  }

  async function waitForReviewJob(taskId,context){
    const apiKey=Settings.getKey();
    if(!apiKey){Settings.openPage();return}
    state.reviewController?.abort();
    state.reviewController=new AbortController();
    el.reviewSubmit.disabled=true;
    el.reviewSubmit.querySelector('span').textContent='审核中';
    try{
      const data=await pollReviewTask(apiKey,taskId,state.reviewController.signal);
      localStorage.removeItem(REVIEW_JOB_KEY);
      const result=data.result||{};
      const hasResult=(Array.isArray(result.usable_assets)&&result.usable_assets.length)
        ||(Array.isArray(result.failed_assets)&&result.failed_assets.length)
        ||typeof result.asset_url==='string';
      if(data.status==='failed'&&!hasResult)throw new Error(data.error?.message||'素材审核失败，接口没有返回可用结果。');
      renderReviewResults(data,context);
      toast(data.status==='completed'?'素材审核完成':'素材审核已返回结果');
    }catch(error){
      if(error.name==='AbortError'){
        showReviewProgress('已停止等待',0,'任务仍在服务器审核，刷新页面可继续查询。');
        return;
      }
      if(isNetworkError(error)||error.name==='TimeoutError'){
        setReviewError(error.message||'任务查询暂时中断。');
        showReviewProgress('连接暂时中断',0,'审核任务仍已保留，恢复网络后刷新页面可继续查询。');
        return;
      }
      setReviewError(error.message||'素材审核失败。');
      showReviewEmpty();
      if(error.name!=='TimeoutError')localStorage.removeItem(REVIEW_JOB_KEY);
    }finally{
      el.reviewSubmit.disabled=false;
      el.reviewSubmit.querySelector('span').textContent='提交审核';
    }
  }

  async function submitReview(){
    setReviewError();
    const apiKey=Settings.getKey();
    if(!apiKey){Settings.openPage();return}
    try{
      const assets=parseReviewAssets();
      const localFiles=el.reviewAssetType.value==='Image'?state.reviewFiles:[];
      if(!assets.length&&!localFiles.length)throw new Error('请选择本地图片或填写公网素材 URL。');
      if(assets.length+localFiles.length>20)throw new Error('本地图片与公网 URL 合计最多 20 个。');
      const projectName=state.appendGroup?.projectName||el.reviewProject.value.trim()||'default';
      const payload={
        project_name:projectName,
        asset_type:el.reviewAssetType.value,
        assets:[]
      };
      let groupContext;
      if(state.appendGroup){
        payload.group_id=state.appendGroup.id;
        groupContext={...state.appendGroup};
      }else{
        const name=el.reviewGroupName.value.trim();
        if(!name)throw new Error('请填写素材组名称。');
        payload.group={name};
        const description=el.reviewGroupDescription.value.trim();
        if(description)payload.group.description=description;
        groupContext={id:'',name,description,projectName};
      }

      state.reviewController?.abort();
      state.reviewController=new AbortController();
      el.reviewSubmit.disabled=true;
      el.reviewSubmit.querySelector('span').textContent='提交中';

      for(let index=0;index<localFiles.length;index++){
        const entry=localFiles[index];
        const progress=Math.round((index/localFiles.length)*35);
        showReviewProgress('正在上传本地图片',progress,`正在上传 ${index+1}/${localFiles.length}`);
        if(!entry.url)entry.url=await uploadImage(entry.file,apiKey,state.reviewController.signal);
        payload.assets.push({
          url:entry.url,
          name:entry.file.name.replace(/\.[^.]+$/,'').slice(0,80)||`本地图片-${index+1}`
        });
      }
      payload.assets.push(...assets);

      showReviewProgress('正在提交审核',localFiles.length?40:0);
      const response=await fetchApi(APIMART_BASE+'/seedance2/private-avatar',{
        method:'POST',
        headers:{
          'Authorization':'Bearer '+apiKey,
          'Content-Type':'application/json',
          'Accept':'application/json'
        },
        body:JSON.stringify(payload),
        signal:state.reviewController.signal
      },'提交素材审核');
      if(!response.ok)throw new Error(parseApiError(await response.text(),response.status));
      const json=await response.json();
      const taskId=json.data?.id||json.data?.task_id||json.id||json.task_id;
      if(!taskId)throw new Error('审核任务已提交，但接口没有返回任务 ID。');
      const submittedGroup=json.data?.group||json.group||{};
      groupContext.id=groupContext.id
        ||json.data?.group_id||json.data?.groupId||json.data?.GroupId
        ||json.group_id||json.groupId||json.GroupId
        ||submittedGroup.id||submittedGroup.group_id||submittedGroup.GroupId
        ||'';
      const context={assetType:payload.asset_type,assets:payload.assets,group:groupContext};
      savePendingReview(taskId,context);
      await waitForReviewJob(taskId,context);
    }catch(error){
      if(error.name!=='AbortError'){
        setReviewError(error.message||'素材审核提交失败。');
        showReviewEmpty();
      }
      el.reviewSubmit.disabled=false;
      el.reviewSubmit.querySelector('span').textContent='提交审核';
    }
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
    if(entry?.preview?.startsWith('blob:'))URL.revokeObjectURL(entry.preview);
  }

  function renderReferences(){
    el.referenceGrid.innerHTML='';
    state.references.forEach((entry,index)=>{
      const item=document.createElement('div');
      item.className='video-reference-item';
      const img=document.createElement('img');
      if(entry.preview){
        img.src=entry.preview;
        img.alt=`参考图 ${index+1}`;
      }else{
        item.classList.add('is-reviewed');
        const reviewed=document.createElement('span');
        reviewed.textContent='已审核';
        item.appendChild(reviewed);
      }
      const remove=document.createElement('button');
      remove.type='button';
      remove.setAttribute('aria-label',`移除参考图 ${index+1}`);
      remove.textContent='×';
      remove.onclick=()=>{
        releaseEntry(entry);
        state.references.splice(index,1);
        renderReferences();
      };
      if(entry.preview)item.append(img,remove);
      else item.append(remove);
      el.referenceGrid.appendChild(item);
    });
    el.referenceButton.querySelector('strong').textContent=state.references.length?`继续添加参考图（${state.references.length}/${MAX_REFERENCES}）`:'添加参考图';
  }

  function renderFrame(kind){
    const entry=kind==='first'?state.firstFrame:state.lastFrame;
    const button=kind==='first'?el.firstButton:el.lastButton;
    button.querySelector('.video-frame-preview')?.remove();
    if(!entry){
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
    if(mode!=='virtual')setMaterialPicker(false);
    document.querySelectorAll('[data-video-mode]').forEach(button=>{
      const active=button.dataset.videoMode===mode;
      button.classList.toggle('active',active);
      button.setAttribute('aria-selected',String(active));
    });
    document.querySelectorAll('[data-video-panel]').forEach(panel=>{
      panel.hidden=panel.dataset.videoPanel!==mode;
    });
  }

  async function uploadImage(file,apiKey,signal){
    const form=new FormData();
    form.append('file',file);
    const response=await fetchApi(APIMART_BASE+'/uploads/images',{
      method:'POST',
      headers:{'Authorization':'Bearer '+apiKey},
      body:form,
      signal
    },'上传图片');
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
    let networkFailures=0;
    while(true){
      if(signal.aborted)throw new DOMException('已停止等待','AbortError');
      if(performance.now()-started>MAX_WAIT_MS)throw new DOMException('等待超过15分钟，请稍后刷新页面继续查询。','TimeoutError');
      let response;
      try{
        response=await fetchApi(APIMART_BASE+'/tasks/'+encodeURIComponent(taskId)+'?language=zh',{
          headers:{'Authorization':'Bearer '+apiKey,'Accept':'application/json'},
          signal
        },'查询视频任务');
      }catch(error){
        if(!isNetworkError(error))throw error;
        networkFailures++;
        if(networkFailures>5)throw error;
        showProgress('网络波动，正在重新连接',0,`第 ${networkFailures}/5 次重试，任务不会丢失`);
        await new Promise(resolve=>setTimeout(resolve,POLL_INTERVAL));
        continue;
      }
      networkFailures=0;
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
      if(isNetworkError(error)||error.name==='TimeoutError'){
        setError(error.message||'任务查询暂时中断。');
        showProgress('连接暂时中断',0,'视频任务仍已保留，恢复网络后刷新页面可继续查询。');
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
    const rawPrompt=el.prompt.value.trim();
    if(!rawPrompt)throw new Error('请先描述想生成的视频镜头。');
    const mentionedGroups=mentionedMaterialGroups(rawPrompt);
    const mentionedAssetUrls=[...new Set(mentionedGroups.flatMap(group=>group.urls))];
    const prompt=promptForApi(rawPrompt,mentionedGroups);
    const videoUrls=parseUrlList(el.referenceUrls.value,'参考视频 URL');
    const audioUrls=parseUrlList(el.audioUrls.value,'参考音频 URL');
    const virtualImageUrls=state.mode==='virtual'?parseVirtualAssetList(el.virtualImageUrls.value,'图片素材',9):[];
    const virtualVideoUrls=state.mode==='virtual'?parseVirtualAssetList(el.virtualVideoUrls.value,'视频素材',3):[];
    const virtualAudioUrls=state.mode==='virtual'?parseVirtualAssetList(el.virtualAudioUrls.value,'音频素材',3):[];
    const combinedVideoUrls=[...new Set([...videoUrls,...virtualVideoUrls])];
    const combinedAudioUrls=[...new Set([...audioUrls,...virtualAudioUrls])];
    if(combinedVideoUrls.length>3)throw new Error('参考视频与视频素材合计最多 3 个。');
    if(combinedAudioUrls.length>3)throw new Error('参考音频与音频素材合计最多 3 个。');
    const hasRegularImageInput=state.mode==='reference'
      ?state.references.length>0
      :state.mode==='frames'
        ?!!(state.firstFrame||state.lastFrame)
        :virtualImageUrls.length>0;
    const hasImageInput=hasRegularImageInput||mentionedAssetUrls.length>0;
    const hasInput=hasImageInput||combinedVideoUrls.length>0;
    if(el.size.value==='adaptive'&&!hasInput)throw new Error('自适应比例需要先添加参考图片或参考视频。');
    if(state.mode==='frames'&&(combinedVideoUrls.length||combinedAudioUrls.length))throw new Error('首尾帧模式不能同时使用参考视频或参考音频。');
    if(combinedAudioUrls.length&&!hasInput)throw new Error('参考音频必须与参考图片或参考视频一起使用。');
    if(mentionedAssetUrls.length&&(
      (state.mode==='reference'&&state.references.length)
      ||(state.mode==='virtual'&&virtualImageUrls.length)
    )){
      throw new Error('@素材组不能与普通参考图片同时使用，请保留其中一种。');
    }
    const roleImageCount=mentionedAssetUrls.length+(state.mode==='frames'?Number(!!state.firstFrame)+Number(!!state.lastFrame):0);
    if(roleImageCount>MAX_REFERENCES)throw new Error(`@素材组与首尾帧合计最多 ${MAX_REFERENCES} 张图片。`);

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
    if(combinedVideoUrls.length)payload.video_urls=combinedVideoUrls;
    if(combinedAudioUrls.length)payload.audio_urls=combinedAudioUrls;
    const roleImages=mentionedAssetUrls.map(url=>({url,role:'reference_image'}));

    if(state.mode==='reference'&&state.references.length){
      const urls=[];
      for(let index=0;index<state.references.length;index++){
        showProgress('正在上传参考图',0,`正在上传 ${index+1}/${state.references.length}`);
        const entry=state.references[index];
        urls.push(entry.url||await uploadImage(entry.file,apiKey,signal));
      }
      payload.image_urls=urls;
    }

    if(state.mode==='virtual'&&virtualImageUrls.length){
      payload.image_urls=virtualImageUrls;
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
      roleImages.push(...frames);
    }
    if(roleImages.length)payload.image_with_roles=roleImages;
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

  el.prompt.addEventListener('input',()=>{
    el.promptCount.textContent=el.prompt.value.length;
    state.mentionIndex=0;
    renderMentionMenu();
  });
  el.prompt.addEventListener('click',renderMentionMenu);
  el.prompt.addEventListener('keydown',event=>{
    if(el.mentionMenu.hidden)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      if(!state.mentionGroups.length)return;
      event.preventDefault();
      const direction=event.key==='ArrowDown'?1:-1;
      state.mentionIndex=(state.mentionIndex+direction+state.mentionGroups.length)%state.mentionGroups.length;
      renderMentionMenu();
      el.mentionList.children[state.mentionIndex]?.scrollIntoView({block:'nearest'});
      return;
    }
    if(event.key==='Enter'&&state.mentionGroups.length&&!event.ctrlKey&&!event.metaKey){
      event.preventDefault();
      selectMentionGroup(state.mentionGroups[state.mentionIndex]);
      return;
    }
    if(event.key==='Escape'){
      event.preventDefault();
      closeMentionMenu();
    }
  });
  el.duration.addEventListener('input',()=>{
    el.durationValue.value=el.duration.value+' 秒';
  });
  [el.virtualImageUrls,el.virtualVideoUrls,el.virtualAudioUrls].forEach(field=>{
    field.addEventListener('input',()=>{
      renderMaterialPicker();
    });
  });
  el.materialPickerTrigger.onclick=event=>{
    event.stopPropagation();
    setMaterialPicker(!el.materialPicker.classList.contains('open'));
  };
  el.materialPickerMenu.onclick=event=>event.stopPropagation();
  el.materialPickerEmpty.onclick=()=>{
    setMaterialPicker(false);
    setWorkspace('review');
  };
  document.addEventListener('click',event=>{
    setMaterialPicker(false);
    if(!el.mentionMenu.contains(event.target)&&event.target!==el.prompt)closeMentionMenu();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')setMaterialPicker(false);
  });
  document.querySelectorAll('[data-video-workspace]').forEach(button=>button.onclick=()=>setWorkspace(button.dataset.videoWorkspace));
  el.reviewAppendCancel.onclick=()=>{
    setAppendGroup(null);
    el.reviewProject.value='default';
    el.reviewGroupName.value=defaultReviewGroupName();
  };
  el.reviewAssetType.addEventListener('change',syncReviewLocalVisibility);
  el.reviewAssets.addEventListener('input',updateReviewAssetCount);
  el.reviewLocalButton.onclick=()=>el.reviewLocalInput.click();
  el.reviewLocalInput.onchange=event=>{
    addReviewFiles(Array.from(event.target.files||[]));
    event.target.value='';
  };
  el.reviewLocalBlock.addEventListener('dragover',event=>{
    event.preventDefault();
    el.reviewLocalBlock.classList.add('is-dragover');
  });
  el.reviewLocalBlock.addEventListener('dragleave',()=>el.reviewLocalBlock.classList.remove('is-dragover'));
  el.reviewLocalBlock.addEventListener('drop',event=>{
    event.preventDefault();
    el.reviewLocalBlock.classList.remove('is-dragover');
    addReviewFiles(Array.from(event.dataTransfer?.files||[]));
  });
  el.reviewSubmit.onclick=submitReview;
  el.reviewStop.onclick=()=>state.reviewController?.abort();
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
    if(!(event.ctrlKey||event.metaKey)||event.key!=='Enter')return;
    if(state.workspace==='review'){
      if(!el.reviewSubmit.disabled)submitReview();
    }else if(!el.generate.disabled){
      generateVideo();
    }
  });
  window.addEventListener('beforeunload',()=>{
    [...state.references,...state.reviewFiles,state.firstFrame,state.lastFrame].filter(Boolean).forEach(releaseEntry);
  });

  initCommonPage();
  initVideoDropdowns();
  loadMaterialLibrary();
  renderMaterialHistory();
  renderMaterialPicker();
  el.reviewGroupName.value=defaultReviewGroupName();
  setAppendGroup(null);
  setWorkspace('generation');
  showReviewEmpty();
  syncReviewLocalVisibility();
  renderReviewFiles();
  setMode('reference');
  renderReferences();
  const pending=loadPendingJob();
  if(pending){
    showProgress('正在恢复视频任务',0);
    waitForJob(pending.taskId,pending.payload);
  }else{
    showEmpty();
  }
  const pendingReview=loadPendingReview();
  if(pendingReview){
    setWorkspace('review');
    showReviewProgress('正在恢复审核任务',0);
    waitForReviewJob(pendingReview.taskId,pendingReview.context);
  }
})();
