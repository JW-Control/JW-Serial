import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clamp } from "../lib/axisScale.js";
import { computePlotFrame, CURSOR_COLORS, isAxisEditable, PLOT_PADDING, plotThemes } from "../lib/plotFrame.js";
import {
  anchorFromPx,
  anchorToX,
  computeHover,
  computeMeasurement,
  formatReadout,
  isInsidePlotArea,
  xToPx
} from "../lib/plotOverlay.js";
import { CHANNEL_DRAG_MIME } from "../constants.js";
import PlotCanvas from "./PlotCanvas.jsx";
import PlotContextMenu from "./PlotContextMenu.jsx";

const MIN_PLOT_HEIGHT = 300;
const MAX_PLOT_HEIGHT = 720;
const Y_DROP_WIDTH = 46;

/** Axis zone under the pointer: y1 (left), y2 (right), x (bottom) or null. */
const getPointerAxisZone = (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const relativeX = (event.clientX - rect.left) / Math.max(1, rect.width);
  const relativeY = (event.clientY - rect.top) / Math.max(1, rect.height);
  if (relativeX <= 0.08) {
    return "y1";
  }
  if (relativeX >= 0.92) {
    return "y2";
  }
  if (relativeY >= 0.84 && relativeX > 0.06 && relativeX < 0.94) {
    return "x";
  }
  return null;
};

const readDraggedChannel = (event) =>
  event.dataTransfer.getData(CHANNEL_DRAG_MIME) || event.dataTransfer.getData("text/plain");

const zoomFactorFor = (event) => {
  const units = -(event.deltaY / 100) * (event.shiftKey ? 5 : 1);
  return clamp(1 + units * 0.05, 0.05, 20);
};

const Plot = ({
  plot,
  engine,
  styles,
  channels,
  theme,
  plotMode,
  includeTimestamp,
  refreshMs,
  contextMenu,
  onChange,
  onOpenContextMenu,
  onCloseContextMenu,
  onDropPrompt,
  onAssign,
  onOpenVariableMenu,
  registerElement,
  thresholds
}) => {
  const sectionRef = useRef(null);
  const [width, setWidth] = useState(1200);
  const [hoverAxis, setHoverAxis] = useState(null);
  const dragRef = useRef(null);
  const memoryRef = useRef({});
  const frameCacheRef = useRef({ inputs: null, dataVersion: -1, frame: null });

  const layoutHeight = clamp(plot.height || 320, MIN_PLOT_HEIGHT, MAX_PLOT_HEIGHT);
  const canvasWidth = Math.max(520, width);
  const canvasHeight = Math.max(180, layoutHeight - 88);
  const colors = plotThemes[theme] || plotThemes.light;

  // Stable while nothing relevant changes, so hover/measurement re-renders do
  // not force a full frame recomputation.
  const inputs = useMemo(
    () => ({ plot, width: canvasWidth, height: canvasHeight, styles, includeTimestamp, plotMode, theme, thresholds }),
    [plot, canvasWidth, canvasHeight, styles, includeTimestamp, plotMode, theme, thresholds]
  );
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  // Hover position and cursors live in a ref: moving the mouse only bumps
  // `version`, which makes the canvas repaint without a React render.
  const overlayRef = useRef({ hoverPx: null, cursors: { a: null, b: null }, version: 0 });
  const measurementClockRef = useRef({ version: -1, at: 0 });
  const [measureMode, setMeasureMode] = useState(false);
  const [measurement, setMeasurement] = useState(null);
  const [editingTitle, setEditingTitle] = useState(null);

  const bumpOverlay = (patch) => {
    Object.assign(overlayRef.current, patch);
    overlayRef.current.version += 1;
  };

  const buildOverlay = (frame) => {
    const { hoverPx, cursors } = overlayRef.current;
    const cursorMarks = [];
    ["a", "b"].forEach((key) => {
      const x = anchorToX(frame, cursors[key]);
      if (Number.isFinite(x) && x >= frame.xTicks.min && x <= frame.xTicks.max) {
        cursorMarks.push({ px: xToPx(frame, x), color: CURSOR_COLORS[key], label: key.toUpperCase() });
      }
    });
    return {
      cursors: cursorMarks,
      hover: hoverPx !== null && frame.hasData ? computeHover(engine, frame, hoverPx) : null
    };
  };

  const getFrame = useCallback((now = performance.now()) => {
    const currentInputs = inputsRef.current;
    const cache = frameCacheRef.current;
    const overlayState = overlayRef.current;
    let frame = cache.frame;
    let changed = false;
    if (!frame || cache.inputs !== currentInputs || cache.dataVersion !== engine.dataVersion) {
      frame = computePlotFrame({ engine, ...currentInputs, memory: memoryRef.current });
      frameCacheRef.current = { inputs: currentInputs, dataVersion: engine.dataVersion, frame, overlayVersion: -1 };
      changed = true;
    }
    if (frameCacheRef.current.overlayVersion !== overlayState.version) {
      changed = true;
    }
    if (changed) {
      frame.overlay = buildOverlay(frame);
      frameCacheRef.current.overlayVersion = overlayState.version;
    }
    // Measurements scan raw samples: refresh on cursor changes, and at most
    // 4 times per second while data keeps arriving.
    const { a, b } = overlayState.cursors;
    const clock = measurementClockRef.current;
    if (a && b && (clock.version !== overlayState.version || (changed && now - clock.at > 250))) {
      measurementClockRef.current = { version: overlayState.version, at: now };
      setMeasurement(computeMeasurement(engine, frame, a, b));
    }
    return { frame, changed };
    // buildOverlay only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const autoRange = (axis) => {
    // Latest drawn frame; compute one if the plot has not painted yet.
    const frame = frameCacheRef.current.frame || getFrame().frame;
    return frame?.autoRanges?.[axis] || null;
  };

  // ------------------------------------------------------------- lifecycle

  const setSectionRef = useCallback((node) => {
    sectionRef.current = node;
    registerElement(plot.id, node);
  }, [plot.id, registerElement]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) {
      return undefined;
    }
    const updateWidth = () => {
      const rect = (node.querySelector(".plot__canvas") || node).getBoundingClientRect();
      setWidth(Math.max(360, Math.round(rect.width)));
    };
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    updateWidth();
    return () => observer.disconnect();
  }, []);

  // ---------------------------------------------------------- axis modes

  const setAxisMode = (axis, mode) => {
    const auto = mode === "manual" ? autoRange(axis) : null;
    onChange(plot.id, (current) => {
      const next = { ...current, [`${axis}Mode`]: mode };
      if (!auto) {
        return next;
      }
      return {
        ...next,
        [`${axis}ManualMin`]: Number(auto.min.toFixed(6)),
        [`${axis}ManualMax`]: Number(auto.max.toFixed(6))
      };
    });
  };

  const toggleXAxisAuto = (enabled) => {
    if (enabled) {
      onChange(plot.id, (current) => ({ ...current, xMode: "auto", xWindowOffset: 0 }));
      return;
    }
    setAxisMode("x", "manual");
  };

  // -------------------------------------------------------- interactions

  const handleWheel = (event) => {
    const axisZone = getPointerAxisZone(event);
    if (!axisZone || !isAxisEditable(plot, axisZone)) {
      return;
    }
    event.stopPropagation();
    const zoomFactor = zoomFactorFor(event);
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = clamp((event.clientX - rect.left - PLOT_PADDING.left) / Math.max(1, rect.width - 148), 0, 1);
    const relativeY = clamp((event.clientY - rect.top - PLOT_PADDING.top) / Math.max(1, rect.height - 60), 0, 1);
    const totalSeconds = Math.max(0.1, engine.getSpanSeconds());

    onChange(plot.id, (current) => {
      if (axisZone === "x") {
        if (current.xMode === "window" || current.xMode === "auto") {
          const span = current.xMode === "auto"
            ? totalSeconds
            : Math.max(0.1, Number(current.xWindowSize) || Math.min(10, totalSeconds));
          const currentOffset = current.xMode === "auto" ? 0 : Number(current.xWindowOffset) || 0;
          const nextSpan = clamp(Math.max(0.1, span * zoomFactor), 0.1, totalSeconds);
          // Keep the instant under the cursor fixed while zooming.
          const cursorOffset = currentOffset + span * (1 - relativeX);
          const nextOffset = Math.max(0, cursorOffset - nextSpan * (1 - relativeX));
          if (nextOffset === 0 && nextSpan >= totalSeconds - 1e-6) {
            return { ...current, xMode: "auto", xWindowSize: Number(totalSeconds.toFixed(3)), xWindowOffset: 0 };
          }
          return {
            ...current,
            xMode: "window",
            xWindowSize: Number(nextSpan.toFixed(3)),
            xWindowOffset: Number(nextOffset.toFixed(3))
          };
        }
        const min = Number(current.xManualMin);
        const max = Number(current.xManualMax);
        const span = Math.max(1e-6, max - min);
        const nextSpan = Math.max(1e-6, span * zoomFactor);
        const cursorValue = min + span * relativeX;
        return {
          ...current,
          xManualMin: Number((cursorValue - nextSpan * relativeX).toFixed(6)),
          xManualMax: Number((cursorValue + nextSpan * (1 - relativeX)).toFixed(6))
        };
      }
      if (current[`${axisZone}Mode`] !== "manual") {
        return current;
      }
      const minKey = `${axisZone}ManualMin`;
      const maxKey = `${axisZone}ManualMax`;
      const min = Number(current[minKey]);
      const max = Number(current[maxKey]);
      const span = Math.max(1e-6, max - min);
      const nextSpan = Math.max(1e-6, span * zoomFactor);
      const cursorValue = max - span * relativeY;
      return {
        ...current,
        [minKey]: Number((cursorValue - nextSpan * (1 - relativeY)).toFixed(6)),
        [maxKey]: Number((cursorValue + nextSpan * relativeY).toFixed(6))
      };
    });
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    const axis = getPointerAxisZone(event);
    if (!axis || !isAxisEditable(plot, axis)) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      axis,
      lastX: event.clientX,
      lastY: event.clientY,
      pixelWidth: Math.max(1, rect.width * 0.86),
      pixelHeight: Math.max(1, rect.height * 0.76)
    };
    const stop = () => {
      dragRef.current = null;
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointerup", stop);
  };

  /** Pointer position in canvas coordinates. */
  const toCanvasPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      px: ((event.clientX - rect.left) * canvasWidth) / Math.max(1, rect.width),
      py: event.clientY - rect.top
    };
  };

  const plotPointFromEvent = (event) => {
    const frame = frameCacheRef.current.frame;
    if (!frame || getPointerAxisZone(event)) {
      return null;
    }
    const point = toCanvasPoint(event);
    return isInsidePlotArea(frame, point.px, point.py) ? { frame, ...point } : null;
  };

  const handlePointerMove = (event) => {
    const axis = getPointerAxisZone(event);
    const activeAxis = axis && isAxisEditable(plot, axis) ? axis : null;
    if (activeAxis !== hoverAxis) {
      setHoverAxis(activeAxis);
    }
    const drag = dragRef.current;
    if (!drag) {
      const point = plotPointFromEvent(event);
      const hoverPx = point ? point.px : null;
      if (hoverPx !== overlayRef.current.hoverPx) {
        bumpOverlay({ hoverPx });
      }
      return;
    }
    const deltaX = event.clientX - drag.lastX;
    const deltaY = event.clientY - drag.lastY;
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return;
    }
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    onChange(plot.id, (current) => {
      if (drag.axis === "x") {
        if (current.xMode !== "manual") {
          return current;
        }
        const span = Math.max(1e-6, Number(current.xManualMax) - Number(current.xManualMin));
        const shift = -(deltaX / drag.pixelWidth) * span;
        return {
          ...current,
          xManualMin: Number((Number(current.xManualMin) + shift).toFixed(6)),
          xManualMax: Number((Number(current.xManualMax) + shift).toFixed(6))
        };
      }
      if (current[`${drag.axis}Mode`] !== "manual") {
        return current;
      }
      const minKey = `${drag.axis}ManualMin`;
      const maxKey = `${drag.axis}ManualMax`;
      const span = Math.max(1e-6, Number(current[maxKey]) - Number(current[minKey]));
      const shift = (deltaY / drag.pixelHeight) * span;
      return {
        ...current,
        [minKey]: Number((Number(current[minKey]) + shift).toFixed(6)),
        [maxKey]: Number((Number(current[maxKey]) + shift).toFixed(6))
      };
    });
  };

  const handlePlotClick = (event) => {
    if (!measureMode) {
      return;
    }
    const point = plotPointFromEvent(event);
    if (!point) {
      return;
    }
    const anchor = anchorFromPx(point.frame, point.px);
    const { a, b } = overlayRef.current.cursors;
    // First click sets A, second sets B, a third starts over from A.
    bumpOverlay({ cursors: !a || b ? { a: anchor, b: null } : { a, b: anchor } });
    if (!a || b) {
      setMeasurement(null);
    }
  };

  const handleDoubleClick = (event) => {
    if (measureMode || !plotPointFromEvent(event)) {
      return;
    }
    // Same as Better Serial Plotter: fit Y to the visible data.
    onChange(plot.id, (current) => ({ ...current, y1Mode: "auto", y2Mode: "auto" }));
  };

  const clearCursors = () => {
    bumpOverlay({ cursors: { a: null, b: null } });
    setMeasurement(null);
  };

  const toggleMeasureMode = () => {
    if (measureMode) {
      clearCursors();
    }
    setMeasureMode(!measureMode);
  };

  const toggleHidden = (channelId) =>
    onChange(plot.id, (current) => {
      const hidden = new Set(current.hiddenChannels || []);
      if (hidden.has(channelId)) {
        hidden.delete(channelId);
      } else {
        hidden.add(channelId);
      }
      return { ...current, hiddenChannels: [...hidden] };
    });

  const commitTitle = () => {
    const title = editingTitle?.trim();
    if (title) {
      onChange(plot.id, (current) => ({ ...current, title }));
    }
    setEditingTitle(null);
  };

  const copyMeasurement = () => {
    if (!measurement) {
      return;
    }
    const header = ["Señal", "A", "B", "ΔY", "Min", "Max", "Prom", "Std", "P-P", "N"].join("\t");
    const rows = measurement.rows.map((row) =>
      [row.name, row.valueA, row.valueB, row.delta, row.min, row.max, row.mean, row.std, row.peakToPeak, row.count]
        .map((value) => (typeof value === "number" ? formatReadout(value) : value))
        .join("\t"));
    const summary = `ΔX\t${formatReadout(measurement.dx)}\tΔt (s)\t${formatReadout(measurement.dt)}`;
    navigator.clipboard?.writeText([summary, header, ...rows].join("\n")).catch(() => {});
  };

  const handleDragOver = (event) => {
    const types = Array.from(event.dataTransfer.types);
    if (!types.includes(CHANNEL_DRAG_MIME) && !types.includes("text/plain")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    const axis = getPointerAxisZone(event);
    if (axis !== hoverAxis) {
      setHoverAxis(axis);
    }
  };

  const handleDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setHoverAxis(null);
    }
  };

  const handleDrop = (event) => {
    const channelId = readDraggedChannel(event);
    if (!channelId) {
      return;
    }
    event.preventDefault();
    setHoverAxis(null);
    const axis = getPointerAxisZone(event);
    if (axis) {
      onAssign(plot.id, channelId, axis);
    } else {
      onDropPrompt(plot.id, channelId);
    }
  };

  const startResize = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = plot.height || 320;
    const onMove = (moveEvent) => {
      const height = clamp(Number(startHeight + moveEvent.clientY - startY) || 320, MIN_PLOT_HEIGHT, MAX_PLOT_HEIGHT);
      onChange(plot.id, (current) => (current.height === height ? current : { ...current, height }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // --------------------------------------------------------------- render

  const legendEntries = plot.assignments.map((assignment) => {
    const style = styles.get(assignment.channelId);
    return {
      key: `${assignment.channelId}-${assignment.axis}`,
      channelId: assignment.channelId,
      hidden: (plot.hiddenChannels || []).includes(assignment.channelId),
      axis: assignment.axis.toUpperCase(),
      name: style?.name || assignment.channelId,
      color: style?.color || "#64748b"
    };
  });
  const xAutoEnabled = plot.xMode !== "manual";
  const y1AutoEnabled = plot.y1Mode === "auto";
  const y2AutoEnabled = plot.y2Mode === "auto";
  const padding = PLOT_PADDING;
  const plotAreaWidth = canvasWidth - padding.left - padding.right;
  const plotAreaHeight = canvasHeight - padding.top - padding.bottom;
  const axisBoxClass = (axis) =>
    `axis-control-box ${isAxisEditable(plot, axis) ? "axis-control-box--editable" : ""} ${hoverAxis === axis ? "axis-control-box--active" : ""}`;

  return (
    <section
      className="plot"
      ref={setSectionRef}
      style={measurement ? { minHeight: `${plot.height || 320}px` } : { height: `${plot.height || 320}px` }}
    >
      <header className="plot__header">
        {editingTitle !== null ? (
          <input
            className="plot__title-input"
            value={editingTitle}
            autoFocus
            onChange={(event) => setEditingTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitTitle();
              }
              if (event.key === "Escape") {
                setEditingTitle(null);
              }
            }}
          />
        ) : (
          <h3 onDoubleClick={() => setEditingTitle(plot.title)} title="Doble clic para renombrar">{plot.title}</h3>
        )}
        <div className="plot__header-actions">
          <button
            type="button"
            className={`plot__tool ${measureMode ? "plot__tool--active" : ""}`}
            onClick={toggleMeasureMode}
            title="Clic en el gráfico para colocar los cursores A y B"
          >
            {measureMode ? "Medición activa" : "Medir"}
          </button>
        </div>
      </header>

      <div
        className="plot__canvas"
        onContextMenu={(event) => onOpenContextMenu(event, plot.id)}
        onWheel={handleWheel}
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          setHoverAxis(null);
          if (overlayRef.current.hoverPx !== null) {
            bumpOverlay({ hoverPx: null });
          }
        }}
        onClick={handlePlotClick}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-plot-id={plot.id}
      >
        <svg width="100%" height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`} preserveAspectRatio="xMinYMin meet">
          <rect x="0" y="0" width={canvasWidth} height={canvasHeight} fill={colors.background} />
          <rect x={padding.left - Y_DROP_WIDTH - 8} y={padding.top} width={Y_DROP_WIDTH} height={plotAreaHeight} className={axisBoxClass("y1")} />
          <rect x={canvasWidth - padding.right + 8} y={padding.top} width={Y_DROP_WIDTH} height={plotAreaHeight} className={axisBoxClass("y2")} />
          <rect x={padding.left} y={canvasHeight - padding.bottom + 10} width={plotAreaWidth} height={20} className={axisBoxClass("x")} />

          <g onClick={() => setAxisMode("y1", y1AutoEnabled ? "manual" : "auto")}>
            <rect x={padding.left - Y_DROP_WIDTH - 2} y={padding.top - 16} width={10} height={10} fill={colors.checkFill} stroke={colors.checkStroke} strokeWidth="1" />
            {y1AutoEnabled ? <path d={`M ${padding.left - Y_DROP_WIDTH} ${padding.top - 11} L ${padding.left - Y_DROP_WIDTH + 2} ${padding.top - 9} L ${padding.left - Y_DROP_WIDTH + 6} ${padding.top - 14}`} stroke={colors.check} strokeWidth="1.5" fill="none" /> : null}
          </g>
          <g onClick={() => setAxisMode("y2", y2AutoEnabled ? "manual" : "auto")}>
            <rect x={canvasWidth - padding.right + 14} y={padding.top - 16} width={10} height={10} fill={colors.checkFill} stroke={colors.checkStroke} strokeWidth="1" />
            {y2AutoEnabled ? <path d={`M ${canvasWidth - padding.right + 16} ${padding.top - 11} L ${canvasWidth - padding.right + 18} ${padding.top - 9} L ${canvasWidth - padding.right + 22} ${padding.top - 14}`} stroke={colors.check} strokeWidth="1.5" fill="none" /> : null}
          </g>
          <g onClick={() => toggleXAxisAuto(!xAutoEnabled)}>
            <rect x={padding.left - 18} y={canvasHeight - padding.bottom + 15} width={10} height={10} fill={colors.checkFill} stroke={colors.checkStroke} strokeWidth="1" />
            {xAutoEnabled ? <path d={`M ${padding.left - 16} ${canvasHeight - padding.bottom + 20} L ${padding.left - 14} ${canvasHeight - padding.bottom + 22} L ${padding.left - 10} ${canvasHeight - padding.bottom + 17}`} stroke={colors.check} strokeWidth="1.5" fill="none" /> : null}
          </g>
        </svg>
        <PlotCanvas
          width={canvasWidth}
          height={canvasHeight}
          padding={padding}
          getFrame={getFrame}
          refreshMs={refreshMs}
          onPaint={engine.notePaint}
        />
        <div className="plot__legend-box">
          <strong>Señales</strong>
          {legendEntries.length === 0 ? (
            <span>Sin señales</span>
          ) : (
            legendEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`plot__legend-row ${entry.hidden ? "plot__legend-row--hidden" : ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleHidden(entry.channelId);
                }}
                onContextMenu={(event) => onOpenVariableMenu(event, entry.channelId)}
                title={entry.hidden ? "Clic para mostrar" : "Clic para ocultar"}
              >
                <span className="plot__legend-dot" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}</span>
                <span className="plot__legend-axis">{entry.axis}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {measurement ? (
        <div className="plot__measurement">
          <div className="plot__measurement-header">
            <strong>A → B</strong>
            <span>ΔX {formatReadout(measurement.dx)}</span>
            <span>Δt {formatReadout(measurement.dt)} s</span>
            <span>{measurement.count} muestras</span>
            <button type="button" onClick={copyMeasurement} title="Copiar como tabla">Copiar</button>
            <button type="button" onClick={clearCursors} title="Quitar cursores">×</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Señal</th>
                <th>A</th>
                <th>B</th>
                <th>ΔY</th>
                <th>Min</th>
                <th>Max</th>
                <th>Prom</th>
                <th>Std</th>
                <th>P-P</th>
              </tr>
            </thead>
            <tbody>
              {measurement.rows.map((row) => (
                <tr key={row.name}>
                  <td><span className="plot__legend-dot" style={{ backgroundColor: row.color }} />{row.name}</td>
                  <td>{formatReadout(row.valueA)}</td>
                  <td>{formatReadout(row.valueB)}</td>
                  <td>{formatReadout(row.delta)}</td>
                  <td>{formatReadout(row.min)}</td>
                  <td>{formatReadout(row.max)}</td>
                  <td>{formatReadout(row.mean)}</td>
                  <td>{formatReadout(row.std)}</td>
                  <td>{formatReadout(row.peakToPeak)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div
        className="plot__resize-zone"
        onPointerDown={startResize}
        role="separator"
        aria-label="Resize plot vertically"
        title="Arrastra desde el borde inferior"
      />

      {contextMenu ? (
        <PlotContextMenu
          plot={plot}
          position={contextMenu}
          engine={engine}
          channels={channels}
          styles={styles}
          onChange={onChange}
          onAssign={onAssign}
          onClose={onCloseContextMenu}
          onSetAxisMode={setAxisMode}
          onToggleXAuto={toggleXAxisAuto}
        />
      ) : null}
    </section>
  );
};

export default memo(Plot);
