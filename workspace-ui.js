/* ===================== 结果面板切换 ===================== */
function restoreResultFor(key){
  els.resultImage.title='点击在新标签页打开';
  const state=modelState[key];
  if(state.generating){
    setStatusVisible(true);
    els.empty.style.display='none';els.resultWrap.style.display='none';els.actions.style.display='none';
    els.loading.style.display='flex';
    els.status.classList.remove('ready');
    els.status.classList.add('generating');
    els.loadingModelName.textContent=MODEL_NAMES[key]+' · 神经矩阵运行中';
    els.status.querySelector('.status-text').textContent='神经演算中';
    Progress.show(els,state);
    return;
  }
  Progress.stop();
  const latest=sharedHistory.find(h=>h.model===key);
  if(latest){showResult(latest.url,key,'生成完成')}
  else{
    currentResultUrl=null;currentResultModel=null;
    els.resultImage.src='';els.resultBackdrop.src='';els.resultWrap.style.display='none';els.actions.style.display='none';
    els.loading.style.display='none';els.empty.style.display='flex';
    els.status.classList.remove('ready','generating');
    els.status.querySelector('.status-text').textContent='等待生成';
    Progress.reset(els);
    setStatusVisible(false);
  }
}

/* ===================== 参考图管理器初始化 ===================== */
for(const key of ['gpt','nano','mj','grok']){
  refManagers[key]=createReferenceManager({
    dropzone:null,fileInput:null,grid:null,count:null,error:els.errorMsg
  });
}

/* ===================== MJ 参数绑定 ===================== */
$$('#mjVersionGrid .opt-btn').forEach(b=>b.onclick=()=>{
  modelState.mj.version=b.dataset.version;
  $$('#mjVersionGrid .opt-btn').forEach(x=>x.classList.toggle('active',x===b));
});
$$('#mjSpeedGrid .opt-btn').forEach(b=>b.onclick=()=>{
  modelState.mj.speed=b.dataset.speed;
  $$('#mjSpeedGrid .opt-btn').forEach(x=>x.classList.toggle('active',x===b));
});
$$('#mjStyleGrid .opt-btn').forEach(b=>b.onclick=()=>{
  modelState.mj.style=b.dataset.style;
  $$('#mjStyleGrid .opt-btn').forEach(x=>x.classList.toggle('active',x===b));
});
$('#mjStylizeSlider').oninput=e=>{
  modelState.mj.stylize=+e.target.value;
  $('#mjStylizeValue').textContent=e.target.value;
};
$('#mjChaosSlider').oninput=e=>{
  modelState.mj.chaos=+e.target.value;
  $('#mjChaosValue').textContent=e.target.value;
};
$('#mjIwSlider').oninput=e=>{
  modelState.mj.iw=parseFloat(e.target.value);
  $('#mjIwValue').textContent=modelState.mj.iw.toFixed(1);
};
$('#mjNegativePrompt').oninput=e=>{modelState.mj.negativePrompt=e.target.value};
$('#mjSeed').oninput=e=>{modelState.mj.seed=e.target.value};

