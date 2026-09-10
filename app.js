/* 初始化 */
updateCharLimit();
updatePlaceholder();
renderResPop();
renderRatioPop();
renderRefRow();
applyReferenceLibraryPayload();
syncTransparentBackgroundControl();

(() => {
  const quoteRoot = document.getElementById("homeArtistQuote");
  const quoteText = document.getElementById("homeArtistQuoteText");
  const quoteAuthor = document.getElementById("homeArtistQuoteAuthor");
  if (!quoteRoot || !quoteText || !quoteAuthor) return;

  const artistQuotes = [
    { quote: "我发现，色彩和形状能表达那些语言无法表达的事物。", artist: "乔治亚·欧姬芙" },
    { quote: "我决定重新开始，放下所学，相信自己的思考。", artist: "乔治亚·欧姬芙" },
    { quote: "我们的学习方式是行动，我们的目标是想象。", artist: "约瑟夫·阿尔伯斯" },
    { quote: "艺术不是一个物件，而是一种体验。", artist: "约瑟夫·阿尔伯斯" },
    { quote: "把有效的观看转化为创造性的发现，是最令人兴奋的教育。", artist: "约瑟夫·阿尔伯斯" },
    { quote: "不要模仿你希望创造的事物。", artist: "乔治·布拉克" },
    { quote: "人们并不模仿表象；表象本身就是结果。", artist: "乔治·布拉克" },
    { quote: "艺术能够记录艺术家所处的时代、地点与文化身份。", artist: "费斯·林戈尔德" },
    { quote: "艺术是理智的保证。", artist: "路易丝·布尔乔亚" },
    { quote: "艺术不是再现可见之物，而是使事物变得可见。", artist: "保罗·克利" }
  ];

  const selected = artistQuotes[Math.floor(Math.random() * artistQuotes.length)];
  quoteText.textContent = `“${selected.quote}”`;
  quoteAuthor.textContent = `— ${selected.artist}`;
  quoteRoot.classList.add("is-ready");
})();

(() => {
  const canvas = document.querySelector(".home-page .app");
  const mascot = document.querySelector(".home-page > .home-mascot-action");
  if (!canvas || !mascot) return;

  let frame = 0;
  const syncMascotToCanvas = () => {
    frame = 0;
    mascot.style.setProperty("--home-mascot-scroll", `${-canvas.scrollTop}px`);
  };

  canvas.addEventListener("scroll", () => {
    if (!frame) frame = requestAnimationFrame(syncMascotToCanvas);
  }, { passive: true });
  syncMascotToCanvas();
})();

(() => {
  const canvas = document.querySelector(".home-page .app");
  const inspiration = document.querySelector(".home-page .home-public-library");
  const backToTop = document.getElementById("homeBackToTop");
  if (!canvas || !inspiration || !backToTop) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let snapping = false;
  let snapTimer = 0;

  const inspirationTop = () => {
    const canvasRect = canvas.getBoundingClientRect();
    const inspirationRect = inspiration.getBoundingClientRect();
    return Math.max(0, Math.round(canvas.scrollTop + inspirationRect.top - canvasRect.top - 14));
  };

  const snapTo = (top) => {
    snapping = true;
    clearTimeout(snapTimer);
    canvas.scrollTo({ top, behavior: reduceMotion.matches ? "auto" : "smooth" });
    snapTimer = window.setTimeout(() => { snapping = false; }, reduceMotion.matches ? 80 : 760);
  };

  canvas.addEventListener("wheel", (event) => {
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaY) < 2) return;
    if (snapping) {
      event.preventDefault();
      return;
    }
    const target = inspirationTop();
    if (event.deltaY > 0 && canvas.scrollTop <= 2) {
      event.preventDefault();
      snapTo(target);
      return;
    }
    if (event.deltaY < 0 && canvas.scrollTop > 2 && canvas.scrollTop <= target + 6) {
      event.preventDefault();
      snapTo(0);
    }
  }, { passive: false });

  const syncBackToTop = () => backToTop.classList.toggle("is-visible", canvas.scrollTop > 120);
  canvas.addEventListener("scroll", syncBackToTop, { passive: true });
  backToTop.addEventListener("click", () => snapTo(0));
  syncBackToTop();
})();
