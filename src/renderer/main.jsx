import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("JW-Serial renderer error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-error">
          <section className="app-error__panel">
            <h1>JW-Serial encontr&oacute; un problema</h1>
            <p>La interfaz se detuvo antes de quedar en blanco. Puedes recargar la ventana para continuar.</p>
            <pre>{this.state.error.message}</pre>
            <button type="button" onClick={() => window.location.reload()}>
              Recargar interfaz
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root"));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
