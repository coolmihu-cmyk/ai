/* ===================== 结果面板切换 ===================== */
function restoreResultFor(){
  els.resultImage.title='点击在新标签页打开';
  Progress.stop();
  document.body.classList.remove('home-has-result','home-generating');
  currentResultUrl=null;currentResultModel=null;
  els.resultImage.src='';els.resultBackdrop.src='';els.resultWrap.style.display='none';els.actions.style.display='none';
  els.loading.style.display='none';els.empty.style.display='flex';
  els.status.classList.remove('ready','generating');
  els.status.querySelector('.status-text').textContent='等待生成';
  Progress.reset(els);
  setStatusVisible(false);
}

/* ===================== 参考图管理器初始化 ===================== */
/* 参考图属于当前创作任务，而不是某一个模型；切换模型时继续复用同一批图片。 */
const sharedReferenceManager=createReferenceManager({
  dropzone:null,fileInput:null,grid:null,count:null,error:els.errorMsg
});
for(const key of ['gpt','nano','grok'])refManagers[key]=sharedReferenceManager;

