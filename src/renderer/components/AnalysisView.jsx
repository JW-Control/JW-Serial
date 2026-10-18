import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatTick, makeTicks } from "../lib/axisScale.js";
import { plotThemes } from "../lib/plotFrame.js";
import { formatReadout } from "../lib/plotOverlay.js";
import { amplitudeSpectrum, histogram, noiseStatistics } from "../lib/spectrum.js";

const CHART_PADDING = { top: 16, right: 20, bottom: 40, left: 72 };

/** Minimal 2D chart: line or bars with ticks, drawn on a canvas. */
const drawChart = (canvas, { kind, xs, ys, overlay, xLabel, yLabel, color, theme }) => {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  const width = rect.width;
  const height = rect.height;
  context.clearRect(0, 0, width, height);
  if (!xs?.length) {
    return;
  }
  const { top, right, bottom, left } = CHART_PADDING;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  [ys, overlay?.ys].filter(Boolean).forEach((series) => series.forEach((value) => {
    if (Number.isFinite(value)) {
      yMin = Math.min(yMin, value);
      yMax = Math.max(yMax, value);
    }
  }));
  if (kind === "bars") {
    yMin = 0;
  }
  if (!Number.isFinite(yMin)) {
    return;
  }
  const xTicks = makeTicks(xs[0], xs[xs.length - 1], 8);
  const yTicks = makeTicks(yMin, yMax === yMin ? yMin + 1 : yMax, 6);
  const toX = (value) => left + ((value - xTicks.min) / (xTicks.max - xTicks.min || 1)) * plotWidth;
  const toY = (value) => top + plotHeight - ((value - yTicks.min) / (yTicks.max - yTicks.min || 1)) * plotHeight;

  context.font = "11px system-ui, sans-serif";
  context.lineWidth = 1;
  context.strokeStyle = theme.gridMajor;
  context.fillStyle = theme.tick;
  context.textAlign = "center";
  context.textBaseline = "top";
  xTicks.ticks.forEach((tick) => {
    const x = toX(tick);
    context.beginPath();
    context.moveTo(x, top);
    context.lineTo(x, top + plotHeight);
    context.stroke();
    context.fillText(formatTick(tick, xTicks.step), x, top + plotHeight + 6);
  });
  context.textAlign = "right";
  context.textBaseline = "middle";
  yTicks.ticks.forEach((tick) => {
    const y = toY(tick);
    context.beginPath();
    context.moveTo(left, y);
    context.lineTo(left + plotWidth, y);
    context.stroke();
    context.fillText(formatTick(tick, yTicks.step), left - 8, y);
  });
  context.strokeStyle = theme.axis;
  context.strokeRect(left, top, plotWidth, plotHeight);
  context.textAlign = "center";
  context.textBaseline = "bottom";
  context.fillText(xLabel, left + plotWidth / 2, height - 2);
  context.save();
  context.translate(12, top + plotHeight / 2);
  context.rotate(-Math.PI / 2);
  context.textBaseline = "top";
  context.fillText(yLabel, 0, -6);
  context.restore();

  context.save();
  context.beginPath();
  context.rect(left, top, plotWidth, plotHeight);
  context.clip();
  if (kind === "bars") {
    const barWidth = Math.max(1, plotWidth / xs.length - 1);
    context.fillStyle = color;
    context.globalAlpha = 0.75;
    xs.forEach((x, index) => {
      const y = toY(ys[index]);
      context.fillRect(toX(x) - barWidth / 2, y, barWidth, top + plotHeight - y);
    });
    context.globalAlpha = 1;
  } else {
    context.strokeStyle = color;
    context.lineWidth = 1.25;
    context.beginPath();
    xs.forEach((x, index) => {
      const y = toY(ys[index]);
      if (index === 0) {
        context.moveTo(toX(x), y);
      } else {
        context.lineTo(toX(x), y);
      }
    });
    context.stroke();
  }
  if (overlay) {
    context.strokeStyle = overlay.color;
    context.lineWidth = 1.5;
    context.setLineDash([5, 3]);
    context.beginPath();
    overlay.xs.forEach((x, index) => {
      const y = toY(overlay.ys[index]);
      if (index === 0) {
        context.moveTo(toX(x), y);
      } else {
        context.lineTo(toX(x), y);
      }
    });
    context.stroke();
  }
  context.restore();
};

const Stat = ({ label, value, hint }) => (
  <div className="analysis-stat" title={hint}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

/**
 * Noise and spectrum analysis of one channel over the last N seconds:
 * RMS/peak-to-peak noise, ADC effective and noise-free bits, amplitude
 * spectrum (FFT, Hann window) and histogram with the fitted Gaussian.
 */
const AnalysisView = ({ engine, channels, settings, onSettingsChange, theme }) => {
  const [result, setResult] = useState(null);
  const spectrumRef = useRef(null);
  const histogramRef = useRef(null);
  const colors = plotThemes[theme] || plotThemes.light;
  const channel = channels.find((item) => item.id === settings.channelId) || channels[0];

  const update = (patch) => onSettingsChange({ ...settings, ...patch });

  const compute = useCallback(() => {
    if (!channel) {
      setResult(null);
      return;
    }
    const view = engine.getView(Math.max(0.1, Number(settings.seconds) || 10));
    const values = [];
    let firstTime = Number.NaN;
    let lastTime = Number.NaN;
    view.forEach((sample) => {
      const value = engine.readValue(sample, channel.id);
      if (Number.isFinite(value)) {
        values.push(value);
        if (!Number.isFinite(firstTime)) {
          firstTime = sample.timestamp;
        }
        lastTime = sample.timestamp;
      }
    });
    if (values.length < 8) {
      setResult({ empty: true });
      return;
    }
    const sampleRate = (values.length - 1) / ((lastTime - firstTime) / 1000);
    setResult({
      sampleRate,
      stats: noiseStatistics(values, Number(settings.fullScale)),
      spectrum: amplitudeSpectrum(values, sampleRate, { window: settings.window }),
      histogram: histogram(values, 60)
    });
  }, [engine, channel, settings.seconds, settings.fullScale, settings.window]);

  useEffect(() => {
    compute();
    if (!settings.autoRefresh) {
      return undefined;
    }
    const timer = window.setInterval(compute, 1000);
    return () => window.clearInterval(timer);
  }, [compute, settings.autoRefresh]);

  useEffect(() => {
    const color = channel?.color || "#2563eb";
    if (spectrumRef.current) {
      const spectrum = result?.spectrum;
      const useDb = settings.scale === "db";
      const xs = spectrum ? Array.from(spectrum.frequencies).slice(1) : [];
      const ys = spectrum
        ? Array.from(spectrum.amplitudes).slice(1).map((value) => (useDb ? 20 * Math.log10(Math.max(value, 1e-15)) : value))
        : [];
      drawChart(spectrumRef.current, {
        kind: "line",
        xs,
        ys,
        xLabel: "Frecuencia (Hz)",
        yLabel: useDb ? "Amplitud (dB)" : "Amplitud",
        color,
        theme: colors
      });
    }
    if (histogramRef.current) {
      const hist = result?.histogram;
      const stats = result?.stats;
      const xs = hist ? Array.from(hist.bins, (_, index) => hist.min + (index + 0.5) * hist.width) : [];
      const ys = hist ? Array.from(hist.bins) : [];
      const gaussian = hist && stats?.rms > 0
        ? {
            color: colors.tick,
            xs,
            ys: xs.map((x) => (stats.count * hist.width) / (stats.rms * Math.sqrt(2 * Math.PI))
              * Math.exp(-((x - stats.mean) ** 2) / (2 * stats.rms ** 2)))
          }
        : null;
      drawChart(histogramRef.current, {
        kind: "bars",
        xs,
        ys,
        overlay: gaussian,
        xLabel: channel?.name || "Valor",
        yLabel: "Muestras",
        color,
        theme: colors
      });
    }
  }, [result, settings.scale, channel, colors]);

  const stats = result?.stats;
  return (
    <div className="analysis">
      <div className="analysis__controls">
        <label>
          Señal
          <select value={channel?.id || ""} onChange={(event) => update({ channelId: event.target.value })}>
            {channels.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Últimos (s)
          <input type="number" min="0.1" step="any" value={settings.seconds} onChange={(event) => update({ seconds: event.target.value })} />
        </label>
        <label title="Rango de entrada completo del ADC en las mismas unidades de la señal (por ejemplo 2·Vref/ganancia)">
          Escala completa
          <input type="number" min="0" step="any" value={settings.fullScale} placeholder="opcional" onChange={(event) => update({ fullScale: event.target.value })} />
        </label>
        <label>
          Ventana FFT
          <select value={settings.window} onChange={(event) => update({ window: event.target.value })}>
            <option value="hann">Hann</option>
            <option value="none">Rectangular</option>
          </select>
        </label>
        <label>
          Escala
          <select value={settings.scale} onChange={(event) => update({ scale: event.target.value })}>
            <option value="db">dB</option>
            <option value="linear">Lineal</option>
          </select>
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.autoRefresh} onChange={(event) => update({ autoRefresh: event.target.checked })} />
          Actualizar cada 1 s
        </label>
        {!settings.autoRefresh ? <button type="button" onClick={compute}>Calcular</button> : null}
      </div>

      {!channel ? <p className="monitor__placeholder">No hay señales disponibles.</p> : null}
      {result?.empty ? <p className="monitor__placeholder">Faltan datos en la ventana elegida.</p> : null}

      <div className="analysis__stats">
        <Stat label="Muestras" value={stats ? stats.count.toLocaleString("es") : "—"} />
        <Stat label="Tasa (SPS)" value={formatReadout(result?.sampleRate)} />
        <Stat label="Promedio" value={formatReadout(stats?.mean)} />
        <Stat label="Ruido RMS" value={formatReadout(stats?.rms)} hint="Desviación estándar de la señal" />
        <Stat label="Ruido p-p" value={formatReadout(stats?.peakToPeak)} />
        <Stat label="p-p / RMS" value={formatReadout(stats?.crestFactor)} hint="≈6.6 para ruido gaussiano (criterio de datasheets)" />
        <Stat label="Bits efectivos" value={formatReadout(stats?.effectiveBits)} hint="log2(escala completa / ruido RMS)" />
        <Stat label="Bits sin ruido" value={formatReadout(stats?.noiseFreeBits)} hint="log2(escala completa / ruido p-p)" />
        <Stat
          label="Pico FFT"
          value={result?.spectrum ? `${formatReadout(result.spectrum.peak.frequency)} Hz` : "—"}
          hint={result?.spectrum ? `Amplitud ${formatReadout(result.spectrum.peak.amplitude)} · resolución ${formatReadout(result.spectrum.resolution)} Hz · ${result.spectrum.size} puntos` : undefined}
        />
      </div>

      <div className="analysis__charts">
        <section>
          <h3>Espectro</h3>
          <canvas ref={spectrumRef} />
        </section>
        <section>
          <h3>Histograma</h3>
          <canvas ref={histogramRef} />
        </section>
      </div>
    </div>
  );
};

export default AnalysisView;
