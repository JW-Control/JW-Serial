// Session report as a self-contained, print-friendly HTML document.

import { formatReadout } from "./plotOverlay.js";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const pad = (value) => String(value).padStart(2, "0");

export const formatDateTime = (time) => {
  if (!Number.isFinite(time)) {
    return "—";
  }
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours ? `${hours} h ${pad(minutes)} min` : minutes ? `${minutes} min ${pad(seconds)} s` : `${seconds} s`;
};

const table = (headers, rows) => `
  <table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>`;

/**
 * @param report.title, report.label, report.notes, report.generatedAt
 * @param report.connection  { port, baudRate, sps, frames, seqLost }
 * @param report.dataRange   { start, end, samples }
 * @param report.channels    [{ name, unit, count, mean, rms, min, max, peakToPeak }]
 * @param report.alarms      [{ description, triggers }]
 * @param report.recordings  [string]
 * @param report.events      [{ time, type, detail }]
 * @param report.images      [{ title, dataUrl }]
 */
export const buildReportHtml = (report) => {
  const sections = [];
  sections.push(`
    <section class="summary">
      <div><span>Lote / tarjeta</span><strong>${escapeHtml(report.label || "—")}</strong></div>
      <div><span>Generado</span><strong>${escapeHtml(formatDateTime(report.generatedAt))}</strong></div>
      <div><span>Puerto</span><strong>${escapeHtml(report.connection?.port || "—")} · ${escapeHtml(report.connection?.baudRate || "—")} baud</strong></div>
      <div><span>Datos en memoria</span><strong>${escapeHtml(formatDateTime(report.dataRange?.start))} → ${escapeHtml(formatDateTime(report.dataRange?.end))} (${escapeHtml(formatDuration(report.dataRange?.end - report.dataRange?.start))})</strong></div>
      <div><span>Muestras</span><strong>${escapeHtml((report.dataRange?.samples ?? 0).toLocaleString("es"))}</strong></div>
      <div><span>SPS medido</span><strong>${escapeHtml(formatReadout(report.connection?.sps))}</strong></div>
      <div><span>Muestras perdidas (secuencia)</span><strong>${escapeHtml(report.connection?.seqLost ?? 0)}</strong></div>
    </section>`);

  if (report.notes?.trim()) {
    sections.push(`<h2>Notas</h2><p class="notes">${escapeHtml(report.notes).replace(/\n/g, "<br>")}</p>`);
  }

  if (report.channels?.length) {
    sections.push(`<h2>Estadísticas de las señales</h2>${table(
      ["Señal", "Unidad", "Muestras", "Promedio", "Ruido RMS", "Mínimo", "Máximo", "Pico a pico"],
      report.channels.map((channel) => [
        channel.name,
        channel.unit || "",
        (channel.count ?? 0).toLocaleString("es"),
        formatReadout(channel.mean),
        formatReadout(channel.rms),
        formatReadout(channel.min),
        formatReadout(channel.max),
        formatReadout(channel.peakToPeak)
      ])
    )}`);
  }

  if (report.images?.length) {
    sections.push(`<h2>Gráficos</h2>${report.images.map((image) => `
      <figure><img src="${image.dataUrl}" alt="${escapeHtml(image.title)}"><figcaption>${escapeHtml(image.title)}</figcaption></figure>`).join("")}`);
  }

  if (report.alarms?.length) {
    sections.push(`<h2>Alarmas</h2>${table(
      ["Regla", "Disparos en la sesión"],
      report.alarms.map((alarm) => [alarm.description, alarm.triggers])
    )}`);
  }

  if (report.recordings?.length) {
    sections.push(`<h2>Grabaciones</h2><ul>${report.recordings.map((path) => `<li>${escapeHtml(path)}</li>`).join("")}</ul>`);
  }

  if (report.events?.length) {
    sections.push(`<h2>Eventos</h2>${table(
      ["Hora", "Tipo", "Detalle"],
      report.events.map((event) => [formatDateTime(event.time), event.type, event.detail])
    )}`);
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(report.title)}</title>
<style>
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #0f172a; margin: 32px; font-size: 12px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 24px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
  .subtitle { color: #64748b; margin: 0 0 16px; }
  .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 24px; }
  .summary div { display: flex; flex-direction: column; }
  .summary span { color: #64748b; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 8px; text-align: left; }
  th { background: #f1f5f9; }
  figure { margin: 0 0 16px; page-break-inside: avoid; }
  figure img { width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; }
  figcaption { color: #64748b; font-size: 11px; margin-top: 4px; }
  .notes { white-space: normal; }
  @page { size: A4; margin: 14mm; }
</style>
</head>
<body>
<h1>${escapeHtml(report.title)}</h1>
<p class="subtitle">Generado con JW-Serial</p>
${sections.join("\n")}
</body>
</html>`;
};
