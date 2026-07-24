/* ===================== 全局 ===================== */
function openCurrentImage(){if(currentResultUrl)openImage(currentResultUrl)}
els.resultImage.onclick=openCurrentImage;
els.resultImage.addEventListener('keydown',e=>{
  if(e.key==='Enter'||e.key===' '){e.preventDefault();openCurrentImage()}
});

const openResultEditor=$('#openResultEditor');
if(openResultEditor)openResultEditor.onclick=()=>{
  if(!currentResultUrl){toast('请先生成一张图片');return}
  openImageEditor({
    url:currentResultUrl,
    prompt:modelState[currentResultModel||activeModel]?.promptText||els.promptInput.value,
    model:currentResultModel||activeModel
  });
};

/* 锁定界面缩放，避免高分屏或触控板误缩放改变工作区尺寸 */
const blockPageZoom=event=>event.preventDefault();
window.addEventListener('wheel',event=>{
  if(event.ctrlKey||event.metaKey)event.preventDefault();
},{passive:false});
document.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey))return;
  if(['+','-','=','0'].includes(event.key)||['NumpadAdd','NumpadSubtract','Numpad0'].includes(event.code)){
    event.preventDefault();
  }
},{capture:true});
document.addEventListener('gesturestart',blockPageZoom,{passive:false});
document.addEventListener('gesturechange',blockPageZoom,{passive:false});
document.addEventListener('gestureend',blockPageZoom,{passive:false});

/* 初始化 */
updateCharLimit();
updatePlaceholder();
renderResPop();
renderRatioPop();
renderRefRow();
syncSidebarHistoryState();
