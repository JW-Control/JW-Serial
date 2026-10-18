import React, { useState } from "react";
import Modal, { ConfirmDialog } from "./Modal.jsx";

const StateToggle = ({ label, enabled, onToggle }) => (
  <div className="modal__field">
    <span>{label}</span>
    <button
      type="button"
      className={`state-toggle ${enabled ? "state-toggle--enabled" : "state-toggle--disabled"}`}
      onClick={onToggle}
    >
      {enabled ? "Activado" : "Desactivado"}
    </button>
  </div>
);

export const CapturesModal = ({ onClose, captureConfig, onUpdate, onChooseDirectory, onOpenDirectory, onCaptureNow, message }) => (
  <Modal title="Capturas" onClose={onClose}>
    <div className="modal__form modal__form--compact">
      <StateToggle label="Capturas automáticas" enabled={captureConfig.enabled} onToggle={() => onUpdate({ enabled: !captureConfig.enabled })} />
      <label>
        Intervalo de capturas (min)
        <input
          type="number"
          min="1"
          value={captureConfig.intervalMinutes}
          onChange={(event) => onUpdate({ intervalMinutes: Math.max(1, Number(event.target.value) || 10) })}
        />
      </label>
      <label>
        Identificador de tarjeta/lote
        <input
          type="text"
          value={captureConfig.label}
          placeholder="PCB_10115"
          onChange={(event) => onUpdate({ label: event.target.value })}
        />
      </label>
      <StateToggle label="Usar como prefijo" enabled={captureConfig.usePrefix} onToggle={() => onUpdate({ usePrefix: !captureConfig.usePrefix })} />
      <StateToggle label="Guardar en subcarpeta" enabled={captureConfig.useSubfolder} onToggle={() => onUpdate({ useSubfolder: !captureConfig.useSubfolder })} />
      <div className="modal__actions modal__actions--spaced">
        <button type="button" onClick={onChooseDirectory}>Elegir carpeta</button>
        <button type="button" onClick={onOpenDirectory}>Abrir carpeta</button>
        <button type="button" onClick={() => onCaptureNow()}>Capturar ahora</button>
      </div>
      <p className="modal__hint">
        {captureConfig.directory ? "Carpeta de capturas configurada." : "Sin carpeta de capturas seleccionada."}
      </p>
      {message ? <p className="modal__hint">{message}</p> : null}
    </div>
  </Modal>
);

export const EventModal = ({ onClose, onSave }) => {
  const [text, setText] = useState("");
  return (
    <Modal title="Evento" onClose={onClose}>
      <div className="modal__form">
        <label>
          Descripción
          <input
            type="text"
            value={text}
            placeholder="Cambio de carga, ajuste, observación..."
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="modal__actions">
          <button type="button" onClick={() => onSave(text.trim() || "Evento sin descripción", false)}>
            Guardar evento
          </button>
          <button type="button" onClick={() => onSave(text.trim() || "Evento con captura", true)}>
            Guardar y capturar
          </button>
        </div>
        <p className="modal__hint">
          Los eventos se registran solo si hay identificador y subcarpeta activos.
        </p>
      </div>
    </Modal>
  );
};

export const ConfigFileModal = ({ mode, onClose, initialText, onSaveFile, onLoadFile, onApplyText, message }) => {
  const [text, setText] = useState(initialText);
  return (
    <Modal title={mode === "save" ? "Guardar configuración" : "Cargar configuración"} onClose={onClose}>
      <div className="modal__form">
        <label>
          Configuración (JSON)
          <textarea rows={8} value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="modal__actions">
          {mode === "save" ? (
            <button type="button" onClick={() => onSaveFile(text)}>Guardar archivo JSON</button>
          ) : (
            <button type="button" onClick={async () => {
              const content = await onLoadFile();
              if (typeof content === "string") {
                setText(content);
              }
            }}
            >
              Cargar archivo JSON
            </button>
          )}
          <button type="button" onClick={() => onApplyText(text)}>Aplicar JSON</button>
        </div>
        {message ? <p className="modal__hint">{message}</p> : null}
      </div>
    </Modal>
  );
};

export const StartupRestorePrompt = ({ onLoad, onFresh }) => (
  <ConfirmDialog
    title="Última sesión"
    message="Se encontró una configuración de la sesión anterior. Puedes cargarla o empezar con una sesión limpia."
    onCancel={onFresh}
    cancelLabel="Empezar de cero"
    onConfirm={onLoad}
    confirmLabel="Cargar última sesión"
  />
);

export const ConnectIdentifierPrompt = ({ value, placeholder, onChange, onCancel, onConfirm }) => (
  <ConfirmDialog title="Identificador" onCancel={onCancel} onConfirm={onConfirm} confirmLabel="Conectar">
    <label>
      Identificador de tarjeta/lote
      <input
        type="text"
        value={value}
        placeholder={placeholder || "PCB_10115"}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onConfirm();
          }
        }}
      />
    </label>
    <p className="modal__hint">
      Se usará para nombrar capturas mientras esté activo «Usar como prefijo».
    </p>
  </ConfirmDialog>
);

export const AssignmentPrompt = ({ channelName, onAssign, onClose }) => (
  <Modal title="Asignar variable" onClose={onClose} compact>
    <div className="modal__form">
      <p className="modal__hint">{channelName} se soltó dentro del plot. Elige el eje.</p>
      <div className="modal__actions">
        {["x", "y1", "y2"].map((axis) => (
          <button key={axis} type="button" onClick={() => onAssign(axis)}>
            {axis.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  </Modal>
);
