"use strict";

const EDIT_HD_PROMPT='基于提供的参考图像进行严格的超高分辨率4K增强。必须绝对忠实于原始画面部结构、比例和身份特征。在表情、视线、姿势、相机角度、画面构图和透视关系上保持零偏差。服装、头发、皮肤以及背景元素的结构、位置和设计都必须保持不变。恢复细微层级的细节，呈现自然写实效果。增强毛孔、细纹、发丝、睫毛、织物纹理、缝线以及材质边缘，但不得引入任何风格化处理。颜色科学、白平衡以及整体色调关系必须与原图完全一致。光线方向、强度、对比度以及阴影表现必须与原始图像精确匹配，只允许提升清晰度并扩展动态范围。禁止重新布光，禁止改变形体';
const EDIT_CUTOUT_PROMPT='抠图,透明背景background="transparent"';
const EDITOR_JOB_ID='editor-generation';

const editorEls={
  layer:$('#editorCanvasLayer'),empty:$('#editorEmpty'),upload:$('#editorUpload'),fileInput:$('#editorFileInput'),
  edit:$('#editorEdit'),cutout:$('#editorCutout'),hd:$('#editorHD'),open:$('#editorOpen'),delete:$('#editorDelete'),
  modal:$('#editorEditModal'),prompt:$('#editorPrompt'),models:$('#editorModels'),
  settings:$('#editorSettings'),settingsValue:$('#editorSettingsValue'),
  ratioGrid:$('#editorRatioGrid'),resolutionGrid:$('#editorResolutionGrid'),
  progress:$('#editorProgress'),progressText:$('#editorProgressText'),
  progressValue:$('#editorProgressValue'),progressBar:$('#editorProgressBar')
};

initCommonPage();

const editorItems=[];
let editorSelectedId=null,editorCounter=0,editorTopZ=1,editorGenerating=false;
let editorGenerationController=null;
let editorModel='gpt';
let editorDrafts=Object.fromEntries(Object.entries(MODEL_CONFIG).filter(([key])=>key!=='grok').map(([key,config])=>[
  key,{ratio:config.ratios[0],resolution:config.defaultResolution||null}
]));
const editorDrag={id:null,pointerId:null,startX:0,startY:0,originX:0,originY:0};
const editorResize={id:null,pointerId:null,startX:0,startWidth:0,ratio:1};

function getEditorItem(id=editorSelectedId){return editorItems.find(item=>item.id===id)||null}
function syncEditor(){
  const selected=getEditorItem();
  document.body.classList.toggle('canvas-preview-mode',editorItems.length>0);
  editorEls.empty.hidden=editorItems.length>0;
  editorEls.edit.disabled=!selected||editorGenerating;
  editorEls.cutout.disabled=!selected||editorGenerating;
  editorEls.hd.disabled=!selected||editorGenerating;
  editorEls.open.disabled=!selected;
  editorEls.delete.disabled=!selected||editorGenerating;
}
function editorLimits(){
  return {
    width:Math.max(1,editorEls.layer.clientWidth*.8),
    height:Math.max(1,editorEls.layer.clientHeight*.8)
  };
}
function positionEditorNode(item){
  const node=editorEls.layer.querySelector('[data-editor-id="'+item.id+'"]');
  if(!node)return;
  node.style.setProperty('--canvas-x',item.x+'px');
  node.style.setProperty('--canvas-y',item.y+'px');
  if(item.width)node.style.width=item.width+'px';
  node.style.zIndex=item.z;
}
function selectEditorItem(id,raise=true){
  editorSelectedId=getEditorItem(id)?id:null;
  const selected=getEditorItem();
  if(selected&&raise)selected.z=++editorTopZ;
  $$('#editorCanvasLayer .canvas-item').forEach(node=>{
    const item=getEditorItem(node.dataset.editorId);
    node.classList.toggle('selected',node.dataset.editorId===editorSelectedId);
    if(item)node.style.zIndex=item.z;
  });
  syncEditor();
}
function startEditorDrag(event,id){
  if(event.button!==0||event.target.closest('.canvas-resize-handle'))return;
  const item=getEditorItem(id);if(!item)return;
  selectEditorItem(id);
  editorDrag.id=id;editorDrag.pointerId=event.pointerId;
  editorDrag.startX=event.clientX;editorDrag.startY=event.clientY;
  editorDrag.originX=item.x;editorDrag.originY=item.y;
  event.currentTarget.classList.add('is-dragging');
  event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
}
function moveEditorDrag(event){
  if(editorDrag.pointerId!==event.pointerId)return;
  const item=getEditorItem(editorDrag.id);if(!item)return;
  item.x=editorDrag.originX+(event.clientX-editorDrag.startX);
  item.y=editorDrag.originY+(event.clientY-editorDrag.startY);
  positionEditorNode(item);
}
function endEditorDrag(event){
  if(editorDrag.pointerId!==event.pointerId)return;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  event.currentTarget.classList.remove('is-dragging');editorDrag.id=null;editorDrag.pointerId=null;
}
function startEditorResize(event,id){
  if(event.button!==0)return;
  const item=getEditorItem(id),node=event.currentTarget.closest('.canvas-item');if(!item||!node)return;
  selectEditorItem(id);
  const rect=node.getBoundingClientRect();
  editorResize.id=id;editorResize.pointerId=event.pointerId;editorResize.startX=event.clientX;
  editorResize.startWidth=rect.width;editorResize.ratio=rect.width/Math.max(rect.height,1);
  node.classList.add('is-resizing');event.currentTarget.setPointerCapture(event.pointerId);
  event.preventDefault();event.stopPropagation();
}
function moveEditorResize(event){
  if(editorResize.pointerId!==event.pointerId)return;
  const item=getEditorItem(editorResize.id);if(!item)return;
  const limits=editorLimits(),maxWidth=Math.max(1,Math.min(limits.width,limits.height*editorResize.ratio));
  item.width=Math.min(maxWidth,Math.max(Math.min(96,maxWidth),editorResize.startWidth+(event.clientX-editorResize.startX)));
  positionEditorNode(item);event.preventDefault();event.stopPropagation();
}
function endEditorResize(event){
  if(editorResize.pointerId!==event.pointerId)return;
  if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  event.currentTarget.closest('.canvas-item')?.classList.remove('is-resizing');
  editorResize.id=null;editorResize.pointerId=null;event.stopPropagation();
}
function createEditorNode(item){
  const node=document.createElement('div');
  node.className='canvas-item';node.dataset.editorId=item.id;
  const image=document.createElement('img');
  image.src=item.url;image.alt=item.prompt||'画布图片';image.draggable=false;
  image.onload=()=>{
    if(item.width)return;
    const limits=editorLimits();
    const scale=Math.min(1,limits.width/(image.naturalWidth||480),limits.height/(image.naturalHeight||480));
    item.width=Math.max(1,Math.round((image.naturalWidth||480)*scale));positionEditorNode(item);
  };
  const handle=document.createElement('button');
  handle.type='button';handle.className='canvas-resize-handle';handle.setAttribute('aria-label','缩放图片');
  node.append(image,handle);editorEls.layer.appendChild(node);positionEditorNode(item);
  handle.addEventListener('pointerdown',event=>startEditorResize(event,item.id));
  handle.addEventListener('pointermove',moveEditorResize);
  handle.addEventListener('pointerup',endEditorResize);
  handle.addEventListener('pointercancel',endEditorResize);
  node.addEventListener('pointerdown',event=>startEditorDrag(event,item.id));
  node.addEventListener('pointermove',moveEditorDrag);
  node.addEventListener('pointerup',endEditorDrag);
  node.addEventListener('pointercancel',endEditorDrag);
}
function addEditorItem(source,{replaceId=null}={}){
  const existing=replaceId?getEditorItem(replaceId):null;
  if(existing){
    existing.url=source.url;existing.prompt=source.prompt||existing.prompt;existing.model=source.model||existing.model;
    const image=editorEls.layer.querySelector('[data-editor-id="'+existing.id+'"] img');
    if(image){image.src=existing.url;image.alt=existing.prompt||'画布图片'}
    selectEditorItem(existing.id);return existing;
  }
  const offset=(editorItems.length%7)*18;
  const item={
    id:'edit-'+(++editorCounter),url:source.url,prompt:source.prompt||'',model:source.model||'gpt',
    x:offset-54,y:offset-54,width:0,z:++editorTopZ
  };
  editorItems.push(item);createEditorNode(item);selectEditorItem(item.id,false);syncEditor();return item;
}
function readEditorFile(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);
  });
}

editorEls.upload.onclick=()=>editorEls.fileInput.click();
editorEls.fileInput.onchange=async()=>{
  const files=[...editorEls.fileInput.files].filter(file=>file.type.startsWith('image/'));
  for(const file of files){
    try{addEditorItem({url:await readEditorFile(file),prompt:'',model:'gpt'})}
    catch(_){toast(file.name+' 读取失败')}
  }
  editorEls.fileInput.value='';if(files.length)toast('已上传 '+files.length+' 张图片');
};
editorEls.delete.onclick=()=>{
  const item=getEditorItem();if(!item)return;
  const index=editorItems.findIndex(entry=>entry.id===item.id);
  editorEls.layer.querySelector('[data-editor-id="'+item.id+'"]')?.remove();
  editorItems.splice(index,1);
  const next=editorItems[Math.min(index,editorItems.length-1)]||null;
  editorSelectedId=next?.id||null;selectEditorItem(editorSelectedId,false);toast('已删除图片');
};

function setEditorModel(key){
  if(!MODEL_CONFIG[key])key='gpt';
  editorModel=key;
  $$('#editorModels .canvas-edit-model').forEach(button=>{
    const selected=button.dataset.model===key;
    button.classList.toggle('active',selected);button.setAttribute('aria-checked',String(selected));
  });
  editorEls.prompt.maxLength=MODEL_CONFIG[key].promptLimit;renderEditorSettings();
}
function renderEditorSettings(){
  const draft=editorDrafts[editorModel];
  editorEls.ratioGrid.innerHTML='';
  for(const ratio of MODEL_CONFIG[editorModel].ratios){
    const button=document.createElement('button');
    button.type='button';button.className='canvas-edit-option'+(ratio===draft.ratio?' active':'');
    button.textContent=ratio;button.onclick=()=>{draft.ratio=ratio;renderEditorSettings()};
    editorEls.ratioGrid.appendChild(button);
  }
  editorEls.resolutionGrid.innerHTML='';
  const resolutions=MODEL_CONFIG[editorModel].resolutions;
  if(resolutions){
    for(const resolution of resolutions){
      const button=document.createElement('button');
      button.type='button';button.className='canvas-edit-option'+(resolution.v===draft.resolution?' active':'');
      button.textContent=resolution.l;button.onclick=()=>{draft.resolution=resolution.v;renderEditorSettings()};
      editorEls.resolutionGrid.appendChild(button);
    }
  }
  const resolutionLabel=resolutions?.find(item=>item.v===draft.resolution)?.l.split(' · ')[0]||'自动';
  editorEls.settingsValue.textContent=draft.ratio+' · '+resolutionLabel;
}
function openEditorModal(){
  const item=getEditorItem();if(!item){toast('请先选择一张图片');return}
  editorDrafts={
    gpt:{...editorDrafts.gpt},nano:{...editorDrafts.nano}
  };
  setEditorModel(editorDrafts[item.model]?item.model:'gpt');
  editorEls.prompt.value=item.prompt||'';editorEls.settings.open=false;
  editorEls.modal.classList.add('open','show');requestAnimationFrame(()=>editorEls.prompt.focus());
}
function closeEditorModal(){editorEls.modal.classList.remove('open','show')}
editorEls.edit.onclick=openEditorModal;
$('#editorEditClose').onclick=closeEditorModal;
$('#editorEditCancel').onclick=closeEditorModal;
editorEls.modal.addEventListener('click',event=>{if(event.target===editorEls.modal)closeEditorModal()});
$$('#editorModels .canvas-edit-model').forEach(button=>button.onclick=()=>setEditorModel(button.dataset.model));

function setEditorProgress(show,percent=0,text='正在生成'){
  editorEls.progress.hidden=!show;
  const value=Math.max(0,Math.min(100,Number(percent)||0));
  editorEls.progressBar.style.width=value+'%';editorEls.progressValue.textContent=Math.round(value)+'%';
  editorEls.progressText.textContent=text;
}
function buildEditorRequest(model,prompt,ratio,resolution,sourceUrl,background){
  if(model==='gpt'){
    return {model:MODEL_CONFIG.gpt.editModel,prompt,size:ratio,resolution,n:1,image_urls:[sourceUrl],...(background?{background,output_format:'png'}:{})};
  }
  if(model==='nano'){
    return {model:MODEL_CONFIG.nano.editModel,prompt,size:ratio,resolution,n:1,image_urls:[sourceUrl]};
  }
  throw new Error('Grok Imagine 2.0 不支持参考图编辑，请使用 Image 2 或 NB2。');
}

async function runEditorJobUnlocked(job){
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  if(editorGenerating){toast('图片正在生成，请稍后');return}
  const model=job.model,prompt=job.prompt,ratio=job.ratio,resolution=job.resolution;
  editorGenerating=true;syncEditor();
  setEditorProgress(true,job.taskId?8:2,job.taskId?'正在恢复生成任务':MODEL_CONFIG[model].name+' 正在生成');
  const controller=new AbortController();
  editorGenerationController=controller;
  const timeout=setTimeout(()=>controller.abort(),300000);
  try{
    if(!job.taskId){
      job.taskId=await Apimart.submitTask(apiKey,job.body,job.endpoint,controller.signal);
      await PendingGeneration.save(job);
      setEditorProgress(true,5,'任务已提交');
    }
    const url=await Apimart.pollTask(
      apiKey,job.taskId,
      (status,progress)=>{
        setEditorProgress(true,progress||8,status==='queued'?'等待算力接入':'正在生成图片');
      },
      controller.signal
    );
    let source=getEditorItem(job.source?.id);
    if(source&&source.url!==job.source?.url)source=null;
    if(!source&&job.source?.url){
      source=addEditorItem(job.source);
      job.source={...job.source,id:source.id};
    }
    const item=addEditorItem({url,prompt,model},{replaceId:source?.id||null});
    const historyItem={
      id:Date.now(),url,prompt,model,settings:{ratio,...(resolution?{resolution}:{})},
      createdAt:new Date().toISOString(),
      durationMs:Math.max(0,Date.now()-new Date(job.createdAt||Date.now()).getTime())
    };
    await History.save(historyItem);
    await PendingGeneration.delete(job.id);
    selectEditorItem(item.id);setEditorProgress(true,100,'图片生成完成');
    setTimeout(()=>setEditorProgress(false),700);toast('画布图片已更新');
  }catch(error){
    const message=error.message||'生成失败';
    const terminal=message.startsWith('生成失败：')||message==='任务已取消';
    if(terminal){
      await PendingGeneration.delete(job.id);
      setEditorProgress(false);
      toast(message);
    }else{
      setEditorProgress(true,8,error.name==='AbortError'?'等待已暂停，重新进入编辑页将继续':'查询暂时中断，重新进入编辑页将继续');
      toast(error.name==='AbortError'?'生成任务仍在进行，可稍后返回查看':'生成任务已保留，可重新进入编辑页继续');
    }
  }finally{
    clearTimeout(timeout);
    if(editorGenerationController===controller)editorGenerationController=null;
    editorGenerating=false;syncEditor();
  }
}

async function runEditorJob(job){
  if(editorGenerating){toast('图片正在生成，请稍后');return}
  const acquired=await GenerationExecutionLock.run(()=>runEditorJobUnlocked(job));
  if(!acquired){
    setEditorProgress(true,8,'任务正在另一标签页继续');
    toast('任务正在另一标签页继续，请勿重复提交');
  }
}
async function generateEditorImage({model,prompt,ratio,resolution,source,background}){
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  if(editorGenerating){toast('图片正在生成，请稍后');return}
  const existing=await PendingGeneration.loadById(EDITOR_JOB_ID);
  if(existing){
    toast('正在恢复上一次编辑任务');
    await runEditorJob(existing);
    return;
  }
  const job={
    id:EDITOR_JOB_ID,scope:'editor',
    body:buildEditorRequest(model,prompt,ratio,resolution,source.url,background),
    endpoint:'/images/generations',model,prompt,ratio,resolution,background,
    source:{...source},createdAt:new Date().toISOString(),taskId:null
  };
  try{
    await PendingGeneration.save(job);
  }catch(_){
    toast('无法保存生成任务，请检查浏览器存储权限');
    return;
  }
  await runEditorJob(job);
}

$('#editorEditSubmit').onclick=async()=>{
  const source=getEditorItem();if(!source)return;
  const prompt=editorEls.prompt.value.trim();
  if(!prompt){toast('请填写图片编辑提示词');editorEls.prompt.focus();return}
  const draft=editorDrafts[editorModel];
  closeEditorModal();
  await generateEditorImage({
    model:editorModel,prompt,ratio:draft.ratio,resolution:draft.resolution,source:{...source}
  });
};
editorEls.hd.onclick=async()=>{
  const source=getEditorItem();if(!source)return;
  const image=editorEls.layer.querySelector('[data-editor-id="'+source.id+'"] img');
  const sourceRatio=(image?.naturalWidth||1)/Math.max(image?.naturalHeight||1,1);
  const ratio=MODEL_CONFIG.gpt.ratios.reduce((best,candidate)=>{
    const [w,h]=candidate.split(':').map(Number),[bw,bh]=best.split(':').map(Number);
    return Math.abs(Math.log(w/h/sourceRatio))<Math.abs(Math.log(bw/bh/sourceRatio))?candidate:best;
  },'1:1');
  editorDrafts.gpt.ratio=ratio;editorDrafts.gpt.resolution='4k';
  await generateEditorImage({model:'gpt',prompt:EDIT_HD_PROMPT,ratio,resolution:'4k',source:{...source}});
};
editorEls.cutout.onclick=async()=>{
  const source=getEditorItem();if(!source)return;
  const image=editorEls.layer.querySelector('[data-editor-id="'+source.id+'"] img');
  const sourceRatio=(image?.naturalWidth||1)/Math.max(image?.naturalHeight||1,1);
  const ratio=MODEL_CONFIG.gpt.ratios.reduce((best,candidate)=>{
    const [w,h]=candidate.split(':').map(Number),[bw,bh]=best.split(':').map(Number);
    return Math.abs(Math.log(w/h/sourceRatio))<Math.abs(Math.log(bw/bh/sourceRatio))?candidate:best;
  },'1:1');
  editorDrafts.gpt.ratio=ratio;editorDrafts.gpt.resolution=MODEL_CONFIG.gpt.defaultResolution;
  await generateEditorImage({model:'gpt',prompt:EDIT_CUTOUT_PROMPT,ratio,resolution:MODEL_CONFIG.gpt.defaultResolution,background:'transparent',source:{...source}});
};
editorEls.open.onclick=()=>{
  const source=getEditorItem();
  if(source?.url)openImage(source.url);
};
$('#editorReverse').onclick=async()=>{
  const source=getEditorItem();if(!source)return;
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  const button=$('#editorReverse'),original=button.innerHTML;
  button.disabled=true;button.textContent='正在反推…';
  try{
    const prompt=await Apimart.chat(apiKey,{
        model:PROMPT_ANALYSIS_MODEL,
        messages:[
          {role:'system',content:'你是一名专业的 AI 图像提示词分析师。忠实识别图片主体，并用中文描述主体、姿态、服装、构图、镜头、光线、色彩、材质、风格和氛围。禁止添加不存在的内容。只输出最终提示词。'},
          {role:'user',content:[{type:'text',text:'请反推一条可直接用于重新生成相似画面的提示词。'},{type:'image_url',image_url:{url:source.url,detail:'high'}}]}
        ],
        temperature:.35
    });
    editorEls.prompt.value=prompt.slice(0,MODEL_CONFIG[editorModel].promptLimit);editorEls.prompt.focus();toast('已生成反推提示词');
  }catch(error){toast(error.message||'反推提示词失败')}
  finally{button.disabled=false;button.innerHTML=original}
};

editorEls.layer.addEventListener('pointerdown',event=>{
  if(event.target===editorEls.layer)selectEditorItem(null,false);
});
window.addEventListener('resize',()=>{
  for(const item of editorItems){
    const node=editorEls.layer.querySelector('[data-editor-id="'+item.id+'"] img');if(!node)continue;
    const limits=editorLimits(),ratio=(node.naturalWidth||1)/Math.max(node.naturalHeight||1,1);
    item.width=Math.min(item.width||limits.width,limits.width,limits.height*ratio);positionEditorNode(item);
  }
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&editorEls.modal.classList.contains('open'))closeEditorModal();
  if((event.key==='Delete'||event.key==='Backspace')&&getEditorItem()&&!editorEls.modal.classList.contains('open')&&!event.target.closest('input,textarea')){
    event.preventDefault();editorEls.delete.click();
  }
},{capture:true});

try{
  const payload=JSON.parse(sessionStorage.getItem('mihu_edit_payload')||'null');
  sessionStorage.removeItem('mihu_edit_payload');
  if(payload?.url)addEditorItem(payload);
}catch(_){}
syncEditor();setEditorModel('gpt');

requestAnimationFrame(async()=>{
  const pending=await PendingGeneration.loadById(EDITOR_JOB_ID);
  if(!pending)return;
  let source=getEditorItem(pending.source?.id);
  if(source&&source.url!==pending.source?.url)source=null;
  if(!source&&pending.source?.url){
    source=addEditorItem(pending.source);
    pending.source={...pending.source,id:source.id};
    await PendingGeneration.save(pending);
  }
  await runEditorJob(pending);
});

window.addEventListener('pagehide',()=>editorGenerationController?.abort());
window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  setTimeout(async()=>{
    if(editorGenerating)return;
    const pending=await PendingGeneration.loadById(EDITOR_JOB_ID);
    if(pending)await runEditorJob(pending);
  },0);
});
