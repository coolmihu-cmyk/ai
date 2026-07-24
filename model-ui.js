/* ===================== 模型切换 ===================== */
const CREATION_MODEL_ICONS={
  gpt:'icon/model-image2.svg',
  nano:'icon/model-nb2.svg',
  grok:'icon/model-grok.svg'
};
function getRatioFrameSize(ratio){
  const parts=ratio.split(':').map(Number);
  const w=parts[0]||1,h=parts[1]||1;
  const scale=Math.min(20/w,16/h);
  return {width:Math.max(5,Math.round(w*scale)),height:Math.max(5,Math.round(h*scale))};
}

function makeCreationVisual(type,value){
  if(type==='model'){
    const img=document.createElement('img');
    img.src=CREATION_MODEL_ICONS[value]||CREATION_MODEL_ICONS.gpt;
    img.alt='';
    return img;
  }
  if(type==='ratio'){
    const frame=document.createElement('i');
    const size=getRatioFrameSize(value);
    frame.className='ratio-frame';
    frame.style.width=size.width+'px';
    frame.style.height=size.height+'px';
    return frame;
  }
  const mark=document.createElement('span');
  mark.textContent=(value||'1K').replace(/[^0-9.K]/g,'')||'1K';
  return mark;
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

    const check=document.createElementNS('http://www.w3.org/2000/svg','svg');
    check.setAttribute('class','creation-option-check');
    check.setAttribute('viewBox','0 0 16 16');
    check.setAttribute('fill','none');
    check.innerHTML='<path d="m3.5 8.2 2.7 2.7 6.3-6.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
    button.append(visual,copy,check);
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

els.creationModelSelect.onchange=()=>switchModel(els.creationModelSelect.value);
els.creationRatioSelect.onchange=()=>{
  modelState[activeModel].ratio=els.creationRatioSelect.value;
};
els.creationResolutionSelect.onchange=()=>{
  modelState[activeModel].resolution=els.creationResolutionSelect.value;
};

function updateSendButton(){
  const generating=modelState[activeModel].generating;
  els.sendBtn.innerHTML=generating
    ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'
    :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z"/></svg>';
  els.sendBtn.title=generating?'停止等待并取消本页任务':'Ctrl + Enter 生成';
  els.sendBtn.setAttribute('aria-label',generating?'取消生成':'生成图片');
  els.sendBtn.classList.toggle('cancel',generating);
}

function switchModel(key){
  if(key===activeModel)return;
  // 保存当前模型的提示词
  const currentPrompt=els.promptInput.value;
  modelState[activeModel].promptText=currentPrompt;
  activeModel=key;
  els.creationModelSelect.value=key;
  syncCreationDropdown(els.creationModelSelect.closest('.creation-dropdown'));
  // 恢复该模型的提示词
  if(historyReusePrompt!==null){
    historyReusePrompt=currentPrompt;
    modelState[key].promptText=currentPrompt.slice(0,MODEL_MAX_PROMPT[key]);
  }
  els.promptInput.value=modelState[key].promptText||'';
  els.promptInput.maxLength=MODEL_MAX_PROMPT[key];
  els.charCount.textContent=els.promptInput.value.length;
  updateCharLimit();
  renderModelSettings();
  // 恢复参考图行和当前模型参数弹层
  renderRefRow();
  renderResPop();
  renderRatioPop();
  // 恢复结果面板
  restoreResultFor(key);
  // 更新占位符和生成按钮状态
  updatePlaceholder();
  updateSendButton();
}

function updateCharLimit(){
  els.charCount.textContent=els.promptInput.value.length;
  els.charCount.parentElement.lastChild.textContent='/'+MODEL_MAX_PROMPT[activeModel];
}

function updatePlaceholder(){
  const phs={
    gpt:'一个念头、一种氛围，或一句不完整的灵感...',
    nano:'描述你想生成的画面，NB2 支持 4K 输出、角色一致性…',
    grok:'描述你想生成的画面，Grok 超写实图像生成…'
  };
  els.promptInput.placeholder=phs[activeModel]||'描述你想生成的图片…';
}

/* ===================== 外置模型输出设置 ===================== */
function renderModelSettings(){
  const res=MODEL_RESOLUTIONS[activeModel];
  els.creationResolutionSelect.innerHTML='';
  els.creationResolutionControl.hidden=!res;

  if(res){
    for(const r of res){
      const option=document.createElement('option');
      option.value=r.v;
      option.textContent=r.l;
      option.selected=modelState[activeModel].resolution===r.v;
      els.creationResolutionSelect.appendChild(option);
    }
  }
  syncCreationDropdown(els.creationResolutionControl);
}
function renderResPop(){renderModelSettings()}

/* ===================== 外置宽高比 ===================== */
function renderRatioPop(){
  const ratios=MODEL_RATIOS[activeModel];
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

/* ===================== 参考图管理 ===================== */
els.refBtn.onclick=()=>els.fileInput.click();
els.fileInput.onchange=async e=>{
  const files=Array.from(e.target.files||[]);
  if(!files.length)return;
  await refManagers[activeModel].addFiles(files);
  els.fileInput.value='';
  renderRefRow();
};

function renderRefRow(){
  const mgr=refManagers[activeModel];
  const refs=mgr?mgr.getAll():[];
  els.refRow.innerHTML='';
  if(!refs.length){els.refRow.classList.remove('has-refs')}
  else{
    els.refRow.classList.add('has-refs');
    refs.forEach((ref,i)=>{
      const thumb=document.createElement('div');
      thumb.className='ref-thumb';
      thumb.innerHTML='<img src="'+ref.dataUrl+'" alt="参考图"><button class="ref-remove" data-i="'+i+'">×</button>';
      thumb.querySelector('.ref-remove').onclick=()=>{mgr.remove(i);renderRefRow()};
      els.refRow.appendChild(thumb);
    });
    if(refs.length<10){
      const add=document.createElement('button');
      add.className='ref-add';
      add.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';
      add.onclick=()=>els.fileInput.click();
      els.refRow.appendChild(add);
    }
  }
}

/* ===================== 提示词字符计数 ===================== */
els.promptInput.addEventListener('input',()=>{
  els.charCount.textContent=els.promptInput.value.length;
  modelState[activeModel].promptText=els.promptInput.value;
  if(historyReusePrompt!==null)historyReusePrompt=els.promptInput.value;
});
els.clearPromptBtn.onclick=()=>{
  const state=modelState[activeModel];
  if(!els.promptInput.value&&!state.originalPrompt)return;
  els.promptInput.value='';state.promptText='';state.originalPrompt=null;
  updateCharLimit();hideComposerError();
  els.promptInput.focus();toast('当前提示词已清空');
};

/* ===================== 优化提示词 ===================== */
const ENHANCE_SYSTEMS={
  gpt:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其结构清晰、具体且适合图片生成模型。不得改变核心意图、主体数量、人物身份和指定元素。只输出优化后的最终提示词，不要解释。',
  nano:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 NB2 (Gemini 3.1 Flash Image) 图片生成模型。只输出优化后的最终提示词，不要解释。',
  grok:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 Grok Imagine (xAI) 超写实图片生成模型。强调细节、光线、材质和氛围的描述。只输出优化后的最终提示词，不要解释。'
};

async function optimizeCurrentPrompt(){
  const state=modelState[activeModel];
  hideComposerError();
  const apiKey=Settings.getKey(),original=els.promptInput.value.trim();
  if(!apiKey){Settings.openModal(els);toast('请先保存 API Key');return false}
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
    const res=await fetch(APIMART_BASE+'/chat/completions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        model:ENHANCE_MODEL,
        messages:[
          {role:'system',content:ENHANCE_SYSTEMS[activeModel]},
          {role:'user',content:modeRule+'\n原始提示词：\n'+original}
        ],
        temperature:.35,
        stream:false
      })
    });
    if(!res.ok){
      let detail='';
      try{
        const errorData=await res.json();
        detail=errorData.error?.message||errorData.message||'';
      }catch(_){
        try{detail=await res.text()}catch(__){}
      }
      if(res.status===402)throw new Error('提示词优化失败：APIMart 余额或该模型可用额度不足，请充值后重试。');
      throw new Error('提示词优化失败（HTTP '+res.status+'）'+(detail?': '+detail.slice(0,180):''));
    }
    const json=await res.json(),enhanced=json.choices?.[0]?.message?.content?.trim();
    if(!enhanced)throw new Error('接口未返回优化结果');
    els.promptInput.value=enhanced.slice(0,MODEL_MAX_PROMPT[activeModel]);
    els.charCount.textContent=els.promptInput.value.length;
    modelState[activeModel].promptText=els.promptInput.value;
    toast('提示词已优化');
    return true;
  }catch(e){
    showComposerError(e.message.includes('Failed to fetch')?'无法连接接口，可能是网络或跨域限制。':e.message);
    return false;
  }finally{
    els.enhanceBtn.disabled=false;
    els.enhanceBtn.closest('.prompt-enhance-switch')?.classList.remove('is-loading');
  }
}
window.optimizeCurrentPrompt=optimizeCurrentPrompt;

/* ===================== 错误提示 ===================== */
function showComposerError(msg){els.errorMsg.textContent=msg;els.errorMsg.classList.add('show')}
function hideComposerError(){els.errorMsg.classList.remove('show')}

