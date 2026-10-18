import React, { useEffect, useRef } from "react";
import { clamp, formatTick, getStepDivisionBase, makeMinorTicks } from "../lib/axisScale.js";
import { formatReadout } from "../lib/plotOverlay.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const LABEL_REFRESH_MS = 100;

const visibleTicks = (ticks) => ticks.ticks.filter(
  (tick, index, values) => index === 0 || formatTick(tick, ticks.step) !== formatTick(values[index - 1], ticks.step)
);

const dashFor = (style) => (style === "dashed" ? [8, 4] : style === "dotted" ? [2, 4] : []);

const roundRect = (context, x, y, width, height, radius) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
};

/**
 * Draws a plot on a canvas inside its own requestAnimationFrame loop, so data
 * updates never go through React. Axis labels are SVG text nodes reused from
 * a pool (crisp at any zoom, cheap to update).
 *
 * `getFrame(now)` returns `{ frame, changed }`; the canvas is only repainted
 * when something changed.
 */
const PlotCanvas = ({ width, height, padding, getFrame, refreshMs, onPaint }) => {
  const canvasRef = useRef(null);
  const labelsRef = useRef(null);
  const labelPoolsRef = useRef({ x: [], y1: [], y2: [] });
  const labelGroupsRef = useRef({});
  const axisLabelStateRef = useRef({ xLayout: null, lastYUpdateAt: 0 });
  const getFrameRef = useRef(getFrame);
  const onPaintRef = useRef(onPaint);

  getFrameRef.current = getFrame;
  onPaintRef.current = onPaint;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const backingWidth = Math.max(1, Math.round(width * pixelRatio));
    const verticalCssPixels = Math.min(height, 420);
    // Never upscale the canvas vertically: it makes axis text blurry and also
    // quantizes plot coordinates. Keep at least 1 backing pixel per CSS pixel,
    // while retaining extra device-pixel density only within the performance cap.
    const backingHeight = Math.max(1, Math.round(height), Math.round(verticalCssPixels * pixelRatio));
    if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
      canvas.width = backingWidth;
      canvas.height = backingHeight;
    }
    const context = canvas.getContext("2d");
    const frameInterval = clamp(Number(refreshMs) || 16, 16, 1000);
    let animationFrame = 0;
    let lastDrawAt = 0;
    let forceRedraw = true;

    const strokeLine = (x1, y1, x2, y2, color, lineWidth = 1) => {
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.strokeStyle = color;
      context.lineWidth = lineWidth;
      context.setLineDash([]);
      context.globalAlpha = 1;
      context.stroke();
    };

    const fillDots = (points, size) => {
      const half = size / 2;
      for (let index = 0; index < points.length; index += 2) {
        context.fillRect(points[index] - half, points[index + 1] - half, size, size);
      }
    };

    // Cursor lines, hover crosshair and tooltip (drawn above the series).
    const paintOverlay = (overlay, theme, plotBottom) => {
      if (!overlay) {
        return;
      }
      context.save();
      context.globalAlpha = 1;
      context.font = "11px system-ui, sans-serif";
      overlay.cursors.forEach(({ px, color, label }) => {
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.setLineDash([]);
        context.beginPath();
        context.moveTo(px, padding.top);
        context.lineTo(px, plotBottom);
        context.stroke();
        context.fillStyle = color;
        roundRect(context, px - 8, padding.top - 1, 16, 15, 3);
        context.fill();
        context.fillStyle = "#ffffff";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(label, px, padding.top + 6.5);
      });

      const { hover } = overlay;
      if (hover) {
        context.strokeStyle = theme.crosshair;
        context.lineWidth = 1;
        context.setLineDash([3, 3]);
        context.beginPath();
        context.moveTo(hover.px, padding.top);
        context.lineTo(hover.px, plotBottom);
        context.stroke();
        context.setLineDash([]);
        hover.rows.forEach((row) => {
          if (!Number.isFinite(row.py)) {
            return;
          }
          context.fillStyle = row.color;
          context.beginPath();
          context.arc(hover.px, row.py, 3.5, 0, Math.PI * 2);
          context.fill();
        });

        const lines = [{ text: `X: ${formatReadout(hover.x)}`, color: null }, ...hover.rows.map((row) => ({
          text: `${row.name}: ${formatReadout(row.value)}`,
          color: row.color
        }))];
        const lineHeight = 16;
        const boxWidth = Math.max(...lines.map((line) => context.measureText(line.text).width)) + 28;
        const boxHeight = lines.length * lineHeight + 10;
        const plotRight = width - padding.right;
        let boxX = hover.px + 12;
        if (boxX + boxWidth > plotRight) {
          boxX = hover.px - 12 - boxWidth;
        }
        const boxY = padding.top + 8;
        context.fillStyle = theme.tooltipBg;
        context.strokeStyle = theme.tooltipBorder;
        roundRect(context, boxX, boxY, boxWidth, boxHeight, 6);
        context.fill();
        context.stroke();
        context.textAlign = "left";
        context.textBaseline = "middle";
        lines.forEach((line, index) => {
          const y = boxY + 5 + lineHeight * index + lineHeight / 2;
          let textX = boxX + 10;
          if (line.color) {
            context.fillStyle = line.color;
            context.fillRect(boxX + 10, y - 4, 8, 8);
            textX += 14;
          }
          context.fillStyle = theme.tooltipText;
          context.fillText(line.text, textX, y);
        });
      }
      context.restore();
    };

    const strokePoints = (points) => {
      context.beginPath();
      context.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) {
        context.lineTo(points[index], points[index + 1]);
      }
      context.stroke();
    };

    const updateLabels = (key, ticks, getPosition, textAnchor, fill) => {
      const svg = labelsRef.current;
      if (!svg) {
        return;
      }
      const labels = visibleTicks(ticks);
      const pool = labelPoolsRef.current[key];
      let group = labelGroupsRef.current[key];
      if (!group) {
        group = document.createElementNS(SVG_NS, "g");
        svg.appendChild(group);
        labelGroupsRef.current[key] = group;
      }
      labels.forEach((tick, index) => {
        let node = pool[index];
        if (!node) {
          node = document.createElementNS(SVG_NS, "text");
          node.setAttribute("font-size", "12");
          node.setAttribute("font-family", "system-ui, sans-serif");
          node.setAttribute("dominant-baseline", "middle");
          group.appendChild(node);
          pool.push(node);
        }
        const position = getPosition(tick);
        const label = formatTick(tick, ticks.step);
        if (node.__jwX !== position.x) {
          node.setAttribute("x", String(position.x));
          node.__jwX = position.x;
        }
        if (node.__jwY !== position.y) {
          node.setAttribute("y", String(position.y));
          node.__jwY = position.y;
        }
        if (node.__jwAnchor !== textAnchor) {
          node.setAttribute("text-anchor", textAnchor);
          node.__jwAnchor = textAnchor;
        }
        if (node.__jwFill !== fill) {
          node.setAttribute("fill", fill);
          node.__jwFill = fill;
        }
        if (node.__jwLabel !== label) {
          node.textContent = label;
          node.__jwLabel = label;
        }
        node.style.display = "";
      });
      for (let index = labels.length; index < pool.length; index += 1) {
        pool[index].style.display = "none";
      }
    };

    const paint = (frame, now) => {
      const { series, statSeries, xTicks, y1Ticks, y2Ticks, theme, hasAssignments, overlay, thresholdLines = [] } = frame;
      const plotRight = width - padding.right;
      const plotBottom = height - padding.bottom;
      const plotWidth = plotRight - padding.left;
      const plotHeight = plotBottom - padding.top;
      const xToPx = (value) => padding.left + ((value - xTicks.min) / (xTicks.max - xTicks.min || 1)) * plotWidth;
      const yToPx = (value, ticks) => plotBottom - ((value - ticks.min) / (ticks.max - ticks.min || 1)) * plotHeight;

      context.setTransform(backingWidth / width, 0, 0, backingHeight / height, 0, 0);
      context.clearRect(0, 0, width, height);

      makeMinorTicks(xTicks, getStepDivisionBase(xTicks.step)).forEach((tick) => {
        const x = xToPx(tick);
        strokeLine(x, padding.top, x, plotBottom, theme.gridMinor);
      });
      makeMinorTicks(y1Ticks, getStepDivisionBase(y1Ticks.step)).forEach((tick) => {
        const y = yToPx(tick, y1Ticks);
        strokeLine(padding.left, y, plotRight, y, theme.gridMinorY);
      });
      visibleTicks(xTicks).forEach((tick) => {
        const x = xToPx(tick);
        strokeLine(x, padding.top, x, plotBottom, theme.gridMajor, 1.15);
      });
      visibleTicks(y1Ticks).forEach((tick) => {
        const y = yToPx(tick, y1Ticks);
        strokeLine(padding.left, y, plotRight, y, theme.gridYMajor, 1.15);
      });
      strokeLine(padding.left, plotBottom, plotRight, plotBottom, theme.axis);
      strokeLine(padding.left, padding.top, padding.left, plotBottom, theme.axis);
      strokeLine(plotRight, padding.top, plotRight, plotBottom, theme.axis);

      // X labels follow the data smoothly via a translate between full
      // re-layouts, which are throttled to LABEL_REFRESH_MS.
      const labelState = axisLabelStateRef.current;
      const xSignature = visibleTicks(xTicks).map((tick) => formatTick(tick, xTicks.step)).join("|");
      const xSpan = xTicks.max - xTicks.min || 1;
      const previousXLayout = labelState.xLayout;
      const spanChange = previousXLayout
        ? Math.abs(xSpan - previousXLayout.span) / Math.max(Math.abs(previousXLayout.span), 1e-9)
        : Number.POSITIVE_INFINITY;
      const xGroup = () => labelGroupsRef.current.x;
      if (
        !previousXLayout
        || now - previousXLayout.updatedAt >= LABEL_REFRESH_MS
        || previousXLayout.signature !== xSignature
        || previousXLayout.fill !== theme.tick
        || spanChange > 0.02
      ) {
        updateLabels("x", xTicks, (tick) => ({ x: xToPx(tick), y: plotBottom + 28 }), "middle", theme.tick);
        xGroup()?.removeAttribute("transform");
        if (xGroup()) {
          delete xGroup().__jwTranslateX;
        }
        labelState.xLayout = { min: xTicks.min, span: xSpan, signature: xSignature, fill: theme.tick, updatedAt: now };
      } else {
        const translateX = ((previousXLayout.min - xTicks.min) / xSpan) * plotWidth;
        if (xGroup() && xGroup().__jwTranslateX !== translateX) {
          xGroup().setAttribute("transform", `translate(${translateX} 0)`);
          xGroup().__jwTranslateX = translateX;
        }
      }
      if (now - labelState.lastYUpdateAt >= LABEL_REFRESH_MS || labelState.yFill !== theme.tick) {
        updateLabels("y1", y1Ticks, (tick) => ({ x: padding.left - 14, y: yToPx(tick, y1Ticks) }), "end", theme.tick);
        updateLabels("y2", y2Ticks, (tick) => ({ x: plotRight + 14, y: yToPx(tick, y2Ticks) }), "start", theme.tick);
        labelState.lastYUpdateAt = now;
        labelState.yFill = theme.tick;
      }

      context.save();
      context.beginPath();
      context.rect(padding.left, padding.top, plotWidth, plotHeight);
      context.clip();
      statSeries.forEach(({ points, color, opacity }) => {
        context.strokeStyle = color;
        context.lineWidth = 0.75;
        context.globalAlpha = opacity;
        context.setLineDash([]);
        strokePoints(points);
      });
      series.forEach(({ points, color, thickness, style }) => {
        context.globalAlpha = 0.95;
        if (style === "points") {
          context.fillStyle = color;
          fillDots(points, thickness + 1);
          return;
        }
        context.strokeStyle = color;
        context.lineWidth = thickness;
        context.setLineDash(dashFor(style));
        strokePoints(points);
      });
      thresholdLines.forEach(({ py, value, active }) => {
        context.strokeStyle = "#dc2626";
        context.lineWidth = active ? 2 : 1.25;
        context.globalAlpha = active ? 1 : 0.8;
        context.setLineDash([6, 4]);
        context.beginPath();
        context.moveTo(padding.left, py);
        context.lineTo(plotRight, py);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = "#dc2626";
        context.font = "11px system-ui, sans-serif";
        context.textAlign = "right";
        context.textBaseline = "bottom";
        context.fillText(formatReadout(value), plotRight - 4, py - 2);
      });
      context.restore();
      paintOverlay(overlay, theme, plotBottom);

      if (!hasAssignments) {
        context.globalAlpha = 1;
        context.fillStyle = theme.placeholder;
        context.font = "12px system-ui, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText("Arrastra una variable hacia X, Y1 o Y2", padding.left + plotWidth / 2, padding.top + plotHeight / 2);
      }
    };

    const draw = (now) => {
      animationFrame = window.requestAnimationFrame(draw);
      if (now - lastDrawAt < frameInterval) {
        return;
      }
      lastDrawAt = now - ((now - lastDrawAt) % frameInterval);
      const result = getFrameRef.current?.(now);
      if (!result?.frame || (!result.changed && !forceRedraw)) {
        return;
      }
      forceRedraw = false;
      paint(result.frame, now);
      onPaintRef.current?.(now);
    };

    animationFrame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [height, padding.bottom, padding.left, padding.right, padding.top, refreshMs, width]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="plot__series-canvas"
        style={{ height: `${height}px` }}
        aria-hidden="true"
      />
      <svg
        ref={labelsRef}
        className="plot__axis-labels"
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        aria-hidden="true"
      />
    </>
  );
};

export default PlotCanvas;
