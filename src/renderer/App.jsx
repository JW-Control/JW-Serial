import React, { useEffect, useMemo, useRef, useState } from "react";

const createDefaultChannels = (count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `val${index}`,
    name: `val${index}`,
    color: `hsl(${index * 32} 70% 50%)`,
    value: 0
  }));

const createPlot = (index) => ({
  id: `plot-${index}`,
  title: `Plot ${index}`,
  assignments: []
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

const buildPath = (points) =>
  points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");

const buildSeries = (samples, xValues, index, minY, maxY, height, width) => {
  if (samples.length <= 1 || maxY - minY === 0) {
    return "";
  }

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const spreadX = maxX - minX || 1;

  const points = samples.map((sample, sampleIndex) => {
    const value = sample.values[index] ?? 0;
    const normalizedX = (xValues[sampleIndex] - minX) / spreadX;
    const normalizedY = (value - minY) / (maxY - minY || 1);
    return {
      x: normalizedX * width,
      y: height - normalizedY * height
    };
  });

  return buildPath(points);
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
      channelId: visibleChannels[0]?.id || "val0",
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

  const addPlot = () => {
    setPlots((prev) => [...prev, createPlot(prev.length + 1)]);
  };

  const removePlot = () => {
    setPlots((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const addAssignment = (plotId) => {
    const draft = getDraft(plotId);
    if (!draft.channelId) {
      return;
    }
    const key = `${draft.channelId}:${draft.axis}`;

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
          assignments: [...plot.assignments, { channelId: draft.channelId, axis: draft.axis }]
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
  };

  const clearAssignments = (plotId) => {
    setPlots((prev) =>
      prev.map((plot) => (plot.id === plotId ? { ...plot, assignments: [] } : plot))
    );
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

      const incomingValues = frame.includeTimestamp
        ? frame.values.slice(1)
        : frame.values;
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

  const renderPlot = (plot) => {
    const samples = historyRef.current.slice(-600);
    const width = 1000;
    const height = 260;

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

    const lines = yAssignments
      .map((assignment) => {
        const idx = channelIndex(assignment.channelId);
        const stats = axisStats[assignment.axis];
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
          width
        );
        if (!path) {
          return null;
        }

        const channel = channels[idx];
        return (
          <path
            key={`${assignment.channelId}-${assignment.axis}`}
            d={path}
            fill="none"
            stroke={channel?.color || "#2563eb"}
            strokeWidth={assignment.axis === "y2" ? 1.5 : 2}
            strokeDasharray={assignment.axis === "y2" ? "6 4" : ""}
            opacity="0.95"
          />
        );
      })
      .filter(Boolean);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
        {lines}
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
                <div className="channel-row" key={channel.id}>
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
          <div className="plots" data-version={dataVersion}>
            {plots.map((plot) => {
              const draft = getDraft(plot.id);
              const assignmentOptions = plot.assignments.map(
                (item) => `${item.channelId}:${item.axis}`
              );
              return (
                <section className="plot" key={plot.id}>
                  <header className="plot__header">
                    <h3>{plot.title}</h3>
                    <div className="plot__legend">
                      {plot.assignments.length === 0
                        ? "Sin canales"
                        : plot.assignments
                            .map((item) => `${item.channelId.toUpperCase()}→${item.axis.toUpperCase()}`)
                            .join(" | ")}
                    </div>
                  </header>

                  <div className="plot__controls">
                    <select
                      value={draft.channelId}
                      onChange={(event) => setDraft(plot.id, { channelId: event.target.value })}
                    >
                      {visibleChannels.map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          {channel.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={draft.axis}
                      onChange={(event) => setDraft(plot.id, { axis: event.target.value })}
                    >
                      <option value="x">X</option>
                      <option value="y1">Y1</option>
                      <option value="y2">Y2</option>
                    </select>
                    <button type="button" onClick={() => addAssignment(plot.id)}>
                      Add channel
                    </button>
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
                    <button type="button" onClick={() => removeAssignment(plot.id)}>
                      Remove
                    </button>
                    <button type="button" onClick={() => clearAssignments(plot.id)}>
                      Remove all
                    </button>
                  </div>

                  <div className="plot__canvas">{renderPlot(plot)}</div>
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
    </div>
  );
}
