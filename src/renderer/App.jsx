import React, { useEffect, useMemo, useRef, useState } from "react";

const channelPalette = ["#ef4444", "#d97706", "#c0ca33", "#65a30d", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

const createDefaultChannels = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `val${index}`,
    name: `val${index}`,
    color: channelPalette[index % channelPalette.length],
    lineStyle: "solid",
    thickness: 2,
    value: 0
  }));

const createPlot = (index) => ({
  id: `plot-${index}`,
  title: `Plot ${index}`,
  assignments: [],
  height: 320,
  statsWindowUnit: "samples",
  statsWindowValue: 400,
  xMode: "auto",
  y1Mode: "auto",
  y2Mode: "auto",
  xManualMin: 0,
  xManualMax: 100,
  xWindowSize: 10,
  y1ManualMin: 0,
  y1ManualMax: 1,
  y2ManualMin: 0,
  y2ManualMax: 1,
  statAvgTargets: [],
  statMinTargets: [],
  statMaxTargets: []
});

const defaultPlots = [createPlot(1), createPlot(2)];

const commonBaudRates = [
  300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 31250, 38400, 57600,
  74880, 115200, 128000, 230400, 250000, 460800, 500000, 921600, 1000000,
  1500000, 2000000
];

const normalizeChannels = (count, previous) => {
  const safeCount = Math.max(1, count);
  const base = createDefaultChannels(safeCount);
  return base.map((item, index) => {
    const prev = previous[index];
    return prev ? { ...item, ...prev, id: item.id } : item;
  });
};

const channelIndex = (channelId) => Number(channelId.replace("val", ""));

const dashByStyle = {
  solid: "",
  dashed: "8 4",
  dotted: "2 4"
};

const buildPath = (points) =>
  points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

const preferredSteps = [0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500, 1000, 5000];

const pickStep = (range, targetTicks = 6) => {
  if (range <= 0 || Number.isNaN(range)) {
    return preferredSteps[0];
  }
  const target = range / targetTicks;
  const found = preferredSteps.find((step) => step >= target);
  if (found) {
    return found;
  }
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return Math.ceil(target / magnitude) * magnitude;
};

const makeTicks = (minValue, maxValue, targetTicks = 6) => {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : min + 1;
  const safeMax = max === min ? min + 1 : max;
  const step = pickStep(safeMax - min, targetTicks);
  const start = Math.floor(min / step) * step;
  const ticks = [];

  for (let tick = start; tick <= safeMax + step; tick += step) {
    if (tick >= min && tick <= safeMax) {
      ticks.push(Number(tick.toFixed(6)));
    }
  }

  if (ticks.length < 2) {
    ticks.push(Number((start + step).toFixed(6)));
  }

  return { ticks, min, max: safeMax, step };
};

const makeMinorTicks = (ticksData, divisions = 10) => {
  if (!ticksData?.ticks?.length || !Number.isFinite(ticksData.step) || divisions <= 1) {
    return [];
  }

  const minorStep = ticksData.step / divisions;
  const start = Math.floor(ticksData.min / ticksData.step) * ticksData.step;
  const end = ticksData.max;
  const values = [];

  for (let tick = start; tick <= end + minorStep * 0.5; tick += minorStep) {
    const rounded = Number(tick.toFixed(6));
    const isMajor = ticksData.ticks.some((major) => Math.abs(major - rounded) < minorStep * 0.2);
    if (!isMajor && rounded >= ticksData.min && rounded <= ticksData.max) {
      values.push(rounded);
    }
  }

  return values;
};

const makeXTicks = (minValue, maxValue, targetTicks = 8) => {
  const min = Number.isFinite(minValue) ? minValue : 0;
  const max = Number.isFinite(maxValue) ? maxValue : min + 1;
  const safeMax = max <= min ? min + 1 : max;
  const step = pickStep(safeMax - min, targetTicks);
  const start = Math.ceil(min / step) * step;
  const ticks = [];

  for (let tick = start; tick <= safeMax + step * 0.0001; tick += step) {
    if (tick >= min && tick <= safeMax) {
      ticks.push(Number(tick.toFixed(6)));
    }
  }

  if (ticks.length === 0) {
    ticks.push(Number((Math.round(min / step) * step).toFixed(6)));
  }

  return { ticks, min, max: safeMax, step };
};

const makeYAxisTicks = (minValue, maxValue, pixelHeight) => {
  const span = Math.max(1, maxValue - minValue);
  const targetTicks = clamp(Math.floor(pixelHeight / 28), 5, 16);

  if (targetTicks <= 2) {
    const step = pickStep(span, 2);
    const centered = Number((Math.round(((minValue + maxValue) * 0.5) / step) * step).toFixed(6));
    return { ticks: [centered], min: minValue, max: maxValue, step };
  }

  return makeTicks(minValue, maxValue, targetTicks);
};

const filterTicksByPixelGap = (ticks, toPx, minGap = 22) => {
  const ordered = [...ticks].sort((a, b) => toPx(a) - toPx(b));
  const kept = [];

  ordered.forEach((tick) => {
    const px = toPx(tick);
    const prev = kept[kept.length - 1];
    if (!prev || Math.abs(px - toPx(prev)) >= minGap) {
      kept.push(tick);
    }
  });

  return kept;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeAxisRange = (minValue, maxValue) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1 };
  }

  if (minValue === maxValue) {
    const pad = Math.max(Math.abs(minValue) * 0.08, 1);
    return { min: minValue - pad, max: maxValue + pad };
  }

  const span = maxValue - minValue;
  const pad = span * 0.12;
  return { min: minValue - pad, max: maxValue + pad };
};

const normalizeYAxisRange = (minValue, maxValue) => {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return { min: 0, max: 1 };
  }

  if (minValue === maxValue) {
    const pad = Math.max(Math.abs(minValue) * 0.05, 0.1);
    return { min: minValue - pad, max: maxValue + pad };
  }

  const span = maxValue - minValue;
  const pad = Math.max(span * 0.06, 0.05);
  return { min: minValue - pad, max: maxValue + pad };
};

const formatTick = (value, step) => {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Number(value.toFixed(6));
  if (step >= 1) {
    const nearestInt = Math.round(rounded);
    if (Math.abs(rounded - nearestInt) < 1e-3) {
      return nearestInt.toString();
    }
    return rounded.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (step >= 0.5) {
    return rounded.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (step >= 0.1) {
    return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  }
  return rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
};

const downsamplePointsByPixel = (points) => {
  if (points.length <= 2) {
    return points;
  }

  const buckets = new Map();
  points.forEach((point) => {
    const key = Math.floor(point.x);
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, { first: point, last: point, min: point, max: point });
      return;
    }

    current.last = point;
    if (point.y < current.min.y) {
      current.min = point;
    }
    if (point.y > current.max.y) {
      current.max = point;
    }
  });

  const reduced = [];
  [...buckets.keys()].sort((a, b) => a - b).forEach((key) => {
    const bucket = buckets.get(key);
    [bucket.first, bucket.min, bucket.max, bucket.last]
      .sort((a, b) => a.x - b.x)
      .forEach((point) => {
        const prev = reduced[reduced.length - 1];
        if (!prev || prev.x !== point.x || prev.y !== point.y) {
          reduced.push(point);
        }
      });
  });

  return reduced.length >= 2 ? reduced : points;
};

const buildSeries = (
  samples,
  xValues,
  index,
  minY,
  maxY,
  height,
  width,
  padding,
  minX,
  maxX
) => {
  if (samples.length <= 1) {
    return "";
  }

  const spreadX = maxX - minX || 1;

  const points = samples.map((sample, sampleIndex) => {
    const value = sample.values[index] ?? 0;
    const normalizedX = (xValues[sampleIndex] - minX) / spreadX;
    const normalizedY = (value - minY) / (maxY - minY || 1);
    return {
      x: padding.left + normalizedX * (width - padding.left - padding.right),
      y:
        height -
        padding.bottom -
        normalizedY * (height - padding.top - padding.bottom)
    };
  });

  const reducedPoints = downsamplePointsByPixel(points);
  return buildPath(reducedPoints);
};

export default function App() {
  const [plots, setPlots] = useState(defaultPlots);
  const [plotDrafts, setPlotDrafts] = useState({});
  const [channels, setChannels] = useState(createDefaultChannels(10));
  const [activeTab, setActiveTab] = useState("plotter");
  const [modal, setModal] = useState(null);
  const [terminator, setTerminator] = useState("none");
  const [monitorMessage, setMonitorMessage] = useState("");
  const [monitorLog, setMonitorLog] = useState([]);
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [manualPort, setManualPort] = useState("COM3");
  const [baudRate, setBaudRate] = useState(115200);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [isPaused, setIsPaused] = useState(false);
  const [configText, setConfigText] = useState("");
  const [configMessage, setConfigMessage] = useState("");
  const [dataVersion, setDataVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState(null);
  const [plotResize, setPlotResize] = useState(null);
  const [variableMenu, setVariableMenu] = useState(null);
  const [hoverAxisByPlot, setHoverAxisByPlot] = useState({});
  const [axisDrag, setAxisDrag] = useState(null);
  const menuRef = useRef(null);
  const variableMenuRef = useRef(null);
  const historyRef = useRef([]);

  const [basicConfig, setBasicConfig] = useState({
    channelCount: 0,
    samplesPerSecond: 80,
    periodMs: 12.5,
    bufferSeconds: 36000,
    refreshMs: 100,
    plotMode: "normal",
    includeTimestamp: false,
    minValidFrames: 3
  });

  const [advancedConfig, setAdvancedConfig] = useState({
    dataBits: 8,
    parity: "none",
    stopBits: 1
  });

  const visibleChannels = useMemo(() => {
    if (basicConfig.channelCount <= 0) {
      return channels;
    }
    return channels.slice(0, basicConfig.channelCount);
  }, [basicConfig.channelCount, channels]);

    const statusTone = isPaused
    ? "paused"
    : connectionStatus === "connected"
      ? "connected"
      : connectionStatus === "error"
        ? "error"
        : "disconnected";

  const buildConfigSnapshot = () => ({
    basicConfig,
    advancedConfig,
    baudRate,
    selectedPort,
    plots
  });

  const appendLog = (message) => {
    setMonitorLog((prev) => [...prev.slice(-399), message]);
  };

  const getDraft = (plotId) =>
    plotDrafts[plotId] || {
      axis: "y1",
      removeKey: ""
    };

  const setDraft = (plotId, nextDraft) => {
    setPlotDrafts((prev) => ({
      ...prev,
      [plotId]: {
        ...getDraft(plotId),
        ...nextDraft
      }
    }));
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const closeVariableMenu = () => {
    setVariableMenu(null);
  };

  const updateChannel = (channelId, patch) => {
    setChannels((prev) =>
      prev.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel))
    );
  };

  const updatePlotSettings = (plotId, patch) => {
    setPlots((prev) =>
      prev.map((plot) => (plot.id === plotId ? { ...plot, ...patch } : plot))
    );
  };


  const toggleStatTarget = (plotId, statKey, target) => {
    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }

        const current = Array.isArray(plot[statKey]) ? plot[statKey] : [];
        const exists = current.includes(target);
        return {
          ...plot,
          [statKey]: exists ? current.filter((item) => item !== target) : [...current, target]
        };
      })
    );
  };


  const getWheelUnits = (event) => {
    const base = event.shiftKey ? 10 : 1;
    const direction = event.deltaY < 0 ? 1 : -1;
    return direction * base;
  };

  const getPointerAxisZone = (event) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / Math.max(1, rect.width);
    const relativeY = (event.clientY - rect.top) / Math.max(1, rect.height);

    if (relativeX <= 0.08) {
      return "y1";
    }
    if (relativeX >= 0.92) {
      return "y2";
    }
    if (relativeY >= 0.9 && relativeX > 0.08 && relativeX < 0.92) {
      return "x";
    }
    return null;
  };

  const isAxisEditable = (plot, axis) => {
    if (axis === "x") {
      return plot.xMode === "manual" || plot.xMode === "window";
    }
    return plot[`${axis}Mode`] === "manual";
  };

  const getSamplesForPlot = (plot) => {
    const allSamples = historyRef.current;
    const sampleWindowSize = Math.max(2, Math.round((Number(plot.xWindowSize || 10) || 10) * basicConfig.samplesPerSecond));
    return plot.xMode === "window" ? allSamples.slice(-sampleWindowSize) : allSamples;
  };

  const computeAxisAutoRange = (plot, axis) => {
    const samples = getSamplesForPlot(plot);
    if (samples.length < 2) {
      return null;
    }

    if (axis === "x") {
      const xAssignment = plot.assignments.find((item) => item.axis === "x");
      const xValues = samples.map((sample, index) => {
        if (xAssignment) {
          return sample.values[channelIndex(xAssignment.channelId)] ?? index;
        }
        if (basicConfig.includeTimestamp && sample.xValue !== null) {
          return sample.xValue;
        }
        return index;
      });

      return { min: Math.min(...xValues), max: Math.max(...xValues) };
    }

    const axisAssignments = plot.assignments.filter((item) => item.axis === axis);
    if (!axisAssignments.length) {
      return null;
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    axisAssignments.forEach((assignment) => {
      const idx = channelIndex(assignment.channelId);
      samples.forEach((sample) => {
        const value = sample.values[idx];
        if (value === undefined) {
          return;
        }
        min = Math.min(min, value);
        max = Math.max(max, value);
      });
    });

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return null;
    }
    return normalizeYAxisRange(min, max);
  };

  const handleModeChange = (plotId, axis, mode) => {
    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }

        const key = `${axis}Mode`;
        const next = { ...plot, [key]: mode };
        if (mode !== "manual") {
          return next;
        }

        const auto = computeAxisAutoRange(plot, axis);
        if (!auto) {
          return next;
        }

        if (axis === "x") {
          return {
            ...next,
            xManualMin: Number(auto.min.toFixed(6)),
            xManualMax: Number(auto.max.toFixed(6))
          };
        }

        return {
          ...next,
          [`${axis}ManualMin`]: Number(auto.min.toFixed(6)),
          [`${axis}ManualMax`]: Number(auto.max.toFixed(6))
        };
      })
    );
  };

  const handlePlotCanvasPointerMove = (event, plotId) => {
    const axis = getPointerAxisZone(event);
    const plot = plots.find((item) => item.id === plotId);
    const activeAxis = plot && axis && isAxisEditable(plot, axis) ? axis : null;

    setHoverAxisByPlot((prev) => {
      if ((prev[plotId] || null) === activeAxis) {
        return prev;
      }
      return { ...prev, [plotId]: activeAxis };
    });

    if (!axisDrag || axisDrag.plotId !== plotId || !plot) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const pixelHeight = Math.max(1, rect.height * 0.76);
    const deltaY = event.clientY - axisDrag.lastClientY;
    if (Math.abs(deltaY) < 0.5) {
      return;
    }

    setAxisDrag((prev) => (prev ? { ...prev, lastClientY: event.clientY } : prev));

    setPlots((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== plotId || !["y1", "y2"].includes(axisDrag.axis) || candidate[`${axisDrag.axis}Mode`] !== "manual") {
          return candidate;
        }

        const minKey = `${axisDrag.axis}ManualMin`;
        const maxKey = `${axisDrag.axis}ManualMax`;
        const span = Math.max(1e-6, Number(candidate[maxKey]) - Number(candidate[minKey]));
        const valueShift = (deltaY / pixelHeight) * span;
        return {
          ...candidate,
          [minKey]: Number((Number(candidate[minKey]) + valueShift).toFixed(6)),
          [maxKey]: Number((Number(candidate[maxKey]) + valueShift).toFixed(6))
        };
      })
    );
  };

  const handlePlotCanvasPointerDown = (event, plotId) => {
    if (event.button !== 0) {
      return;
    }
    const axis = getPointerAxisZone(event);
    if (!axis || axis === "x") {
      return;
    }

    const plot = plots.find((item) => item.id === plotId);
    if (!plot || !isAxisEditable(plot, axis)) {
      return;
    }

    event.preventDefault();
    setAxisDrag({ plotId, axis, lastClientY: event.clientY });
  };

  const handlePlotCanvasPointerLeave = (plotId) => {
    setHoverAxisByPlot((prev) => {
      if (!prev[plotId]) {
        return prev;
      }
      return { ...prev, [plotId]: null };
    });
  };

  const handlePlotAxisWheel = (event, plotId) => {
    const axisZone = getPointerAxisZone(event);
    const plot = plots.find((item) => item.id === plotId);
    if (!plot || !axisZone || !isAxisEditable(plot, axisZone)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const units = getWheelUnits(event);

    setPlots((prev) =>
      prev.map((candidate) => {
        if (candidate.id !== plotId) {
          return candidate;
        }

        if (axisZone === "x") {
          if (candidate.xMode === "window") {
            return {
              ...candidate,
              xWindowSize: clamp((Number(candidate.xWindowSize) || 10) + units, 1, 36000)
            };
          }
          if (candidate.xMode === "manual") {
            const min = Number(candidate.xManualMin);
            const max = Number(candidate.xManualMax);
            const center = (min + max) / 2;
            const span = Math.max(1e-6, max - min);
            const nextSpan = Math.max(1e-6, span - units * Math.max(span * 0.08, 0.5));
            return {
              ...candidate,
              xManualMin: Number((center - nextSpan / 2).toFixed(6)),
              xManualMax: Number((center + nextSpan / 2).toFixed(6))
            };
          }
          return candidate;
        }

        if (candidate[`${axisZone}Mode`] !== "manual") {
          return candidate;
        }

        const minKey = `${axisZone}ManualMin`;
        const maxKey = `${axisZone}ManualMax`;
        const min = Number(candidate[minKey]);
        const max = Number(candidate[maxKey]);
        const center = (min + max) / 2;
        const span = Math.max(1e-6, max - min);
        const nextSpan = Math.max(1e-6, span - units * Math.max(span * 0.08, 0.02));

        return {
          ...candidate,
          [minKey]: Number((center - nextSpan / 2).toFixed(6)),
          [maxKey]: Number((center + nextSpan / 2).toFixed(6))
        };
      })
    );
  };

  const handlePlotterWheelCapture = (event) => {
    event.preventDefault();
  };

  const openVariableMenu = (event, channelId) => {
    event.preventDefault();
    const menuWidth = 250;
    const menuHeight = 236;
    const x = clamp(event.clientX, 8, window.innerWidth - menuWidth - 8);
    const y = clamp(event.clientY, 8, window.innerHeight - menuHeight - 8);
    setVariableMenu({ channelId, x, y });
    setContextMenu(null);
  };


  const openContextMenu = (event, plotId) => {
    event.preventDefault();
    const menuWidth = 300;
    const menuHeight = 340;
    const x = clamp(event.clientX, 8, window.innerWidth - menuWidth - 8);
    const y = event.clientY + menuHeight > window.innerHeight - 8
      ? Math.max(8, event.clientY - menuHeight)
      : clamp(event.clientY, 8, window.innerHeight - menuHeight - 8);
    setContextMenu({
      plotId,
      x,
      y
    });
    setVariableMenu(null);
  };

  const addPlot = () => {
    setPlots((prev) => [...prev, createPlot(prev.length + 1)]);
  };

  const removePlot = () => {
    setPlots((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const updatePlotHeight = (plotId, nextHeight) => {
    const height = clamp(Number(nextHeight) || 320, 300, 720);
    setPlots((prev) =>
      prev.map((plot) => (plot.id === plotId ? { ...plot, height } : plot))
    );
  };

  const startResize = (event, plotId, currentHeight) => {
    event.preventDefault();
    event.stopPropagation();
    setPlotResize({
      plotId,
      startY: event.clientY,
      startHeight: currentHeight || 320
    });
  };

  const addAssignment = (plotId, channelId) => {
    const draft = getDraft(plotId);
    if (!channelId) {
      return;
    }
    const key = `${channelId}:${draft.axis}`;

    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }
        if (plot.assignments.some((item) => `${item.channelId}:${item.axis}` === key)) {
          return plot;
        }
        return {
          ...plot,
          assignments: [...plot.assignments, { channelId, axis: draft.axis }]
        };
      })
    );
  };

  const removeAssignment = (plotId) => {
    const draft = getDraft(plotId);
    if (!draft.removeKey) {
      return;
    }

    setPlots((prev) =>
      prev.map((plot) => {
        if (plot.id !== plotId) {
          return plot;
        }
        return {
          ...plot,
          assignments: plot.assignments.filter(
            (item) => `${item.channelId}:${item.axis}` !== draft.removeKey
          )
        };
      })
    );
    closeContextMenu();
  };

  const clearAssignments = (plotId) => {
    setPlots((prev) =>
      prev.map((plot) => (plot.id === plotId ? { ...plot, assignments: [] } : plot))
    );
    closeContextMenu();
  };

  const closeModal = () => setModal(null);

  const handleSend = async () => {
    if (!monitorMessage.trim()) {
      return;
    }

    const suffix =
      terminator === "nl"
        ? "\n"
        : terminator === "cr"
          ? "\r"
          : terminator === "nlcr"
            ? "\n\r"
            : "";

    const payload = `${monitorMessage}${suffix}`;
    const response = await window.jwSerial?.sendMessage?.(payload);
    if (response?.ok) {
      appendLog(`TX > ${monitorMessage}`);
      setMonitorMessage("");
    }
  };

  const updateBasicConfig = (key, value) => {
    setBasicConfig((prev) => ({ ...prev, [key]: value }));
  };

  const updateAdvancedConfig = (key, value) => {
    setAdvancedConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSamplesChange = (value) => {
    const samplesPerSecond = Number(value);
    if (!samplesPerSecond || samplesPerSecond <= 0) {
      return;
    }
    updateBasicConfig("samplesPerSecond", samplesPerSecond);
    updateBasicConfig("periodMs", Number((1000 / samplesPerSecond).toFixed(2)));
  };

  const handlePeriodChange = (value) => {
    const periodMs = Number(value);
    if (!periodMs || periodMs <= 0) {
      return;
    }
    updateBasicConfig("periodMs", periodMs);
    updateBasicConfig("samplesPerSecond", Number((1000 / periodMs).toFixed(2)));
  };

  const refreshPorts = async () => {
    try {
      const nextPorts = await window.jwSerial.listPorts();
      setPorts(nextPorts);
      if (!selectedPort && nextPorts.length > 0) {
        setSelectedPort(nextPorts[0].path);
      }
      if (nextPorts.length === 0) {
        appendLog("SYS > No se detectaron puertos. Puedes ingresar uno manualmente (ej: COM7).");
      } else {
        appendLog(`SYS > ${nextPorts.length} puerto(s) detectado(s).`);
      }
    } catch (_error) {
      setPorts([]);
      appendLog("SYS > Error al listar puertos seriales.");
    }
  };

  const handleConnect = async () => {
    const targetPort = selectedPort || manualPort.trim();
    if (!targetPort) {
      appendLog("SYS > Selecciona o ingresa un puerto antes de conectar.");
      return;
    }

    try {
      setConnectionStatus("connecting");
      await window.jwSerial.openPort({
        path: targetPort,
        baudRate,
        dataBits: advancedConfig.dataBits,
        parity: advancedConfig.parity,
        stopBits: advancedConfig.stopBits,
        expectedChannels: basicConfig.channelCount,
        minValidFrames: basicConfig.minValidFrames,
        includeTimestamp: basicConfig.includeTimestamp
      });
      setConnectionStatus("connected");
    } catch (_error) {
      setConnectionStatus("error");
    }
  };

  const handleDisconnect = async () => {
    await window.jwSerial.closePort();
    setConnectionStatus("disconnected");
  };

  const clearBuffer = () => {
    historyRef.current = [];
    setDataVersion((prev) => prev + 1);
    setMonitorLog([]);
    setChannels((prev) => prev.map((channel) => ({ ...channel, value: 0 })));
  };

  const exportCsv = () => {
    if (historyRef.current.length === 0) {
      return;
    }

    const header = ["timestamp", "xValue", ...channels.map((channel) => channel.name)];
    const rows = historyRef.current.map((item) => [item.timestamp, item.xValue, ...item.values]);
    const csv = [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jw-serial-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveConfig = () => {
    const payload = JSON.stringify(buildConfigSnapshot(), null, 2);
    setConfigText(payload);
    localStorage.setItem("jwSerialConfig", payload);
    setConfigMessage("Configuración guardada localmente.");
  };

  const handleLoadConfig = () => {
    const saved = localStorage.getItem("jwSerialConfig");
    if (!saved) {
      setConfigMessage("No hay configuración guardada.");
      return;
    }
    setConfigText(saved);
    setConfigMessage("Configuración cargada desde almacenamiento local.");
  };

  const applyConfigText = () => {
    try {
      const parsed = JSON.parse(configText);
      if (parsed.basicConfig) {
        setBasicConfig(parsed.basicConfig);
      }
      if (parsed.advancedConfig) {
        setAdvancedConfig(parsed.advancedConfig);
      }
      if (parsed.baudRate) {
        setBaudRate(parsed.baudRate);
      }
      if (parsed.selectedPort) {
        setSelectedPort(parsed.selectedPort);
      }
      if (parsed.plots) {
        setPlots(parsed.plots);
      }
      setConfigMessage("Configuración aplicada.");
    } catch (_error) {
      setConfigMessage("JSON inválido. Revisa el formato.");
    }
  };

  useEffect(() => {
    refreshPorts();
  }, []);

  useEffect(() => {
    if (
      !window.jwSerial?.onFrame ||
      !window.jwSerial?.onRawLine ||
      !window.jwSerial?.onStatus
    ) {
      appendLog("SYS > API serial no disponible en renderer (preload).");
      return undefined;
    }

    const unsubscribeFrame = window.jwSerial.onFrame((frame) => {
      if (isPaused) {
        return;
      }

      const incomingValues = frame.values;
      const xValue = frame.includeTimestamp ? frame.values[0] : null;
      const channelCount =
        basicConfig.channelCount > 0 ? basicConfig.channelCount : incomingValues.length;

      setChannels((prev) => {
        const normalized = normalizeChannels(channelCount, prev);
        return normalized.map((channel, index) => ({
          ...channel,
          value: Number((incomingValues[index] ?? channel.value ?? 0).toFixed(2))
        }));
      });

      const maxSamples = Math.max(
        1,
        Math.floor(basicConfig.bufferSeconds * basicConfig.samplesPerSecond)
      );
      historyRef.current.push({
        timestamp: frame.timestamp,
        xValue,
        values: incomingValues.slice(0, channelCount)
      });
      if (historyRef.current.length > maxSamples) {
        historyRef.current = historyRef.current.slice(-maxSamples);
      }
      setDataVersion((prev) => prev + 1);
    });

    const unsubscribeRaw = window.jwSerial.onRawLine((line) => {
      if (!line?.trim()) {
        return;
      }
      appendLog(`RX > ${line}`);
    });

    const unsubscribeStatus = window.jwSerial.onStatus((status) => {
      if (status.type === "error") {
        setConnectionStatus("error");
      }
      if (status.type === "closed") {
        setConnectionStatus("disconnected");
      }
      if (status.type === "open") {
        setConnectionStatus("connected");
      }
      appendLog(`SYS > ${status.message}`);
    });

    return () => {
      unsubscribeFrame?.();
      unsubscribeRaw?.();
      unsubscribeStatus?.();
    };
  }, [basicConfig, isPaused]);

  useEffect(() => {
    if (basicConfig.channelCount > 0) {
      setChannels((prev) => normalizeChannels(basicConfig.channelCount, prev));
    }
  }, [basicConfig.channelCount]);

  useEffect(() => {
    if (modal === "save" || modal === "load") {
      setConfigText(JSON.stringify(buildConfigSnapshot(), null, 2));
      setConfigMessage("");
    }
  }, [modal]);

  useEffect(() => {
    if (!contextMenu && !variableMenu) {
      return undefined;
    }

    const close = (event) => {
      if (menuRef.current?.contains(event.target) || variableMenuRef.current?.contains(event.target)) {
        return;
      }
      setContextMenu(null);
      setVariableMenu(null);
    };

    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu, variableMenu]);


  useEffect(() => {
    if (!axisDrag) {
      return undefined;
    }

    const stopDrag = () => setAxisDrag(null);
    window.addEventListener("pointerup", stopDrag);
    return () => window.removeEventListener("pointerup", stopDrag);
  }, [axisDrag]);

  useEffect(() => {
    if (!plotResize) {
      return undefined;
    }

    const onMove = (event) => {
      const delta = event.clientY - plotResize.startY;
      updatePlotHeight(plotResize.plotId, plotResize.startHeight + delta);
    };

    const onUp = () => setPlotResize(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [plotResize]);

  const renderPlot = (plot) => {
    const allSamples = historyRef.current;
    const sampleWindowSize = Math.max(2, Math.round((Number(plot.xWindowSize || 10) || 10) * basicConfig.samplesPerSecond));
    const samples = plot.xMode === "window" ? allSamples.slice(-sampleWindowSize) : allSamples;
    const layoutHeight = clamp(plot.height || 320, 300, 720);
    const width = 1200;
    const height = Math.max(180, layoutHeight - 88);
    const padding = { top: 14, right: 60, bottom: 34, left: 60 };
    const xTargetTicks = clamp(Math.floor((width - padding.left - padding.right) / 60), 6, 40);

    if (samples.length < 2 || plot.assignments.length === 0) {
      return <span>Esperando datos y canales asignados...</span>;
    }

    const xAssignment = plot.assignments.find((item) => item.axis === "x");
    const xValues = samples.map((sample, index) => {
      if (xAssignment) {
        return sample.values[channelIndex(xAssignment.channelId)] ?? index;
      }
      if (basicConfig.includeTimestamp && sample.xValue !== null) {
        return sample.xValue;
      }
      return index;
    });

    const yAssignments = plot.assignments.filter((item) => item.axis !== "x");
    if (yAssignments.length === 0) {
      return <span>Asigna al menos un canal al eje Y.</span>;
    }

    const axisStats = {
      y1: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
      y2: { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
    };

    yAssignments.forEach((assignment) => {
      const idx = channelIndex(assignment.channelId);
      samples.forEach((sample) => {
        const value = sample.values[idx];
        if (value === undefined) {
          return;
        }
        axisStats[assignment.axis].min = Math.min(axisStats[assignment.axis].min, value);
        axisStats[assignment.axis].max = Math.max(axisStats[assignment.axis].max, value);
      });
    });

    const y1AutoRange = normalizeYAxisRange(axisStats.y1.min, axisStats.y1.max);
    const y2AutoRange = Number.isFinite(axisStats.y2.min)
      ? normalizeYAxisRange(axisStats.y2.min, axisStats.y2.max)
      : y1AutoRange;

    const y1Range = plot.y1Mode === "manual"
      ? {
          min: Number(plot.y1ManualMin ?? y1AutoRange.min),
          max: Number(plot.y1ManualMax ?? y1AutoRange.max)
        }
      : y1AutoRange;

    const y2Range = plot.y2Mode === "manual"
      ? {
          min: Number(plot.y2ManualMin ?? y2AutoRange.min),
          max: Number(plot.y2ManualMax ?? y2AutoRange.max)
        }
      : y2AutoRange;

    const y1TicksData = makeYAxisTicks(y1Range.min, y1Range.max, height - padding.top - padding.bottom);
    const y2TicksData = makeYAxisTicks(y2Range.min, y2Range.max, height - padding.top - padding.bottom);

    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const rightPad = (xMax - xMin || 1) * 0.05;
    const xTicksData = plot.xMode === "manual"
      ? makeXTicks(Number(plot.xManualMin ?? xMin), Number(plot.xManualMax ?? xMax), xTargetTicks)
      : makeXTicks(xMin, xMax + rightPad, xTargetTicks);

    const xMinorTicks = makeMinorTicks(xTicksData, 10);
    const y1MinorTicks = makeMinorTicks(y1TicksData, 10);
    const y2MinorTicks = makeMinorTicks(y2TicksData, 10);

    const yTickToPx = (value, ticksData) => {
      const ratio = (value - ticksData.min) / (ticksData.max - ticksData.min || 1);
      return (
        height -
        padding.bottom -
        ratio * (height - padding.top - padding.bottom)
      );
    };

    const xTickToPx = (value) => {
      const ratio = (value - xTicksData.min) / (xTicksData.max - xTicksData.min || 1);
      return padding.left + ratio * (width - padding.left - padding.right);
    };

    const y1VisibleTicks = filterTicksByPixelGap(y1TicksData.ticks, (tick) => yTickToPx(tick, y1TicksData), 10)
      .filter((tick, index, arr) => index === 0 || formatTick(tick, y1TicksData.step) !== formatTick(arr[index - 1], y1TicksData.step));
    const y2VisibleTicks = filterTicksByPixelGap(y2TicksData.ticks, (tick) => yTickToPx(tick, y2TicksData), 10)
      .filter((tick, index, arr) => index === 0 || formatTick(tick, y2TicksData.step) !== formatTick(arr[index - 1], y2TicksData.step));
    const xVisibleTicks = filterTicksByPixelGap(xTicksData.ticks, xTickToPx, 64)
      .filter((tick, index, arr) => index === 0 || formatTick(tick, xTicksData.step) !== formatTick(arr[index - 1], xTicksData.step));

    const getStatWindow = () => {
      const rawValue = Math.max(2, Number(plot.statsWindowValue || 400));
      if (plot.statsWindowUnit === "seconds") {
        return Math.max(2, Math.round(rawValue * basicConfig.samplesPerSecond));
      }
      return rawValue;
    };

    const statWindowSamples = getStatWindow();
    const statTargetGroups = {
      avg: Array.isArray(plot.statAvgTargets) ? plot.statAvgTargets : [],
      min: Array.isArray(plot.statMinTargets) ? plot.statMinTargets : [],
      max: Array.isArray(plot.statMaxTargets) ? plot.statMaxTargets : []
    };

    const lines = yAssignments
      .map((assignment) => {
        const idx = channelIndex(assignment.channelId);
        const stats = assignment.axis === "y2" ? y2TicksData : y1TicksData;
        if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max)) {
          return null;
        }

        const path = buildSeries(
          samples,
          xValues,
          idx,
          stats.min,
          stats.max,
          height,
          width,
          padding,
          xTicksData.min,
          xTicksData.max
        );
        if (!path) {
          return null;
        }

        const channel = channels[idx];
        const style = channel?.lineStyle || "solid";
        const thickness = Number(channel?.thickness || 2);
        return (
          <path
            key={`${assignment.channelId}-${assignment.axis}`}
            d={path}
            fill="none"
            stroke={channel?.color || "#2563eb"}
            strokeWidth={Math.max(1, thickness)}
            strokeDasharray={dashByStyle[style] || ""}
            opacity="0.95"
          />
        );
      })
      .filter(Boolean);

    const computeRollingStatSeries = (values, mode) => {
      if (mode === "avg") {
        let sum = 0;
        let count = 0;
        return values.map((value, index) => {
          if (value !== undefined) {
            sum += value;
            count += 1;
          }
          const outIndex = index - statWindowSamples;
          if (outIndex >= 0) {
            const outValue = values[outIndex];
            if (outValue !== undefined) {
              sum -= outValue;
              count -= 1;
            }
          }
          return count > 0 ? sum / count : undefined;
        });
      }

      const deque = [];
      return values.map((value, index) => {
        if (value !== undefined) {
          while (deque.length) {
            const tailValue = values[deque[deque.length - 1]];
            if (tailValue === undefined) {
              deque.pop();
              continue;
            }
            if ((mode === "min" && tailValue >= value) || (mode === "max" && tailValue <= value)) {
              deque.pop();
            } else {
              break;
            }
          }
          deque.push(index);
        }

        const windowStart = index - statWindowSamples + 1;
        while (deque.length && deque[0] < windowStart) {
          deque.shift();
        }

        return deque.length ? values[deque[0]] : undefined;
      });
    };

    const statCurves = yAssignments
      .map((assignment) => {
        const assignmentKey = `${assignment.channelId}:${assignment.axis}`;
        const idx = channelIndex(assignment.channelId);
        const channel = channels[idx];
        const stats = assignment.axis === "y2" ? y2TicksData : y1TicksData;
        const curves = [];

        const buildStatPath = (mode, opacity, dasharray = "") => {
          const targets = statTargetGroups[mode] || [];
          if (!targets.includes(assignmentKey)) {
            return;
          }

          const sourceValues = samples.map((sample) => sample.values[idx]);
          const statValues = computeRollingStatSeries(sourceValues, mode);
          const points = downsamplePointsByPixel(statValues
            .map((value, sampleIndex) => {
              if (value === undefined) {
                return null;
              }
              const normalizedX = (xValues[sampleIndex] - xTicksData.min) / (xTicksData.max - xTicksData.min || 1);
              const normalizedY = (value - stats.min) / (stats.max - stats.min || 1);
              return {
                x: padding.left + normalizedX * (width - padding.left - padding.right),
                y: height - padding.bottom - normalizedY * (height - padding.top - padding.bottom)
              };
            })
            .filter(Boolean));

          if (points.length < 2) {
            return;
          }

          curves.push(
            <path
              key={`${assignment.channelId}-${assignment.axis}-${mode}`}
              d={buildPath(points)}
              fill="none"
              stroke={channel?.color || "#2563eb"}
              strokeWidth="0.5"
              strokeOpacity={opacity}
              strokeDasharray={dasharray}
            />
          );
        };

        buildStatPath("avg", 0.85);
        buildStatPath("min", 0.65);
        buildStatPath("max", 0.65);

        return curves;
      })
      .flat();

    const isAxisActive = (axis) => hoverAxisByPlot[plot.id] === axis && isAxisEditable(plot, axis);

    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
        <line
          x1={padding.left}
          y1={height - padding.bottom}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#94a3b8"
          strokeWidth="1"
        />
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={height - padding.bottom}
          stroke="#94a3b8"
          strokeWidth="1"
        />
        <line
          x1={width - padding.right}
          y1={padding.top}
          x2={width - padding.right}
          y2={height - padding.bottom}
          stroke="#94a3b8"
          strokeWidth="1"
        />

        <rect
          x={padding.left - 44}
          y={padding.top + 6}
          width={34}
          height={height - padding.top - padding.bottom - 12}
          className={`axis-control-box ${isAxisEditable(plot, "y1") ? "axis-control-box--editable" : ""} ${isAxisActive("y1") ? "axis-control-box--active" : ""}`}
          
        />
        <rect
          x={width - padding.right + 10}
          y={padding.top + 6}
          width={34}
          height={height - padding.top - padding.bottom - 12}
          className={`axis-control-box ${isAxisEditable(plot, "y2") ? "axis-control-box--editable" : ""} ${isAxisActive("y2") ? "axis-control-box--active" : ""}`}
          
        />
        <rect
          x={padding.left + 4}
          y={height - 18}
          width={width - padding.left - padding.right - 8}
          height={16}
          className={`axis-control-box ${isAxisEditable(plot, "x") ? "axis-control-box--editable" : ""} ${isAxisActive("x") ? "axis-control-box--active" : ""}`}
          
        />

        {xMinorTicks.map((tick) => {
          const x = xTickToPx(tick);
          return (
            <line
              key={`x-minor-${tick}`}
              x1={x}
              y1={padding.top}
              x2={x}
              y2={height - padding.bottom}
              stroke="#e9eef8"
              strokeWidth="1"
            />
          );
        })}

        {y1MinorTicks.map((tick) => {
          const y = yTickToPx(tick, y1TicksData);
          return (
            <line
              key={`y1-minor-${tick}`}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#f3f6fd"
              strokeWidth="1"
            />
          );
        })}

        {y2MinorTicks.map((tick) => {
          const y = yTickToPx(tick, y2TicksData);
          return (
            <line
              key={`y2-minor-${tick}`}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#f3f6fd"
              strokeWidth="1"
            />
          );
        })}

        {xVisibleTicks.map((tick) => {
          const x = xTickToPx(tick);
          return (
            <g key={`x-${tick}`}>
              <line
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke="#b6c6db"
                strokeWidth="1.15"
              />
              <text
                x={x}
                y={height - 6}
                textAnchor="middle"
                fontSize="12px"
                fill="#64748b"
              >
                {formatTick(tick, xTicksData.step)}
              </text>
            </g>
          );
        })}

        {y1VisibleTicks.map((tick) => {
          const y = yTickToPx(tick, y1TicksData);
          return (
            <g key={`y1-${tick}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#bfdbfe"
                strokeWidth="1.15"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="12px"
                fill="#64748b"
              >
                {formatTick(tick, y1TicksData.step)}
              </text>
            </g>
          );
        })}

        {y2VisibleTicks.map((tick) => {
          const y = yTickToPx(tick, y2TicksData);
          return (
            <text
              key={`y2-${tick}`}
              x={width - 8}
              y={y + 3}
              textAnchor="end"
              fontSize="12px"
              fill="#64748b"
            >
              {formatTick(tick, y2TicksData.step)}
            </text>
          );
        })}
        {lines}
        {statCurves}
      </svg>
    );
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>JW-Serial</h1>
          <div className="sidebar__status">
            <span className={`status-dot status-dot--${statusTone}`} />
            <span>
              {isPaused
                ? "Pausado"
                : connectionStatus === "connected"
                  ? "Capturando"
                  : connectionStatus === "error"
                    ? "Error"
                    : "Desconectado"}
            </span>
          </div>
          <p>MVP · Windows</p>
        </header>

        <div className="sidebar__content">
          <section className="sidebar__section">
            <h2>Conexión</h2>
            <label className="field">
              Puerto
              <select
                value={selectedPort}
                onChange={(event) => setSelectedPort(event.target.value)}
              >
                {ports.length === 0 ? (
                  <option value="">Sin puertos</option>
                ) : (
                  ports.map((port) => (
                    <option key={port.path} value={port.path}>
                      {port.path}
                    </option>
                  ))
                )}
              </select>
            </label>
            {ports.length === 0 ? (
              <label className="field">
                Puerto manual
                <input
                  type="text"
                  value={manualPort}
                  onChange={(event) => setManualPort(event.target.value)}
                  placeholder="COM7"
                />
              </label>
            ) : null}
            <label className="field">
              Baudrate
              <select
                value={baudRate}
                onChange={(event) => setBaudRate(Number(event.target.value))}
              >
                {commonBaudRates.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}
                  </option>
                ))}
              </select>
            </label>
            <div className="connection-actions">
              <button type="button" onClick={refreshPorts}>
                Refrescar
              </button>
              {connectionStatus === "connected" ? (
                <button type="button" onClick={handleDisconnect}>
                  Desconectar
                </button>
              ) : (
                <button type="button" onClick={handleConnect}>
                  Conectar
                </button>
              )}
            </div>
            <p className="connection-status">Estado: {connectionStatus}</p>
          </section>

          <section className="sidebar__section">
            <h2>Variables</h2>
            <div className="channel-table">
              {visibleChannels.map((channel) => (
                <div className="channel-row" key={channel.id} onContextMenu={(event) => openVariableMenu(event, channel.id)}>
                  <span
                    className="channel-color"
                    style={{ backgroundColor: channel.color }}
                  />
                  <span className="channel-name">{channel.name}</span>
                  <span className="channel-value">{channel.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="sidebar__section">
            <h2>Acciones</h2>
            <div className="actions">
              <button type="button" onClick={() => setModal("basic")}>
                Configuración básica
              </button>
              <button type="button" onClick={() => setModal("advanced")}>
                Configuración avanzada
              </button>
              <button type="button" onClick={() => setIsPaused((prev) => !prev)}>
                {isPaused ? "Reanudar" : "Pausar"}
              </button>
              <button type="button" onClick={clearBuffer}>
                Limpiar buffer
              </button>
              <button type="button" onClick={exportCsv}>
                Exportar CSV
              </button>
              <button type="button" onClick={() => setModal("save")}>
                Guardar configuración
              </button>
              <button type="button" onClick={() => setModal("load")}>
                Cargar configuración
              </button>
            </div>
          </section>
        </div>
      </aside>

      <main className="main">
        <div className="main__toolbar">
          <div className="tabs">
            <button
              type="button"
              className={`tab ${activeTab === "plotter" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("plotter")}
            >
              Plotter
            </button>
            <button
              type="button"
              className={`tab ${activeTab === "monitor" ? "tab--active" : ""}`}
              onClick={() => setActiveTab("monitor")}
            >
              Monitor
            </button>
          </div>
          <div className="plot-actions">
            <button type="button" onClick={addPlot}>
              Add Plot
            </button>
            <button type="button" onClick={removePlot}>
              Remove Plot
            </button>
          </div>
        </div>

        {activeTab === "plotter" ? (
          <div className="plots" data-version={dataVersion} onWheelCapture={handlePlotterWheelCapture}>
            {plots.map((plot) => {
              const draft = getDraft(plot.id);
              const assignmentOptions = plot.assignments.map(
                (item) => `${item.channelId}:${item.axis}`
              );
              const yAssignments = plot.assignments.filter((item) => item.axis !== "x");
              const legendEntries = plot.assignments.map((assignment) => {
                const idx = channelIndex(assignment.channelId);
                const channel = channels[idx];
                return {
                  key: `${assignment.channelId}-${assignment.axis}`,
                  axis: assignment.axis.toUpperCase(),
                  name: channel?.name || assignment.channelId,
                  color: channel?.color || "#64748b"
                };
              });

              return (
                <section className="plot" key={plot.id} style={{ height: `${plot.height || 320}px` }}>
                  <header className="plot__header">
                    <h3>{plot.title}</h3>
                  </header>

                  <div
                    className="plot__canvas"
                    onContextMenu={(event) => openContextMenu(event, plot.id)}
                    onWheel={(event) => handlePlotAxisWheel(event, plot.id)}
                    onPointerMove={(event) => handlePlotCanvasPointerMove(event, plot.id)}
                    onPointerDown={(event) => handlePlotCanvasPointerDown(event, plot.id)}
                    onPointerLeave={() => handlePlotCanvasPointerLeave(plot.id)}
                  >
                    {renderPlot(plot)}
                    <div className="plot__legend-box">
                      <strong>Señales</strong>
                      {legendEntries.length === 0 ? (
                        <span>Sin señales</span>
                      ) : (
                        legendEntries.map((entry) => (
                          <button
                            key={entry.key}
                            type="button"
                            className="plot__legend-row"
                            onContextMenu={(event) => openVariableMenu(event, entry.key.split("-")[0])}
                          >
                            <span className="plot__legend-dot" style={{ backgroundColor: entry.color }} />
                            <span>{entry.name}</span>
                            <span className="plot__legend-axis">{entry.axis}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <div
                    className="plot__resize-zone"
                    onPointerDown={(event) => startResize(event, plot.id, plot.height)}
                    role="separator"
                    aria-label="Resize plot vertically"
                    title="Arrastra desde el borde inferior"
                  />

                  {contextMenu?.plotId === plot.id ? (
                    <div
                      ref={menuRef}
                      className="plot-menu"
                      style={{ left: contextMenu.x, top: contextMenu.y }}
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <div className="plot-menu__section">
                        <strong>Add data</strong>
                        <select
                          value={draft.axis}
                          onChange={(event) => setDraft(plot.id, { axis: event.target.value })}
                        >
                          <option value="x">X</option>
                          <option value="y1">Y1</option>
                          <option value="y2">Y2</option>
                        </select>
                        <div className="plot-menu__channels">
                          {visibleChannels.map((channel) => (
                            <button
                              key={channel.id}
                              type="button"
                              onClick={() => addAssignment(plot.id, channel.id)}
                            >
                              {channel.name}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="plot-menu__section">
                        <strong>Remove channel</strong>
                        <select
                          value={draft.removeKey}
                          onChange={(event) =>
                            setDraft(plot.id, { removeKey: event.target.value })
                          }
                        >
                          <option value="">Seleccionar para remover</option>
                          {assignmentOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <div className="plot-menu__actions">
                          <button type="button" onClick={() => removeAssignment(plot.id)}>
                            Remove
                          </button>
                          <button type="button" onClick={() => clearAssignments(plot.id)}>
                            Remove all
                          </button>
                          <button type="button" onClick={closeContextMenu}>
                            Cerrar
                          </button>
                        </div>
                      </div>

                      <div className="plot-menu__section">
                        <strong>Stat curves</strong>
                        <div className="plot-menu__inline-fields">
                          <select
                            value={plot.statsWindowUnit}
                            onChange={(event) => updatePlotSettings(plot.id, { statsWindowUnit: event.target.value })}
                          >
                            <option value="samples">Muestras</option>
                            <option value="seconds">Segundos</option>
                          </select>
                          <input
                            type="number"
                            min="2"
                            value={plot.statsWindowValue}
                            onChange={(event) => updatePlotSettings(plot.id, { statsWindowValue: Math.max(2, Number(event.target.value) || 2) })}
                          />
                        </div>
                        {([
                          { key: "avg", label: "Promedio", field: "statAvgTargets" },
                          { key: "min", label: "Mínimo", field: "statMinTargets" },
                          { key: "max", label: "Máximo", field: "statMaxTargets" }
                        ]).map((stat) => (
                          <div key={stat.key} className="plot-menu__stat-group">
                            <strong>{stat.label}</strong>
                            {yAssignments.length === 0 ? (
                              <span className="plot-menu__muted">Sin señales Y</span>
                            ) : (
                              yAssignments.map((assignment) => {
                                const targetKey = `${assignment.channelId}:${assignment.axis}`;
                                const idx = channelIndex(assignment.channelId);
                                const channel = channels[idx];
                                const selected = (Array.isArray(plot[stat.field]) ? plot[stat.field] : []).includes(targetKey);
                                return (
                                  <label key={`${stat.key}-${targetKey}`}>
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      onChange={() => toggleStatTarget(plot.id, stat.field, targetKey)}
                                    />
                                    {channel?.name || assignment.channelId} ({assignment.axis.toUpperCase()})
                                  </label>
                                );
                              })
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="plot-menu__section">
                        <strong>Modes</strong>
                        <label>
                          X mode
                          <select value={plot.xMode} onChange={(event) => handleModeChange(plot.id, "x", event.target.value)}>
                            <option value="auto">Automático</option>
                            <option value="window">Ventana deslizante</option>
                            <option value="manual">Manual</option>
                          </select>
                        </label>
                        {(plot.xMode === "manual" || plot.xMode === "window") ? (
                          <p className="plot-menu__muted">
                            Pasa el mouse sobre la zona X y usa rueda (Shift = salto de 10).
                          </p>
                        ) : null}
                        <label>
                          Y1 mode
                          <select value={plot.y1Mode} onChange={(event) => handleModeChange(plot.id, "y1", event.target.value)}>
                            <option value="auto">Automático</option>
                            <option value="manual">Manual</option>
                          </select>
                        </label>
                        {plot.y1Mode === "manual" ? (
                          <p className="plot-menu__muted">
                            Pasa el mouse sobre zona Y1 y usa rueda; arrastra con click izquierdo para deslizar.
                          </p>
                        ) : null}
                        <label>
                          Y2 mode
                          <select value={plot.y2Mode} onChange={(event) => handleModeChange(plot.id, "y2", event.target.value)}>
                            <option value="auto">Automático</option>
                            <option value="manual">Manual</option>
                          </select>
                        </label>
                        {plot.y2Mode === "manual" ? (
                          <p className="plot-menu__muted">
                            Pasa el mouse sobre zona Y2 y usa rueda; arrastra con click izquierdo para deslizar.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="monitor">
            <div className="monitor__log">
              {monitorLog.length === 0 ? (
                <p className="monitor__placeholder">Aquí se verá el monitor serial.</p>
              ) : (
                monitorLog.map((line, index) => (
                  <p key={`${line}-${index}`} className="monitor__line">
                    {line}
                  </p>
                ))
              )}
            </div>
            <div className="monitor__controls">
              <input
                type="text"
                placeholder="Escribe un mensaje..."
                value={monitorMessage}
                onChange={(event) => setMonitorMessage(event.target.value)}
              />
              <select
                value={terminator}
                onChange={(event) => setTerminator(event.target.value)}
              >
                <option value="none">Sin ajuste</option>
                <option value="nl">Nueva línea (NL)</option>
                <option value="cr">Retorno de carro (CR)</option>
                <option value="nlcr">NL &amp; CR</option>
              </select>
              <button type="button" onClick={handleSend}>
                Enviar
              </button>
            </div>
          </div>
        )}
      </main>

      {modal ? (
        <div className="modal-backdrop">
          <div className="modal">
            <header className="modal__header">
              <h3>
                {modal === "basic" && "Configuración básica"}
                {modal === "advanced" && "Configuración avanzada"}
                {modal === "save" && "Guardar configuración"}
                {modal === "load" && "Cargar configuración"}
              </h3>
              <button type="button" onClick={closeModal}>
                Cerrar
              </button>
            </header>
            <div className="modal__body">
              {modal === "basic" ? (
                <div className="modal__form">
                  <label>
                    Canales por trama (0 = auto)
                    <input
                      type="number"
                      min="0"
                      value={basicConfig.channelCount}
                      onChange={(event) =>
                        updateBasicConfig("channelCount", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    SPS (muestras/seg)
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.samplesPerSecond}
                      onChange={(event) => handleSamplesChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Periodo (ms)
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={basicConfig.periodMs}
                      onChange={(event) => handlePeriodChange(event.target.value)}
                    />
                  </label>
                  <label>
                    Buffer (segundos)
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.bufferSeconds}
                      onChange={(event) =>
                        updateBasicConfig("bufferSeconds", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Refresh UI (ms)
                    <input
                      type="number"
                      min="16"
                      value={basicConfig.refreshMs}
                      onChange={(event) =>
                        updateBasicConfig("refreshMs", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Min. tramas válidas para iniciar
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.minValidFrames}
                      onChange={(event) =>
                        updateBasicConfig("minValidFrames", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Modo de ploteo
                    <select
                      value={basicConfig.plotMode}
                      onChange={(event) => updateBasicConfig("plotMode", event.target.value)}
                    >
                      <option value="normal">Normal</option>
                      <option value="minmax">Min/Max agregado</option>
                    </select>
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={basicConfig.includeTimestamp}
                      onChange={(event) =>
                        updateBasicConfig("includeTimestamp", event.target.checked)
                      }
                    />
                    Incluye timestamp en X
                  </label>
                </div>
              ) : null}

              {modal === "advanced" ? (
                <div className="modal__form">
                  <label>
                    Data bits
                    <select
                      value={advancedConfig.dataBits}
                      onChange={(event) =>
                        updateAdvancedConfig("dataBits", Number(event.target.value))
                      }
                    >
                      <option value={7}>7</option>
                      <option value={8}>8</option>
                    </select>
                  </label>
                  <label>
                    Paridad
                    <select
                      value={advancedConfig.parity}
                      onChange={(event) =>
                        updateAdvancedConfig("parity", event.target.value)
                      }
                    >
                      <option value="none">Ninguna</option>
                      <option value="even">Par</option>
                      <option value="odd">Impar</option>
                    </select>
                  </label>
                  <label>
                    Stop bits
                    <select
                      value={advancedConfig.stopBits}
                      onChange={(event) =>
                        updateAdvancedConfig("stopBits", Number(event.target.value))
                      }
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {modal === "save" || modal === "load" ? (
                <div className="modal__form">
                  <label>
                    Configuración (JSON)
                    <textarea
                      rows={8}
                      value={configText}
                      onChange={(event) => setConfigText(event.target.value)}
                    />
                  </label>
                  <div className="modal__actions">
                    {modal === "save" ? (
                      <button type="button" onClick={handleSaveConfig}>
                        Guardar local
                      </button>
                    ) : (
                      <button type="button" onClick={handleLoadConfig}>
                        Cargar local
                      </button>
                    )}
                    <button type="button" onClick={applyConfigText}>
                      Aplicar JSON
                    </button>
                  </div>
                  {configMessage ? <p className="modal__hint">{configMessage}</p> : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {variableMenu ? (
        <div
          ref={variableMenuRef}
          className="variable-menu"
          style={{ left: variableMenu.x, top: variableMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <strong>Variable</strong>
          {(() => {
            const channel = channels.find((item) => item.id === variableMenu.channelId);
            if (!channel) {
              return <span>No disponible</span>;
            }

            return (
              <>
                <label>
                  Nombre
                  <input
                    type="text"
                    value={channel.name}
                    onChange={(event) => updateChannel(channel.id, { name: event.target.value || channel.id })}
                  />
                </label>
                <label>
                  Color
                  <input
                    type="color"
                    value={channel.color}
                    onChange={(event) => updateChannel(channel.id, { color: event.target.value })}
                  />
                </label>
                <label>
                  Estilo
                  <select
                    value={channel.lineStyle || "solid"}
                    onChange={(event) => updateChannel(channel.id, { lineStyle: event.target.value })}
                  >
                    <option value="solid">Sólida</option>
                    <option value="dashed">Discontinua</option>
                    <option value="dotted">Punteada</option>
                  </select>
                </label>
                <label>
                  Grosor
                  <input
                    type="number"
                    min="1"
                    max="8"
                    value={channel.thickness || 2}
                    onChange={(event) => updateChannel(channel.id, { thickness: clamp(Number(event.target.value) || 2, 1, 8) })}
                  />
                </label>
                <button type="button" onClick={closeVariableMenu}>Cerrar</button>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
}
