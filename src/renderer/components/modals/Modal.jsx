import React, { forwardRef } from "react";

/** Backdrop + panel + header with a close button. */
const Modal = forwardRef(({ title, onClose, compact = false, top = false, className = "", style, onMouseUp, children }, ref) => (
  <div className={`modal-backdrop ${top ? "modal-backdrop--top" : ""}`}>
    <div
      ref={ref}
      className={`modal ${compact ? "modal--compact" : ""} ${className}`}
      style={style}
      onMouseUp={onMouseUp}
    >
      <header className="modal__header">
        <h3>{title}</h3>
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </header>
      <div className="modal__body">{children}</div>
    </div>
  </div>
));

Modal.displayName = "Modal";

/** Small confirmation dialog with a secondary and a primary action. */
export const ConfirmDialog = ({ title, message, onCancel, cancelLabel = "Cancelar", onConfirm, confirmLabel, danger = false, top = true, children }) => (
  <Modal title={title} onClose={onCancel} compact top={top}>
    <div className="modal__form">
      {message ? <p className="modal__hint">{message}</p> : null}
      {children}
      <div className="template-confirm__actions">
        <button
          type="button"
          className="template-confirm__button template-confirm__button--secondary"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`template-confirm__button ${danger ? "template-confirm__button--danger" : "template-confirm__button--primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </Modal>
);

export default Modal;
