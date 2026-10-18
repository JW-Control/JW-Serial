import React, { useMemo, useRef, useState } from "react";
import Modal from "./Modal.jsx";
import { storageKeys } from "../../constants.js";
import { writeString } from "../../lib/storage.js";
import { WindowRegistry } from "../../lib/virtual/compiler.js";
import {
  binaryBlockSymbols,
  createFunctionBlock,
  definitionExpression,
  functionBlockOperations,
  functionPaletteGroups,
  unaryExpressionFunctions,
  validateFunctionBlock,
  wrapFunctionBlock
} from "../../lib/virtual/definitions.js";
import { compileDefinition } from "../../engine/virtualFunctionSet.js";

const FUNCTION_DRAG_MIME = "application/x-jw-function-block";
const PLACED_DRAG_MIME = "jw-function-kind-placed";

const readNode = (node, path, depth = 0) => {
  if (!node || depth >= path.length) {
    return node || null;
  }
  return readNode(node[path[depth]], path, depth + 1);
};

const writeNode = (node, path, value, depth = 0) => {
  if (depth >= path.length) {
    return value;
  }
  if (!node) {
    return node;
  }
  const key = path[depth];
  return { ...node, [key]: writeNode(node[key], path, value, depth + 1) };
};

const createBlockFromPayload = (payload) =>
  payload?.kind === "variable"
    ? createFunctionBlock("variable", payload.sourceId || null)
    : createFunctionBlock(payload?.type || "current", null);

const readDragPayload = (event) => {
  const raw = event.dataTransfer.getData(FUNCTION_DRAG_MIME)
    || event.dataTransfer.getData("text/plain").replace(/^jwserial-function:/, "");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
};

const hasFunctionPayload = (event) => Array.from(event.dataTransfer.types).includes(FUNCTION_DRAG_MIME);

const allowDrop = (event) => {
  if (hasFunctionPayload(event)) {
    event.preventDefault();
    event.dataTransfer.dropEffect = Array.from(event.dataTransfer.types).includes(PLACED_DRAG_MIME) ? "move" : "copy";
  }
};

const allowTrashDrop = (event) => {
  if (hasFunctionPayload(event)) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }
};

/** Returns an error message for a draft, or "" when it is valid. */
export const validateFunctionDraft = (draft, sourceChannels) => {
  if (!draft) {
    return "No hay función para validar.";
  }
  if (!draft.name?.trim()) {
    return "Escribe un nombre para la función.";
  }
  const isKnownChannel = (id) => sourceChannels.some((channel) => channel.id === id);
  const blockError = draft.block ? validateFunctionBlock(draft.block, isKnownChannel) : "";
  if (blockError) {
    return blockError;
  }
  try {
    compileDefinition(draft, sourceChannels, new WindowRegistry());
  } catch (error) {
    return String(error?.message || error || "Sintaxis inválida.");
  }
  return "";
};

const FunctionBuilderModal = ({ initialDraft, sourceChannels, isExisting, width, onWidthChange, onSave, onDelete, onClose }) => {
  const [draft, setDraft] = useState(initialDraft);
  const [message, setMessage] = useState("");
  const modalRef = useRef(null);

  const channelName = (id) => sourceChannels.find((channel) => channel.id === id)?.name || "variable";
  const expression = definitionExpression(draft, channelName);
  const validationError = useMemo(() => validateFunctionDraft(draft, sourceChannels), [draft, sourceChannels]);

  const updateBlock = (updater) => {
    setDraft((prev) => {
      const block = updater(prev.block);
      return { ...prev, block, expression: "" };
    });
    setMessage("");
  };

  const updateBlockAtPath = (path, updater) =>
    updateBlock((block) => writeNode(block, path, updater(readNode(block, path))));

  const handlePaletteDragStart = (event, payload) => {
    const encoded = JSON.stringify(payload);
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData(FUNCTION_DRAG_MIME, encoded);
    event.dataTransfer.setData("text/plain", `jwserial-function:${encoded}`);
  };

  const handlePlacedDragStart = (event, path) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(FUNCTION_DRAG_MIME, JSON.stringify({ kind: "placed", path }));
    event.dataTransfer.setData(PLACED_DRAG_MIME, "1");
  };

  const dropAtPath = (event, path) => {
    const payload = readDragPayload(event);
    if (!payload) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (payload.kind === "placed") {
      if (!Array.isArray(payload.path) || JSON.stringify(payload.path) === JSON.stringify(path)) {
        return;
      }
      // Swap the dragged block with the block at the drop target.
      updateBlock((block) => {
        const moved = readNode(block, payload.path);
        if (!moved) {
          return block;
        }
        const target = readNode(block, path);
        return writeNode(writeNode(block, payload.path, target), path, moved);
      });
      return;
    }
    updateBlockAtPath(path, (oldNode) => wrapFunctionBlock(createBlockFromPayload(payload), oldNode));
  };

  const dropToTrash = (event) => {
    const payload = readDragPayload(event);
    if (!payload || payload.kind !== "placed" || !Array.isArray(payload.path)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateBlockAtPath(payload.path, () => null);
  };

  const dropVariableAtPath = (event, path) => {
    const payload = readDragPayload(event);
    if (!payload || payload.kind !== "variable") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updateBlockAtPath(path, (node) => ({ ...node, sourceId: payload.sourceId }));
  };

  const patchAtPath = (path, patch) => updateBlockAtPath(path, (node) => ({ ...node, ...patch }));

  const renderPaletteBlock = (item) => {
    const payload = item.kind ? item : { kind: "block", type: item.type };
    return (
      <button
        key={`${item.type || item.sourceId}-${item.label}`}
        type="button"
        className={`function-palette__block function-palette__block--${item.tone || "operator"}`}
        draggable
        onDragStart={(event) => handlePaletteDragStart(event, payload)}
        onDoubleClick={() => updateBlockAtPath([], (oldNode) => wrapFunctionBlock(createBlockFromPayload(payload), oldNode))}
        title="Arrastra este bloque a una ranura"
      >
        {item.color ? <span className="function-palette__dot" style={{ background: item.color }} /> : null}
        <span>{item.label}</span>
      </button>
    );
  };

  const renderVariableSlot = (block, path) => {
    const channel = sourceChannels.find((item) => item.id === block.sourceId) || null;
    return (
      <span
        className={`function-slot ${channel ? "function-slot--variable" : "function-slot--empty"}`}
        onDragOver={allowDrop}
        onDrop={(event) => dropVariableAtPath(event, path)}
        title="Arrastra una variable aquí"
      >
        {channel ? <span className="function-palette__dot" style={{ background: channel.color }} /> : null}
        <span>{channel?.name || ""}</span>
      </span>
    );
  };

  const renderSlot = (block, path, label) => (
    <span
      className="function-slot-shell"
      onDragOver={allowDrop}
      onDrop={(event) => dropAtPath(event, path)}
      title="Suelta un bloque aquí"
    >
      {block ? renderBlock(block, path) : <span className="function-slot function-slot--empty" aria-label={label} />}
    </span>
  );

  function renderBlock(block, path = []) {
    if (!block) {
      return null;
    }
    const operation = functionBlockOperations.find((item) => item.id === block.type);
    const dragProps = {
      draggable: true,
      onDragStart: (event) => handlePlacedDragStart(event, path),
      onDragOver: allowDrop,
      onDrop: (event) => dropAtPath(event, path)
    };

    if (block.type === "number") {
      return (
        <span className="function-block function-block--number" {...dragProps}>
          <span>Número</span>
          <input type="number" value={block.value} onChange={(event) => patchAtPath(path, { value: event.target.value })} />
        </span>
      );
    }
    if (block.type === "variable") {
      const channel = sourceChannels.find((item) => item.id === block.sourceId) || sourceChannels[0];
      return (
        <span className="function-block function-block--variable" {...dragProps}>
          {channel ? <span className="function-palette__dot" style={{ background: channel.color }} /> : null}
          <span>{channel?.name || "Variable"}</span>
        </span>
      );
    }
    if (unaryExpressionFunctions[block.type]) {
      return (
        <span className="function-block function-block--operator" {...dragProps}>
          <span>{operation?.label || unaryExpressionFunctions[block.type]}</span>
          <span>(</span>
          {renderSlot(block.input, [...path, "input"], "valor")}
          <span>)</span>
        </span>
      );
    }
    if (binaryBlockSymbols[block.type]) {
      return (
        <span className="function-block function-block--operator" {...dragProps}>
          {renderSlot(block.left, [...path, "left"], "A")}
          <span className="function-block__symbol">{binaryBlockSymbols[block.type]}</span>
          {renderSlot(block.right, [...path, "right"], "B")}
        </span>
      );
    }
    return (
      <span className="function-block function-block--window" {...dragProps}>
        <span className="function-block__label">{operation?.label || "Actual"}</span>
        <span>de</span>
        {renderVariableSlot(block, path)}
        {operation?.needsWindow ? (
          <>
            <span>en</span>
            <input
              type="number"
              min="0"
              step="any"
              value={block.windowValue}
              onChange={(event) => patchAtPath(path, { windowValue: event.target.value })}
            />
            <select value={block.windowUnit || "seconds"} onChange={(event) => patchAtPath(path, { windowUnit: event.target.value })}>
              <option value="seconds">s</option>
              <option value="samples">m</option>
            </select>
          </>
        ) : null}
      </span>
    );
  }

  const save = () => {
    if (validationError) {
      setMessage(validationError);
      return;
    }
    onSave({ ...draft, name: draft.name.trim(), expression, enabled: true });
  };

  return (
    <Modal
      ref={modalRef}
      title="Función"
      onClose={onClose}
      className="modal--function"
      style={{ width: `${width}px` }}
      onMouseUp={() => {
        if (modalRef.current) {
          const nextWidth = Math.round(modalRef.current.getBoundingClientRect().width);
          if (nextWidth !== width) {
            onWidthChange(nextWidth);
            writeString(storageKeys.functionModalWidth, String(nextWidth));
          }
        }
      }}
    >
      <div className="modal__form function-builder function-builder--blocks">
        <div className="modal__field">
          <span>Nombre</span>
          <input
            type="text"
            value={draft.name}
            placeholder="Rango uV 200s"
            onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <div className="modal__field">
          <span>Color</span>
          <input type="color" value={draft.color} onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))} />
        </div>
        <div className="function-workbench">
          <div className="function-palette" aria-label="Paleta de bloques">
            <div className="function-palette__intro">
              <span className="function-builder__section-title">Bloques</span>
              <p className="modal__hint">Arrastra piezas a la fórmula o a cualquier ranura.</p>
            </div>
            <div className="function-palette__rows">
              {functionPaletteGroups.map((group) => (
                <div key={group.title} className="function-palette__group">
                  <span>{group.title}</span>
                  <div className="function-palette__blocks">{group.items.map(renderPaletteBlock)}</div>
                </div>
              ))}
              <div className="function-palette__group">
                <span>Variables</span>
                <div className="function-palette__blocks">
                  {sourceChannels.map((channel) => renderPaletteBlock({
                    kind: "variable",
                    sourceId: channel.id,
                    label: channel.name,
                    color: channel.color,
                    tone: "variable"
                  }))}
                </div>
              </div>
            </div>
          </div>
          <div className="function-canvas">
            <div className="function-canvas__header">
              <span>Fórmula</span>
              <span>{draft.block ? "Resultado" : "Vacío"}</span>
            </div>
            <div className="function-canvas__result" onDragOver={allowDrop} onDrop={(event) => dropAtPath(event, [])}>
              {draft.block ? renderSlot(draft.block, [], "Suelta un bloque") : (
                <div className="function-canvas__empty">
                  <strong>Suelta un bloque aquí</strong>
                  <span>Empieza desde un operador, ventana, número o variable.</span>
                </div>
              )}
            </div>
            <div className="function-canvas__tools">
              <button type="button" onClick={() => updateBlock(() => null)}>Limpiar fórmula</button>
              <div className="function-trash" onDragEnter={allowTrashDrop} onDragOver={allowTrashDrop} onDrop={dropToTrash}>
                <span>Papelera</span>
                <small>Arrastra aquí para borrar</small>
              </div>
            </div>
          </div>
        </div>
        <div className="function-builder__preview">
          <span>Fórmula generada</span>
          <code>{expression}</code>
        </div>
        <p className={`modal__hint ${validationError ? "function-builder__error" : "function-builder__ok"}`}>
          {message || validationError || "Bloques válidos. Se generará una variable virtual arrastrable."}
        </p>
        <div className="modal__actions modal__actions--spaced">
          <button type="button" className="button-primary" onClick={save}>
            Guardar función
          </button>
          {isExisting ? (
            <button type="button" className="button-danger" onClick={() => onDelete(draft.id)}>
              Eliminar
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default FunctionBuilderModal;
