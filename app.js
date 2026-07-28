/* 初始化 */
updateCharLimit();
updatePlaceholder();
renderResPop();
renderRatioPop();
renderRefRow();

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
