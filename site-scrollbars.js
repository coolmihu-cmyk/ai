"use strict";

/* A single visual scrollbar system for every scrollable application surface. */
(() => {
  const targets = [
    { selector: ".home-page .app", inset: 20, edge: 5 },
    { selector: ".assets-ledger", inset: 8, edge: 8 },
    { selector: ".reference-ledger", inset: 8, edge: 8 },
    { selector: ".settings-shell", inset: 8, edge: 8 },
    { selector: ".mj-shell", inset: 8, edge: 8 },
    { selector: ".mj-page", inset: 12, edge: 5 }
  ];

  function addScrollbar({ selector, inset, edge }) {
    const scroller = document.querySelector(selector);
    if (!scroller) return;

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
      const viewport = scroller.clientHeight;
      const total = scroller.scrollHeight;
      const travel = Math.max(0, total - viewport);
      const homeSurface = selector === ".home-page .app";
      const top = homeSurface ? inset : Math.round(rect.top + inset);
      const height = homeSurface ? Math.max(0, window.innerHeight - inset * 2) : Math.max(0, Math.round(rect.height - inset * 2));
      const right = homeSurface ? edge : Math.max(edge, Math.round(window.innerWidth - rect.right + edge));

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
      hideTimer = window.setTimeout(() => rail.classList.remove("is-scrolling"), 420);
      requestUpdate();
    }, { passive: true });

    new ResizeObserver(requestUpdate).observe(scroller);
    new MutationObserver(requestUpdate).observe(scroller, { childList: true, subtree: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    requestUpdate();
  }

  targets.forEach(addScrollbar);
})();
