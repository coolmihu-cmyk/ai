(() => {
  const canvas = document.getElementById("homeShapeGrid");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const config = {
    speed: 0.2,
    squareSize: 35,
    borderColor: "#f6f6f6",
    hoverFillColor: "#cfcfcf",
    direction: "diagonal",
    hoverTrailAmount: 0
  };

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const offset = { x: 0, y: 0 };
  const pointer = { x: -1000, y: -1000, active: false };
  const cellOpacities = new Map();
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frameId = 0;
  let visible = !document.hidden;

  const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const currentHoveredCell = () => {
    if (!pointer.active) return null;
    const size = config.squareSize;
    const offsetX = positiveModulo(offset.x, size);
    const offsetY = positiveModulo(offset.y, size);
    return {
      x: Math.floor((pointer.x - offsetX) / size),
      y: Math.floor((pointer.y - offsetY) / size)
    };
  };

  const updateCellOpacities = () => {
    const hovered = currentHoveredCell();
    const targetKey = hovered ? `${hovered.x},${hovered.y}` : "";
    if (targetKey && !cellOpacities.has(targetKey)) cellOpacities.set(targetKey, 0);

    for (const [key, opacity] of cellOpacities) {
      const target = key === targetKey ? 1 : 0;
      const next = opacity + (target - opacity) * 0.18;
      if (next < 0.006) cellOpacities.delete(key);
      else cellOpacities.set(key, next);
    }
  };

  const drawGrid = () => {
    const size = config.squareSize;
    const offsetX = positiveModulo(offset.x, size);
    const offsetY = positiveModulo(offset.y, size);
    const columns = Math.ceil(width / size) + 3;
    const rows = Math.ceil(height / size) + 3;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = config.borderColor;

    for (let column = -2; column < columns; column += 1) {
      for (let row = -2; row < rows; row += 1) {
        const x = column * size + offsetX;
        const y = row * size + offsetY;
        const opacity = cellOpacities.get(`${column},${row}`);

        if (opacity) {
          ctx.globalAlpha = opacity;
          ctx.fillStyle = config.hoverFillColor;
          ctx.fillRect(x, y, size, size);
          ctx.globalAlpha = 1;
        }

        ctx.strokeRect(x, y, size, size);
      }
    }
  };

  const updateOffset = () => {
    if (motionQuery.matches) return;
    const movement = Math.max(config.speed, 0.1);
    if (config.direction === "diagonal") {
      offset.x = positiveModulo(offset.x - movement, config.squareSize);
      offset.y = positiveModulo(offset.y - movement, config.squareSize);
    }
  };

  const animate = () => {
    if (!visible) return;
    updateOffset();
    updateCellOpacities();
    drawGrid();
    frameId = window.requestAnimationFrame(animate);
  };

  const restart = () => {
    window.cancelAnimationFrame(frameId);
    visible = !document.hidden;
    if (visible) animate();
  };

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pointermove", event => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }, { passive: true });
  document.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
  document.addEventListener("visibilitychange", restart);
  motionQuery.addEventListener?.("change", restart);

  resize();
  animate();
})();
