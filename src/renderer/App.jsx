import React, { useEffect, useMemo, useState } from "react";

const defaultChannels = Array.from({ length: 10 }, (_, index) => ({
  id: `val${index}`,
  name: `val${index}`,
  color: `hsl(${index * 32} 70% 50%)`,
  value: 0
}));

const defaultPlots = [
  {
    id: "plot-1",
    title: "Plot 1",
    channels: ["val0", "val1"]
  },
  {
    id: "plot-2",
    title: "Plot 2",
    channels: ["val2", "val3"]
  }
];

export default function App() {
  const [plots, setPlots] = useState(defaultPlots);
  const channels = useMemo(() => defaultChannels, []);
  const [activeTab, setActiveTab] = useState("plotter");
  const [modal, setModal] = useState(null);
  const [terminator, setTerminator] = useState("none");
  const [monitorMessage, setMonitorMessage] = useState("");
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [baudRate, setBaudRate] = useState(115200);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [isPaused, setIsPaused] = useState(false);
  const [configText, setConfigText] = useState("");
  const [configMessage, setConfigMessage] = useState("");
  const [basicConfig, setBasicConfig] = useState({
    channelCount: 0,
    samplesPerSecond: 80,
    periodMs: 12.5,
    bufferSeconds: 36000,
    refreshMs: 100,
    plotMode: "normal",
    includeTimestamp: false
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
    selectedPort
  });

  const addPlot = () => {
    setPlots((prev) => [
      ...prev,
      {
        id: `plot-${prev.length + 1}`,
        title: `Plot ${prev.length + 1}`,
        channels: []
      }
    ]);
  };

  const removePlot = () => {
    setPlots((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handleAction = (action) => {
    setModal(action);
  };

  const closeModal = () => {
    setModal(null);
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
      setConfigMessage("Configuración aplicada.");
    } catch (error) {
      setConfigMessage("JSON inválido. Revisa el formato.");
    }
  };

  const handleSend = () => {
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
    window.jwSerial?.sendMessage?.(`${monitorMessage}${suffix}`);
    setMonitorMessage("");
  };

  const updateBasicConfig = (key, value) => {
    setBasicConfig((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const updateAdvancedConfig = (key, value) => {
    setAdvancedConfig((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSamplesChange = (value) => {
    const samplesPerSecond = Number(value);
    if (Number.isNaN(samplesPerSecond) || samplesPerSecond <= 0) {
      updateBasicConfig("samplesPerSecond", 0);
      return;
    }
    updateBasicConfig("samplesPerSecond", samplesPerSecond);
    updateBasicConfig("periodMs", Number((1000 / samplesPerSecond).toFixed(2)));
  };

  const handlePeriodChange = (value) => {
    const periodMs = Number(value);
    if (Number.isNaN(periodMs) || periodMs <= 0) {
      updateBasicConfig("periodMs", 0);
      return;
    }
    updateBasicConfig("periodMs", periodMs);
    updateBasicConfig(
      "samplesPerSecond",
      Number((1000 / periodMs).toFixed(2))
    );
  };

  const refreshPorts = async () => {
    if (!window.jwSerial?.listPorts) {
      setPorts([]);
      return;
    }
    try {
      const nextPorts = await window.jwSerial.listPorts();
      setPorts(nextPorts);
      if (!selectedPort && nextPorts.length > 0) {
        setSelectedPort(nextPorts[0].path);
      }
    } catch (error) {
      setPorts([]);
    }
  };

  const handleConnect = async () => {
    if (!window.jwSerial?.openPort || !selectedPort) {
      return;
    }
    try {
      setConnectionStatus("connecting");
      await window.jwSerial.openPort({
        path: selectedPort,
        baudRate,
        dataBits: advancedConfig.dataBits,
        parity: advancedConfig.parity,
        stopBits: advancedConfig.stopBits
      });
      setConnectionStatus("connected");
    } catch (error) {
      setConnectionStatus("error");
    }
  };

  const handleDisconnect = async () => {
    if (!window.jwSerial?.closePort) {
      return;
    }
    await window.jwSerial.closePort();
    setConnectionStatus("disconnected");
  };

  useEffect(() => {
    refreshPorts();
  }, []);

  useEffect(() => {
    if (modal === "save" || modal === "load") {
      setConfigText(JSON.stringify(buildConfigSnapshot(), null, 2));
      setConfigMessage("");
    }
  }, [modal]);

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
            <label className="field">
              Baudrate
              <select
                value={baudRate}
                onChange={(event) => setBaudRate(Number(event.target.value))}
              >
                <option value={9600}>9600</option>
                <option value={115200}>115200</option>
                <option value={230400}>230400</option>
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
            <p className="connection-status">
              Estado: {connectionStatus}
            </p>
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
                  <span className="channel-value">
                    {channel.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="sidebar__section">
            <h2>Acciones</h2>
            <div className="actions">
              <button type="button" onClick={() => handleAction("basic")}>
                Configuración básica
              </button>
              <button type="button" onClick={() => handleAction("advanced")}>
                Configuración avanzada
              </button>
              <button
                type="button"
                onClick={() => setIsPaused((prev) => !prev)}
              >
                {isPaused ? "Reanudar" : "Pausar"}
              </button>
              <button type="button" onClick={() => handleAction("clear")}>
                Limpiar buffer
              </button>
              <button type="button" onClick={() => handleAction("export")}>
                Exportar CSV
              </button>
              <button type="button" onClick={() => handleAction("save")}>
                Guardar configuración
              </button>
              <button type="button" onClick={() => handleAction("load")}>
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
          <div className="plots">
            {plots.map((plot) => (
              <section className="plot" key={plot.id}>
                <header className="plot__header">
                  <h3>{plot.title}</h3>
                  <div className="plot__legend">
                    {plot.channels.length === 0
                      ? "Sin canales"
                      : plot.channels.join(", ")}
                  </div>
                </header>
                <div className="plot__canvas">
                  <span>Área de gráfico (uPlot)</span>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="monitor">
            <div className="monitor__log">
              <p className="monitor__placeholder">
                Aquí se verá el monitor serial.
              </p>
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
                {modal === "pause" && "Pausar"}
                {modal === "clear" && "Limpiar buffer"}
                {modal === "export" && "Exportar CSV"}
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
                        updateBasicConfig(
                          "channelCount",
                          Number(event.target.value)
                        )
                      }
                    />
                  </label>
                  <label>
                    SPS (muestras/seg)
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.samplesPerSecond}
                      onChange={(event) =>
                        handleSamplesChange(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Periodo (ms)
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      value={basicConfig.periodMs}
                      onChange={(event) =>
                        handlePeriodChange(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Buffer (segundos)
                    <input
                      type="number"
                      min="1"
                      value={basicConfig.bufferSeconds}
                      onChange={(event) =>
                        updateBasicConfig(
                          "bufferSeconds",
                          Number(event.target.value)
                        )
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
                        updateBasicConfig(
                          "refreshMs",
                          Number(event.target.value)
                        )
                      }
                    />
                  </label>
                  <label>
                    Modo de ploteo
                    <select
                      value={basicConfig.plotMode}
                      onChange={(event) =>
                        updateBasicConfig("plotMode", event.target.value)
                      }
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
                        updateBasicConfig(
                          "includeTimestamp",
                          event.target.checked
                        )
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
                        updateAdvancedConfig(
                          "dataBits",
                          Number(event.target.value)
                        )
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
                        updateAdvancedConfig(
                          "stopBits",
                          Number(event.target.value)
                        )
                      }
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </label>
                </div>
              ) : null}
              {modal === "clear" ? (
                <p>El buffer se vaciará cuando conectemos el backend.</p>
              ) : null}
              {modal === "export" ? (
                <p>Exportación CSV pendiente de los datos reales.</p>
              ) : null}
              {modal === "save" ? (
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
                    <button type="button" onClick={handleSaveConfig}>
                      Guardar local
                    </button>
                    <button type="button" onClick={applyConfigText}>
                      Aplicar JSON
                    </button>
                  </div>
                  {configMessage ? (
                    <p className="modal__hint">{configMessage}</p>
                  ) : null}
                </div>
              ) : null}
              {modal === "load" ? (
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
                    <button type="button" onClick={handleLoadConfig}>
                      Cargar local
                    </button>
                    <button type="button" onClick={applyConfigText}>
                      Aplicar JSON
                    </button>
                  </div>
                  {configMessage ? (
                    <p className="modal__hint">{configMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
