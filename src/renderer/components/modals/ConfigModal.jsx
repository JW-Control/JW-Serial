import React, { useState } from "react";
import Modal, { ConfirmDialog } from "./Modal.jsx";
import { getTemplateNames, readTemplates, writeTemplates } from "../../lib/storage.js";

const TemplatesSection = ({ buildSnapshot, applySnapshot }) => {
  const [templateNames, setTemplateNames] = useState(() => getTemplateNames());
  const [selectedName, setSelectedName] = useState("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(null);

  const sync = (templates, preferredName) => {
    const names = getTemplateNames(templates);
    setTemplateNames(names);
    setSelectedName(names.includes(preferredName) ? preferredName : "");
  };

  const requestSave = () => {
    const name = newName.trim();
    if (!name) {
      setMessage("Escribe un nombre en Guardar como.");
      return;
    }
    setConfirm({ type: "save", name, overwrites: Boolean(readTemplates()[name]) });
  };

  const load = () => {
    const template = readTemplates()[selectedName];
    if (!template) {
      sync(readTemplates(), "");
      setMessage("No se encontró esa plantilla.");
      return;
    }
    applySnapshot(template);
    setMessage(`Plantilla cargada: ${selectedName}`);
  };

  const requestDelete = () => {
    if (!readTemplates()[selectedName]) {
      sync(readTemplates(), "");
      setMessage("No se encontró esa plantilla.");
      return;
    }
    setConfirm({ type: "delete", name: selectedName });
  };

  const confirmAction = () => {
    const templates = readTemplates();
    if (confirm.type === "save") {
      templates[confirm.name] = buildSnapshot();
      writeTemplates(templates);
      sync(templates, confirm.name);
      setNewName("");
      setMessage(`Plantilla guardada: ${confirm.name}`);
    } else {
      delete templates[confirm.name];
      writeTemplates(templates);
      sync(templates, "");
      setMessage(`Plantilla eliminada: ${confirm.name}`);
    }
    setConfirm(null);
  };

  return (
    <div className="modal__form modal__section">
      <h4>Plantillas</h4>
      <label>
        Plantilla existente
        <select
          value={selectedName}
          onChange={(event) => {
            setSelectedName(event.target.value);
            setMessage("");
          }}
        >
          <option value="">Sin seleccionar</option>
          {templateNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Guardar como
        <input type="text" value={newName} placeholder="Galga 80 SPS" onChange={(event) => setNewName(event.target.value)} />
      </label>
      <div className="modal__actions">
        <button type="button" onClick={requestSave}>Guardar como</button>
        <button type="button" onClick={load} disabled={!selectedName}>Cargar</button>
        <button type="button" onClick={requestDelete} disabled={!selectedName}>Eliminar</button>
      </div>
      {message ? <p className="modal__hint">{message}</p> : null}
      {confirm ? (
        <ConfirmDialog
          title={confirm.type === "save" ? "Confirmar guardado" : "Confirmar eliminación"}
          message={confirm.type === "save"
            ? confirm.overwrites
              ? `La plantilla "${confirm.name}" ya existe. Si continúas, se reemplazará con la configuración actual.`
              : `Se guardará una nueva plantilla llamada "${confirm.name}".`
            : `Se eliminará la plantilla "${confirm.name}". Esta acción no se puede deshacer.`}
          onCancel={() => setConfirm(null)}
          onConfirm={confirmAction}
          danger={confirm.type === "delete"}
          confirmLabel={confirm.type === "save"
            ? confirm.overwrites ? "Confirmar reemplazo" : "Confirmar guardado"
            : "Confirmar eliminación"}
        />
      ) : null}
    </div>
  );
};

const BASIC_FIELDS = [
  { key: "channelCount", label: "Canales por trama (0 = auto)", min: "0" },
  { key: "samplesPerSecond", label: "SPS nominal (dimensiona el buffer)", min: "1" },
  { key: "periodMs", label: "Periodo (ms)", min: "0.01", step: "0.1" },
  { key: "bufferSeconds", label: "Buffer (segundos)", min: "1" },
  { key: "refreshMs", label: "Refresh plot (ms)", min: "16" },
  { key: "minValidFrames", label: "Min. tramas válidas para iniciar", min: "1" }
];

const BasicSection = ({ basicConfig, onApply, onUpdate, appSettings, onUpdateAppSettings, onApplyProfile, message }) => {
  const [draft, setDraft] = useState({});

  const setField = (key, rawValue) => {
    const value = Number(rawValue);
    setDraft((prev) => {
      if (key === "samplesPerSecond") {
        return { ...prev, samplesPerSecond: value, periodMs: value > 0 ? Number((1000 / value).toFixed(3)) : prev.periodMs };
      }
      if (key === "periodMs") {
        return { ...prev, periodMs: value, samplesPerSecond: value > 0 ? Number((1000 / value).toFixed(2)) : prev.samplesPerSecond };
      }
      if (key === "minValidFrames") {
        return { ...prev, minValidFrames: Math.max(1, value || 1) };
      }
      return { ...prev, [key]: value };
    });
  };

  const apply = () => {
    const patch = {};
    Object.entries(draft).forEach(([key, value]) => {
      if (Number.isFinite(value) && (value > 0 || (key === "channelCount" && value >= 0))) {
        patch[key] = key === "channelCount" ? Math.floor(value) : value;
      }
    });
    onApply(patch);
    setDraft({});
  };

  return (
    <div className="modal__form modal__section">
      <h4>Básica</h4>
      {message ? <p className="modal__hint">{message}</p> : null}
      <div className="config-grid">
        <div className="config-grid__header">Parámetro</div>
        <div className="config-grid__header">Actual</div>
        <div className="config-grid__header">Editar</div>
        {BASIC_FIELDS.map((field) => (
          <React.Fragment key={field.key}>
            <div className="config-grid__label">{field.label}</div>
            <input type="text" readOnly value={basicConfig[field.key]} />
            <input
              type="number"
              min={field.min}
              step={field.step}
              value={draft[field.key] ?? basicConfig[field.key]}
              onChange={(event) => setField(field.key, event.target.value)}
            />
          </React.Fragment>
        ))}
      </div>
      <div className="config-actions">
        <button type="button" onClick={onApplyProfile} title="921600 baud, 2 kSPS, secuencia al inicio, buffer 60 s, ploteo Min/Max">
          Perfil ESP32/CH340 2 kSPS
        </button>
        <button type="button" onClick={apply}>Aplicar cambios</button>
      </div>
      <p className="modal__hint">
        Las ventanas en segundos (eje X, funciones y curvas de referencia) usan el tiempo real de llegada de cada muestra; el SPS nominal solo dimensiona el buffer inicial.
      </p>
      <label>
        Modo de ploteo
        <select value={basicConfig.plotMode} onChange={(event) => onUpdate({ plotMode: event.target.value })}>
          <option value="normal">Normal</option>
          <option value="minmax">Min/Max agregado</option>
        </select>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={basicConfig.includeTimestamp}
          onChange={(event) => onUpdate({ includeTimestamp: event.target.checked })}
        />
        Incluye timestamp en X
      </label>
      <p className="modal__hint">
        Con timestamp del dispositivo (en ms) el jitter mostrado es el real del muestreo.
      </p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={Boolean(basicConfig.includeSequenceCounter)}
          onChange={(event) => onUpdate({ includeSequenceCounter: event.target.checked })}
        />
        Incluye secuencia al inicio
      </label>
      <p className="modal__hint">
        CSV compacto: seq,valor0,valor1. En clave:valor se detecta automáticamente SEQ:123.
      </p>
      <label>
        Timeout sin trama válida (s)
        <input
          type="number"
          min="0"
          value={appSettings.serialTimeoutSeconds}
          onChange={(event) => onUpdateAppSettings({ serialTimeoutSeconds: Math.max(0, Number(event.target.value) || 0) })}
        />
      </label>
      <p className="modal__hint">
        Usa 0 para desactivar la desconexión automática por falta de tramas válidas.
      </p>
    </div>
  );
};

const ConfigModal = ({
  onClose,
  basicConfig,
  onApplyBasic,
  onUpdateBasic,
  advancedConfig,
  onUpdateAdvanced,
  appSettings,
  onUpdateAppSettings,
  onApplyProfile,
  buildSnapshot,
  applySnapshot,
  message
}) => (
  <Modal title="Configuración" onClose={onClose}>
    <TemplatesSection buildSnapshot={buildSnapshot} applySnapshot={applySnapshot} />
    <BasicSection
      basicConfig={basicConfig}
      onApply={onApplyBasic}
      onUpdate={onUpdateBasic}
      appSettings={appSettings}
      onUpdateAppSettings={onUpdateAppSettings}
      onApplyProfile={onApplyProfile}
      message={message}
    />

    <div className="modal__form modal__section">
      <h4>Filtro de tramas</h4>
      <p className="modal__hint">
        Filtra las líneas antes de graficarlas. Escribe un prefijo o patrón por línea (también acepta * y /regex/). Se aplica en vivo.
      </p>
      <label>
        Modo de filtro
        <select
          value={appSettings.serialFilterMode || "none"}
          onChange={(event) => onUpdateAppSettings({ serialFilterMode: event.target.value })}
        >
          <option value="none">Sin filtro</option>
          <option value="accept">Aceptar solo coincidencias</option>
          <option value="reject">Rechazar coincidencias</option>
        </select>
      </label>
      <label className="modal__field--textarea">
        Prefijos/patrones
        <textarea
          rows={4}
          value={appSettings.serialFilterPatterns || ""}
          placeholder={"LORA_\n+EVT"}
          onChange={(event) => onUpdateAppSettings({ serialFilterPatterns: event.target.value })}
        />
      </label>
      <p className="modal__hint">
        Ejemplo: usa «Aceptar solo coincidencias» con LORA_ para graficar solo tramas como LORA_ADC:1409.96,RSSI:-29,SNR:12,FREQ:916.000.
      </p>
    </div>

    <div className="modal__form modal__section">
      <h4>Inicio y sesión</h4>
      <p className="modal__hint">Define cómo JW-Serial debe manejar la última configuración guardada al abrir.</p>
      <label>
        Al iniciar JW-Serial
        <select
          value={appSettings.sessionRestoreMode}
          onChange={(event) => onUpdateAppSettings({ sessionRestoreMode: event.target.value })}
        >
          <option value="ask">Preguntar si cargar la última sesión</option>
          <option value="auto">Cargar la última sesión automáticamente</option>
          <option value="fresh">Empezar de cero sin preguntar</option>
        </select>
      </label>
    </div>

    <div className="modal__form modal__section">
      <h4>Avanzada</h4>
      <p className="modal__hint">Parámetros del puerto serial para equipos que requieren formato específico.</p>
      <label>
        Data bits
        <select value={advancedConfig.dataBits} onChange={(event) => onUpdateAdvanced({ dataBits: Number(event.target.value) })}>
          <option value={7}>7</option>
          <option value={8}>8</option>
        </select>
      </label>
      <label>
        Paridad
        <select value={advancedConfig.parity} onChange={(event) => onUpdateAdvanced({ parity: event.target.value })}>
          <option value="none">Ninguna</option>
          <option value="even">Par</option>
          <option value="odd">Impar</option>
        </select>
      </label>
      <label>
        DTR/RTS al conectar
        <select value={advancedConfig.lineSignals || "default"} onChange={(event) => onUpdateAdvanced({ lineSignals: event.target.value })}>
          <option value="default">Por defecto del driver</option>
          <option value="reset">Reinicio limpio (ESP32 / Arduino)</option>
          <option value="release">Liberar líneas (no reiniciar)</option>
        </select>
      </label>
      <p className="modal__hint">
        En placas ESP32 con CH340/CP210x, DTR y RTS controlan el arranque. Si a veces conecta pero no llegan datos,
        usa «Reinicio limpio»: la placa arranca siempre en modo normal al abrir el puerto.
      </p>
      <label>
        Stop bits
        <select value={advancedConfig.stopBits} onChange={(event) => onUpdateAdvanced({ stopBits: Number(event.target.value) })}>
          <option value={1}>1</option>
          <option value={2}>2</option>
        </select>
      </label>
    </div>
  </Modal>
);

export default ConfigModal;
