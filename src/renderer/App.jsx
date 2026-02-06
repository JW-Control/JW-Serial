import React, { useMemo, useState } from "react";

const defaultChannels = Array.from({ length: 10 }, (_, index) => ({
  id: `val${index}`,
  name: `val${index}`,
  color: `hsl(${index * 32} 70% 50%)`,
  value: 0
}));

const defaultPlots = [
  {
    id: "plot-1",
    title: "Plot 1",
    channels: ["val0", "val1"]
  },
  {
    id: "plot-2",
    title: "Plot 2",
    channels: ["val2", "val3"]
  }
];

export default function App() {
  const [plots, setPlots] = useState(defaultPlots);
  const channels = useMemo(() => defaultChannels, []);

  const addPlot = () => {
    setPlots((prev) => [
      ...prev,
      {
        id: `plot-${prev.length + 1}`,
        title: `Plot ${prev.length + 1}`,
        channels: []
      }
    ]);
  };

  const removePlot = () => {
    setPlots((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar__header">
          <h1>JW-Serial</h1>
          <p>MVP · Windows</p>
        </header>

        <section className="sidebar__section">
          <h2>Conexión</h2>
          <label className="field">
            Puerto
            <select>
              <option>COM3</option>
              <option>COM4</option>
            </select>
          </label>
          <label className="field">
            Baudrate
            <select>
              <option>9600</option>
              <option>115200</option>
              <option>230400</option>
            </select>
          </label>
        </section>

        <section className="sidebar__section">
          <h2>Variables</h2>
          <div className="channel-table">
            {channels.map((channel) => (
              <div className="channel-row" key={channel.id}>
                <span
                  className="channel-color"
                  style={{ backgroundColor: channel.color }}
                />
                <span className="channel-name">{channel.name}</span>
                <span className="channel-value">{channel.value.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="sidebar__section">
          <h2>Acciones</h2>
          <div className="actions">
            <button type="button">Configuración básica</button>
            <button type="button">Configuración avanzada</button>
            <button type="button">Pausar</button>
            <button type="button">Limpiar buffer</button>
            <button type="button">Exportar CSV</button>
            <button type="button">Guardar configuración</button>
            <button type="button">Cargar configuración</button>
          </div>
        </section>
      </aside>

      <main className="main">
        <div className="main__toolbar">
          <div className="tabs">
            <button type="button" className="tab tab--active">
              Plotter
            </button>
            <button type="button" className="tab">
              Monitor
            </button>
          </div>
          <div className="plot-actions">
            <button type="button" onClick={addPlot}>
              Add Plot
            </button>
            <button type="button" onClick={removePlot}>
              Remove Plot
            </button>
          </div>
        </div>

        <div className="plots">
          {plots.map((plot) => (
            <section className="plot" key={plot.id}>
              <header className="plot__header">
                <h3>{plot.title}</h3>
                <div className="plot__legend">
                  {plot.channels.length === 0
                    ? "Sin canales"
                    : plot.channels.join(", ")}
                </div>
              </header>
              <div className="plot__canvas">
                <span>Área de gráfico (uPlot)</span>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
