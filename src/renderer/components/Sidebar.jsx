import React from "react";
import { commonBaudRates } from "../constants.js";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot.js";
import CaptureButton from "./CaptureButton.jsx";
import { liveChannelValue, startChannelDrag } from "./channelDrag.js";

const statusLabel = (isPaused, connectionStatus) => {
  if (isPaused) {
    return "Pausado";
  }
  if (connectionStatus === "connected") {
    return "Capturando";
  }
  if (connectionStatus === "connecting") {
    return "Conectando";
  }
  return connectionStatus === "error" ? "Error" : "Desconectado";
};

const formatMs = (value) => (Number.isFinite(value) ? `${value < 10 ? value.toFixed(2) : value.toFixed(1)} ms` : "—");

/** Live link metrics; the only part of the sidebar that updates with data. */
const RxStats = ({ engine }) => {
  const { rxStats, fps } = useEngineSnapshot(engine);
  const period = rxStats.devicePeriodMs ?? (rxStats.avgMs || null);
  return (
    <div className="rx-stats">
      <span title="Muestras por segundo medidas por el software (últimos 5 s)">{rxStats.sps.toFixed(1)} SPS</span>
      <span title="Cuadros por segundo dibujados en el plotter">{fps.toFixed(1)} FPS</span>
      <span title={rxStats.devicePeriodMs !== null ? "Periodo según el timestamp del dispositivo" : "Periodo según la llegada al PC"}>
        {formatMs(period)} periodo
      </span>
      <span title={rxStats.jitterMs !== null ? "Desviación estándar del periodo según el timestamp del dispositivo" : "Activa 'Incluye timestamp' para medir el jitter real del dispositivo"}>
        {formatMs(rxStats.jitterMs)} jitter
      </span>
      <span>{Number(rxStats.seqLost || 0)} Perdidos</span>
      <span>{Number(rxStats.seqGaps || 0)} Huecos seq</span>
      <span>{Number(rxStats.seqLast ?? 0)} Último seq</span>
    </div>
  );
};

const ChannelRows = ({ engine, channels, virtual, onClick, onContextMenu }) => {
  const snapshot = useEngineSnapshot(engine);
  return channels.map((channel) => (
    <div
      className={`channel-row ${virtual ? "channel-row--virtual" : ""}`}
      key={channel.id}
      draggable
      onDragStart={(event) => startChannelDrag(event, channel.id)}
      onClick={onClick ? () => onClick(channel.id) : undefined}
      onContextMenu={(event) => onContextMenu(event, channel.id)}
      title={channel.error ? `Error: ${channel.error}` : undefined}
    >
      <span className="channel-color" style={{ backgroundColor: channel.color }} />
      <span className="channel-name">{channel.name}</span>
      <span className="channel-value">{channel.error ? "error" : liveChannelValue(snapshot, channel).toFixed(2)}</span>
    </div>
  ));
};

const Sidebar = ({
  engine,
  theme,
  onToggleTheme,
  isPaused,
  connectionStatus,
  ports,
  selectedPort,
  onSelectPort,
  manualPort,
  onManualPortChange,
  baudRate,
  onBaudRateChange,
  onRefreshPorts,
  onConnect,
  onDisconnect,
  channels,
  virtualChannels,
  onNewFunction,
  onEditFunction,
  onOpenVariableMenu,
  onOpenModal,
  onTogglePause,
  onClear,
  onExportCsv,
  captureConfig,
  nextCaptureAt,
  onCapture,
  captureMessage
}) => {
  const statusTone = isPaused
    ? "paused"
    : connectionStatus === "connected"
      ? "connected"
      : connectionStatus === "error"
        ? "error"
        : "disconnected";

  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <div className="sidebar__brand">
          <div>
            <h1>JW-Serial</h1>
            <div className="sidebar__status">
              <span className={`status-dot status-dot--${statusTone}`} />
              <span>{statusLabel(isPaused, connectionStatus)}</span>
            </div>
            <p>MVP · Windows</p>
          </div>
          <button
            type="button"
            className={`theme-toggle theme-toggle--${theme}`}
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
          >
            <span className="theme-toggle__scene" aria-hidden="true">
              <span className="theme-toggle__sun" />
              <span className="theme-toggle__moon" />
              <span className="theme-toggle__cloud theme-toggle__cloud--one" />
              <span className="theme-toggle__cloud theme-toggle__cloud--two" />
              <span className="theme-toggle__star theme-toggle__star--one" />
              <span className="theme-toggle__star theme-toggle__star--two" />
              <span className="theme-toggle__star theme-toggle__star--three" />
            </span>
          </button>
        </div>
      </header>

      <div className="sidebar__content">
        <section className="sidebar__section">
          <h2>Conexión</h2>
          <label className="field">
            Puerto
            <select value={selectedPort} onChange={(event) => onSelectPort(event.target.value)}>
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
                onChange={(event) => onManualPortChange(event.target.value)}
                placeholder="COM7"
              />
            </label>
          ) : null}
          <label className="field">
            Baudrate
            <select value={baudRate} onChange={(event) => onBaudRateChange(Number(event.target.value))}>
              {commonBaudRates.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}
                </option>
              ))}
            </select>
          </label>
          <div className="connection-actions">
            <button type="button" onClick={onRefreshPorts}>
              Refrescar
            </button>
            {connectionStatus === "connected" ? (
              <button type="button" onClick={onDisconnect}>
                Desconectar
              </button>
            ) : (
              <button type="button" onClick={onConnect} disabled={connectionStatus === "connecting"}>
                Conectar
              </button>
            )}
          </div>
          <RxStats engine={engine} />
        </section>

        <section className="sidebar__section">
          <h2>Variables</h2>
          <div className="channel-table">
            <ChannelRows engine={engine} channels={channels} onContextMenu={onOpenVariableMenu} />
          </div>
        </section>

        <section className="sidebar__section">
          <div className="sidebar__section-title">
            <h2>Funciones</h2>
            <button type="button" onClick={onNewFunction}>
              Nueva
            </button>
          </div>
          <div className="channel-table">
            {virtualChannels.length === 0 ? (
              <p className="connection-status">Sin funciones virtuales.</p>
            ) : (
              <ChannelRows
                engine={engine}
                channels={virtualChannels}
                virtual
                onClick={onEditFunction}
                onContextMenu={onOpenVariableMenu}
              />
            )}
          </div>
        </section>

        <section className="sidebar__section">
          <h2>Acciones</h2>
          <div className="actions">
            <button type="button" onClick={() => onOpenModal("config")}>
              Configuración
            </button>
            <div className="actions__row actions__row--triple">
              <button type="button" onClick={onTogglePause}>
                {isPaused ? "Reanudar" : "Pausar"}
              </button>
              <button type="button" onClick={onClear}>
                Limpiar
              </button>
              <button type="button" onClick={onExportCsv}>
                CSV
              </button>
            </div>
            <button type="button" onClick={() => onOpenModal("event")}>
              Evento
            </button>
            <div className="actions__row actions__row--capture">
              <CaptureButton
                captureConfig={captureConfig}
                isConnected={connectionStatus === "connected"}
                nextCaptureAt={nextCaptureAt}
                onCapture={onCapture}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => onOpenModal("captures")}
                aria-label="Configurar capturas"
                title="Configurar capturas"
              >
                ?
              </button>
            </div>
            <div className="actions__row actions__row--split">
              <button type="button" onClick={() => onOpenModal("save")}>
                Guardar conf.
              </button>
              <button type="button" onClick={() => onOpenModal("load")}>
                Cargar conf.
              </button>
            </div>
          </div>
          {captureMessage ? <p className="connection-status">{captureMessage}</p> : null}
        </section>
      </div>
    </aside>
  );
};

export default React.memo(Sidebar);
