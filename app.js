/* ===================== 全局 ===================== */
function openCurrentImage(){if(currentResultUrl)openImage(currentResultUrl)}
els.resultImage.onclick=openCurrentImage;
els.resultImage.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){e.preventDefault();openCurrentImage()}
});

function setComposerCollapsed(collapsed){
  els.composer.classList.toggle('collapsed',collapsed);
  els.collapseComposer.setAttribute('aria-expanded',String(!collapsed));
  els.collapseComposer.setAttribute('aria-label',collapsed?'展开输入框':'收起输入框');
  els.collapseComposer.title=collapsed?'展开输入框':'收起输入框';
  if(collapsed)closeAllPops();
}
els.collapseComposer.onclick=()=>setComposerCollapsed(!els.composer.classList.contains('collapsed'));

/* 初始化 */
updateCharLimit();
updatePlaceholder();
renderResPop();
renderRatioPop();
renderRefRow();
syncSidebarHistoryState();
