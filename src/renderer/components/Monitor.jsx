import React, { useState } from "react";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot.js";

const terminatorSuffix = {
  none: "",
  nl: "\n",
  cr: "\r",
  nlcr: "\n\r"
};

const Monitor = ({ engine, terminator, onTerminatorChange }) => {
  const { log } = useEngineSnapshot(engine);
  const [message, setMessage] = useState("");

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
      <div className="monitor__log">
        {log.length === 0 ? (
          <p className="monitor__placeholder">Aquí se verá el monitor serial.</p>
        ) : (
          log.map((line, index) => (
            <p key={`${index}-${line}`} className="monitor__line">
              {line}
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
