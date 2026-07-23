/* ===================== 历史记录 ===================== */
function snapshotCreationState(model){
  const state=modelState[model];
  const snapshot={ratio:state.ratio};
  if(state.resolution)snapshot.resolution=state.resolution;
  if(model==='mj')Object.assign(snapshot,{version:state.version,speed:state.speed,quality:state.quality,stylize:state.stylize,chaos:state.chaos,style:state.style,iw:state.iw,negativePrompt:state.negativePrompt||'',seed:state.seed||''});
  return snapshot;
}
function addHistory(url,prompt,model,settings,durationMs){
  const item={id:Date.now(),url,prompt,model,settings:settings||snapshotCreationState(model),createdAt:new Date().toISOString(),durationMs:Number.isFinite(durationMs)?Math.round(durationMs):null};
  sharedHistory.unshift(item);
  if(sharedHistory.length>20)sharedHistory.length=20;
  renderHistory();
  History.save(item);
  return item;
}
function historyIcon(paths){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.9');
  for(const d of paths){const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);svg.appendChild(p)}
  return svg;
}
function flashHistoryAction(button,success=true){
  const original=button.innerHTML;
  button.classList.toggle('success',success);button.classList.toggle('failed',!success);
  button.textContent=success?'✓':'!';
  setTimeout(()=>{button.innerHTML=original;button.classList.remove('success','failed')},900);
}
function formatHistoryDate(value){
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return '日期未知';
  return new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date).replace('/','-');
}
function renderHistory(){
  els.historyList.innerHTML='';
  const frag=document.createDocumentFragment();
  for(const item of sharedHistory){
    const el=document.createElement('div');
    el.className='history-item'+(item.url===currentResultUrl?' active':'');
    el.title=item.prompt;
    const img=document.createElement('img');img.className='history-thumb';img.src=item.url;img.alt=item.prompt;
    const content=document.createElement('div');content.className='history-content';
    const head=document.createElement('div');head.className='history-card-head';
    const tag=document.createElement('span');tag.className='model-tag';tag.textContent=MODEL_NAMES[item.model]||item.model;
    const meta=document.createElement('span');meta.className='history-meta';
    meta.textContent=formatHistoryDate(item.createdAt)+(Number.isFinite(item.durationMs)?' · '+formatDuration(item.durationMs):'');
    head.append(tag,meta);
    const prompt=document.createElement('p');prompt.className='history-prompt';prompt.textContent=item.prompt;
    const actions=document.createElement('div');actions.className='history-card-actions';
    const copyBtn=document.createElement('button');copyBtn.className='history-action history-copy';copyBtn.title='复制提示词';copyBtn.appendChild(historyIcon(['M9 9h11v11H9z','M5 15V5a2 2 0 0 1 2-2h10']));
    copyBtn.onclick=async e=>{e.stopPropagation();flashHistoryAction(copyBtn,await copyPrompt(item.prompt))};
    const canvasBtn=document.createElement('button');canvasBtn.className='history-action history-canvas';canvasBtn.title='发送到画布';canvasBtn.setAttribute('aria-label','发送到画布中心');canvasBtn.appendChild(historyIcon(['M9 6 3 12l6 6','M3 12h13','M16 5h5v14h-5']));
    canvasBtn.onclick=e=>{e.stopPropagation();sendHistoryToCanvas(item)};
    const openBtn=document.createElement('button');openBtn.className='history-action history-open';openBtn.title='打开原图';openBtn.appendChild(historyIcon(['M14 4h6v6','M20 4 11 13','M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6']));
    openBtn.onclick=e=>{e.stopPropagation();openImage(item.url)};
    const deleteBtn=document.createElement('button');deleteBtn.className='history-action history-delete';deleteBtn.title='删除这条记录';deleteBtn.setAttribute('aria-label','删除这条历史记录');deleteBtn.appendChild(historyIcon(['M4 7h16','M9 7V5h6v2','M7 7l1 13h8l1-13','M10 11v5','M14 11v5']));
    deleteBtn.onclick=async e=>{e.stopPropagation();await deleteHistoryItem(item,deleteBtn)};
    actions.append(copyBtn,canvasBtn,openBtn,deleteBtn);
    content.append(head,prompt,actions);
    el.onclick=()=>selectHistory(item);
    el.append(img,content);
    frag.appendChild(el);
  }
  els.historyList.appendChild(frag);
  syncSidebarHistoryState();
}
function applyHistorySettings(item){
  const state=modelState[item.model],saved=item.settings||{};
  if(MODEL_RATIOS[item.model]?.includes(saved.ratio))state.ratio=saved.ratio;
  if(saved.resolution&&MODEL_RESOLUTIONS[item.model]?.some(r=>r.v===saved.resolution))state.resolution=saved.resolution;
  if(item.model==='mj'){
    for(const key of ['version','speed','quality','style','negativePrompt','seed'])if(saved[key]!==undefined)state[key]=saved[key];
    for(const key of ['stylize','chaos','iw'])if(Number.isFinite(Number(saved[key])))state[key]=Number(saved[key]);
  }
}
function selectHistory(item){
  if(!modelState[item.model]){toast('该历史记录对应的模型已移除');return}
  if(item.model!==activeModel)switchModel(item.model);
  applyHistorySettings(item);
  const state=modelState[item.model];state.promptText=item.prompt||'';state.originalPrompt=null;
  els.promptInput.value=state.promptText;els.promptInput.maxLength=MODEL_MAX_PROMPT[item.model];
  updateCharLimit();els.restoreBtn.hidden=true;
  const res=MODEL_RESOLUTIONS[item.model];
  if(res){els.resBtn.style.display='';const rObj=res.find(r=>r.v===state.resolution);els.resBtnValue.textContent=rObj?rObj.l.split(' ')[0]:state.resolution}else els.resBtn.style.display='none';
  renderResPop();renderRatioPop();syncMjControls();renderRefRow();updatePlaceholder();
  showResult(item.url,item.model,'历史记录');
  toast(item.settings?'已恢复提示词与生成参数':'已恢复提示词（旧记录无参数快照）');
}
async function deleteHistoryItem(item,button){
  button.disabled=true;
  const ok=await History.delete(item.id);
  if(!ok){button.disabled=false;flashHistoryAction(button,false);toast('删除失败');return}
  const index=sharedHistory.findIndex(x=>x.id===item.id);if(index>=0)sharedHistory.splice(index,1);
  if(currentResultUrl===item.url){currentResultUrl=null;currentResultModel=null;restoreResultFor(activeModel)}
  renderHistory();toast('已删除这条历史记录');
}
async function copyPrompt(text){
  if(!text)return false;
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
    }else{
      const ta=document.createElement('textarea');
      ta.value=text;ta.style.position='fixed';ta.style.top='-9999px';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();
      document.execCommand('copy');ta.remove();
    }
    toast('提示词已复制');return true;
  }catch(e){
    toast('复制失败，请手动选择');return false;
  }
}
function getCanvasItem(id=selectedCanvasId){return canvasItems.find(item=>item.id===id)||null}
function syncCanvasMode(){
  const hasItems=canvasItems.length>0;
  document.body.classList.toggle('canvas-preview-mode',hasItems);
  els.editCanvasImage.disabled=!getCanvasItem();
  els.deleteCanvasImage.disabled=!getCanvasItem();
  if(hasItems){
    els.empty.style.display='none';els.loading.style.display='none';
    els.resultWrap.style.display='none';els.actions.style.display='none';
  }
}
function selectCanvasItem(id,raise=true){
  selectedCanvasId=getCanvasItem(id)?id:null;
  if(raise&&selectedCanvasId){const item=getCanvasItem();item.z=++canvasTopZ}
  $$('#canvasLayer .canvas-item').forEach(node=>{
    const item=getCanvasItem(node.dataset.canvasId);
    node.classList.toggle('selected',node.dataset.canvasId===selectedCanvasId);
    if(item)node.style.zIndex=item.z;
  });
  els.editCanvasImage.disabled=!getCanvasItem();
  els.deleteCanvasImage.disabled=!getCanvasItem();
}
function positionCanvasNode(item){
  const node=els.canvasLayer.querySelector('[data-canvas-id="'+item.id+'"]');
  if(!node)return;
  node.style.setProperty('--canvas-x',item.x+'px');
  node.style.setProperty('--canvas-y',item.y+'px');
  if(item.width)node.style.width=item.width+'px';
  node.style.zIndex=item.z;
}
function createCanvasNode(item){
  const node=document.createElement('div');
  node.className='canvas-item';node.dataset.canvasId=item.id;
  const img=document.createElement('img');
  img.src=item.url;img.alt=item.prompt||'画布图片';img.draggable=false;
  img.onload=()=>{if(!item.width){item.width=Math.min(img.naturalWidth||480,Math.max(180,els.canvasLayer.clientWidth*.55));positionCanvasNode(item)}};
  const handle=document.createElement('button');
  handle.type='button';handle.className='canvas-resize-handle';handle.setAttribute('aria-label','缩放图片');
  node.append(img,handle);els.canvasLayer.appendChild(node);positionCanvasNode(item);
  handle.addEventListener('pointerdown',e=>startCanvasResize(e,item.id));
  handle.addEventListener('pointermove',moveCanvasResize);
  handle.addEventListener('pointerup',endCanvasResize);
  handle.addEventListener('pointercancel',endCanvasResize);
  node.addEventListener('pointerdown',e=>startCanvasDrag(e,item.id));
  node.addEventListener('pointermove',moveCanvasDrag);
  node.addEventListener('pointerup',endCanvasDrag);
  node.addEventListener('pointercancel',endCanvasDrag);
}
function addCanvasItem(source,{silent=false,replaceId=null}={}){
  const old=replaceId?getCanvasItem(replaceId):null;
  if(old){
    old.url=source.url;old.model=source.model||old.model;old.prompt=source.prompt||old.prompt;
    old.historyId=source.id||old.historyId;
    const img=els.canvasLayer.querySelector('[data-canvas-id="'+old.id+'"] img');
    if(img){img.src=old.url;img.alt=old.prompt||'画布图片'}
    selectCanvasItem(old.id);
  }else{
    const offset=(canvasItems.length%7)*18;
    const item={id:'canvas-'+(++canvasItemCounter),url:source.url,model:source.model||activeModel,prompt:source.prompt||'',historyId:source.id||null,x:offset-54,y:offset-54,width:0,z:++canvasTopZ};
    canvasItems.push(item);createCanvasNode(item);selectCanvasItem(item.id,false);
  }
  syncCanvasMode();renderHistory();
  if(!silent)toast('图片已添加到画布');
  return getCanvasItem();
}
function sendHistoryToCanvas(item,{silent=false,replaceId=null}={}){
  return addCanvasItem(item,{silent,replaceId});
}
function startCanvasResize(e,id){
  if(e.button!==0)return;
  const item=getCanvasItem(id),node=e.currentTarget.closest('.canvas-item');if(!item||!node)return;
  selectCanvasItem(id);
  const rect=node.getBoundingClientRect();
  canvasResize.id=id;canvasResize.pointerId=e.pointerId;canvasResize.startX=e.clientX;
  canvasResize.startWidth=rect.width;canvasResize.ratio=rect.width/Math.max(rect.height,1);
  node.classList.add('is-resizing');e.currentTarget.setPointerCapture(e.pointerId);
  e.preventDefault();e.stopPropagation();
}
function moveCanvasResize(e){
  if(canvasResize.pointerId!==e.pointerId)return;
  const item=getCanvasItem(canvasResize.id);if(!item)return;
  const maxWidth=Math.max(240,els.canvasLayer.clientWidth*2);
  item.width=Math.min(maxWidth,Math.max(96,canvasResize.startWidth+(e.clientX-canvasResize.startX)));
  positionCanvasNode(item);e.preventDefault();e.stopPropagation();
}
function endCanvasResize(e){
  if(canvasResize.pointerId!==e.pointerId)return;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  e.currentTarget.closest('.canvas-item')?.classList.remove('is-resizing');
  canvasResize.id=null;canvasResize.pointerId=null;e.stopPropagation();
}
function startCanvasDrag(e,id){
  if(e.button!==0||e.target.closest('.canvas-resize-handle'))return;
  const item=getCanvasItem(id);if(!item)return;
  selectCanvasItem(id);
  canvasDrag.id=id;canvasDrag.pointerId=e.pointerId;canvasDrag.startX=e.clientX;canvasDrag.startY=e.clientY;
  canvasDrag.originX=item.x;canvasDrag.originY=item.y;canvasDrag.moved=false;
  e.currentTarget.classList.add('is-dragging');e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
}
function moveCanvasDrag(e){
  if(canvasDrag.pointerId!==e.pointerId)return;
  const item=getCanvasItem(canvasDrag.id);if(!item)return;
  const dx=e.clientX-canvasDrag.startX,dy=e.clientY-canvasDrag.startY;
  if(Math.abs(dx)>3||Math.abs(dy)>3)canvasDrag.moved=true;
  item.x=canvasDrag.originX+dx;item.y=canvasDrag.originY+dy;positionCanvasNode(item);
}
function endCanvasDrag(e){
  if(canvasDrag.pointerId!==e.pointerId)return;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  e.currentTarget.classList.remove('is-dragging');canvasDrag.id=null;canvasDrag.pointerId=null;
}
function readCanvasFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
  });
}
els.uploadCanvasImage.onclick=()=>els.canvasFileInput.click();
els.deleteCanvasImage.onclick=()=>{
  const item=getCanvasItem();if(!item)return;
  const index=canvasItems.findIndex(entry=>entry.id===item.id);if(index<0)return;
  els.canvasLayer.querySelector('[data-canvas-id="'+item.id+'"]')?.remove();
  canvasItems.splice(index,1);
  const next=canvasItems[Math.min(index,canvasItems.length-1)]||null;
  selectedCanvasId=next?next.id:null;selectCanvasItem(selectedCanvasId,false);syncCanvasMode();renderHistory();
  if(!canvasItems.length){
    els.empty.style.display='flex';els.resultWrap.style.display='none';els.actions.style.display='none';
  }
  toast('已从画布删除图片');
};
els.canvasFileInput.onchange=async()=>{
  const files=[...els.canvasFileInput.files].filter(file=>file.type.startsWith('image/'));
  if(!files.length)return;
  for(const file of files){
    try{addCanvasItem({url:await readCanvasFile(file),model:activeModel,prompt:file.name},{silent:true})}
    catch{toast(file.name+' 读取失败')}
  }
  els.canvasFileInput.value='';toast('已上传 '+files.length+' 张图片到画布');
};
const canvasEditModal=$('#canvasEditModal');
const CANVAS_EDIT_MODELS=new Set(['gpt','nano','grok']);
const REVERSE_PROMPT_MODEL=ENHANCE_MODEL;
function setCanvasEditModel(key){
  if(!CANVAS_EDIT_MODELS.has(key))key='gpt';
  canvasEditModel=key;
  $$('#canvasEditModels .canvas-edit-model').forEach(button=>{
    const selected=button.dataset.model===key;
    button.classList.toggle('active',selected);
    button.setAttribute('aria-checked',String(selected));
  });
  $('#canvasEditPrompt').maxLength=MODEL_MAX_PROMPT[key];
}
function closeCanvasEdit(){canvasEditModal.classList.remove('open','show')}
function openCanvasEdit(){
  const currentCanvasItem=getCanvasItem();
  if(!currentCanvasItem){toast('请先选择一张画布图片');return}
  closeAllPops();
  setCanvasEditModel(CANVAS_EDIT_MODELS.has(currentCanvasItem.model)?currentCanvasItem.model:'gpt');
  $('#canvasEditPrompt').value=currentCanvasItem.prompt||'';
  canvasEditModal.classList.add('open','show');
  requestAnimationFrame(()=>$('#canvasEditPrompt').focus());
}
els.editCanvasImage.onclick=openCanvasEdit;
$('#closeCanvasEdit').onclick=closeCanvasEdit;
$('#cancelCanvasEdit').onclick=closeCanvasEdit;
canvasEditModal.addEventListener('click',e=>{if(e.target===canvasEditModal)closeCanvasEdit()});
$$('#canvasEditModels .canvas-edit-model').forEach(button=>button.onclick=()=>setCanvasEditModel(button.dataset.model));
$('#reverseCanvasPrompt').onclick=async()=>{
  const currentCanvasItem=getCanvasItem();
  if(!currentCanvasItem){toast('请先选择一张画布图片');return}
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openModal(els);toast('请先保存 API Key');return}
  const button=$('#reverseCanvasPrompt'),promptInput=$('#canvasEditPrompt'),original=button.innerHTML;
  button.disabled=true;button.classList.add('is-loading');button.textContent='正在反推…';
  try{
    const res=await fetch(APIMART_BASE+'/chat/completions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        model:REVERSE_PROMPT_MODEL,
        messages:[
          {role:'system',content:'你是一名专业的 AI 图像提示词分析师。根据图片反推出适用于 AI 图像生成的中文提示词，准确描述主体、构图、镜头、光线、色彩、材质、风格和氛围。不要猜测无法从图片确认的细节。只输出最终提示词，不要解释。'},
          {role:'user',content:[
            {type:'text',text:'请根据这张图片反推一条可直接用于重新生成相似画面的提示词。'},
            {type:'image_url',image_url:{url:currentCanvasItem.url}}
          ]}
        ],
        temperature:.35,
        stream:false
      })
    });
    if(!res.ok){
      let detail='';
      try{const data=await res.json();detail=data.error?.message||data.message||''}catch(_){try{detail=await res.text()}catch(__){}}
      throw new Error('反推提示词失败（HTTP '+res.status+'）'+(detail?': '+detail.slice(0,180):''));
    }
    const json=await res.json();
    const reversed=(json.choices||json.data?.choices)?.[0]?.message?.content?.trim();
    if(!reversed)throw new Error('接口未返回反推提示词');
    promptInput.value=reversed.slice(0,MODEL_MAX_PROMPT[canvasEditModel]);
    promptInput.focus();toast('已生成反推提示词');
  }catch(e){
    toast(e.message?.includes('Failed to fetch')?'无法连接接口，请检查网络或跨域设置。':(e.message||'反推提示词失败'));
  }finally{
    button.disabled=false;button.classList.remove('is-loading');button.innerHTML=original;
  }
};
$('#submitCanvasEdit').onclick=async()=>{
  const currentCanvasItem=getCanvasItem();if(!currentCanvasItem)return;
  const prompt=$('#canvasEditPrompt').value.trim();
  if(!prompt){toast('请填写图片编辑提示词');$('#canvasEditPrompt').focus();return}
  if(prompt.length>MODEL_MAX_PROMPT[canvasEditModel]){toast('提示词不能超过 '+MODEL_MAX_PROMPT[canvasEditModel]+' 个字符');$('#canvasEditPrompt').focus();return}
  if(modelState[canvasEditModel].generating){toast(MODEL_NAMES[canvasEditModel]+' 正在生成，请稍后再试');return}
  if(!Settings.getKey()){closeCanvasEdit();Settings.openModal(els);toast('请先保存 API Key');return}
  const source={...currentCanvasItem};
  if(canvasEditModel!==activeModel)switchModel(canvasEditModel);
  const manager=refManagers[canvasEditModel];manager.clear();
  if(!manager.addRemote(source.url,'画布图片')){toast('画布图片添加失败');return}
  const state=modelState[canvasEditModel];state.promptText=prompt;state.originalPrompt=null;
  els.promptInput.value=prompt;els.promptInput.maxLength=MODEL_MAX_PROMPT[canvasEditModel];
  els.restoreBtn.hidden=true;updateCharLimit();renderRefRow();updatePlaceholder();
  pendingCanvasEditSource=source;closeCanvasEdit();
  await doGenerate({fromCanvasEdit:true,canvasItemId:source.id});
};
function showResult(url,model,statusText){
  els.resultImage.title='点击在新标签页打开';
  currentResultUrl=url;currentResultModel=model;
  els.resultImage.src=url;
  els.resultBackdrop.src=url;
  els.empty.style.display='none';els.loading.style.display='none';
  els.resultWrap.style.display='flex';els.actions.style.display='flex';
  els.status.classList.remove('generating');
  els.status.classList.add('ready');
  els.status.querySelector('.status-text').textContent=statusText||'生成完成';
  Progress.setBars(els,100,'视觉矩阵已固化 · 100%');
  if(!modelState[model]?.generating)setStatusVisible(false);
  renderHistory();
}
/* 历史加载延迟到首屏渲染后 */
requestAnimationFrame(async()=>{
  try{
    const all=await History.load();
    sharedHistory.push(...all);
  }finally{
    historyLoading=false;
    renderHistory();
  }
});

