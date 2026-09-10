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
    let dragging = false;
    let dragPointerId = null;
    let grabOffset = 0;

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

    function showRail() {
      rail.classList.add("is-scrolling");
      clearTimeout(hideTimer);
    }

    function moveToPointer(clientY) {
      const railRect = rail.getBoundingClientRect();
      const trackTravel = Math.max(0, rail.clientHeight - thumb.offsetHeight);
      const scrollTravel = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      if (!trackTravel || !scrollTravel) return;
      const thumbTop = Math.min(trackTravel, Math.max(0, clientY - railRect.top - grabOffset));
      scroller.scrollTop = thumbTop / trackTravel * scrollTravel;
    }

    scroller.addEventListener("scroll", () => {
      showRail();
      if (!dragging) hideTimer = window.setTimeout(() => rail.classList.remove("is-scrolling"), 700);
      requestUpdate();
    }, { passive: true });

    rail.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || rail.hidden) return;
      event.preventDefault();
      dragging = true;
      dragPointerId = event.pointerId;
      const thumbRect = thumb.getBoundingClientRect();
      grabOffset = event.target === thumb ? event.clientY - thumbRect.top : thumbRect.height / 2;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add("is-dragging");
      showRail();
      moveToPointer(event.clientY);
    });

    rail.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== dragPointerId) return;
      event.preventDefault();
      moveToPointer(event.clientY);
    });

    const finishDrag = (event) => {
      if (!dragging || event.pointerId !== dragPointerId) return;
      dragging = false;
      dragPointerId = null;
      rail.classList.remove("is-dragging");
      hideTimer = window.setTimeout(() => rail.classList.remove("is-scrolling"), 700);
    };
    rail.addEventListener("pointerup", finishDrag);
    rail.addEventListener("pointercancel", finishDrag);

    const resizeObserver = new ResizeObserver(requestUpdate);
    resizeObserver.observe(scroller);
    if (edgeSurface && edgeSurface !== scroller) resizeObserver.observe(edgeSurface);
    new MutationObserver(requestUpdate).observe(scroller, { childList: true, subtree: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    requestUpdate();
  }

  targets.forEach(addScrollbar);
})();
