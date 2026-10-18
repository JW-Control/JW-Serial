import React, { useEffect, useState } from "react";

const formatElapsed = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
};

/** Start/stop recording button showing elapsed time and rows written. */
const RecordButton = ({ engine, recording, onStart, onStop, disabled }) => {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  if (!recording) {
    return (
      <button type="button" className="record-button" onClick={onStart} disabled={disabled} title="Graba todas las muestras en un CSV dentro de la carpeta de capturas">
        <span className="record-button__dot" /> Grabar datos
      </button>
    );
  }
  return (
    <button type="button" className="record-button record-button--active" onClick={onStop} title={recording.filePath}>
      <span className="record-button__dot" /> Detener · {formatElapsed(Date.now() - recording.startedAt)} · {engine.recordedRows.toLocaleString("es")} filas
    </button>
  );
};

export default RecordButton;
