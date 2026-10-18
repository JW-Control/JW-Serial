// Renders a plot element to PNG by compositing it onto a canvas: boxes,
// borders and text are drawn from computed styles, inline SVGs are drawn as
// pure SVG images and canvases are copied directly.
//
// This avoids the SVG <foreignObject> route, which taints the canvas in
// Chromium (toDataURL then throws), and does not depend on the window being
// visible, so automatic captures also work minimized.

const SVG_STYLE_PROPERTIES = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity",
  "opacity", "font-size", "font-family", "font-weight", "visibility", "display"
];

/** Resolves after a paint, or after a short timeout when rAF is paused (minimized window). */
export const waitForPaint = () =>
  new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, 100);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.clearTimeout(timeout);
      resolve();
    }));
  });

const isTransparent = (color) => !color || color === "transparent" || /rgba\([^)]*,\s*0\)$/.test(color);

const isHidden = (style) => style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0;

const roundedRectPath = (context, x, y, width, height, radius) => {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
};

const drawBox = (context, style, rect) => {
  const radius = parseFloat(style.borderTopLeftRadius) || 0;
  if (!isTransparent(style.backgroundColor)) {
    roundedRectPath(context, rect.x, rect.y, rect.width, rect.height, radius);
    context.fillStyle = style.backgroundColor;
    context.fill();
  }
  const borderWidth = parseFloat(style.borderTopWidth) || 0;
  if (borderWidth > 0 && style.borderTopStyle !== "none" && !isTransparent(style.borderTopColor)) {
    const half = borderWidth / 2;
    roundedRectPath(context, rect.x + half, rect.y + half, rect.width - borderWidth, rect.height - borderWidth, radius);
    context.lineWidth = borderWidth;
    context.strokeStyle = style.borderTopColor;
    context.setLineDash(style.borderTopStyle === "dashed" ? [4, 3] : style.borderTopStyle === "dotted" ? [1, 2] : []);
    context.stroke();
    context.setLineDash([]);
  }
};

const drawTextNode = (context, node, style, origin) => {
  const text = node.textContent.replace(/\s+/g, " ").trim();
  if (!text) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  range.detach?.();
  if (!rect.width || !rect.height) {
    return;
  }
  context.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.fillStyle = style.color;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(
    style.textTransform === "uppercase" ? text.toUpperCase() : text,
    rect.left - origin.x,
    rect.top - origin.y + rect.height / 2
  );
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

const drawSvg = async (context, svg, rect) => {
  const clone = svg.cloneNode(true);
  const sourceNodes = [svg, ...svg.querySelectorAll("*")];
  const cloneNodes = [clone, ...clone.querySelectorAll("*")];
  sourceNodes.forEach((source, index) => {
    const computed = window.getComputedStyle(source);
    const target = cloneNodes[index];
    SVG_STYLE_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value) {
        target.style.setProperty(property, value);
      }
    });
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const drawElement = async (context, element, origin) => {
  const style = window.getComputedStyle(element);
  if (isHidden(style)) {
    return;
  }
  const bounds = element.getBoundingClientRect();
  const rect = { x: bounds.left - origin.x, y: bounds.top - origin.y, width: bounds.width, height: bounds.height };
  if (element instanceof SVGSVGElement) {
    await drawSvg(context, element, rect);
    return;
  }
  if (element instanceof HTMLCanvasElement) {
    context.drawImage(element, rect.x, rect.y, rect.width, rect.height);
    return;
  }
  drawBox(context, style, rect);
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      drawTextNode(context, child, style, origin);
    } else if (child instanceof Element) {
      await drawElement(context, child, origin);
    }
  }
};

export const renderElementToPng = async (element) => {
  const bounds = element.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(bounds.width));
  const height = Math.max(1, Math.ceil(bounds.height));
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  // Opaque background so the PNG never ends up transparent.
  const pageBackground = window.getComputedStyle(document.body).backgroundColor;
  context.fillStyle = isTransparent(pageBackground) ? "#ffffff" : pageBackground;
  context.fillRect(0, 0, width, height);
  await drawElement(context, element, { x: bounds.left, y: bounds.top });
  return canvas.toDataURL("image/png");
};
