import React from "react";
import { axisLabels, CHANNEL_DRAG_MIME } from "../constants.js";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot.js";
import { isAxisEditable } from "../lib/plotFrame.js";
import { liveChannelValue, startChannelDrag } from "./channelDrag.js";

const STAT_FIELDS = [
  { key: "avg", field: "statAvgTargets", label: "Promedio" },
  { key: "min", field: "statMinTargets", label: "Mínimo" },
  { key: "max", field: "statMaxTargets", label: "Máximo" }
];

const PlotContextMenu = ({ plot, position, engine, channels, styles, onChange, onAssign, onClose, onSetAxisMode, onToggleXAuto }) => {
  const snapshot = useEngineSnapshot(engine);
  const yAssignments = plot.assignments.filter((item) => item.axis !== "x");
  const channelLabel = (channelId) => styles.get(channelId)?.name || channelId;
  const channelColor = (channelId) => styles.get(channelId)?.color || "#64748b";

  const update = (patch) => onChange(plot.id, (current) => ({ ...current, ...patch }));

  const removeAssignment = (assignmentKey) =>
    onChange(plot.id, (current) => ({
      ...current,
      assignments: current.assignments.filter((item) => `${item.channelId}:${item.axis}` !== assignmentKey)
    }));

  const clearAssignments = () => {
    onChange(plot.id, (current) => ({ ...current, assignments: [] }));
    onClose();
  };

  const toggleStatTarget = (field, target) =>
    onChange(plot.id, (current) => {
      const selected = Array.isArray(current[field]) ? current[field] : [];
      return {
        ...current,
        [field]: selected.includes(target) ? selected.filter((item) => item !== target) : [...selected, target]
      };
    });

  const isStatSelected = (field, target) => (Array.isArray(plot[field]) ? plot[field] : []).includes(target);

  const handleAxisDrop = (event, axis) => {
    const channelId = event.dataTransfer.getData(CHANNEL_DRAG_MIME) || event.dataTransfer.getData("text/plain");
    if (!channelId) {
      return;
    }
    event.preventDefault();
    onAssign(plot.id, channelId, axis);
  };

  return (
    <div
      className="plot-menu"
      data-floating-menu="true"
      style={{ left: position.x, top: position.y }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <header className="plot-menu__header">
        <div>
          <strong>{plot.title}</strong>
          <span>Configurar gráfico</span>
        </div>
        <button type="button" className="plot-menu__close" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="plot-menu__section">
        <div className="plot-menu__section-title">
          <strong>Asignar señal</strong>
          <span>Arrastra hacia un eje</span>
        </div>
        <div className="plot-menu__axis-targets" role="group" aria-label="Ejes destino">
          {["x", "y1", "y2"].map((axis) => (
            <div
              key={axis}
              className="plot-menu__axis-target"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleAxisDrop(event, axis)}
            >
              {axisLabels[axis]}
            </div>
          ))}
        </div>
        <div className="plot-menu__channels">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className="plot-menu__channel"
              draggable
              onDragStart={(event) => startChannelDrag(event, channel.id)}
              title={`Arrastra ${channel.name} hacia X, Y1 o Y2`}
            >
              <span className="plot-menu__dot" style={{ backgroundColor: channel.color }} />
              <span>{channel.name}</span>
              <span>{liveChannelValue(snapshot, channel).toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="plot-menu__section">
        <div className="plot-menu__section-title">
          <strong>Señales asignadas</strong>
          <span>{plot.assignments.length} activa(s)</span>
        </div>
        <div className="plot-menu__assigned">
          {plot.assignments.length === 0 ? (
            <span className="plot-menu__muted">Aún no hay señales en este plot.</span>
          ) : (
            plot.assignments.map((assignment) => {
              const assignmentKey = `${assignment.channelId}:${assignment.axis}`;
              return (
                <div key={assignmentKey} className="plot-menu__assigned-row">
                  <span className="plot-menu__dot" style={{ backgroundColor: channelColor(assignment.channelId) }} />
                  <span>{channelLabel(assignment.channelId)}</span>
                  <span className="plot-menu__axis-pill">{axisLabels[assignment.axis]}</span>
                  <button type="button" onClick={() => removeAssignment(assignmentKey)}>
                    Quitar
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="plot-menu__actions">
          <button type="button" onClick={clearAssignments} disabled={plot.assignments.length === 0}>
            Limpiar plot
          </button>
          <button type="button" onClick={onClose}>Listo</button>
        </div>
      </div>

      <div className="plot-menu__section plot-menu__section--fold">
        <strong>Curvas de referencia</strong>
        <div className="plot-menu__inline-fields">
          <select
            value={plot.statsWindowUnit}
            onChange={(event) => update({ statsWindowUnit: event.target.value })}
          >
            <option value="samples">Muestras</option>
            <option value="seconds">Segundos</option>
          </select>
          <input
            type="number"
            min="2"
            value={plot.statsWindowValue}
            onChange={(event) => update({ statsWindowValue: Math.max(2, Number(event.target.value) || 2) })}
          />
        </div>
        {yAssignments.length === 0 ? (
          <span className="plot-menu__muted">Asigna una señal en Y1 o Y2 para activar referencias.</span>
        ) : (
          <div className="plot-menu__stats-table">
            <span>Señal</span>
            <span>Prom</span>
            <span>Min</span>
            <span>Max</span>
            {yAssignments.map((assignment) => {
              const targetKey = `${assignment.channelId}:${assignment.axis}`;
              const name = channelLabel(assignment.channelId);
              return (
                <React.Fragment key={targetKey}>
                  <div className="plot-menu__stats-signal">
                    <span className="plot-menu__dot" style={{ backgroundColor: channelColor(assignment.channelId) }} />
                    <span>{name}</span>
                    <span>{axisLabels[assignment.axis]}</span>
                  </div>
                  {STAT_FIELDS.map((stat) => (
                    <label key={`${targetKey}-${stat.field}`} className="plot-menu__stat-check" title={`${stat.label} de ${name}`}>
                      <input
                        type="checkbox"
                        checked={isStatSelected(stat.field, targetKey)}
                        onChange={() => toggleStatTarget(stat.field, targetKey)}
                      />
                    </label>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        )}
        {STAT_FIELDS.map((stat) => (
          <div key={stat.key} className="plot-menu__stat-group">
            <strong>{stat.label}</strong>
            {yAssignments.length === 0 ? (
              <span className="plot-menu__muted">Sin señales Y</span>
            ) : (
              yAssignments.map((assignment) => {
                const targetKey = `${assignment.channelId}:${assignment.axis}`;
                return (
                  <label key={`${stat.key}-${targetKey}`}>
                    <input
                      type="checkbox"
                      checked={isStatSelected(stat.field, targetKey)}
                      onChange={() => toggleStatTarget(stat.field, targetKey)}
                    />
                    {channelLabel(assignment.channelId)} ({assignment.axis.toUpperCase()})
                  </label>
                );
              })
            )}
          </div>
        ))}
      </div>

      <div className="plot-menu__section plot-menu__section--fold plot-menu__modes">
        <strong>Modos de ejes</strong>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={plot.xMode !== "manual"}
            onChange={(event) => onToggleXAuto(event.target.checked)}
          />
          X auto/ventana
        </label>
        {isAxisEditable(plot, "x") ? (
          <p className="plot-menu__muted">
            Pasa el mouse sobre zona X: rueda = zoom, Shift+rueda = zoom rápido.
          </p>
        ) : null}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={plot.y1Mode === "auto"}
            onChange={(event) => onSetAxisMode("y1", event.target.checked ? "auto" : "manual")}
          />
          Y1 automático
        </label>
        {plot.y1Mode === "manual" ? (
          <p className="plot-menu__muted">
            Pasa el mouse sobre zona Y1 y usa rueda; arrastra con click izquierdo para deslizar.
          </p>
        ) : null}
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={plot.y2Mode === "auto"}
            onChange={(event) => onSetAxisMode("y2", event.target.checked ? "auto" : "manual")}
          />
          Y2 automático
        </label>
        {plot.y2Mode === "manual" ? (
          <p className="plot-menu__muted">
            Pasa el mouse sobre zona Y2 y usa rueda; arrastra con click izquierdo para deslizar.
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default PlotContextMenu;
