import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPlot,
  defaultAdvancedConfig,
  defaultAppSettings,
  defaultBasicConfig,
  defaultCaptureConfig,
  defaultPlots,
  esp32Ch340HighSpeedProfile,
  normalizeChannels,
  createDefaultChannels,
  storageKeys,
  virtualPalette
} from "./constants.js";
import { AcquisitionEngine } from "./engine/acquisitionEngine.js";
import { useEvent } from "./hooks/useEvent.js";
import { clamp } from "./lib/axisScale.js";
import { renderElementToPng, waitForPaint } from "./lib/capture.js";
import { buildHistoryCsv } from "./lib/csv.js";
import { readJson, readSettings, readString, removeKey, writeJson, writeString } from "./lib/storage.js";
import { createFunctionBlock } from "./lib/virtual/definitions.js";
import Monitor from "./components/Monitor.jsx";
import ValuePanel from "./components/ValuePanel.jsx";
import AnalysisView from "./components/AnalysisView.jsx";
import Toasts from "./components/Toasts.jsx";
import AlarmsModal from "./components/modals/AlarmsModal.jsx";
import CommandsModal from "./components/modals/CommandsModal.jsx";
import ReportModal from "./components/modals/ReportModal.jsx";
import { buildReportHtml } from "./lib/report.js";
import { noiseStatistics } from "./lib/spectrum.js";
import { alarmThresholds, describeAlarm } from "./engine/alarms.js";
import { formatReadout } from "./lib/plotOverlay.js";
import Plot from "./components/Plot.jsx";
import Sidebar from "./components/Sidebar.jsx";
import VariableMenu from "./components/VariableMenu.jsx";
import ConfigModal from "./components/modals/ConfigModal.jsx";
import FunctionBuilderModal from "./components/modals/FunctionBuilderModal.jsx";
import {
  AssignmentPrompt,
  CapturesModal,
  ConfigFileModal,
  ConnectIdentifierPrompt,
  EventModal,
  StartupRestorePrompt
} from "./components/modals/SmallModals.jsx";

const monotonicNow = () => performance.timeOrigin + performance.now();
const ALARM_NOTICE_COOLDOWN_MS = 30000;
// Boards that reset when the port opens (ESP32 auto-reset) need time to boot
// before the first frame; added to the timeout only until data arrives.
const FIRST_FRAME_GRACE_MS = 3000;

/** Explains why no valid frame arrived, from the main-process counters. */
const describeLinkProblem = (stats, baudRate) => {
  if (!stats) {
    return "No hubo tramas válidas. Revisa el monitor: sin líneas RX = el equipo no envía o es otro puerto; "
      + "caracteres raros = baudrate distinto. (Si acabas de actualizar JW-Serial, reinícialo por completo.)";
  }
  if (stats.bytes === 0) {
    return "No llegó ningún byte. Verifica que el equipo esté enviando y que sea el puerto correcto. "
      + "Si es un ESP32 con CH340/CP210x, puede haber quedado en reset o en modo boot al abrir el puerto: "
      + "usa Configuración → Avanzada → DTR/RTS → Reinicio limpio.";
  }
  if (stats.lines === 0) {
    return `Llegaron ${stats.bytes} bytes sin saltos de línea: probablemente el baudrate (${baudRate}) no coincide con el del equipo.`;
  }
  return `Llegaron ${stats.lines} líneas pero ninguna fue una trama válida: revisa el formato, el filtro de tramas, `
    + "\"Canales por trama\" y \"Min. tramas válidas\" (las líneas recibidas están en el monitor).";
};

/** Prefers USB serial adapters over legacy ports such as COM1. */
const pickDefaultPort = (ports) =>
  ports.find((port) => port.manufacturer && !/^COM1$/i.test(port.path))
  || ports.find((port) => !/^COM1$/i.test(port.path))
  || ports[0];

const isMissingIpcHandlerError = (error) => String(error?.message || error || "").includes("No handler registered");

// Fields that change what a virtual function computes (style edits such as
// color or name must not trigger a history recompute).
const virtualComputationKey = (definitions) =>
  JSON.stringify(definitions.map(({ id, block, expression, sourceId, operation, windowUnit, windowValue, enabled }) =>
    [id, block, expression, sourceId, operation, windowUnit, windowValue, enabled]
  ));

const normalizePlots = (plots) =>
  (Array.isArray(plots) && plots.length ? plots : defaultPlots).map((plot, index) => ({
    ...createPlot(index + 1),
    ...plot,
    assignments: Array.isArray(plot?.assignments) ? plot.assignments : []
  }));

export default function App() {
  const [engine] = useState(() => new AcquisitionEngine());
  const [theme, setTheme] = useState(() => readString(storageKeys.theme, "light"));
  const [plots, setPlots] = useState(defaultPlots);
  const [channels, setChannels] = useState(() => createDefaultChannels(10));
  const [virtualFunctions, setVirtualFunctions] = useState([]);
  const [functionErrors, setFunctionErrors] = useState({});
  const [functionDraft, setFunctionDraft] = useState(null);
  const [functionModalWidth, setFunctionModalWidth] = useState(() => {
    const saved = Number(readString(storageKeys.functionModalWidth));
    return Number.isFinite(saved) && saved >= 760 ? saved : 920;
  });
  const [activeTab, setActiveTab] = useState("plotter");
  const [panelChannels, setPanelChannels] = useState([]);
  const [alarmRules, setAlarmRules] = useState([]);
  const [quickCommands, setQuickCommands] = useState([]);
  const [analysisSettings, setAnalysisSettings] = useState({
    channelId: "val0",
    seconds: 10,
    fullScale: "",
    window: "hann",
    scale: "db",
    autoRefresh: true
  });
  const [activeAlarmIds, setActiveAlarmIds] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [recording, setRecording] = useState(null);
  const [replayInfo, setReplayInfo] = useState(null);
  const [modal, setModal] = useState(null);
  const [terminator, setTerminator] = useState("none");
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [manualPort, setManualPort] = useState("COM3");
  const [baudRate, setBaudRate] = useState(115200);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [isPaused, setIsPaused] = useState(false);
  const [appSettings, setAppSettings] = useState(() => readSettings(storageKeys.appSettings, defaultAppSettings));
  const [basicConfig, setBasicConfig] = useState(defaultBasicConfig);
  const [advancedConfig, setAdvancedConfig] = useState(defaultAdvancedConfig);
  const [captureConfig, setCaptureConfig] = useState(() => readSettings(storageKeys.captureConfig, defaultCaptureConfig));
  const [captureMessage, setCaptureMessage] = useState("");
  const [configMessage, setConfigMessage] = useState("");
  const [nextCaptureAt, setNextCaptureAt] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [variableMenu, setVariableMenu] = useState(null);
  const [assignmentPrompt, setAssignmentPrompt] = useState(null);
  const [startupRestorePrompt, setStartupRestorePrompt] = useState(null);
  const [connectIdentifierPrompt, setConnectIdentifierPrompt] = useState(null);

  const plotsRef = useRef(null);
  const plotElementsRef = useRef(new Map());
  const captureInProgressRef = useRef(false);
  const restoreReadyRef = useRef(false);
  const connectedAtRef = useRef(null);
  // Session history for the report (independent of session_log.csv).
  const sessionTimelineRef = useRef([]);
  const alarmTriggerCountsRef = useRef(new Map());
  const recordingsRef = useRef([]);

  // ---------------------------------------------------------- derived data

  const visibleChannels = useMemo(
    () => (basicConfig.channelCount > 0 ? channels.slice(0, basicConfig.channelCount) : channels),
    [basicConfig.channelCount, channels]
  );

  const virtualChannels = useMemo(() =>
    virtualFunctions
      .filter((item) => item.enabled !== false)
      .map((item) => ({
        id: item.id,
        name: item.name,
        color: item.color,
        lineStyle: item.lineStyle || "solid",
        thickness: item.thickness || 2,
        virtual: true,
        error: functionErrors[item.id]
      })),
  [virtualFunctions, functionErrors]);

  const allChannels = useMemo(() => [...visibleChannels, ...virtualChannels], [visibleChannels, virtualChannels]);

  const channelStyles = useMemo(
    () => new Map(allChannels.map((channel) => [channel.id, channel])),
    [allChannels]
  );

  // Only text formulas (configs from older versions) resolve variables by
  // name; block-based functions use channel ids and ignore renames.
  const usesChannelNames = virtualFunctions.some((definition) => !definition.block);
  const channelNamesKey = usesChannelNames ? visibleChannels.map((channel) => channel.name).join("\u0000") : "";
  const virtualKey = useMemo(() => virtualComputationKey(virtualFunctions), [virtualFunctions]);

  // --------------------------------------------------------- engine wiring

  useEffect(() => {
    engine.configure({
      channelCount: basicConfig.channelCount,
      bufferSeconds: basicConfig.bufferSeconds,
      samplesPerSecond: basicConfig.samplesPerSecond,
      includeTimestamp: basicConfig.includeTimestamp,
      includeSequenceCounter: basicConfig.includeSequenceCounter
    });
  }, [engine, basicConfig.channelCount, basicConfig.bufferSeconds, basicConfig.samplesPerSecond, basicConfig.includeTimestamp, basicConfig.includeSequenceCounter]);

  useEffect(() => {
    engine.setUiInterval(basicConfig.refreshMs);
  }, [engine, basicConfig.refreshMs]);

  useEffect(() => {
    engine.setPaused(isPaused);
  }, [engine, isPaused]);

  const calibrations = useMemo(() => channels.map((channel) => channel.calibration || null), [channels]);
  useEffect(() => {
    engine.setCalibrations(calibrations);
  }, [engine, calibrations]);

  useEffect(() => {
    // Recompute virtual functions over the full history (single O(N) pass)
    // whenever what they compute, or the names they refer to, change.
    setFunctionErrors(engine.setVirtualFunctions(virtualFunctions, visibleChannels));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, virtualKey, channelNamesKey]);

  useEffect(() => engine.onChannelStructure(({ count, names }) => {
    setChannels((prev) => {
      const resized = basicConfig.channelCount > 0 ? prev : normalizeChannels(count, prev);
      if (!names.length) {
        return resized;
      }
      return resized.map((channel, index) => (names[index] ? { ...channel, name: names[index] } : channel));
    });
  }), [engine, basicConfig.channelCount]);

  useEffect(() => {
    if (basicConfig.channelCount > 0) {
      setChannels((prev) => normalizeChannels(basicConfig.channelCount, prev));
    }
  }, [basicConfig.channelCount]);

  useEffect(() => {
    const api = window.jwSerial;
    if (!api?.onFrames || !api?.onRawLines || !api?.onStatus) {
      engine.appendLog("SYS > API serial no disponible en renderer (preload).");
      return undefined;
    }
    const unsubscribeFrames = api.onFrames((frames) => engine.ingestFrames(frames));
    const unsubscribeRawLines = api.onRawLines((payload) => engine.ingestRawLines(payload));
    const unsubscribeStatus = api.onStatus((status) => {
      if (status.type === "error") {
        setConnectionStatus("error");
      }
      if (status.type === "closed") {
        setConnectionStatus("disconnected");
        connectedAtRef.current = null;
      }
      if (status.type === "open") {
        setConnectionStatus("connected");
        connectedAtRef.current = monotonicNow();
      }
      engine.appendLog(`SYS > ${status.message}`);
    });
    return () => {
      unsubscribeFrames?.();
      unsubscribeRawLines?.();
      unsubscribeStatus?.();
    };
  }, [engine]);

  // Filter and frame validation run in the main process; keep them in sync
  // while connected so changes apply without reconnecting.
  useEffect(() => {
    if (connectionStatus !== "connected") {
      return;
    }
    window.jwSerial?.updateSerialConfig?.({
      expectedChannels: basicConfig.channelCount,
      minValidFrames: basicConfig.minValidFrames,
      includeTimestamp: basicConfig.includeTimestamp,
      includeSequenceCounter: basicConfig.includeSequenceCounter,
      serialFilterMode: appSettings.serialFilterMode,
      serialFilterPatterns: appSettings.serialFilterPatterns
    })?.catch?.(() => {});
  }, [
    connectionStatus,
    basicConfig.channelCount,
    basicConfig.minValidFrames,
    basicConfig.includeTimestamp,
    basicConfig.includeSequenceCounter,
    appSettings.serialFilterMode,
    appSettings.serialFilterPatterns
  ]);

  // ------------------------------------------------------------- settings

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeString(storageKeys.theme, theme);
  }, [theme]);

  useEffect(() => {
    writeJson(storageKeys.captureConfig, captureConfig);
  }, [captureConfig]);

  const updateCaptureConfig = useEvent((patch) => setCaptureConfig((prev) => ({ ...prev, ...patch })));

  const updateAppSettings = useEvent((patch) => {
    setAppSettings((prev) => {
      const next = { ...prev, ...patch };
      writeJson(storageKeys.appSettings, next);
      return next;
    });
  });

  // ------------------------------------------------- config snapshot I/O

  const buildConfigSnapshot = useEvent(() => ({
    basicConfig,
    advancedConfig,
    appSettings,
    baudRate,
    selectedPort,
    manualPort,
    terminator,
    activeTab,
    panelChannels,
    alarmRules,
    quickCommands,
    analysisSettings,
    channels: channels.map(({ id, name, color, lineStyle, thickness, calibration }) => ({ id, name, color, lineStyle, thickness, calibration })),
    virtualFunctions: virtualFunctions.map(({ id, name, sourceId, operation, expression, block, windowUnit, windowValue, color, lineStyle, thickness, enabled }) => ({
      id, name, sourceId, operation, expression, block, windowUnit, windowValue, color, lineStyle, thickness, enabled
    })),
    plots,
    captureConfig
  }));

  const applyConfigSnapshot = useEvent((parsed) => {
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Configuración inválida.");
    }
    const nextBasicConfig = parsed.basicConfig ? { ...basicConfig, ...parsed.basicConfig } : basicConfig;
    if (parsed.basicConfig) {
      setBasicConfig(nextBasicConfig);
    }
    if (parsed.advancedConfig) {
      setAdvancedConfig({ ...defaultAdvancedConfig, ...parsed.advancedConfig });
    }
    if (parsed.appSettings) {
      updateAppSettings(parsed.appSettings);
    }
    if (parsed.baudRate) {
      setBaudRate(Number(parsed.baudRate));
    }
    if (parsed.selectedPort) {
      setSelectedPort(parsed.selectedPort);
    }
    if (parsed.manualPort) {
      setManualPort(parsed.manualPort);
    }
    if (parsed.terminator) {
      setTerminator(parsed.terminator);
    }
    if (parsed.activeTab) {
      setActiveTab(parsed.activeTab);
    }
    if (Array.isArray(parsed.panelChannels)) {
      setPanelChannels(parsed.panelChannels);
    }
    if (Array.isArray(parsed.alarmRules)) {
      setAlarmRules(parsed.alarmRules);
    }
    if (Array.isArray(parsed.quickCommands)) {
      setQuickCommands(parsed.quickCommands);
    }
    if (parsed.analysisSettings && typeof parsed.analysisSettings === "object") {
      setAnalysisSettings((prev) => ({ ...prev, ...parsed.analysisSettings }));
    }
    if (parsed.plots) {
      setPlots(normalizePlots(parsed.plots));
    }
    if (parsed.captureConfig) {
      updateCaptureConfig(parsed.captureConfig);
    }
    if (Array.isArray(parsed.channels)) {
      const preferredCount = nextBasicConfig.channelCount > 0 ? nextBasicConfig.channelCount : parsed.channels.length;
      setChannels(normalizeChannels(preferredCount, parsed.channels));
    }
    if (Array.isArray(parsed.virtualFunctions)) {
      setVirtualFunctions(parsed.virtualFunctions.map(({ value: _value, ...item }) => item));
    }
  });

  useEffect(() => {
    const snapshot = readJson(storageKeys.lastSession);
    if (!snapshot) {
      restoreReadyRef.current = true;
      return;
    }
    if (appSettings.sessionRestoreMode === "auto") {
      applyConfigSnapshot(snapshot);
      restoreReadyRef.current = true;
      setConfigMessage("Última sesión cargada.");
      return;
    }
    if (appSettings.sessionRestoreMode === "fresh") {
      restoreReadyRef.current = true;
      return;
    }
    setStartupRestorePrompt(snapshot);
    // Startup only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (restoreReadyRef.current) {
      writeJson(storageKeys.lastSession, buildConfigSnapshot());
    }
  }, [basicConfig, advancedConfig, appSettings, baudRate, selectedPort, manualPort, terminator, activeTab, panelChannels, alarmRules, quickCommands, analysisSettings, channels, virtualFunctions, plots, captureConfig, buildConfigSnapshot]);

  const loadLastSession = () => {
    try {
      applyConfigSnapshot(startupRestorePrompt);
      setConfigMessage("Última sesión cargada.");
    } catch (_error) {
      setConfigMessage("No se pudo cargar la última sesión.");
    }
    restoreReadyRef.current = true;
    setStartupRestorePrompt(null);
  };

  const startEmptySession = () => {
    removeKey(storageKeys.lastSession);
    restoreReadyRef.current = true;
    setStartupRestorePrompt(null);
    setConfigMessage("Sesión nueva iniciada.");
  };

  const applyConfigText = (text) => {
    try {
      applyConfigSnapshot(JSON.parse(text));
      setConfigMessage("Configuración aplicada.");
    } catch (_error) {
      setConfigMessage("JSON inválido. Revisa el formato.");
    }
  };

  const saveConfigFile = async (text) => {
    writeString(storageKeys.config, text);
    try {
      const response = await window.jwSerial?.saveConfigFile?.(text);
      if (response?.ok) {
        setConfigMessage(`Configuración guardada en ${response.filePath}`);
        return;
      }
      if (response?.canceled) {
        setConfigMessage("Guardado cancelado.");
        return;
      }
    } catch (error) {
      setConfigMessage(isMissingIpcHandlerError(error)
        ? "Reinicia JW-Serial para activar el diálogo nativo de guardado."
        : "No se pudo abrir el diálogo de guardado.");
      return;
    }
    setConfigMessage("Configuración guardada localmente.");
  };

  const loadConfigFile = async () => {
    try {
      const response = await window.jwSerial?.loadConfigFile?.();
      if (response?.ok) {
        writeString(storageKeys.config, response.content);
        setConfigMessage(`Configuración cargada desde ${response.filePath}`);
        return response.content;
      }
      if (response?.canceled) {
        setConfigMessage("Carga cancelada.");
        return null;
      }
    } catch (error) {
      setConfigMessage(isMissingIpcHandlerError(error)
        ? "Reinicia JW-Serial para activar el diálogo nativo de carga."
        : "No se pudo abrir el diálogo de carga.");
      return null;
    }
    const saved = readString(storageKeys.config, "");
    setConfigMessage(saved ? "Configuración cargada desde almacenamiento local." : "No hay configuración guardada.");
    return saved || null;
  };

  const applyBasicConfig = (patch) => {
    setBasicConfig((prev) => ({ ...prev, ...patch }));
    setConfigMessage("Cambios aplicados.");
  };

  const applyEsp32Profile = () => {
    const profile = esp32Ch340HighSpeedProfile;
    setBaudRate(profile.baudRate);
    setBasicConfig((prev) => ({
      ...prev,
      channelCount: profile.channelCount,
      samplesPerSecond: profile.samplesPerSecond,
      periodMs: profile.periodMs,
      bufferSeconds: profile.bufferSeconds,
      refreshMs: profile.refreshMs,
      plotMode: profile.plotMode,
      includeTimestamp: false,
      includeSequenceCounter: profile.includeSequenceCounter,
      minValidFrames: 1
    }));
    updateAppSettings({ serialTimeoutSeconds: profile.serialTimeoutSeconds });
    setAdvancedConfig((prev) => ({ ...prev, lineSignals: "reset" }));
    setPlots((prev) => prev.map((plot) => ({ ...plot, xMode: "window", xWindowSize: profile.xWindowSize, xWindowOffset: 0 })));
    setConfigMessage("Perfil ESP32/CH340 aplicado: 921600 baud, 2 kSPS, secuencia al inicio, buffer 60 s y ploteo Min/Max.");
  };

  // ----------------------------------------------------------- session log

  const appendSessionEvent = useEvent(async (type, detail = "", extras = {}) => {
    sessionTimelineRef.current.push({ time: Date.now(), type, detail });
    if (sessionTimelineRef.current.length > 2000) {
      sessionTimelineRef.current.splice(0, sessionTimelineRef.current.length - 2000);
    }
    const enabled = captureConfig.directory && captureConfig.label?.trim() && captureConfig.useSubfolder;
    if (!enabled || !window.jwSerial?.appendSessionEvent) {
      return;
    }
    const { rxStats } = engine.getSnapshot();
    try {
      await window.jwSerial.appendSessionEvent({
        directory: captureConfig.directory,
        label: captureConfig.label,
        useSubfolder: captureConfig.useSubfolder,
        type,
        detail,
        port: selectedPort || manualPort,
        baudRate,
        frames: rxStats.frames,
        sps: rxStats.sps.toFixed(2),
        lastFrameMs: engine.lastFrameAt ? Math.round(monotonicNow() - engine.lastFrameAt) : "",
        ...extras
      });
    } catch (_error) {
      // Session logging should never interrupt acquisition.
    }
  });

  // ------------------------------------------------------------ connection

  const refreshPorts = useEvent(async () => {
    try {
      const nextPorts = await window.jwSerial.listPorts();
      setPorts(nextPorts);
      if (nextPorts.length > 0 && !nextPorts.some((port) => port.path === selectedPort)) {
        setSelectedPort(pickDefaultPort(nextPorts).path);
      }
      engine.appendLog(nextPorts.length === 0
        ? "SYS > No se detectaron puertos. Puedes ingresar uno manualmente (ej: COM7)."
        : `SYS > ${nextPorts.length} puerto(s) detectado(s).`);
    } catch (_error) {
      setPorts([]);
      engine.appendLog("SYS > Error al listar puertos seriales.");
    }
  });

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  const openSerialConnection = async () => {
    const targetPort = selectedPort || manualPort.trim();
    if (!targetPort) {
      engine.appendLog("SYS > Selecciona o ingresa un puerto antes de conectar.");
      return;
    }
    setConnectionStatus("connecting");
    try {
      const response = await window.jwSerial.openPort({
        path: targetPort,
        baudRate,
        dataBits: advancedConfig.dataBits,
        parity: advancedConfig.parity,
        stopBits: advancedConfig.stopBits,
        lineSignals: advancedConfig.lineSignals,
        expectedChannels: basicConfig.channelCount,
        minValidFrames: basicConfig.minValidFrames,
        includeTimestamp: basicConfig.includeTimestamp,
        includeSequenceCounter: basicConfig.includeSequenceCounter,
        serialFilterMode: appSettings.serialFilterMode,
        serialFilterPatterns: appSettings.serialFilterPatterns
      });
      if (!response?.ok) {
        throw new Error(response?.error || "error desconocido");
      }
      connectedAtRef.current = monotonicNow();
      setConnectionStatus("connected");
      appendSessionEvent("connect", `Conectado a ${targetPort}`);
    } catch (error) {
      setConnectionStatus("error");
      engine.appendLog(`SYS > No se pudo abrir ${targetPort}: ${error?.message || error}`);
    }
  };

  const handleConnect = useEvent(() => {
    if (replayInfo) {
      exitReplay();
    }
    if (captureConfig.usePrefix) {
      setConnectIdentifierPrompt(captureConfig.label || "");
      return;
    }
    openSerialConnection();
  });

  const confirmConnectIdentifier = () => {
    const label = connectIdentifierPrompt.trim();
    if (!label) {
      setCaptureMessage("Ingresa un identificador antes de conectar.");
      return;
    }
    updateCaptureConfig({ label });
    setConnectIdentifierPrompt(null);
    // Let the label reach state before the session log uses it.
    window.setTimeout(() => openSerialConnection(), 0);
  };

  const handleDisconnect = useEvent(async () => {
    appendSessionEvent("disconnect", "Desconexión solicitada");
    await window.jwSerial.closePort();
    setConnectionStatus("disconnected");
    connectedAtRef.current = null;
  });

  useEffect(() => {
    const timeoutSeconds = Number(appSettings.serialTimeoutSeconds) || 0;
    if (connectionStatus !== "connected" || timeoutSeconds <= 0) {
      return undefined;
    }
    const watchdog = window.setInterval(async () => {
      const connectedAt = connectedAtRef.current || 0;
      const hasFrame = (engine.lastFrameAt || 0) > connectedAt;
      const lastActivity = hasFrame ? engine.lastFrameAt : connectedAt;
      const allowedMs = timeoutSeconds * 1000 + (hasFrame ? 0 : FIRST_FRAME_GRACE_MS);
      if (monotonicNow() - lastActivity < allowedMs) {
        return;
      }
      let stats = null;
      try {
        stats = await window.jwSerial?.getLinkStats?.();
      } catch (_error) {
        // Diagnostics are optional.
      }
      engine.appendLog(`SYS > Timeout serial: ${Math.round(allowedMs / 1000)} s sin trama válida. Desconectando.`);
      if (!hasFrame) {
        engine.appendLog(`SYS > ${describeLinkProblem(stats, baudRate)}`);
      }
      appendSessionEvent("timeout_disconnect", `${timeoutSeconds} s sin trama válida`);
      connectedAtRef.current = null;
      try {
        await window.jwSerial?.closePort?.();
      } catch (_error) {
        // The status listener handles normal close notifications.
      }
      setConnectionStatus("disconnected");
    }, 1000);
    return () => window.clearInterval(watchdog);
  }, [engine, connectionStatus, appSettings.serialTimeoutSeconds, appendSessionEvent, baudRate]);

  // -------------------------------------------------------------- data ops

  const clearBuffer = useEvent(() => {
    engine.clear();
    // Follow live data again after clearing (keeps each plot's zoom level).
    setPlots((prev) => prev.map((plot) => (plot.xWindowOffset ? { ...plot, xWindowOffset: 0 } : plot)));
  });

  const exportCsv = useEvent(() => {
    if (!engine.history.length) {
      return;
    }
    // Same layout as recordings, so an export can be reopened for review.
    const columns = [
      { header: "time_iso", read: (sample) => new Date(sample.timestamp).toISOString() },
      { header: "timestamp_ms", read: (sample) => Number(sample.timestamp.toFixed(3)) },
      { header: "seq", read: (sample) => sample.externalSequence },
      { header: "x", read: (sample) => sample.xValue },
      ...visibleChannels.map((channel) => ({ header: channel.name, read: (sample) => engine.readValue(sample, channel.id) })),
      ...virtualChannels.map((channel) => ({ header: `fn:${channel.name}`, read: (sample) => engine.readValue(sample, channel.id) }))
    ];
    const blob = new Blob([buildHistoryCsv(engine.history, columns)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jw-serial-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  });

  // ------------------------------------------------------------- toasts

  const pushToast = useEvent((toast) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-4), { ...toast, id }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), toast.timeoutMs || 8000);
  });

  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((item) => item.id !== id)), []);

  // ------------------------------------------------------------- recording

  const recordingColumns = useMemo(() => [...visibleChannels, ...virtualChannels], [visibleChannels, virtualChannels]);
  const recordingColumnsKey = recordingColumns.map((channel) => `${channel.id}=${channel.name}`).join("|");

  const startRecording = useEvent(async () => {
    if (!captureConfig.directory) {
      pushToast({ title: "No se puede grabar", body: "Elige una carpeta en Configurar capturas.", tone: "alarm" });
      return;
    }
    const header = [
      "time_iso", "timestamp_ms", "seq", "x",
      ...visibleChannels.map((channel) => channel.name),
      ...virtualChannels.map((channel) => `fn:${channel.name}`)
    ];
    try {
      const response = await window.jwSerial.startRecording({
        directory: captureConfig.directory,
        label: captureConfig.label,
        useSubfolder: captureConfig.useSubfolder,
        header
      });
      if (!response?.ok) {
        throw new Error(response?.error || "error desconocido");
      }
      engine.startRecording({
        columns: recordingColumns.map((channel) => channel.id),
        write: (text) => window.jwSerial.writeRecording(text)
      });
      setRecording({ filePath: response.filePath, startedAt: Date.now(), columnsKey: recordingColumnsKey });
      recordingsRef.current.push(response.filePath);
      engine.appendLog(`SYS > Grabando en ${response.filePath}`);
      appendSessionEvent("record_start", response.filePath);
    } catch (error) {
      pushToast({ title: "No se pudo iniciar la grabación", body: String(error?.message || error), tone: "alarm" });
    }
  });

  const stopRecording = useEvent(async () => {
    if (!recording) {
      return;
    }
    const rows = engine.stopRecording();
    setRecording(null);
    try {
      await window.jwSerial.stopRecording();
    } catch (_error) {
      // The main process closes the file on quit as well.
    }
    engine.appendLog(`SYS > Grabación guardada: ${recording.filePath} (${rows} filas)`);
    appendSessionEvent("record_stop", `${recording.filePath} (${rows} filas)`);
    pushToast({ title: "Grabación guardada", body: `${rows.toLocaleString("es")} filas`, tone: "ok", timeoutMs: 5000 });
  });

  // A column change (new channel, renamed variable, new function) starts a
  // new file so every CSV keeps a consistent header.
  useEffect(() => {
    if (recording && recording.columnsKey !== recordingColumnsKey) {
      stopRecording().then(() => startRecording());
    }
  }, [recording, recordingColumnsKey, startRecording, stopRecording]);

  const previousConnectionRef = useRef(connectionStatus);
  useEffect(() => {
    const previous = previousConnectionRef.current;
    previousConnectionRef.current = connectionStatus;
    if (connectionStatus === "connected" && previous !== "connected" && captureConfig.recordOnConnect && !recording) {
      startRecording();
    }
    if (previous === "connected" && connectionStatus !== "connected" && recording) {
      stopRecording();
    }
  }, [connectionStatus, captureConfig.recordOnConnect, recording, startRecording, stopRecording]);

  // ---------------------------------------------------------------- replay

  const openRecording = useEvent(async () => {
    if (connectionStatus === "connected") {
      pushToast({ title: "Desconecta el puerto", body: "La revisión de archivos reemplaza los datos en vivo.", tone: "alarm" });
      return;
    }
    try {
      const response = await window.jwSerial.loadRecording();
      if (!response?.ok) {
        if (!response?.canceled) {
          pushToast({ title: "No se pudo abrir el archivo", body: response?.error, tone: "alarm" });
        }
        return;
      }
      engine.loadRecording(response, response.fileName);
      setPlots((prev) => prev.map((plot) => ({ ...plot, xMode: plot.xMode === "manual" ? "manual" : "auto", xWindowOffset: 0 })));
      setReplayInfo({
        fileName: response.fileName,
        rows: response.timestamps.length,
        totalRows: response.totalRows,
        decimation: response.decimation
      });
      engine.appendLog(`SYS > Revisando ${response.fileName} (${response.totalRows} filas${response.decimation > 1 ? `, 1 de cada ${response.decimation}` : ""})`);
    } catch (error) {
      pushToast({ title: "No se pudo abrir el archivo", body: String(error?.message || error), tone: "alarm" });
    }
  });

  const exitReplay = useEvent(() => {
    engine.exitReplay();
    setReplayInfo(null);
  });

  // ---------------------------------------------------------------- alarms

  useEffect(() => {
    engine.setAlarmRules(alarmRules);
    setActiveAlarmIds(engine.activeAlarmIds);
  }, [engine, alarmRules]);

  const audioContextRef = useRef(null);
  const lastAlarmNoticeRef = useRef(new Map());

  const playAlarmSound = () => {
    try {
      audioContextRef.current ??= new AudioContext();
      const audio = audioContextRef.current;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.15;
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.35);
    } catch (_error) {
      // Sound is optional.
    }
  };

  const handleAlarmEvents = useEvent((events) => {
    setActiveAlarmIds(engine.activeAlarmIds);
    events.forEach((event) => {
      const rule = alarmRules.find((item) => item.id === event.ruleId);
      if (!rule) {
        return;
      }
      const description = describeAlarm(rule, channelStyles.get(rule.channelId)?.name || rule.channelId);
      if (event.type === "clear") {
        engine.appendLog(`ALM > Normalizada: ${description} (valor ${formatReadout(event.value)})`);
        if (rule.logEvent) {
          appendSessionEvent("alarm_clear", description);
        }
        return;
      }
      engine.appendLog(`ALM > ${description} (valor ${formatReadout(event.value)})`);
      alarmTriggerCountsRef.current.set(rule.id, (alarmTriggerCountsRef.current.get(rule.id) || 0) + 1);
      // A signal hovering around the threshold re-triggers often: notify (and
      // capture) at most once per rule every ALARM_NOTICE_COOLDOWN_MS.
      const now = Date.now();
      const lastNotice = lastAlarmNoticeRef.current.get(rule.id) || 0;
      const inCooldown = now - lastNotice < ALARM_NOTICE_COOLDOWN_MS;
      if (!inCooldown) {
        lastAlarmNoticeRef.current.set(rule.id, now);
      }
      if (rule.notify && !inCooldown) {
        pushToast({ title: "Alarma", body: `${description} · valor ${formatReadout(event.value)}`, tone: "alarm", timeoutMs: 15000 });
        playAlarmSound();
        try {
          new Notification("JW-Serial: alarma", { body: `${description} · valor ${formatReadout(event.value)}`, silent: true });
        } catch (_error) {
          // System notifications are optional.
        }
      }
      if (rule.logEvent) {
        appendSessionEvent("alarm", `${description} · valor ${formatReadout(event.value)}`);
      }
      if (rule.capture && !inCooldown) {
        captureAllPlots({ resetTimer: false, automatic: true });
      }
    });
  });

  useEffect(() => engine.onAlarm(handleAlarmEvents), [engine, handleAlarmEvents]);

  const plotThresholds = useMemo(() =>
    alarmRules
      .filter((rule) => rule.enabled !== false && rule.showOnPlot !== false)
      .map((rule) => ({ channelId: rule.channelId, values: alarmThresholds(rule), active: activeAlarmIds.includes(rule.id) })),
  [alarmRules, activeAlarmIds]);

  // ---------------------------------------------------------------- report

  const generateReport = async ({ title, notes, includePlots, format }) => {
    const history = engine.history;
    const channelsForStats = [...visibleChannels, ...virtualChannels].map((channel) => {
      const values = [];
      history.forEach((sample) => {
        const value = engine.readValue(sample, channel.id);
        if (Number.isFinite(value)) {
          values.push(value);
        }
      });
      const stats = noiseStatistics(values);
      return { name: channel.name, unit: channel.calibration?.unit, ...(stats || { count: 0 }) };
    });
    const images = [];
    if (includePlots) {
      document.documentElement.classList.add("capture-clean");
      try {
        await waitForPaint();
        for (const plot of plots) {
          const element = plotElementsRef.current.get(plot.id);
          if (element) {
            images.push({ title: plot.title, dataUrl: await renderElementToPng(element) });
          }
        }
      } finally {
        document.documentElement.classList.remove("capture-clean");
      }
    }
    const { rxStats } = engine.getSnapshot();
    const html = buildReportHtml({
      title,
      notes,
      label: captureConfig.label,
      generatedAt: Date.now(),
      connection: { port: selectedPort || manualPort, baudRate, sps: rxStats.sps, seqLost: rxStats.seqLost },
      dataRange: { start: history.first()?.timestamp, end: history.last()?.timestamp, samples: history.length },
      channels: channelsForStats,
      alarms: alarmRules.map((rule) => ({
        description: describeAlarm(rule, channelStyles.get(rule.channelId)?.name || rule.channelId),
        triggers: alarmTriggerCountsRef.current.get(rule.id) || 0
      })),
      recordings: recordingsRef.current,
      events: sessionTimelineRef.current,
      images
    });
    try {
      const response = await window.jwSerial.saveReport({
        html,
        format,
        directory: captureConfig.directory,
        label: captureConfig.label,
        useSubfolder: captureConfig.useSubfolder
      });
      if (response?.ok) {
        appendSessionEvent("report", response.filePath);
      }
      return response;
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  };

  // -------------------------------------------------------------- captures

  const resetCaptureTimer = useEvent(() => {
    if (!captureConfig.enabled || !captureConfig.directory || connectionStatus !== "connected") {
      setNextCaptureAt(null);
      return;
    }
    setNextCaptureAt(Date.now() + Math.max(1, Number(captureConfig.intervalMinutes) || 10) * 60 * 1000);
  });

  const captureSinglePlot = async (plot, plotIndex) => {
    const element = plotElementsRef.current.get(plot.id);
    if (!element || !captureConfig.directory) {
      return null;
    }
    const target = {
      title: plot.title,
      plotNumber: plotIndex + 1,
      directory: captureConfig.directory,
      label: captureConfig.label,
      usePrefix: captureConfig.usePrefix,
      useSubfolder: captureConfig.useSubfolder
    };
    const visibleWindowFallback = async () => {
      if (!window.jwSerial?.capturePlot) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return window.jwSerial.capturePlot({ ...target, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
    };

    await waitForPaint();
    try {
      if (!window.jwSerial?.savePlotImage) {
        const fallback = await visibleWindowFallback();
        return fallback?.ok ? fallback : { ok: false, error: "Reinicia JW-Serial para activar las capturas PNG en segundo plano." };
      }
      const dataUrl = await renderElementToPng(element);
      return await window.jwSerial.savePlotImage({ ...target, dataUrl });
    } catch (error) {
      try {
        const fallback = await visibleWindowFallback();
        if (fallback?.ok) {
          return fallback;
        }
      } catch (_fallbackError) {
        // Keep the original error message below.
      }
      return {
        ok: false,
        error: isMissingIpcHandlerError(error)
          ? "Reinicia JW-Serial para activar las capturas PNG en segundo plano."
          : `No se pudo guardar la captura: ${String(error?.message || error)}`
      };
    }
  };

  const captureAllPlots = useEvent(async ({ resetTimer = true, automatic = false } = {}) => {
    if (captureInProgressRef.current) {
      return;
    }
    if (!captureConfig.directory) {
      setCaptureMessage("Elige una carpeta antes de capturar.");
      return;
    }
    captureInProgressRef.current = true;
    const plotsElement = plotsRef.current;
    const previousPlotsScrollTop = plotsElement?.scrollTop ?? 0;
    const previousScroll = [window.scrollX, window.scrollY];
    const results = [];
    try {
      document.documentElement.classList.add("capture-clean");
      await waitForPaint();
      for (const [plotIndex, plot] of plots.entries()) {
        results.push(await captureSinglePlot(plot, plotIndex));
      }
    } finally {
      document.documentElement.classList.remove("capture-clean");
      captureInProgressRef.current = false;
      if (plotsElement) {
        plotsElement.scrollTop = previousPlotsScrollTop;
      }
      window.scrollTo(...previousScroll);
      if (resetTimer) {
        resetCaptureTimer();
      }
    }
    const saved = results.filter((result) => result?.ok).length;
    const firstError = results.find((result) => result && !result.ok)?.error;
    setCaptureMessage(saved > 0
      ? `${automatic ? "Auto: " : ""}${saved} captura(s) guardada(s)`
      : firstError || "No se pudieron guardar capturas.");
    if (saved > 0) {
      appendSessionEvent(automatic ? "auto_capture" : "manual_capture", `${saved} captura(s) guardada(s)`, { captures: saved });
    }
  });

  useEffect(() => {
    resetCaptureTimer();
  }, [captureConfig.enabled, captureConfig.directory, captureConfig.intervalMinutes, connectionStatus, resetCaptureTimer]);

  useEffect(() => {
    if (!nextCaptureAt) {
      return undefined;
    }
    const timeout = window.setTimeout(() => captureAllPlots({ automatic: true }), Math.max(0, nextCaptureAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [nextCaptureAt, captureAllPlots]);

  const chooseCaptureDirectory = async () => {
    try {
      const response = await window.jwSerial?.chooseCaptureDirectory?.();
      if (!response?.ok) {
        setCaptureMessage(response?.canceled ? "Selección cancelada." : "No se pudo elegir carpeta.");
        return;
      }
      updateCaptureConfig({ directory: response.directory });
      setCaptureMessage("Carpeta de capturas configurada.");
    } catch (error) {
      setCaptureMessage(isMissingIpcHandlerError(error)
        ? "Reinicia JW-Serial para activar el selector de carpeta."
        : "No se pudo abrir el selector de carpeta.");
    }
  };

  const openCaptureDirectory = async () => {
    if (!captureConfig.directory) {
      setCaptureMessage("Elige una carpeta antes de abrirla.");
      return;
    }
    try {
      const response = await window.jwSerial?.openCaptureDirectory?.(captureConfig.directory);
      if (!response?.ok) {
        setCaptureMessage(response?.error || "No se pudo abrir la carpeta.");
      }
    } catch (error) {
      setCaptureMessage(isMissingIpcHandlerError(error)
        ? "Reinicia JW-Serial para activar abrir carpeta."
        : "No se pudo abrir la carpeta.");
    }
  };

  const saveEvent = (text, withCapture) => {
    appendSessionEvent("event", text);
    engine.appendLog(`EVT > ${text}`);
    if (withCapture) {
      captureAllPlots();
    }
    setModal(null);
  };

  // ------------------------------------------------------ virtual functions

  const openFunctionBuilder = useEvent((definition = null) => {
    const firstSource = visibleChannels[0]?.id || "val0";
    setFunctionDraft(definition
      ? { ...definition, block: definition.block || createFunctionBlock("rangeAbs", firstSource) }
      : {
          id: `fn-${Date.now()}`,
          name: "Nueva función",
          sourceId: firstSource,
          operation: "rangeAbs",
          block: null,
          expression: "",
          windowUnit: "seconds",
          windowValue: 200,
          color: virtualPalette[virtualFunctions.length % virtualPalette.length],
          lineStyle: "solid",
          thickness: 2,
          enabled: true
        });
    setModal("function");
  });

  const editFunction = useEvent((functionId) => {
    const definition = virtualFunctions.find((item) => item.id === functionId);
    if (definition) {
      openFunctionBuilder(definition);
    }
  });

  const saveFunction = (definition) => {
    setVirtualFunctions((prev) => (prev.some((item) => item.id === definition.id)
      ? prev.map((item) => (item.id === definition.id ? definition : item))
      : [...prev, definition]));
    setFunctionDraft(null);
    setModal(null);
  };

  const deleteFunction = useEvent((functionId) => {
    setVirtualFunctions((prev) => prev.filter((item) => item.id !== functionId));
    const keepTarget = (key) => !key.startsWith(`${functionId}:`);
    setPlots((prev) => prev.map((plot) => ({
      ...plot,
      assignments: plot.assignments.filter((assignment) => assignment.channelId !== functionId),
      statAvgTargets: (plot.statAvgTargets || []).filter(keepTarget),
      statMinTargets: (plot.statMinTargets || []).filter(keepTarget),
      statMaxTargets: (plot.statMaxTargets || []).filter(keepTarget)
    })));
    if (functionDraft?.id === functionId) {
      setFunctionDraft(null);
      setModal(null);
    }
  });

  // ------------------------------------------------------------------ plots

  const updatePlot = useCallback((plotId, updater) => {
    setPlots((prev) => prev.map((plot) => (plot.id === plotId ? updater(plot) : plot)));
  }, []);

  const assignChannelToAxis = useCallback((plotId, channelId, axis) => {
    if (!plotId || !channelId || !axis) {
      return;
    }
    updatePlot(plotId, (plot) => {
      if (plot.assignments.some((item) => item.channelId === channelId && item.axis === axis)) {
        return plot;
      }
      const assignments = axis === "x" ? plot.assignments.filter((item) => item.axis !== "x") : plot.assignments;
      return { ...plot, assignments: [...assignments, { channelId, axis }] };
    });
    setAssignmentPrompt(null);
  }, [updatePlot]);

  const promptAssignment = useEvent((plotId, channelId) => {
    setAssignmentPrompt({ plotId, channelId, channelName: channelStyles.get(channelId)?.name || channelId });
  });

  const registerPlotElement = useCallback((plotId, node) => {
    if (node) {
      plotElementsRef.current.set(plotId, node);
    } else {
      plotElementsRef.current.delete(plotId);
    }
  }, []);

  const openContextMenu = useCallback((event, plotId) => {
    event.preventDefault();
    const menuWidth = 340;
    const menuHeight = Math.min(520, Math.floor(window.innerHeight * 0.78));
    const x = clamp(event.clientX, 8, window.innerWidth - menuWidth - 8);
    const y = event.clientY + menuHeight > window.innerHeight - 8
      ? Math.max(8, event.clientY - menuHeight)
      : clamp(event.clientY, 8, window.innerHeight - menuHeight - 8);
    setContextMenu({ plotId, x, y });
    setVariableMenu(null);
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const openVariableMenu = useCallback((event, channelId) => {
    event.preventDefault();
    const x = clamp(event.clientX, 8, window.innerWidth - 250 - 8);
    const y = clamp(event.clientY, 8, Math.max(8, window.innerHeight - 480));
    setVariableMenu({ channelId, x, y });
    setContextMenu(null);
  }, []);

  const updateChannelStyle = (channel, patch) => {
    if (channel.virtual) {
      setVirtualFunctions((prev) => prev.map((item) => (item.id === channel.id ? { ...item, ...patch } : item)));
    } else {
      setChannels((prev) => prev.map((item) => (item.id === channel.id ? { ...item, ...patch } : item)));
    }
  };

  useEffect(() => {
    if (!contextMenu && !variableMenu) {
      return undefined;
    }
    const close = (event) => {
      if (event.target instanceof Element && event.target.closest("[data-floating-menu]")) {
        return;
      }
      setContextMenu(null);
      setVariableMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu, variableMenu]);

  useEffect(() => {
    // The mouse wheel drives axis zoom inside the plotter, never page scroll.
    const element = plotsRef.current;
    if (activeTab !== "plotter" || !element) {
      return undefined;
    }
    const blockWheelScroll = (event) => event.preventDefault();
    element.addEventListener("wheel", blockWheelScroll, { passive: false });
    return () => element.removeEventListener("wheel", blockWheelScroll);
  }, [activeTab]);

  // ------------------------------------------------------- keyboard shortcuts

  const handleShortcut = useEvent((event) => {
    const target = event.target;
    const isTyping = target instanceof HTMLElement
      && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (event.key === "Escape") {
      setContextMenu(null);
      setVariableMenu(null);
      return;
    }
    if (isTyping || event.ctrlKey || event.metaKey || event.altKey || modal) {
      return;
    }
    const actions = {
      " ": () => setIsPaused((prev) => !prev),
      c: () => captureAllPlots(),
      e: () => setModal("event"),
      1: () => setActiveTab("plotter"),
      2: () => setActiveTab("monitor"),
      3: () => setActiveTab("panel"),
      4: () => setActiveTab("analysis")
    };
    const action = actions[event.key.toLowerCase()];
    if (action) {
      event.preventDefault();
      action();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleShortcut]);

  // ------------------------------------------------------------------ render

  const toggleTheme = useEvent(() => setTheme((prev) => (prev === "dark" ? "light" : "dark")));
  const togglePause = useEvent(() => setIsPaused((prev) => !prev));
  const openModal = useEvent((name) => {
    setConfigMessage("");
    setModal(name);
  });
  const closeModal = () => {
    setFunctionDraft(null);
    setModal(null);
  };
  const newFunction = useEvent(() => openFunctionBuilder());

  const variableMenuChannel = variableMenu ? channelStyles.get(variableMenu.channelId) : null;

  return (
    <div className="app">
      <Sidebar
        engine={engine}
        theme={theme}
        onToggleTheme={toggleTheme}
        isPaused={isPaused}
        connectionStatus={connectionStatus}
        ports={ports}
        selectedPort={selectedPort}
        onSelectPort={setSelectedPort}
        manualPort={manualPort}
        onManualPortChange={setManualPort}
        baudRate={baudRate}
        onBaudRateChange={setBaudRate}
        onRefreshPorts={refreshPorts}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        channels={visibleChannels}
        virtualChannels={virtualChannels}
        onNewFunction={newFunction}
        onEditFunction={editFunction}
        onOpenVariableMenu={openVariableMenu}
        onOpenModal={openModal}
        onTogglePause={togglePause}
        onClear={clearBuffer}
        onExportCsv={exportCsv}
        captureConfig={captureConfig}
        nextCaptureAt={nextCaptureAt}
        onCapture={captureAllPlots}
        captureMessage={captureMessage}
        recording={recording}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onOpenRecording={openRecording}
        isReplay={Boolean(replayInfo)}
        alarmCount={alarmRules.filter((rule) => rule.enabled !== false).length}
        activeAlarmCount={activeAlarmIds.length}
      />

      <main className="main">
        <div className="main__toolbar">
          <div className="tabs">
            <button type="button" className={`tab ${activeTab === "plotter" ? "tab--active" : ""}`} onClick={() => setActiveTab("plotter")} title="Atajo: 1">
              Plotter
            </button>
            <button type="button" className={`tab ${activeTab === "monitor" ? "tab--active" : ""}`} onClick={() => setActiveTab("monitor")} title="Atajo: 2">
              Monitor
            </button>
            <button type="button" className={`tab ${activeTab === "panel" ? "tab--active" : ""}`} onClick={() => setActiveTab("panel")} title="Atajo: 3">
              Panel
            </button>
            <button type="button" className={`tab ${activeTab === "analysis" ? "tab--active" : ""}`} onClick={() => setActiveTab("analysis")} title="Atajo: 4">
              Análisis
            </button>
          </div>
          {replayInfo ? (
            <div className="replay-banner">
              <span>
                Revisando <strong>{replayInfo.fileName}</strong> · {replayInfo.totalRows.toLocaleString("es")} filas
                {replayInfo.decimation > 1 ? ` (se muestra 1 de cada ${replayInfo.decimation})` : ""}
              </span>
              <button type="button" onClick={exitReplay}>Salir de revisión</button>
            </div>
          ) : null}
          <div className="plot-actions">
            <button type="button" onClick={() => setPlots((prev) => [...prev, createPlot(prev.length + 1)])}>
              Add Plot
            </button>
            <button type="button" onClick={() => setPlots((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}>
              Remove Plot
            </button>
          </div>
        </div>

        {activeTab === "plotter" ? (
          <div ref={plotsRef} className="plots">
            {plots.map((plot) => (
              <Plot
                key={plot.id}
                plot={plot}
                engine={engine}
                styles={channelStyles}
                channels={allChannels}
                theme={theme}
                plotMode={basicConfig.plotMode}
                includeTimestamp={basicConfig.includeTimestamp}
                refreshMs={basicConfig.refreshMs}
                contextMenu={contextMenu?.plotId === plot.id ? contextMenu : null}
                onChange={updatePlot}
                onOpenContextMenu={openContextMenu}
                onCloseContextMenu={closeContextMenu}
                onDropPrompt={promptAssignment}
                onAssign={assignChannelToAxis}
                onOpenVariableMenu={openVariableMenu}
                registerElement={registerPlotElement}
                thresholds={plotThresholds}
              />
            ))}
          </div>
        ) : activeTab === "monitor" ? (
          <Monitor
            engine={engine}
            terminator={terminator}
            onTerminatorChange={setTerminator}
            commands={quickCommands}
            onEditCommands={() => setModal("commands")}
          />
        ) : activeTab === "panel" ? (
          <ValuePanel engine={engine} channels={allChannels} selectedIds={panelChannels} onSelectionChange={setPanelChannels} />
        ) : (
          <AnalysisView engine={engine} channels={allChannels} settings={analysisSettings} onSettingsChange={setAnalysisSettings} theme={theme} />
        )}
      </main>

      {modal === "config" ? (
        <ConfigModal
          onClose={closeModal}
          basicConfig={basicConfig}
          onApplyBasic={applyBasicConfig}
          onUpdateBasic={(patch) => setBasicConfig((prev) => ({ ...prev, ...patch }))}
          advancedConfig={advancedConfig}
          onUpdateAdvanced={(patch) => setAdvancedConfig((prev) => ({ ...prev, ...patch }))}
          appSettings={appSettings}
          onUpdateAppSettings={updateAppSettings}
          onApplyProfile={applyEsp32Profile}
          buildSnapshot={buildConfigSnapshot}
          applySnapshot={applyConfigSnapshot}
          message={configMessage}
        />
      ) : null}
      {modal === "captures" ? (
        <CapturesModal
          onClose={closeModal}
          captureConfig={captureConfig}
          onUpdate={updateCaptureConfig}
          onChooseDirectory={chooseCaptureDirectory}
          onOpenDirectory={openCaptureDirectory}
          onCaptureNow={captureAllPlots}
          message={captureMessage}
        />
      ) : null}
      {modal === "event" ? <EventModal onClose={closeModal} onSave={saveEvent} /> : null}
      {modal === "save" || modal === "load" ? (
        <ConfigFileModal
          mode={modal}
          onClose={closeModal}
          initialText={JSON.stringify(buildConfigSnapshot(), null, 2)}
          onSaveFile={saveConfigFile}
          onLoadFile={loadConfigFile}
          onApplyText={applyConfigText}
          message={configMessage}
        />
      ) : null}
      {modal === "function" && functionDraft ? (
        <FunctionBuilderModal
          initialDraft={functionDraft}
          sourceChannels={visibleChannels}
          isExisting={virtualFunctions.some((item) => item.id === functionDraft.id)}
          width={functionModalWidth}
          onWidthChange={setFunctionModalWidth}
          onSave={saveFunction}
          onDelete={deleteFunction}
          onClose={closeModal}
        />
      ) : null}

      {modal === "alarms" ? (
        <AlarmsModal
          rules={alarmRules}
          channels={allChannels}
          activeIds={activeAlarmIds}
          onChange={setAlarmRules}
          onClose={closeModal}
        />
      ) : null}
      {modal === "report" ? (
        <ReportModal
          defaultTitle={`Reporte de prueba${captureConfig.label ? ` · ${captureConfig.label}` : ""}`}
          hasDirectory={Boolean(captureConfig.directory)}
          onGenerate={generateReport}
          onClose={closeModal}
        />
      ) : null}
      {modal === "commands" ? <CommandsModal commands={quickCommands} onChange={setQuickCommands} onClose={closeModal} /> : null}
      <Toasts toasts={toasts} onDismiss={dismissToast} />

      {startupRestorePrompt ? <StartupRestorePrompt onLoad={loadLastSession} onFresh={startEmptySession} /> : null}
      {connectIdentifierPrompt !== null ? (
        <ConnectIdentifierPrompt
          value={connectIdentifierPrompt}
          placeholder={captureConfig.label}
          onChange={setConnectIdentifierPrompt}
          onCancel={() => setConnectIdentifierPrompt(null)}
          onConfirm={confirmConnectIdentifier}
        />
      ) : null}
      {assignmentPrompt ? (
        <AssignmentPrompt
          channelName={assignmentPrompt.channelName}
          onAssign={(axis) => assignChannelToAxis(assignmentPrompt.plotId, assignmentPrompt.channelId, axis)}
          onClose={() => setAssignmentPrompt(null)}
        />
      ) : null}
      {variableMenu ? (
        <VariableMenu
          position={variableMenu}
          channel={variableMenuChannel}
          onUpdate={updateChannelStyle}
          onEditFunction={(functionId) => {
            setVariableMenu(null);
            editFunction(functionId);
          }}
          onDeleteFunction={(functionId) => {
            deleteFunction(functionId);
            setVariableMenu(null);
          }}
          onClose={() => setVariableMenu(null)}
        />
      ) : null}
    </div>
  );
}
