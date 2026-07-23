/* ===================== 模型切换 ===================== */
$$('#modelPop .model-tab[data-model]').forEach(item=>{
  item.onclick=()=>{
    switchModel(item.dataset.model);
    renderModelSettings();
  };
});

$$('#modelQualityGrid .setting-chip').forEach(button=>{
  button.onclick=()=>{
    modelState.mj.quality=button.dataset.quality;
    syncMjControls();
    renderModelSettings();
  };
});

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
  modelState[activeModel].promptText=els.promptInput.value;
  activeModel=key;
  const modelSettingsScroll=$('#modelPop .model-settings-scroll');
  if(modelSettingsScroll)modelSettingsScroll.scrollTop=0;
  $$('#modelPop .model-tab[data-model]').forEach(i=>{
    const selected=i.dataset.model===key;
    i.classList.toggle('active',selected);
    i.setAttribute('aria-selected',String(selected));
  });
  els.modelBtnValue.textContent=MODEL_NAMES[key];
  els.modelBtn.title='模型与输出设置 · '+MODEL_NAMES[key];
  els.modelBtn.setAttribute('aria-label','模型与输出设置，当前 '+MODEL_NAMES[key]);
  // 恢复该模型的提示词
  els.promptInput.value=modelState[key].promptText||'';
  els.promptInput.maxLength=MODEL_MAX_PROMPT[key];
  els.charCount.textContent=els.promptInput.value.length;
  updateCharLimit();
  // 比例、分辨率与质量统一在模型窗口中维护
  const res=MODEL_RESOLUTIONS[key];
  if(res){
    const rv=modelState[key].resolution;
    const rObj=res.find(r=>r.v===rv);
    els.resBtnValue.textContent=rObj?rObj.l.split(' ')[0]:rv;
  }
  renderModelSettings();
  // Midjourney 高级参数已集成在模型窗口中
  $('#mjModelSettings').hidden=key!=='mj';
  // 恢复优化按钮状态
  els.restoreBtn.hidden=modelState[key].originalPrompt===null;
  // 恢复参考图行和当前模型参数弹层
  renderRefRow();
  renderResPop();
  renderRatioPop();
  syncMjControls();
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
    mj:'描述你想生成的画面，支持 MJ 原生参数如 --ar 16:9 --v 7 --s 250',
    grok:'描述你想生成的画面，Grok 超写实图像生成…'
  };
  els.promptInput.placeholder=phs[activeModel]||'描述你想生成的图片…';
}

/* ===================== 模型窗口输出设置 ===================== */
function renderModelSettings(){
  const resolutionSection=$('#modelResolutionSection');
  const qualitySection=$('#modelQualitySection');
  const mjSettings=$('#mjModelSettings');
  const res=MODEL_RESOLUTIONS[activeModel];
  els.resPopList.innerHTML='';
  resolutionSection.hidden=!res;
  qualitySection.hidden=activeModel!=='mj';
  mjSettings.hidden=activeModel!=='mj';
  els.modelPop.classList.toggle('has-mj-settings',activeModel==='mj');

  if(res){
    for(const r of res){
      const item=document.createElement('button');
      item.className='setting-chip'+(modelState[activeModel].resolution===r.v?' active':'');
      item.textContent=r.l;
      item.onclick=e=>{
        e.stopPropagation();
        modelState[activeModel].resolution=r.v;
        els.resBtnValue.textContent=r.l.split(' ')[0];
        renderModelSettings();
      };
      els.resPopList.appendChild(item);
    }
  }

  $$('#modelQualityGrid .setting-chip').forEach(button=>{
    button.classList.toggle('active',button.dataset.quality===String(modelState.mj.quality));
  });
}
function renderResPop(){renderModelSettings()}

/* ===================== 模型窗口内宽高比 ===================== */
function renderRatioPop(){
  const ratios=MODEL_RATIOS[activeModel];
  els.modelRatioGrid.innerHTML='';
  for(const r of ratios){
    const [w,h]=RATIO_ICON_SIZE[r]||[20,20];
    const item=document.createElement('button');
    item.className='ratio-pop-item'+(modelState[activeModel].ratio===r?' active':'');
    item.innerHTML='<i class="ratio-icon" style="width:'+w+'px;height:'+h+'px"></i><span>'+r+'</span>';
    item.onclick=()=>{
      modelState[activeModel].ratio=r;
      renderRatioPop();
    };
    els.modelRatioGrid.appendChild(item);
  }
}

function syncMjControls(){
  const state=modelState.mj;
  $$('#mjVersionGrid .opt-btn').forEach(b=>b.classList.toggle('active',b.dataset.version===state.version));
  $$('#mjSpeedGrid .opt-btn').forEach(b=>b.classList.toggle('active',b.dataset.speed===state.speed));
  $$('#mjQualityGrid .opt-btn').forEach(b=>b.classList.toggle('active',b.dataset.quality===String(state.quality)));
  $$('#modelQualityGrid .setting-chip').forEach(b=>b.classList.toggle('active',b.dataset.quality===String(state.quality)));
  $$('#mjStyleGrid .opt-btn').forEach(b=>b.classList.toggle('active',b.dataset.style===state.style));
  $('#mjStylizeSlider').value=state.stylize;$('#mjStylizeValue').textContent=state.stylize;
  $('#mjChaosSlider').value=state.chaos;$('#mjChaosValue').textContent=state.chaos;
  $('#mjIwSlider').value=state.iw;$('#mjIwValue').textContent=Number(state.iw).toFixed(1);
  $('#mjNegativePrompt').value=state.negativePrompt||'';
  $('#mjSeed').value=state.seed||'';
}

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
  // MJ 的 iw section 根据参考图数量显隐
  const iwSection=$('#mjIwSection');
  if(iwSection)iwSection.hidden=!(activeModel==='mj'&&refs.length>0);
}

/* ===================== 提示词字符计数 ===================== */
els.promptInput.addEventListener('input',()=>{
  els.charCount.textContent=els.promptInput.value.length;
  modelState[activeModel].promptText=els.promptInput.value;
});
els.clearPromptBtn.onclick=()=>{
  const state=modelState[activeModel];
  if(!els.promptInput.value&&!state.originalPrompt)return;
  els.promptInput.value='';state.promptText='';state.originalPrompt=null;
  updateCharLimit();els.restoreBtn.hidden=true;hideComposerError();
  els.promptInput.focus();toast('当前提示词已清空');
};

/* ===================== 优化提示词 ===================== */
const ENHANCE_SYSTEMS={
  gpt:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其结构清晰、具体且适合图片生成模型。不得改变核心意图、主体数量、人物身份和指定元素。只输出优化后的最终提示词，不要解释。',
  nano:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 NB2 (Gemini 3.1 Flash Image) 图片生成模型。只输出优化后的最终提示词，不要解释。',
  mj:'你是一名 Midjourney 提示词优化专家。请优化用户提示词，使其更适合 Midjourney 生成。可以使用英文描述以获得更好效果，但保留用户的核心意图。只输出优化后的提示词，不要添加 --ar --v 等参数（这些由界面控件设置），不要解释。',
  grok:'你是一名专业的 AI 图像提示词编辑器。请优化用户提示词，使其适合 Grok Imagine (xAI) 超写实图片生成模型。强调细节、光线、材质和氛围的描述。只输出优化后的最终提示词，不要解释。'
};

els.enhanceBtn.onclick=async()=>{
  const state=modelState[activeModel];
  hideComposerError();
  const apiKey=Settings.getKey(),original=els.promptInput.value.trim();
  if(!apiKey){Settings.openModal(els);toast('请先保存 API Key');return}
  if(!original){showComposerError('请先填写需要优化的提示词。');return}
  const before=els.promptInput.value;
  els.enhanceBtn.disabled=true;
  els.enhanceBtn.style.opacity='.5';
  try{
    const refCount=refManagers[activeModel]?refManagers[activeModel].count():0;
    let modeRule='';
    if(activeModel==='mj'){
      modeRule=refCount>0?'当前是图生图任务，有 '+refCount+' 张参考图，请保留主体描述。':'';
    }else if(refCount>0){
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
        temperature:activeModel==='mj'?.45:.35,
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
    if(state.originalPrompt===null)state.originalPrompt=before;
    els.promptInput.value=enhanced.slice(0,MODEL_MAX_PROMPT[activeModel]);
    els.charCount.textContent=els.promptInput.value.length;
    modelState[activeModel].promptText=els.promptInput.value;
    els.restoreBtn.hidden=false;
    toast('提示词已优化');
  }catch(e){
    showComposerError(e.message.includes('Failed to fetch')?'无法连接接口，可能是网络或跨域限制。':e.message);
  }finally{
    els.enhanceBtn.disabled=false;
    els.enhanceBtn.style.opacity='';
  }
};

els.restoreBtn.onclick=()=>{
  const state=modelState[activeModel];
  if(state.originalPrompt===null)return;
  els.promptInput.value=state.originalPrompt;
  els.charCount.textContent=els.promptInput.value.length;
  modelState[activeModel].promptText=els.promptInput.value;
  state.originalPrompt=null;
  els.restoreBtn.hidden=true;
  toast('已恢复原提示词');
};

/* ===================== 错误提示 ===================== */
function showComposerError(msg){els.errorMsg.textContent=msg;els.errorMsg.classList.add('show')}
function hideComposerError(){els.errorMsg.classList.remove('show')}

