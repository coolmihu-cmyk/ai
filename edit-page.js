"use strict";

const EDIT_MODEL_NAMES={gpt:'Image 2',nano:'NB2',grok:'Grok'};
const EDIT_MODEL_LIMITS={gpt:3000,nano:2000,grok:4000};
const EDIT_RATIOS={
  gpt:['1:1','3:2','4:3','3:4','16:9','9:16'],
  nano:['1:1','3:2','4:3','3:4','2:3','16:9','9:16','4:5','5:4','21:9'],
  grok:['1:1','16:9','9:16','4:3','3:4','3:2','2:3']
};
const EDIT_RESOLUTIONS={
  gpt:[{v:'1k',l:'1K · 快速'},{v:'2k',l:'2K · 高清'},{v:'4k',l:'4K · 超清'}],
  nano:[{v:'0.5K',l:'0.5K · 预览'},{v:'1K',l:'1K · 标准'},{v:'2K',l:'2K · 高清'},{v:'4K',l:'4K · 超清'}],
  grok:null
};
const EDIT_GROK_SIZES={
  '1:1':'1024x1024','16:9':'1280x720','4:3':'1792x1024','3:2':'1792x1024',
  '9:16':'720x1280','3:4':'1024x1792','2:3':'1024x1792'
};
const EDIT_HD_PROMPT='基于提供的参考图像进行严格的超高分辨率4K增强。必须绝对忠实于原始画面部结构、比例和身份特征。在表情、视线、姿势、相机角度、画面构图和透视关系上保持零偏差。服装、头发、皮肤以及背景元素的结构、位置和设计都必须保持不变。恢复细微层级的细节，呈现自然写实效果。增强毛孔、细纹、发丝、睫毛、织物纹理、缝线以及材质边缘，但不得引入任何风格化处理。颜色科学、白平衡以及整体色调关系必须与原图完全一致。光线方向、强度、对比度以及阴影表现必须与原始图像精确匹配，只允许提升清晰度并扩展动态范围。禁止重新布光，禁止改变形体';

const editorEls={
  layer:$('#editorCanvasLayer'),empty:$('#editorEmpty'),upload:$('#editorUpload'),fileInput:$('#editorFileInput'),
  edit:$('#editorEdit'),hd:$('#editorHD'),delete:$('#editorDelete'),
  modal:$('#editorEditModal'),prompt:$('#editorPrompt'),models:$('#editorModels'),
  settings:$('#editorSettings'),settingsValue:$('#editorSettingsValue'),
  ratioGrid:$('#editorRatioGrid'),resolutionGrid:$('#editorResolutionGrid'),
  progress:$('#editorProgress'),progressText:$('#editorProgressText'),
  progressValue:$('#editorProgressValue'),progressBar:$('#editorProgressBar'),
  apiModal:$('#modalBackdrop'),apiKey:$('#apiKey'),openSettings:null
};

initCommonPage({modal:editorEls.apiModal,apiKey:editorEls.apiKey,openSettings:editorEls.openSettings});

const editorItems=[];
let editorSelectedId=null,editorCounter=0,editorTopZ=1,editorGenerating=false;
let editorModel='gpt';
let editorDrafts={
  gpt:{ratio:'1:1',resolution:'1k'},
  nano:{ratio:'1:1',resolution:'1K'},
  grok:{ratio:'1:1',resolution:null}
};
const editorDrag={id:null,pointerId:null,startX:0,startY:0,originX:0,originY:0};
const editorResize={id:null,pointerId:null,startX:0,startWidth:0,ratio:1};

function getEditorItem(id=editorSelectedId){return editorItems.find(item=>item.id===id)||null}
function syncEditor(){
  const selected=getEditorItem();
  document.body.classList.toggle('canvas-preview-mode',editorItems.length>0);
  editorEls.empty.hidden=editorItems.length>0;
  editorEls.edit.disabled=!selected||editorGenerating;
  editorEls.hd.disabled=!selected||editorGenerating;
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
  if(!EDIT_MODEL_NAMES[key])key='gpt';
  editorModel=key;
  $$('#editorModels .canvas-edit-model').forEach(button=>{
    const selected=button.dataset.model===key;
    button.classList.toggle('active',selected);button.setAttribute('aria-checked',String(selected));
  });
  editorEls.prompt.maxLength=EDIT_MODEL_LIMITS[key];renderEditorSettings();
}
function renderEditorSettings(){
  const draft=editorDrafts[editorModel];
  editorEls.ratioGrid.innerHTML='';
  for(const ratio of EDIT_RATIOS[editorModel]){
    const button=document.createElement('button');
    button.type='button';button.className='canvas-edit-option'+(ratio===draft.ratio?' active':'');
    button.textContent=ratio;button.onclick=()=>{draft.ratio=ratio;renderEditorSettings()};
    editorEls.ratioGrid.appendChild(button);
  }
  editorEls.resolutionGrid.innerHTML='';
  const resolutions=EDIT_RESOLUTIONS[editorModel];
  if(resolutions){
    for(const resolution of resolutions){
      const button=document.createElement('button');
      button.type='button';button.className='canvas-edit-option'+(resolution.v===draft.resolution?' active':'');
      button.textContent=resolution.l;button.onclick=()=>{draft.resolution=resolution.v;renderEditorSettings()};
      editorEls.resolutionGrid.appendChild(button);
    }
  }else{
    const automatic=document.createElement('div');
    automatic.className='canvas-edit-auto-resolution';
    automatic.textContent='自动 · '+(EDIT_GROK_SIZES[draft.ratio]||'1024x1024');
    editorEls.resolutionGrid.appendChild(automatic);
  }
  const resolutionLabel=resolutions
    ?(resolutions.find(item=>item.v===draft.resolution)?.l.split(' · ')[0]||'自动')
    :(EDIT_GROK_SIZES[draft.ratio]||'自动');
  editorEls.settingsValue.textContent=draft.ratio+' · '+resolutionLabel;
}
function openEditorModal(){
  const item=getEditorItem();if(!item){toast('请先选择一张图片');return}
  editorDrafts={
    gpt:{...editorDrafts.gpt},nano:{...editorDrafts.nano},grok:{...editorDrafts.grok}
  };
  setEditorModel(EDIT_MODEL_NAMES[item.model]?item.model:'gpt');
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
async function generateEditorImage({model,prompt,ratio,resolution,source}){
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openModal({modal:editorEls.apiModal,apiKey:editorEls.apiKey});toast('请先保存 API Key');return}
  if(editorGenerating){toast('图片正在生成，请稍后');return}
  editorGenerating=true;syncEditor();setEditorProgress(true,2,EDIT_MODEL_NAMES[model]+' 正在生成');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),300000);
  try{
    let body;
    if(model==='gpt'){
      body={model:'gpt-image-2',prompt,size:ratio,resolution,n:1,image_urls:[source.url]};
    }else if(model==='nano'){
      body={model:'nano-banana-2-ext',prompt,size:ratio,resolution,n:1,image_urls:[source.url]};
    }else{
      body={model:'grok-imagine-1.5-edit-ext',prompt,size:EDIT_GROK_SIZES[ratio]||'1024x1024',n:1,image_urls:[source.url]};
    }
    const started=performance.now();
    const url=await Apimart.generate({
      apiKey,body,endpoint:'/images/generations',signal:controller.signal,
      onProgress:(status,progress,retryMessage)=>{
        if(retryMessage){setEditorProgress(true,Math.max(2,progress||0),retryMessage);return}
        setEditorProgress(true,progress||8,status==='queued'?'等待算力接入':'正在生成图片');
      }
    });
    const item=addEditorItem({url,prompt,model},{replaceId:source.id});
    const historyItem={
      id:Date.now(),url,prompt,model,settings:{ratio,...(resolution?{resolution}:{})},
      createdAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started)
    };
    await History.save(historyItem);selectEditorItem(item.id);setEditorProgress(true,100,'图片生成完成');
    setTimeout(()=>setEditorProgress(false),700);toast('画布图片已更新');
  }catch(error){
    setEditorProgress(false);
    toast(error.name==='AbortError'?'请求超时，请稍后重试':(error.message||'生成失败'));
  }finally{
    clearTimeout(timeout);editorGenerating=false;syncEditor();
  }
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
  const ratio=EDIT_RATIOS.gpt.reduce((best,candidate)=>{
    const [w,h]=candidate.split(':').map(Number),[bw,bh]=best.split(':').map(Number);
    return Math.abs(Math.log(w/h/sourceRatio))<Math.abs(Math.log(bw/bh/sourceRatio))?candidate:best;
  },'1:1');
  editorDrafts.gpt.ratio=ratio;editorDrafts.gpt.resolution='4k';
  await generateEditorImage({model:'gpt',prompt:EDIT_HD_PROMPT,ratio,resolution:'4k',source:{...source}});
};
$('#editorReverse').onclick=async()=>{
  const source=getEditorItem();if(!source)return;
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openModal({modal:editorEls.apiModal,apiKey:editorEls.apiKey});toast('请先保存 API Key');return}
  const button=$('#editorReverse'),original=button.innerHTML;
  button.disabled=true;button.textContent='正在反推…';
  try{
    const response=await fetch(APIMART_BASE+'/chat/completions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        model:'gpt-5.6-luna',
        messages:[
          {role:'system',content:'你是一名专业的 AI 图像提示词分析师。忠实识别图片主体，并用中文描述主体、姿态、服装、构图、镜头、光线、色彩、材质、风格和氛围。禁止添加不存在的内容。只输出最终提示词。'},
          {role:'user',content:[{type:'text',text:'请反推一条可直接用于重新生成相似画面的提示词。'},{type:'image_url',image_url:{url:source.url,detail:'high'}}]}
        ],
        temperature:.35,stream:false
      })
    });
    if(!response.ok)throw new Error('反推提示词失败（HTTP '+response.status+'）');
    const json=await response.json();
    const prompt=(json.choices||json.data?.choices)?.[0]?.message?.content?.trim();
    if(!prompt)throw new Error('接口未返回提示词');
    editorEls.prompt.value=prompt.slice(0,EDIT_MODEL_LIMITS[editorModel]);editorEls.prompt.focus();toast('已生成反推提示词');
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
  if((event.ctrlKey||event.metaKey)&&(['+','-','=','0'].includes(event.key)||['NumpadAdd','NumpadSubtract','Numpad0'].includes(event.code)))event.preventDefault();
},{capture:true});
window.addEventListener('wheel',event=>{if(event.ctrlKey||event.metaKey)event.preventDefault()},{passive:false});

try{
  const payload=JSON.parse(sessionStorage.getItem('mihu_edit_payload')||'null');
  if(payload?.url)addEditorItem(payload);
}catch(_){}
syncEditor();setEditorModel('gpt');
