import React from "react";
import Modal from "./Modal.jsx";
import { ALARM_CONDITIONS, createAlarmRule, describeAlarm } from "../../engine/alarms.js";

const AlarmsModal = ({ rules, channels, activeIds, onChange, onClose }) => {
  const channelName = (id) => channels.find((channel) => channel.id === id)?.name || id;
  const update = (ruleId, patch) => onChange(rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  const remove = (ruleId) => onChange(rules.filter((rule) => rule.id !== ruleId));
  const add = () => onChange([...rules, createAlarmRule(channels[0]?.id || "val0")]);

  return (
    <Modal title="Alarmas" onClose={onClose}>
      <div className="modal__form">
        <p className="modal__hint">
          Se evalúan en cada muestra. Una alarma se dispara cuando la condición se mantiene el tiempo indicado y se
          normaliza cuando deja de cumplirse. Las líneas de umbral se dibujan en los plots donde está la señal.
        </p>
        {rules.length === 0 ? <p className="modal__hint">Sin alarmas configuradas.</p> : null}
        {rules.map((rule) => {
          const condition = ALARM_CONDITIONS.find((item) => item.id === rule.condition) || ALARM_CONDITIONS[0];
          const isActive = activeIds.includes(rule.id);
          return (
            <section key={rule.id} className={`alarm-rule ${isActive ? "alarm-rule--active" : ""}`}>
              <header>
                <label className="checkbox-row">
                  <input type="checkbox" checked={rule.enabled !== false} onChange={(event) => update(rule.id, { enabled: event.target.checked })} />
                  <strong>{describeAlarm(rule, channelName(rule.channelId))}</strong>
                </label>
                {isActive ? <span className="alarm-rule__badge">ACTIVA</span> : null}
                <button type="button" className="button-danger" onClick={() => remove(rule.id)}>Eliminar</button>
              </header>
              <div className="alarm-rule__fields">
                <label>
                  Señal
                  <select value={rule.channelId} onChange={(event) => update(rule.id, { channelId: event.target.value })}>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>{channel.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Condición
                  <select value={rule.condition} onChange={(event) => update(rule.id, { condition: event.target.value })}>
                    {ALARM_CONDITIONS.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {condition.values === 2 ? "Desde" : "Valor"}
                  <input type="number" step="any" value={rule.value} onChange={(event) => update(rule.id, { value: event.target.value })} />
                </label>
                {condition.values === 2 ? (
                  <label>
                    Hasta
                    <input type="number" step="any" value={rule.value2} onChange={(event) => update(rule.id, { value2: event.target.value })} />
                  </label>
                ) : null}
                <label>
                  Durante (s)
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={rule.minDurationSeconds}
                    onChange={(event) => update(rule.id, { minDurationSeconds: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
              </div>
              <div className="alarm-rule__actions">
                <label className="checkbox-row">
                  <input type="checkbox" checked={rule.notify} onChange={(event) => update(rule.id, { notify: event.target.checked })} />
                  Aviso y sonido
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={rule.logEvent} onChange={(event) => update(rule.id, { logEvent: event.target.checked })} />
                  Registrar evento
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={rule.capture} onChange={(event) => update(rule.id, { capture: event.target.checked })} />
                  Capturar plots
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={rule.showOnPlot !== false} onChange={(event) => update(rule.id, { showOnPlot: event.target.checked })} />
                  Línea en el plot
                </label>
              </div>
            </section>
          );
        })}
        <div className="modal__actions">
          <button type="button" className="button-primary" onClick={add} disabled={!channels.length}>Agregar alarma</button>
        </div>
      </div>
    </Modal>
  );
};

export default AlarmsModal;
