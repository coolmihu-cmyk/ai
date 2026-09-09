"use strict";

/* A single visual scrollbar system for every scrollable application surface. */
(() => {
  const targets = [
    { selector: ".home-page .app", inset: 8, edge: 8 },
    { selector: ".assets-ledger", edgeSelector: ".assets-shell", inset: 8, edge: 8 },
    { selector: ".reference-ledger", inset: 8, edge: 8 },
    { selector: ".settings-shell", inset: 8, edge: 8 }
  ];

  function addScrollbar({ selector, edgeSelector, inset, edge }) {
    const scroller = document.querySelector(selector);
    if (!scroller) return;
    const edgeSurface = edgeSelector ? document.querySelector(edgeSelector) : scroller;

    const rail = document.createElement("div");
    rail.className = "site-scrollbar";
    rail.setAttribute("aria-hidden", "true");
    rail.innerHTML = "<i></i>";
    document.body.append(rail);
    const thumb = rail.firstElementChild;
    let frame = 0;
    let hideTimer = 0;

    function update() {
      frame = 0;
      const rect = scroller.getBoundingClientRect();
      const edgeRect = edgeSurface?.getBoundingClientRect() || rect;
      const viewport = scroller.clientHeight;
      const total = scroller.scrollHeight;
      const travel = Math.max(0, total - viewport);
      const top = Math.round(rect.top + inset);
      const height = Math.max(0, Math.round(rect.height - inset * 2));
      const right = Math.max(edge, Math.round(window.innerWidth - edgeRect.right + edge));

      rail.style.top = `${top}px`;
      rail.style.right = `${right}px`;
      rail.style.height = `${height}px`;
      rail.hidden = travel < 2 || height < 34;
      if (rail.hidden) return;

      const thumbHeight = Math.max(34, Math.round(height * viewport / total));
      const offset = travel ? Math.round((height - thumbHeight) * scroller.scrollTop / travel) : 0;
      thumb.style.height = `${thumbHeight}px`;
      thumb.style.transform = `translateY(${offset}px)`;
    }

    function requestUpdate() { if (!frame) frame = requestAnimationFrame(update); }

    scroller.addEventListener("scroll", () => {
      rail.classList.add("is-scrolling");
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => rail.classList.remove("is-scrolling"), 700);
      requestUpdate();
    }, { passive: true });

    const resizeObserver = new ResizeObserver(requestUpdate);
    resizeObserver.observe(scroller);
    if (edgeSurface && edgeSurface !== scroller) resizeObserver.observe(edgeSurface);
    new MutationObserver(requestUpdate).observe(scroller, { childList: true, subtree: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    requestUpdate();
  }

  targets.forEach(addScrollbar);
})();
