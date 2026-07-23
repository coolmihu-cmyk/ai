/* ===================== 全局 ===================== */
function openCurrentImage(){if(currentResultUrl)openImage(currentResultUrl)}
els.resultImage.onclick=openCurrentImage;
els.resultImage.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){e.preventDefault();openCurrentImage()}
});

/* 初始化 */
updateCharLimit();
updatePlaceholder();
renderResPop();
renderRatioPop();
renderRefRow();
syncSidebarHistoryState();
