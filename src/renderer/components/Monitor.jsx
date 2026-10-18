import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot.js";

const terminatorSuffix = {
  none: "",
  nl: "\n",
  cr: "\r",
  nlcr: "\n\r"
};

const pad = (value, length = 2) => String(value).padStart(length, "0");

export const formatLogTime = (time) => {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

const Monitor = ({ engine, terminator, onTerminatorChange }) => {
  const { log } = useEngineSnapshot(engine);
  const [message, setMessage] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTime, setShowTime] = useState(true);
  const [frozenLog, setFrozenLog] = useState(null);
  const [search, setSearch] = useState("");
  const logRef = useRef(null);

  const visibleLog = frozenLog || log;
  const query = search.trim().toLowerCase();
  const lines = query ? visibleLog.filter((entry) => entry.text.toLowerCase().includes(query)) : visibleLog;

  useLayoutEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Scrolling up by hand stops autoscroll; reaching the bottom resumes it.
  const handleScroll = () => {
    const element = logRef.current;
    if (!element) {
      return;
    }
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 24;
    if (atBottom !== autoScroll) {
      setAutoScroll(atBottom);
    }
  };

  useEffect(() => {
    if (!log.length) {
      setFrozenLog((prev) => (prev ? [] : prev));
    }
  }, [log.length]);

  const send = async () => {
    if (!message.trim()) {
      return;
    }
    const response = await window.jwSerial?.sendMessage?.(`${message}${terminatorSuffix[terminator] ?? ""}`);
    if (response?.ok) {
      engine.appendLog(`TX > ${message}`);
      setMessage("");
    } else {
      engine.appendLog(`SYS > No se pudo enviar: ${response?.error || "puerto no disponible"}`);
    }
  };

  return (
    <div className="monitor">
      <div className="monitor__toolbar">
        <input
          type="search"
          className="monitor__search"
          placeholder="Buscar en el monitor..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="checkbox-row">
          <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} />
          Autoscroll
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={showTime} onChange={(event) => setShowTime(event.target.checked)} />
          Hora
        </label>
        <button type="button" onClick={() => setFrozenLog(frozenLog ? null : log)}>
          {frozenLog ? "Reanudar vista" : "Pausar vista"}
        </button>
        <button type="button" onClick={() => engine.clearLog()}>
          Limpiar monitor
        </button>
        <span className="monitor__count">
          {query ? `${lines.length} de ${visibleLog.length}` : `${visibleLog.length} líneas`}
        </span>
      </div>
      <div className="monitor__log" ref={logRef} onScroll={handleScroll}>
        {lines.length === 0 ? (
          <p className="monitor__placeholder">
            {query ? "Sin coincidencias." : "Aquí se verá el monitor serial."}
          </p>
        ) : (
          lines.map((entry) => (
            <p key={entry.id} className="monitor__line">
              {showTime ? <span className="monitor__time">{formatLogTime(entry.time)}</span> : null}
              {entry.text}
            </p>
          ))
        )}
      </div>
      <div className="monitor__controls">
        <input
          type="text"
          placeholder="Escribe un mensaje..."
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              send();
            }
          }}
        />
        <select value={terminator} onChange={(event) => onTerminatorChange(event.target.value)}>
          <option value="none">Sin ajuste</option>
          <option value="nl">Nueva línea (NL)</option>
          <option value="cr">Retorno de carro (CR)</option>
          <option value="nlcr">NL &amp; CR</option>
        </select>
        <button type="button" onClick={send}>
          Enviar
        </button>
      </div>
    </div>
  );
};

export default Monitor;
