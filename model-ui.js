/* ===================== 模型切换 ===================== */
const CREATION_MODEL_ICONS=Object.fromEntries(
  Object.entries(MODEL_CONFIG).map(([key,config])=>[key,config.icon])
);
CREATION_MODEL_ICONS.seedream=CREATION_MODEL_ICONS.seedreamflash;
const MODEL_VERSIONS={
  gpt:[{value:'gpt',label:'2.0'},{value:'gpt25flare',label:'2.5 Flare'},{value:'gpt25sunburst',label:'2.5 Sunburst'}],
  seedream:[{value:'seedreamflash',label:'FLASH'},{value:'seedreampro',label:'PRO'}]
};
const selectedModelVersions={gpt:activeModel,seedream:'seedreamflash'};
function creationModelFamily(key){return key.startsWith('gpt')?'gpt':key.startsWith('seedream')?'seedream':key}
const RESOLUTION_ICONS={
  '1k':'icon/resolution-1k.png','1K':'icon/resolution-1k.png',
  '1.5K':'icon/resolution-1k-plus.png','2k':'icon/resolution-2k.png',
  '2K':'icon/resolution-2k.png','4k':'icon/resolution-4k.png','4K':'icon/resolution-4k.png'
};
const sharedReferenceManager=createReferenceManager({
  dropzone:null,fileInput:null,grid:null,count:null,error:els.errorMsg
});
for(const key of Object.keys(MODEL_CONFIG))refManagers[key]=sharedReferenceManager;
function getRatioFrameSize(ratio){
  const parts=ratio.split(':').map(Number);
  const w=parts[0]||1,h=parts[1]||1;
  const scale=Math.min(20/w,16/h);
  return {width:Math.max(5,Math.round(w*scale)),height:Math.max(5,Math.round(h*scale))};
}

function makeCreationVisual(type,value){
  if(type==='model'){
    const img=document.createElement('img');
    img.className='model-mark model-mark-'+value;
    img.src=CREATION_MODEL_ICONS[value]||CREATION_MODEL_ICONS.gpt;
    img.alt='';
    return img;
  }
  if(type==='gpt-version'){
    const img=document.createElement('img');
    img.className='model-mark';img.src=CREATION_MODEL_ICONS[value]||CREATION_MODEL_ICONS.gpt;img.alt='';
    return img;
  }
  if(type==='ratio'){
    if(value==='auto'){
      const img=document.createElement('img');
      img.className='ratio-auto-icon';img.src='icon/ratio-auto.png';img.alt='';
      return img;
    }
    const frame=document.createElement('i');
    const size=getRatioFrameSize(value);
    frame.className='ratio-frame';
    frame.style.width=size.width+'px';
    frame.style.height=size.height+'px';
    return frame;
  }
  if(type==='quality'||type==='moderation'){
    const mark=document.createElement('span');
    mark.className='creation-parameter-mark';
    mark.textContent=type==='quality'?'Q':'S';
    return mark;
  }
  if(type==='transparent'){
    const img=document.createElement('img');
    img.className='transparent-mode-icon';img.src='icon/transparency.svg';img.alt='';
    return img;
  }
  const img=document.createElement('img');
  img.src=RESOLUTION_ICONS[value]||RESOLUTION_ICONS['1K'];
  img.alt='';
  return img;
}

function createCreditMark(){
  const icon=document.createElement('img');
  icon.className='creation-credit-mark';
  icon.src='icon/credit.svg';
  icon.alt='';
  icon.setAttribute('aria-hidden','true');
  return icon;
}

function closeCreationDropdowns(except){
  document.querySelectorAll('.creation-dropdown.open').forEach(dropdown=>{
    if(dropdown===except)return;
    dropdown.classList.remove('open');
    dropdown.querySelector('.creation-select-trigger')?.setAttribute('aria-expanded','false');
  });
}

function syncCreationDropdown(dropdown){
  if(!dropdown)return;
  const type=dropdown.dataset.creationDropdown;
  const select=dropdown.querySelector('select');
  const current=select.options[select.selectedIndex]||select.options[0];
  const currentLabel=current?.textContent||'';
  const currentValue=current?.value||'';
  dropdown.querySelector('[data-creation-current]').textContent=currentLabel;
  const triggerVisual=dropdown.querySelector('[data-creation-visual]');
  triggerVisual.innerHTML='';
  const currentVisual=makeCreationVisual(type,currentValue);
  if(type==='model'){
    currentVisual.id='creationModelIcon';
    els.creationModelIcon=currentVisual;
  }
  triggerVisual.appendChild(currentVisual);
  triggerVisual.classList.toggle('creation-resolution-mark',type==='resolution');

  const menu=dropdown.querySelector('.creation-select-menu');
  menu.innerHTML='';
  Array.from(select.options).forEach(option=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='creation-select-option';
    button.setAttribute('role','option');
    button.setAttribute('aria-selected',String(option.value===select.value));

    const visual=document.createElement('span');
    visual.className='creation-option-visual';
    visual.appendChild(makeCreationVisual(type,option.value));

    const copy=document.createElement('span');
    copy.className='creation-option-copy';
    const title=document.createElement('strong');
    title.textContent=option.textContent;
    copy.appendChild(title);
    if(type==='model'&&option.dataset.description){
      const description=document.createElement('small');
      description.className='creation-option-description';
      description.textContent=option.dataset.description;
      copy.appendChild(description);
    }
    if(type==='resolution'&&option.dataset.price){
      const price=document.createElement('small');
      price.className='creation-option-price';
      const [amount,unit]=option.dataset.price.split('积分');
      price.append(document.createTextNode(amount),createCreditMark(),document.createTextNode(unit||''));
      copy.appendChild(price);
    }

    button.append(visual,copy);
    button.onclick=()=>{
      select.value=option.value;
      syncCreationDropdown(dropdown);
      closeCreationDropdowns();
      select.dispatchEvent(new Event('change',{bubbles:true}));
    };
    menu.appendChild(button);
  });
}

function initCreationDropdowns(){
  document.querySelectorAll('.creation-dropdown').forEach(dropdown=>{
    const trigger=dropdown.querySelector('.creation-select-trigger');
    trigger.onclick=event=>{
      event.stopPropagation();
      const opening=!dropdown.classList.contains('open');
      closeCreationDropdowns(dropdown);
      dropdown.classList.toggle('open',opening);
      trigger.setAttribute('aria-expanded',String(opening));
      if(opening)syncCreationDropdown(dropdown);
    };
    syncCreationDropdown(dropdown);
  });
  document.addEventListener('click',()=>closeCreationDropdowns());
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')closeCreationDropdowns();
  });
}

els.creationModelSelect.onchange=()=>{
  const family=els.creationModelSelect.value;
  const key=selectedModelVersions[family]||family;
  switchModel(key);
};
els.creationGptVersionSelect.onchange=()=>switchModel(els.creationGptVersionSelect.value);
els.creationRatioSelect.onchange=()=>{
  modelState[activeModel].ratio=els.creationRatioSelect.value;
  if(MODEL_CONFIG[activeModel].provider==='moss')renderModelSettings();
};
els.creationResolutionSelect.onchange=()=>{
  modelState[activeModel].resolution=els.creationResolutionSelect.value;
  if(MODEL_CONFIG[activeModel].provider==='moss')renderModelSettings();
};
els.creationQualitySelect.onchange=()=>{
  modelState[activeModel].quality=els.creationQualitySelect.value;
};
els.creationModerationSelect.onchange=()=>{
  modelState[activeModel].moderation=els.creationModerationSelect.value;
};

function switchModel(key){
  if(key===activeModel)return;
  // 首页提示词是共用草稿；切换模型时只切换模型参数，不清空创作内容。
  const currentPrompt=els.promptInput.value;
  Object.entries(modelState).forEach(([modelKey,state])=>{
    state.promptText=currentPrompt.slice(0,MODEL_CONFIG[modelKey].promptLimit);
  });
  activeModel=key;
  const family=creationModelFamily(key);
  if(MODEL_VERSIONS[family])selectedModelVersions[family]=key;
  els.creationModelSelect.value=family;
  syncCreationDropdown(els.creationModelSelect.closest('.creation-dropdown'));
  els.promptInput.value=modelState[key].promptText;
  els.promptInput.maxLength=MODEL_CONFIG[key].promptLimit;
  els.charCount.textContent=els.promptInput.value.length;
  updateCharLimit();
  renderModelSettings();
  // 恢复参考图行和当前模型参数弹层
  renderRefRow();
  renderResPop();
  renderRatioPop();
  syncTransparentBackgroundControl();
  renderModelVersionControl();
  // 更新占位符
  updatePlaceholder();
}

function updateCharLimit(){
  els.charCount.textContent=els.promptInput.value.length;
  els.charCount.parentElement.lastChild.textContent='/'+MODEL_CONFIG[activeModel].promptLimit;
  resizePromptInput();
}

function resizePromptInput(){
  const input=els.promptInput;
  input.style.height='auto';
  input.style.height=Math.min(input.scrollHeight,Math.round(innerHeight*.42),420)+'px';
  renderPromptHighlights();
}

function updatePlaceholder(){els.promptInput.placeholder=MODEL_CONFIG[activeModel].supportsReferences===false?'MOSS SFT 限时免费，仅支持文生图，请输入提示词':'请输入提示词，输入 @ 引用参考图'}

/* ===================== 外置模型输出设置 ===================== */
function renderModelSettings(){
  const config=MODEL_CONFIG[activeModel],res=config.resolutions;
  els.creationResolutionSelect.innerHTML='';
  els.creationResolutionControl.hidden=!res;

  if(res){
    for(const r of res){
      const option=document.createElement('option');
      option.value=r.v;
      option.textContent=r.l;
      option.dataset.price=r.price||'';
      option.selected=modelState[activeModel].resolution===r.v;
      els.creationResolutionSelect.appendChild(option);
    }
  }
  syncCreationDropdown(els.creationResolutionControl);
  els.creationResolutionControl.querySelector('.creation-select-trigger').dataset.tooltip='选择分辨率';
  if(config.provider==='moss'){
    const state=modelState[activeModel],size=config.sizes[state.resolution][state.ratio].replace('x','×');
    els.creationResolutionControl.querySelector('.creation-select-trigger').dataset.tooltip=size+' 像素 · 限时免费 · 高清档受总像素上限限制';
    els.creationResolutionControl.querySelectorAll('.creation-select-option').forEach((button,index)=>button.title=config.sizes[res[index].v][state.ratio].replace('x','×')+' 像素（限时免费）');
  }

  const renderOptionalSetting=(items,control,select,stateKey)=>{
    control.hidden=!items?.length;
    select.replaceChildren();
    if(!items?.length)return;
    for(const item of items){
      const option=document.createElement('option');
      option.value=item.v;option.textContent=item.l;
      option.selected=modelState[activeModel][stateKey]===item.v;
      select.appendChild(option);
    }
    syncCreationDropdown(control);
  };
  renderOptionalSetting(config.qualities,els.creationQualityControl,els.creationQualitySelect,'quality');
  renderOptionalSetting(config.moderations,els.creationModerationControl,els.creationModerationSelect,'moderation');
}

function renderModelVersionControl(){
  const control=els.creationGptVersionControl;
  if(!control)return;
  const family=creationModelFamily(activeModel),versions=MODEL_VERSIONS[family];
  control.hidden=!versions;
  if(!versions)return;
  const label=family==='seedream'?'Seedream 5.0 档位':'GPT IMAGE 版本';
  els.creationGptVersionSelect.replaceChildren(...versions.map(version=>{
    const option=document.createElement('option');option.value=version.value;option.textContent=version.label;return option;
  }));
  els.creationGptVersionSelect.value=activeModel;
  els.creationGptVersionSelect.setAttribute('aria-label',label);control.querySelector('.creation-select-menu').setAttribute('aria-label',label);
  syncCreationDropdown(control);
}

function syncTransparentBackgroundControl(){
  const control=els.transparentBgBtn?.closest('.creation-transparent-select');
  if(!control)return;
  const config=MODEL_CONFIG[activeModel],trigger=control.querySelector('.creation-select-trigger');
  control.hidden=!config.supportsTransparent;
  if(trigger)trigger.dataset.tooltip=config.transparentRequiresSingleReference?'仅适用于单张带透明通道的参考图':'是否打开透明背景';
}
function renderResPop(){renderModelSettings()}

/* ===================== 外置宽高比 ===================== */
function renderRatioPop(){
  const ratios=MODEL_CONFIG[activeModel].ratios;
  els.creationRatioSelect.innerHTML='';
  for(const r of ratios){
    const option=document.createElement('option');
    option.value=r;
    option.textContent=r;
    option.selected=modelState[activeModel].ratio===r;
    els.creationRatioSelect.appendChild(option);
  }
  syncCreationDropdown(els.creationRatioSelect.closest('.creation-dropdown'));
}

initCreationDropdowns();

// Keep the native textarea for editing; mirror only the text styling underneath it.
const promptEditor=document.createElement('div');promptEditor.className='prompt-editor';
els.promptInput.before(promptEditor);promptEditor.appendChild(els.promptInput);
const promptHighlights=document.createElement('div');promptHighlights.className='prompt-highlights';
promptHighlights.setAttribute('aria-hidden','true');promptEditor.prepend(promptHighlights);
function renderPromptHighlights(){
  const input=els.promptInput,text=input.value;
  const matches=[...text.matchAll(/@参考图\d+(?!\d)/g)];
  promptEditor.classList.toggle('has-reference-mentions',matches.length>0);
  promptHighlights.replaceChildren();
  if(!matches.length)return;
  let cursor=0;
  for(const match of matches){
    promptHighlights.append(document.createTextNode(text.slice(cursor,match.index)));
    const mention=document.createElement('span');mention.className='prompt-reference-mention';mention.textContent=match[0];
    promptHighlights.append(mention);cursor=match.index+match[0].length;
  }
  promptHighlights.append(document.createTextNode(text.slice(cursor)+'\n'));
  const style=getComputedStyle(input);
  for(const property of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','wordSpacing','textIndent','textAlign','paddingTop','paddingRight','paddingBottom','paddingLeft','overflowWrap','wordBreak','tabSize'])promptHighlights.style[property]=style[property];
  promptHighlights.style.width=input.clientWidth+'px';promptHighlights.style.height=input.clientHeight+'px';
  promptHighlights.style.left=input.offsetLeft+input.clientLeft+'px';promptHighlights.style.top=input.offsetTop+input.clientTop+'px';
  promptHighlights.scrollTop=input.scrollTop;promptHighlights.scrollLeft=input.scrollLeft;
}
els.promptInput.addEventListener('scroll',()=>{promptHighlights.scrollTop=els.promptInput.scrollTop;promptHighlights.scrollLeft=els.promptInput.scrollLeft});
new ResizeObserver(renderPromptHighlights).observe(els.promptInput);
document.fonts.ready.then(renderPromptHighlights);

/* ===================== 参考图管理 ===================== */
let draggedReferenceIndex=null;
function remapReferenceMentions(mapping){
  const replace=text=>text.replace(/@参考图(\d+)(?!\d)/g,(token,number)=>{
    const next=mapping[Number(number)-1];
    return next===undefined?'[已移除参考图]':'@参考图'+(next+1);
  });
  for(const state of Object.values(modelState))state.promptText=replace(state.promptText||'');
  const input=els.promptInput,start=input.selectionStart,end=input.selectionEnd;
  const before=input.value;
  input.value=replace(before);
  input.setSelectionRange(replace(before.slice(0,start)).length,replace(before.slice(0,end)).length);
  modelState[activeModel].promptText=input.value;
  updateCharLimit();closeReferenceMentions();
}
function reorderReferences(from,to){
  if(preparingGeneration||from===to)return;
  const order=sharedReferenceManager.getAll().map((_,index)=>index);
  order.splice(to,0,order.splice(from,1)[0]);
  if(!sharedReferenceManager.move(from,to))return;
  const mapping=[];order.forEach((oldIndex,newIndex)=>mapping[oldIndex]=newIndex);
  remapReferenceMentions(mapping);renderRefRow();
  els.refRow.querySelector('.ref-stack')?.classList.add('is-expanded');
}
const referenceMentionMenu=document.createElement('div');
referenceMentionMenu.className='reference-mention-menu';referenceMentionMenu.hidden=true;
referenceMentionMenu.id='referenceMentionMenu';referenceMentionMenu.setAttribute('role','listbox');
referenceMentionMenu.setAttribute('aria-label','选择参考图');document.body.appendChild(referenceMentionMenu);
els.promptInput.setAttribute('aria-controls',referenceMentionMenu.id);
els.promptInput.setAttribute('aria-autocomplete','list');
let referenceMentionRange=null,referenceMentionChoices=[],referenceMentionSelected=0;
function closeReferenceMentions(){
  referenceMentionMenu.hidden=true;referenceMentionRange=null;
  els.promptInput.setAttribute('aria-expanded','false');els.promptInput.removeAttribute('aria-activedescendant');
}
function selectReferenceMention(index){
  if(!referenceMentionRange)return;
  const input=els.promptInput,{start,end}=referenceMentionRange,token='@参考图'+(index+1)+' ';
  if(input.value.length-(end-start)+token.length>input.maxLength){toast('提示词已达到字数上限');return}
  input.setRangeText(token,start,end,'end');closeReferenceMentions();input.focus();
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function highlightReferenceMention(){
  [...referenceMentionMenu.children].forEach((option,index)=>{
    option.classList.toggle('is-active',index===referenceMentionSelected);
    option.setAttribute('aria-selected',String(index===referenceMentionSelected));
  });
  const selected=referenceMentionMenu.children[referenceMentionSelected];
  if(selected){els.promptInput.setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView({block:'nearest'})}
}
function updateReferenceMentions(){
  if(MODEL_CONFIG[activeModel].supportsReferences===false){closeReferenceMentions();return}
  const input=els.promptInput,caret=input.selectionStart;
  if(document.activeElement!==input||caret!==input.selectionEnd){closeReferenceMentions();return}
  const match=input.value.slice(0,caret).match(/@(?:参考图)?(\d*)$/);
  const refs=sharedReferenceManager.getAll();
  if(!match||!refs.length){closeReferenceMentions();return}
  referenceMentionChoices=refs.map((_,index)=>index).filter(index=>String(index+1).startsWith(match[1]));
  if(!referenceMentionChoices.length){closeReferenceMentions();return}
  referenceMentionRange={start:caret-match[0].length,end:caret};referenceMentionSelected=0;
  referenceMentionMenu.replaceChildren();
  referenceMentionChoices.forEach(index=>{
    const option=document.createElement('button');option.type='button';option.setAttribute('role','option');
    option.id='referenceMention-'+index;
    const image=document.createElement('img');image.src=refs[index].dataUrl;image.alt='';image.draggable=false;
    const label=document.createElement('span');label.textContent='参考图 '+(index+1);
    option.append(image,label);option.addEventListener('mousedown',event=>event.preventDefault());
    option.onclick=()=>selectReferenceMention(index);referenceMentionMenu.appendChild(option);
  });
  const rect=input.getBoundingClientRect();
  referenceMentionMenu.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-248))+'px';
  referenceMentionMenu.style.top=Math.max(8,Math.min(rect.bottom,window.innerHeight-240))+'px';
  referenceMentionMenu.hidden=false;input.setAttribute('aria-expanded','true');highlightReferenceMention();
}
els.promptInput.addEventListener('input',updateReferenceMentions);
els.promptInput.addEventListener('click',updateReferenceMentions);
els.promptInput.addEventListener('keyup',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))updateReferenceMentions()});
els.promptInput.addEventListener('blur',closeReferenceMentions);
els.promptInput.addEventListener('keydown',event=>{
  if(referenceMentionMenu.hidden||event.isComposing||event.ctrlKey||event.metaKey)return;
  if(['ArrowDown','ArrowUp','Enter','Escape','Tab'].includes(event.key)){
    event.preventDefault();event.stopImmediatePropagation();
    if(event.key==='Escape'){closeReferenceMentions();return}
    if(event.key==='Enter'||event.key==='Tab'){selectReferenceMention(referenceMentionChoices[referenceMentionSelected]);return}
    referenceMentionSelected=(referenceMentionSelected+(event.key==='ArrowDown'?1:-1)+referenceMentionChoices.length)%referenceMentionChoices.length;
    highlightReferenceMention();
  }
});
window.addEventListener('resize',closeReferenceMentions);
window.addEventListener('scroll',event=>{if(!referenceMentionMenu.contains(event.target))closeReferenceMentions()},true);
els.refBtn.onclick=()=>els.fileInput.click();
async function addReferenceFiles(fileList){
  if(MODEL_CONFIG[activeModel].supportsReferences===false){toast('MOSS SFT 仅支持文生图，不能上传参考图');return}
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  await refManagers[activeModel].addFiles(files);
  renderRefRow();
}
els.fileInput.onchange=async e=>{
  await addReferenceFiles(e.target.files);
  els.fileInput.value='';
};

let composerDragDepth=0;
els.composer.addEventListener('dragenter',event=>{
  if(!event.dataTransfer?.types?.includes('Files'))return;
  event.preventDefault();
  if(MODEL_CONFIG[activeModel].supportsReferences===false)return;
  composerDragDepth++;
  els.composer.classList.add('is-dragover');
});
els.composer.addEventListener('dragover',event=>{
  if(!event.dataTransfer?.types?.includes('Files'))return;
  event.preventDefault();
  event.dataTransfer.dropEffect=MODEL_CONFIG[activeModel].supportsReferences===false?'none':'copy';
});
els.composer.addEventListener('dragleave',event=>{
  if(!event.dataTransfer?.types?.includes('Files'))return;
  composerDragDepth=Math.max(0,composerDragDepth-1);
  if(composerDragDepth===0)els.composer.classList.remove('is-dragover');
});
els.composer.addEventListener('drop',event=>{
  if(!event.dataTransfer?.types?.includes('Files'))return;
  event.preventDefault();
  composerDragDepth=0;
  els.composer.classList.remove('is-dragover');
  void addReferenceFiles(event.dataTransfer.files);
});

function renderRefRow(){
  const mgr=refManagers[activeModel];
  const refs=mgr?mgr.getAll():[];
  els.refRow.innerHTML='';
  const textOnly=MODEL_CONFIG[activeModel].supportsReferences===false;
  els.refRow.hidden=textOnly;els.refBtn.hidden=textOnly;els.fileInput.disabled=textOnly;
  if(els.oneClickStyleBtn)els.oneClickStyleBtn.hidden=textOnly;
  els.composer.classList.toggle('is-text-only-model',textOnly);
  closeReferenceMentions();
  if(textOnly){els.refRow.classList.remove('has-refs');return}
  if(!refs.length){els.refRow.classList.remove('has-refs')}
  else{
    els.refRow.classList.add('has-refs');
    const stack=document.createElement('div');
    stack.className='ref-stack';
    stack.classList.toggle('is-single',refs.length===1);
    stack.style.setProperty('--ref-count',String(refs.length));
    stack.addEventListener('mouseleave',()=>{if(draggedReferenceIndex===null)stack.classList.remove('is-expanded')});
    refs.forEach((ref,i)=>{
      const thumb=document.createElement('div');
      thumb.className='ref-thumb';
      thumb.style.setProperty('--ref-index',String(i));
      thumb.style.setProperty('--ref-angle',i%2===0?'-3deg':'3deg');
      thumb.style.setProperty('--ref-left',(i%3===2?-4:i%2===0?0:7)+'px');
      thumb.style.setProperty('--ref-top',(i%3)*2+'px');
      const image=document.createElement('img');image.src=ref.dataUrl;image.alt='参考图 '+(i+1);image.draggable=false;
      const label=document.createElement('span');label.className='ref-number';label.textContent='参考图 '+(i+1);
      const remove=document.createElement('button');remove.type='button';remove.className='ref-remove';remove.textContent='×';remove.setAttribute('aria-label','移除参考图 '+(i+1));
      thumb.append(image,label,remove);thumb.draggable=true;thumb.title='拖动调整顺序 · 参考图 '+(i+1);
      thumb.addEventListener('dragstart',event=>{
        if(preparingGeneration){event.preventDefault();return}
        draggedReferenceIndex=i;event.dataTransfer.effectAllowed='move';
        event.dataTransfer.setData('application/x-mihu-reference',String(i));
        thumb.classList.add('is-dragging');stack.classList.add('is-expanded');closeReferenceMentions();
      });
      thumb.addEventListener('dragover',event=>{
        if(draggedReferenceIndex===null)return;
        event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';thumb.classList.add('is-drop-target');
      });
      thumb.addEventListener('dragleave',()=>thumb.classList.remove('is-drop-target'));
      thumb.addEventListener('drop',event=>{
        if(draggedReferenceIndex===null)return;
        event.preventDefault();event.stopPropagation();const from=draggedReferenceIndex;draggedReferenceIndex=null;
        reorderReferences(from,i);
      });
      thumb.addEventListener('dragend',()=>{
        draggedReferenceIndex=null;stack.querySelectorAll('.ref-thumb').forEach(item=>item.classList.remove('is-dragging','is-drop-target'));
      });
      thumb.addEventListener('mouseenter',()=>stack.classList.add('is-expanded'));
      remove.onclick=()=>{
        if(preparingGeneration)return;
        const mapping=refs.map((_,index)=>index===i?undefined:index>i?index-1:index);
        mgr.remove(i);remapReferenceMentions(mapping);renderRefRow();
      };
      stack.appendChild(thumb);
    });
    if(refs.length<10){
      const add=document.createElement('button');
      add.className='ref-add';
      add.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
      add.onclick=()=>els.fileInput.click();
      stack.appendChild(add);
    }
    els.refRow.appendChild(stack);
  }
}

function applyReferenceLibraryPayload(){
  try{
    const payload=JSON.parse(sessionStorage.getItem('mihu_reference_payload')||'null');
    sessionStorage.removeItem('mihu_reference_payload');
    if(!payload)return;
    if(payload.model&&MODEL_CONFIG[payload.model]){
      const config=MODEL_CONFIG[payload.model],settings=payload.settings||{},state=modelState[payload.model];
      if(config.ratios.includes(settings.ratio))state.ratio=settings.ratio;
      if(config.resolutions?.some(item=>item.v===settings.resolution))state.resolution=settings.resolution;
      if(config.qualities?.some(item=>item.v===settings.quality))state.quality=settings.quality;
      if(config.moderations?.some(item=>item.v===settings.moderation))state.moderation=settings.moderation;
      if(payload.model!==activeModel)switchModel(payload.model);
      else{
        renderModelSettings();
        renderRatioPop();
      }
    }
    const manager=refManagers[activeModel];
    const referenceUrls=MODEL_CONFIG[activeModel].supportsReferences===false?[]:[...new Set([
      ...(Array.isArray(payload.urls)?payload.urls:[]),
      payload.url||''
    ].filter(Boolean))];
    let addedReferences=0;
    for(const [index,url] of referenceUrls.entries()){
      if(manager?.addRemote(url,'原始参考图 '+(index+1)))addedReferences++;
    }
    if(payload.prompt&&(payload.replacePrompt||!els.promptInput.value.trim())){
      const prompt=payload.prompt.slice(0,MODEL_CONFIG[activeModel].promptLimit);
      els.promptInput.value=prompt;modelState[activeModel].promptText=prompt;updateCharLimit();
    }
    renderRefRow();toast(addedReferences?'已带入原始参考图和提示词':'已带入提示词和生成参数');
  }catch(_){}
}
/* ===================== 提示词字符计数 ===================== */
els.promptInput.addEventListener('input',()=>{
  els.charCount.textContent=els.promptInput.value.length;
  modelState[activeModel].promptText=els.promptInput.value;
  if(els.promptInput.value.trim())hideComposerError();
  resizePromptInput();
});
els.clearPromptBtn.onclick=()=>{
  const state=modelState[activeModel];
  if(!els.promptInput.value)return;
  els.promptInput.value='';state.promptText='';
  updateCharLimit();hideComposerError();
  els.promptInput.focus();toast('当前提示词已清空');
};

/* ===================== 一键同款 ===================== */
const IMAGE_REVERSE_SYSTEM='你是一名严谨的图像反推助手。只根据用户提供的这一张图片，写出一段可直接用于 AI 生图的完整中文提示词。先在内部判断图像类型，再提取真实可见的画幅、构图、主体、空间层次、光线、色彩、材质、成像质感与必要的海报版式关系；按生成优先级将它们重组为连续自然语言。所有左右位置都以观者看到的画面坐标描述。不要猜测品牌、人物身份、镜头型号或不可见细节；不要保留水印、平台界面、署名或来源标记；海报中的文字只描述版式、位置、字重与层级，不抄写具体文案。只输出最终提示词，不要标题、分析、项目符号、解释或署名。';

function readImageFrame(file){
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file),image=new Image();
    image.onload=()=>{const width=image.naturalWidth,height=image.naturalHeight;URL.revokeObjectURL(url);resolve(width&&height?{width,height}:null)};
    image.onerror=()=>{URL.revokeObjectURL(url);resolve(null)};
    image.src=url;
  });
}
function getSimplifiedRatio(width,height){
  const gcd=(a,b)=>b?gcd(b,a%b):a;
  const divisor=gcd(width,height);
  return divisor?width/divisor+':'+height/divisor:'';
}

async function reverseStyleFromImage(file){
  if(!file)return;
  const types=new Set(['image/jpeg','image/png','image/webp']);
  if(!types.has(file.type)){showComposerError('一键同款仅支持 JPG、PNG 或 WebP 图片。');return}
  if(file.size>10*1024*1024){showComposerError('图片不能超过 10MB。');return}
  const apiKey=Settings.getKey();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return}
  const button=els.oneClickStyleBtn;
  hideComposerError();button.disabled=true;button.classList.add('is-loading');
  button.dataset.tooltip='正在分析图片';button.setAttribute('aria-label','正在分析图片');
  try{
    const [imageUrl,frame]=await Promise.all([fileToDataURI(file),readImageFrame(file)]);
    const frameHint=frame?'图片真实尺寸为 '+frame.width+'×'+frame.height+'，最简画幅比例为 '+getSimplifiedRatio(frame.width,frame.height)+'。':'';
    const prompt=await Apimart.analyzeImage(apiKey,{imageUrl,model:IMAGE_REVERSE_MODEL,instruction:IMAGE_REVERSE_SYSTEM+' '+frameHint+' 输出应适合 '+MODEL_CONFIG[activeModel].name+'。'});
    els.promptInput.value=prompt.trim().slice(0,MODEL_CONFIG[activeModel].promptLimit);
    modelState[activeModel].promptText=els.promptInput.value;
    updateCharLimit();els.promptInput.focus();toast('同款提示词已带入，可继续修改后生成');
  }catch(error){
    const message=error?.status===402
      ?'一键同款失败：APIMart 余额或模型可用额度不足。'
      :(error?.message||'图片分析失败，请稍后重试。');
    showComposerError(message);
  }finally{
    button.disabled=false;button.classList.remove('is-loading');
    button.dataset.tooltip='上传图片反推提示词';button.setAttribute('aria-label','上传图片反推提示词');
  }
}

els.oneClickStyleBtn?.addEventListener('click',()=>els.oneClickStyleInput?.click());
els.oneClickStyleInput?.addEventListener('change',async event=>{
  const [file]=Array.from(event.target.files||[]);
  event.target.value='';
  await reverseStyleFromImage(file);
});

/* ===================== 优化提示词 ===================== */
const ENHANCE_SYSTEMS={
  mosssft:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 MOSS Image SFT 文生图，清楚描述主体、构图、文字和光线。只输出最终提示词，不要添加参考图引用。',
  seedreamflash:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 Seedream 5.0 FLASH，保留主体、构图、文字、光线和参考图引用。只输出优化后的提示词，不要解释。',
  seedreampro:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 Seedream 5.0 PRO，准确保留主体、构图、文字、材质、光线和参考图引用。只输出优化后的提示词，不要解释。',
  gpt:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其结构清晰、具体且适合图片生成模型。不得改变核心意图、主体数量、人物身份和指定元素。只输出优化后的最终提示词，不要解释。',
  gpt25flare:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 GPT Image 2.5 Flare 快速图像生成，保留核心意图并清晰描述主体、构图、文字、光线和材质。只输出优化后的最终提示词，不要解释。',
  gpt25sunburst:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 GPT Image 2.5 Sunburst 高质量图像生成与精细编辑，保留核心意图并准确描述主体、构图、文字、光线、材质和细节。只输出优化后的最终提示词，不要解释。',
  nano:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 Nano Banana PRO（Gemini 3 Pro Image）图片生成模型。突出主体、构图、光线、材质、文字内容和参考图一致性。只输出优化后的最终提示词，不要解释。'
};

async function optimizeCurrentPrompt(){
  const state=modelState[activeModel];
  hideComposerError();
  const apiKey=Settings.getKey(),original=els.promptInput.value.trim();
  if(!apiKey){Settings.openPage();toast('请先保存 API Key');return false}
  if(!original){showComposerError('请先填写需要优化的提示词。');return false}
  els.enhanceBtn.disabled=true;
  els.enhanceBtn.closest('.prompt-enhance-switch')?.classList.add('is-loading');
  try{
    const refCount=refManagers[activeModel]?refManagers[activeModel].count():0;
    let modeRule='';
    if(refCount>0){
      modeRule='这是多参考图的图生图任务，当前共有 '+refCount+' 张参考图。必须保留参考图中的主体身份、人物外貌、姿势、构图和产品结构，只优化用户明确要求修改的部分。';
    }else{
      modeRule='这是文生图任务。可在不改变核心创意的前提下补充构图、镜头、光线、色彩、材质与氛围。';
    }
    const enhanced=await Apimart.chat(apiKey,{
        model:PROMPT_ANALYSIS_MODEL,
        messages:[
          {role:'system',content:ENHANCE_SYSTEMS[activeModel]},
          {role:'user',content:modeRule+'\n原始提示词：\n'+original}
        ],
        temperature:.35
    });
    els.promptInput.value=enhanced.slice(0,MODEL_CONFIG[activeModel].promptLimit);
    updateCharLimit();
    modelState[activeModel].promptText=els.promptInput.value;
    toast('提示词已优化');
    return true;
  }catch(e){
    const message=e.status===402
      ?'提示词优化失败：APIMart 余额或该模型可用额度不足，请充值后重试。'
      :(e.message.includes('Failed to fetch')?'无法连接接口，可能是网络或跨域限制。':e.message);
    showComposerError(message);
    return false;
  }finally{
    els.enhanceBtn.disabled=els.transparentBgBtn?.value==='yes';
    els.enhanceBtn.closest('.prompt-enhance-switch')?.classList.remove('is-loading');
  }
}
window.optimizeCurrentPrompt=optimizeCurrentPrompt;

/* ===================== 错误提示 ===================== */
function showComposerError(msg){els.errorMsg.textContent=msg;els.errorMsg.classList.add('show')}
function hideComposerError(){els.errorMsg.classList.remove('show')}

