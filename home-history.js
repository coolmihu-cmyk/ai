"use strict";

function snapshotCreationState(model){
  const state=modelState[model],snapshot={ratio:state.ratio};
  if(state.resolution)snapshot.resolution=state.resolution;
  return snapshot;
}
function addHistory(url,prompt,model,settings,durationMs){
  const item={
    id:Date.now(),url,prompt,model,settings:settings||snapshotCreationState(model),
    createdAt:new Date().toISOString(),durationMs:Number.isFinite(durationMs)?Math.round(durationMs):null
  };
  sharedHistory.unshift(item);if(sharedHistory.length>20)sharedHistory.length=20;
  renderHistory();History.save(item);return item;
}
function homeHistoryIcon(paths){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
  svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.9');
  for(const d of paths){
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);svg.appendChild(path);
  }
  return svg;
}
function formatHomeHistoryDate(value){
  const date=new Date(value||Date.now());
  if(Number.isNaN(date.getTime()))return '日期未知';
  return new Intl.DateTimeFormat('zh-CN',{
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
  }).format(date).replace('/','-');
}
function renderHistory(){
  if(!els.historyList)return;
  els.historyList.innerHTML='';
  const fragment=document.createDocumentFragment();
  for(const item of sharedHistory){
    const card=document.createElement('div');
    card.className='history-item'+(item.url===currentResultUrl?' active':'');card.title=item.prompt;
    const image=document.createElement('img');
    image.className='history-thumb';image.src=item.url;image.alt=item.prompt;
    image.title='在新标签页打开原图';image.tabIndex=0;image.setAttribute('role','button');
    image.onclick=event=>{event.stopPropagation();openImage(item.url)};
    image.onkeydown=event=>{
      if(event.key==='Enter'||event.key===' '){
        event.preventDefault();event.stopPropagation();openImage(item.url);
      }
    };
    const content=document.createElement('div');content.className='history-content';
    const head=document.createElement('div');head.className='history-card-head';
    const tag=document.createElement('span');tag.className='model-tag';tag.textContent=MODEL_NAMES[item.model]||item.model;
    const meta=document.createElement('span');meta.className='history-meta';
    meta.textContent=formatHomeHistoryDate(item.createdAt)+(Number.isFinite(item.durationMs)?' · '+formatDuration(item.durationMs):'');
    head.append(tag,meta);
    const prompt=document.createElement('p');prompt.className='history-prompt';prompt.textContent=item.prompt;
    const actions=document.createElement('div');actions.className='history-card-actions';
    const reuse=document.createElement('button');
    reuse.className='history-action history-reuse';reuse.title='恢复提示词与生成参数';
    reuse.setAttribute('aria-label','恢复提示词与生成参数');
    reuse.appendChild(homeHistoryIcon(['M4 12a8 8 0 1 0 2.3-5.7','M4 4v5h5']));
    reuse.onclick=event=>{event.stopPropagation();selectHistory(item)};
    const open=document.createElement('button');
    open.className='history-action history-open';open.title='打开原图';
    open.appendChild(homeHistoryIcon(['M14 4h6v6','M20 4 11 13','M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6']));
    open.onclick=event=>{event.stopPropagation();openImage(item.url)};
    const remove=document.createElement('button');
    remove.className='history-action history-delete';remove.title='删除这条记录';
    remove.setAttribute('aria-label','删除这条历史记录');
    remove.appendChild(homeHistoryIcon(['M4 7h16','M9 7V5h6v2','M7 7l1 13h8l1-13','M10 11v5','M14 11v5']));
    remove.onclick=async event=>{event.stopPropagation();await deleteHistoryItem(item,remove)};
    actions.append(reuse,open,remove);content.append(head,prompt,actions);
    card.onclick=()=>openImageEditor(item);card.append(image,content);fragment.appendChild(card);
  }
  els.historyList.appendChild(fragment);syncSidebarHistoryState();
}
function applyHistorySettings(item){
  const state=modelState[item.model],saved=item.settings||{};
  if(MODEL_RATIOS[item.model]?.includes(saved.ratio))state.ratio=saved.ratio;
  if(saved.resolution&&MODEL_RESOLUTIONS[item.model]?.some(resolution=>resolution.v===saved.resolution))state.resolution=saved.resolution;
}
function selectHistory(item){
  if(!modelState[item.model]){toast('该历史记录对应的模型已移除');return}
  historyReusePrompt=null;
  if(item.model!==activeModel)switchModel(item.model);
  historyReusePrompt=item.prompt||'';applyHistorySettings(item);
  const state=modelState[item.model];
  state.promptText=historyReusePrompt.slice(0,MODEL_MAX_PROMPT[item.model]);state.originalPrompt=null;
  els.promptInput.value=state.promptText;els.promptInput.maxLength=MODEL_MAX_PROMPT[item.model];
  updateCharLimit();
  renderResPop();renderRatioPop();renderRefRow();updatePlaceholder();
  showResult(item.url,item.model,'历史记录');
  toast(item.settings?'已恢复提示词与生成参数':'已恢复提示词（旧记录无参数快照）');
}
async function deleteHistoryItem(item,button){
  button.disabled=true;
  if(!await History.delete(item.id)){button.disabled=false;toast('删除失败');return}
  const index=sharedHistory.findIndex(entry=>entry.id===item.id);
  if(index>=0)sharedHistory.splice(index,1);
  if(currentResultUrl===item.url){currentResultUrl=null;currentResultModel=null;restoreResultFor(activeModel)}
  renderHistory();toast('已删除这条历史记录');
}
function openImageEditor(item){
  if(!item?.url){toast('没有可编辑的图片');return}
  try{
    sessionStorage.setItem('mihu_edit_payload',JSON.stringify({
      url:item.url,prompt:item.prompt||'',model:item.model||'gpt'
    }));
  }catch(_){}
  window.location.href='edit.html';
}
function sendHistoryToCanvas(item){openImageEditor(item);return item}
function showResult(url,model,statusText){
  document.body.classList.add('home-has-result');document.body.classList.remove('home-generating');
  currentResultUrl=url;currentResultModel=model;
  els.resultImage.title='点击在新标签页打开';els.resultImage.src=url;els.resultBackdrop.src=url;
  els.empty.style.display='none';els.loading.style.display='none';
  els.resultWrap.style.display='flex';els.actions.style.display='flex';
  els.status.classList.remove('generating');els.status.classList.add('ready');
  els.status.querySelector('.status-text').textContent=statusText||'生成完成';
  Progress.setBars(els,100,'视觉矩阵已固化 · 100%');
  if(!modelState[model]?.generating)setStatusVisible(false);
  renderHistory();
}

requestAnimationFrame(async()=>{
  try{sharedHistory.push(...await History.load())}
  finally{historyLoading=false;renderHistory()}
});
