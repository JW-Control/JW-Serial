// Defaults, palettes and storage keys shared by the renderer.

export const channelPalette = ["#ef4444", "#d97706", "#c0ca33", "#65a30d", "#0ea5e9", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];
export const virtualPalette = ["#2563eb", "#9333ea", "#0891b2", "#db2777", "#16a34a", "#ea580c"];

export const CHANNEL_DRAG_MIME = "application/x-jw-channel";

export const axisLabels = {
  x: "X",
  y1: "Y1",
  y2: "Y2"
};

export const commonBaudRates = [
  300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 28800, 31250, 38400, 57600,
  74880, 115200, 128000, 230400, 250000, 460800, 500000, 921600, 1000000,
  1500000, 2000000
];

export const esp32Ch340HighSpeedProfile = {
  baudRate: 921600,
  channelCount: 2,
  samplesPerSecond: 2000,
  periodMs: 0.5,
  bufferSeconds: 60,
  refreshMs: 50,
  plotMode: "minmax",
  xWindowSize: 10,
  includeSequenceCounter: true,
  serialTimeoutSeconds: 3
};

export const storageKeys = {
  theme: "jwSerialTheme",
  appSettings: "jwSerialAppSettings",
  lastSession: "jwSerialLastSession",
  captureConfig: "jwSerialCaptureConfig",
  templates: "jwSerialTemplates",
  config: "jwSerialConfig",
  functionModalWidth: "jwSerialFunctionModalWidth"
};

export const defaultBasicConfig = {
  channelCount: 0,
  samplesPerSecond: 100,
  periodMs: 10,
  bufferSeconds: 120,
  refreshMs: 33,
  minValidFrames: 10,
  plotMode: "normal",
  includeTimestamp: false,
  includeSequenceCounter: false
};

export const defaultAdvancedConfig = {
  dataBits: 8,
  parity: "none",
  stopBits: 1,
  lineSignals: "default"
};

export const defaultCaptureConfig = {
  enabled: false,
  intervalMinutes: 10,
  directory: "",
  label: "",
  usePrefix: false,
  useSubfolder: false,
  recordOnConnect: false
};

export const defaultAppSettings = {
  serialTimeoutSeconds: 10,
  sessionRestoreMode: "ask",
  serialFilterMode: "none",
  serialFilterPatterns: ""
};

export const createDefaultChannels = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `val${index}`,
    name: `val${index}`,
    color: channelPalette[index % channelPalette.length],
    lineStyle: "solid",
    thickness: 2
  }));

/** Resizes the channel list, keeping user styles for existing channels. */
export const normalizeChannels = (count, previous) =>
  createDefaultChannels(Math.max(1, count)).map((item, index) => {
    const prev = previous[index];
    if (!prev) {
      return item;
    }
    const { value: _value, ...style } = prev;
    return { ...item, ...style, id: item.id };
  });

export const createPlot = (index) => ({
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

export const defaultPlots = [createPlot(1), createPlot(2)];
