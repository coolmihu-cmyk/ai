"use strict";
(() => {
  const scroller=document.querySelector('.home-page .app');
  const rail=$('#homeScrollbar'),thumb=$('#homeScrollbarThumb');
  if(!scroller||!rail||!thumb)return;
  let frame=0,hideTimer=0;
  function update(){
    frame=0;
    const viewport=scroller.clientHeight,total=scroller.scrollHeight,travel=Math.max(0,total-viewport);
    rail.hidden=travel<2;
    if(rail.hidden)return;
    const railHeight=rail.clientHeight,thumbHeight=Math.max(34,Math.round(railHeight*viewport/total)),offset=travel?Math.round((railHeight-thumbHeight)*scroller.scrollTop/travel):0;
    thumb.style.height=thumbHeight+'px';thumb.style.transform='translateY('+offset+'px)';
  }
  function requestUpdate(){if(!frame)frame=requestAnimationFrame(update)}
  scroller.addEventListener('scroll',()=>{rail.classList.add('is-scrolling');clearTimeout(hideTimer);hideTimer=setTimeout(()=>rail.classList.remove('is-scrolling'),420);requestUpdate()},{passive:true});
  const observer=new ResizeObserver(requestUpdate);observer.observe(scroller);document.querySelector('.home-page .main')&&observer.observe(document.querySelector('.home-page .main'));
  new MutationObserver(requestUpdate).observe(scroller,{childList:true,subtree:true});
  window.addEventListener('resize',requestUpdate,{passive:true});
  requestUpdate();
})();
