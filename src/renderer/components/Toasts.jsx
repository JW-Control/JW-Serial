import React from "react";

/** Transient notifications (alarms, recording) stacked in a corner. */
const Toasts = ({ toasts, onDismiss }) => (
  <div className="toasts" aria-live="polite">
    {toasts.map((toast) => (
      <div key={toast.id} className={`toast toast--${toast.tone || "info"}`}>
        <div>
          <strong>{toast.title}</strong>
          {toast.body ? <span>{toast.body}</span> : null}
        </div>
        <button type="button" onClick={() => onDismiss(toast.id)} aria-label="Cerrar aviso">×</button>
      </div>
    ))}
  </div>
);

export default Toasts;
