import React from "react";
import { clamp } from "../lib/axisScale.js";

const VariableMenu = ({ position, channel, onUpdate, onEditFunction, onDeleteFunction, onClose }) => (
  <div
    className="variable-menu"
    data-floating-menu="true"
    style={{ left: position.x, top: position.y }}
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
