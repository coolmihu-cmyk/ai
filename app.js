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

  const cacheKey = "mihu_home_artist_quote";
  const cacheDuration = 6 * 60 * 60 * 1000;

  const renderQuote = ({ quote, artist }) => {
    if (!quote || !artist) return false;
    quoteText.textContent = `“${String(quote).replace(/^[“”"']+|[“”"']+$/g, "").trim()}”`;
    quoteAuthor.textContent = `— ${String(artist).trim()}`;
    quoteRoot.classList.add("is-ready");
    return true;
  };

  const readCache = () => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey) || "null");
    } catch (_) {
      return null;
    }
  };

  const parseQuote = content => {
    const cleaned = String(content || "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("名言格式不正确");
    const data = JSON.parse(cleaned.slice(start, end + 1));
    const quote = String(data.quote || "").trim().slice(0, 80);
    const artist = String(data.artist || "").trim().slice(0, 40);
    if (!quote || !artist) throw new Error("名言内容为空");
    return { quote, artist };
  };

  const loadQuote = async () => {
    const cached = readCache();
    const cacheIsFresh = cached?.createdAt && Date.now() - cached.createdAt < cacheDuration;
    if (cached && renderQuote(cached) && cacheIsFresh) return;

    const apiKey = Settings.getKey();
    if (!apiKey) return;

    try {
      const content = await Apimart.chat(apiKey, {
        model: PROMPT_ANALYSIS_MODEL,
        temperature: 0.95,
        messages: [
          {
            role: "system",
            content: "你是一名严谨的艺术史编辑。只选择有可靠出处的真实艺术家名言，不得编造作者或内容。"
          },
          {
            role: "user",
            content: `随机选择一位绘画、摄影、雕塑、建筑或设计领域的知名艺术家，给出一句适合创作首页展示的真实名言中文译文。名言控制在12至36个汉字。仅输出JSON：{"quote":"名言","artist":"艺术家姓名"}。随机参考值：${Math.random().toString(36).slice(2)}`
          }
        ]
      });
      const quote = { ...parseQuote(content), createdAt: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(quote));
      renderQuote(quote);
    } catch (error) {
      if (cached) renderQuote(cached);
      console.warn("艺术家名言加载失败", error);
    }
  };

  loadQuote();
})();
