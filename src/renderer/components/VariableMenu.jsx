import React from "react";
import { clamp } from "../lib/axisScale.js";
import { defaultCalibration } from "../engine/calibration.js";

const VariableMenu = ({ position, channel, onUpdate, onEditFunction, onDeleteFunction, onClose }) => (
  <div
    className="variable-menu"
    data-floating-menu="true"
    style={{ left: position.x, top: position.y, maxHeight: `calc(100vh - ${position.y + 8}px)` }}
    onClick={(event) => event.stopPropagation()}
    onPointerDown={(event) => event.stopPropagation()}
  >
    <strong>Variable</strong>
    {!channel ? (
      <span>No disponible</span>
    ) : (
      <>
        <label>
          Nombre
          <input
            type="text"
            value={channel.name}
            onChange={(event) => onUpdate(channel, { name: event.target.value || channel.id })}
          />
        </label>
        <label>
          Color
          <input type="color" value={channel.color} onChange={(event) => onUpdate(channel, { color: event.target.value })} />
        </label>
        <label>
          Estilo
          <select value={channel.lineStyle || "solid"} onChange={(event) => onUpdate(channel, { lineStyle: event.target.value })}>
            <option value="solid">Sólida</option>
            <option value="dashed">Discontinua</option>
            <option value="dotted">Punteada</option>
            <option value="points">Puntos (scatter)</option>
          </select>
        </label>
        <label>
          Grosor
          <input
            type="number"
            min="1"
            max="8"
            value={channel.thickness || 2}
            onChange={(event) => onUpdate(channel, { thickness: clamp(Number(event.target.value) || 2, 1, 8) })}
          />
        </label>
        {!channel.virtual ? (
          <fieldset className="variable-menu__calibration">
            <legend>Calibración</legend>
            {(() => {
              const calibration = { ...defaultCalibration, ...channel.calibration };
              const set = (patch) => onUpdate(channel, { calibration: { ...calibration, ...patch } });
              return (
                <>
                  <label>
                    Escala ×
                    <input type="number" step="any" value={calibration.scale} onChange={(event) => set({ scale: event.target.value })} />
                  </label>
                  <label>
                    Offset +
                    <input type="number" step="any" value={calibration.offset} onChange={(event) => set({ offset: event.target.value })} />
                  </label>
                  <label>
                    Unidad
                    <input type="text" value={calibration.unit} placeholder="mV" onChange={(event) => set({ unit: event.target.value })} />
                  </label>
                  <label>
                    Filtro
                    <select value={calibration.filter} onChange={(event) => set({ filter: event.target.value })}>
                      <option value="none">Ninguno</option>
                      <option value="average">Media móvil (muestras)</option>
                      <option value="lowpass">Pasa bajos (Hz)</option>
                    </select>
                  </label>
                  {calibration.filter !== "none" ? (
                    <label>
                      {calibration.filter === "average" ? "Muestras" : "Corte (Hz)"}
                      <input type="number" min="0" step="any" value={calibration.filterValue} onChange={(event) => set({ filterValue: event.target.value })} />
                    </label>
                  ) : null}
                  <small>valor = (lectura × escala + offset), luego el filtro. Se recalcula todo el historial.</small>
                </>
              );
            })()}
          </fieldset>
        ) : null}
        {channel.virtual ? (
          <div className="modal__actions">
            <button type="button" onClick={() => onEditFunction(channel.id)}>
              Editar función
            </button>
            <button type="button" className="button-danger" onClick={() => onDeleteFunction(channel.id)}>
              Eliminar
            </button>
          </div>
        ) : null}
      </>
    )}
    <button type="button" onClick={onClose}>Cerrar</button>
  </div>
);

export default VariableMenu;
