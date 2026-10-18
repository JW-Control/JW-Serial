import React from "react";
import Modal from "./Modal.jsx";
import { buildCommandMessages, createCommand } from "../../lib/commands.js";

const validate = (command) => {
  try {
    const messages = buildCommandMessages(command);
    return messages.length ? "" : "Sin contenido.";
  } catch (error) {
    return error.message;
  }
};

const CommandsModal = ({ commands, onChange, onClose }) => {
  const update = (id, patch) => onChange(commands.map((command) => (command.id === id ? { ...command, ...patch } : command)));
  const move = (index, direction) => {
    const next = [...commands];
    const target = index + direction;
    if (target < 0 || target >= next.length) {
      return;
    }
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <Modal title="Comandos rápidos" onClose={onClose}>
      <div className="modal__form">
        <p className="modal__hint">
          Cada línea del contenido es un comando; con varias líneas se envían en orden con el retardo indicado.
          En formato hex escribe bytes separados por espacios (ej. AA 55 01 0x2F).
        </p>
        {commands.map((command, index) => {
          const error = validate(command);
          return (
            <section key={command.id} className="alarm-rule">
              <header>
                <input
                  type="text"
                  className="command-label"
                  value={command.label}
                  onChange={(event) => update(command.id, { label: event.target.value })}
                />
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} title="Subir">↑</button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === commands.length - 1} title="Bajar">↓</button>
                <button type="button" className="button-danger" onClick={() => onChange(commands.filter((item) => item.id !== command.id))}>
                  Eliminar
                </button>
              </header>
              <div className="alarm-rule__fields">
                <label>
                  Formato
                  <select value={command.format} onChange={(event) => update(command.id, { format: event.target.value })}>
                    <option value="text">Texto</option>
                    <option value="hex">Hex (bytes)</option>
                  </select>
                </label>
                {command.format === "text" ? (
                  <label>
                    Terminador
                    <select value={command.terminator} onChange={(event) => update(command.id, { terminator: event.target.value })}>
                      <option value="inherit">El del monitor</option>
                      <option value="none">Ninguno</option>
                      <option value="nl">NL (\n)</option>
                      <option value="cr">CR (\r)</option>
                      <option value="crlf">CR+NL (\r\n)</option>
                    </select>
                  </label>
                ) : null}
                <label>
                  Retardo entre líneas (ms)
                  <input
                    type="number"
                    min="0"
                    value={command.delayMs}
                    onChange={(event) => update(command.id, { delayMs: Math.max(0, Number(event.target.value) || 0) })}
                  />
                </label>
              </div>
              <label className="modal__field--textarea">
                Contenido
                <textarea
                  rows={3}
                  value={command.payload}
                  placeholder={command.format === "hex" ? "AA 55 01" : "GAIN 64\nRATE 2000"}
                  onChange={(event) => update(command.id, { payload: event.target.value })}
                />
              </label>
              {error ? <p className="modal__hint function-builder__error">{error}</p> : null}
            </section>
          );
        })}
        <div className="modal__actions">
          <button type="button" className="button-primary" onClick={() => onChange([...commands, createCommand()])}>
            Agregar comando
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CommandsModal;
