import React, { useState } from "react";
import Modal from "./Modal.jsx";

const ReportModal = ({ defaultTitle, hasDirectory, onGenerate, onClose }) => {
  const [title, setTitle] = useState(defaultTitle);
  const [notes, setNotes] = useState("");
  const [includePlots, setIncludePlots] = useState(true);
  const [format, setFormat] = useState("pdf");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const generate = async () => {
    setBusy(true);
    setMessage("Generando reporte...");
    const result = await onGenerate({ title, notes, includePlots, format });
    setBusy(false);
    setMessage(result?.ok ? `Reporte guardado en ${result.filePath}` : result?.error || (result?.canceled ? "Cancelado." : "No se pudo generar el reporte."));
  };

  return (
    <Modal title="Reporte de sesión" onClose={onClose}>
      <div className="modal__form">
        <label>
          Título
          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="modal__field--textarea">
          Notas (resultado, observaciones, firma...)
          <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={includePlots} onChange={(event) => setIncludePlots(event.target.checked)} />
          Incluir imágenes de los plots
        </label>
        <label>
          Formato
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="pdf">PDF</option>
            <option value="html">HTML</option>
          </select>
        </label>
        <p className="modal__hint">
          Incluye datos del lote y la conexión, estadísticas de cada señal sobre los datos en memoria, alarmas,
          grabaciones y eventos de la sesión. {hasDirectory ? "Se guarda en la carpeta de capturas." : "Se te pedirá dónde guardarlo."}
        </p>
        <div className="modal__actions">
          <button type="button" className="button-primary" onClick={generate} disabled={busy}>Generar reporte</button>
        </div>
        {message ? <p className="modal__hint">{message}</p> : null}
      </div>
    </Modal>
  );
};

export default ReportModal;
