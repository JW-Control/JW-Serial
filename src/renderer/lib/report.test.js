import assert from "node:assert/strict";
import test from "node:test";

import { buildReportHtml } from "./report.js";

test("report escapes user text and includes every section", () => {
  const html = buildReportHtml({
    title: "Prueba <PCB>",
    label: "PCB_0116",
    notes: "Línea 1\nLínea <2>",
    generatedAt: Date.UTC(2026, 4, 10, 12),
    connection: { port: "COM9", baudRate: 921600, sps: 2000, seqLost: 0 },
    dataRange: { start: 0, end: 60000, samples: 120000 },
    channels: [{ name: "uV", unit: "µV", count: 10, mean: 1, rms: 0.1, min: 0.8, max: 1.2, peakToPeak: 0.4 }],
    alarms: [{ description: "uV mayor que 2", triggers: 3 }],
    recordings: ["C:\\\\datos\\\\Datos.csv"],
    events: [{ time: 0, type: "event", detail: "Inicio" }],
    images: [{ title: "Plot 1", dataUrl: "data:image/png;base64,AAAA" }]
  });
  assert.match(html, /<title>Prueba &lt;PCB&gt;<\/title>/);
  assert.match(html, /Línea 1<br>Línea &lt;2&gt;/);
  ["Estadísticas de las señales", "Gráficos", "Alarmas", "Grabaciones", "Eventos", "µV", "1 min 00 s"].forEach((text) => assert.ok(html.includes(text), text));
});
