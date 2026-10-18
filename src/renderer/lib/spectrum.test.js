import assert from "node:assert/strict";
import test from "node:test";

import { amplitudeSpectrum, fft, histogram, noiseStatistics } from "./spectrum.js";

test("fft matches a direct DFT", () => {
  const n = 16;
  const signal = Array.from({ length: n }, (_, index) => Math.sin(index) + 0.3 * Math.cos(3 * index));
  const re = Float64Array.from(signal);
  const im = new Float64Array(n);
  fft(re, im);
  for (let k = 0; k < n; k += 1) {
    let sumRe = 0;
    let sumIm = 0;
    signal.forEach((value, index) => {
      sumRe += value * Math.cos((-2 * Math.PI * k * index) / n);
      sumIm += value * Math.sin((-2 * Math.PI * k * index) / n);
    });
    assert.ok(Math.abs(re[k] - sumRe) < 1e-9);
    assert.ok(Math.abs(im[k] - sumIm) < 1e-9);
  }
});

test("spectrum finds the tone frequency and amplitude", () => {
  const sampleRate = 1000;
  const values = Array.from({ length: 5000 }, (_, index) => 2.5 + 0.8 * Math.sin((2 * Math.PI * 50 * index) / sampleRate));
  const spectrum = amplitudeSpectrum(values, sampleRate);
  assert.equal(spectrum.size, 4096);
  assert.ok(Math.abs(spectrum.peak.frequency - 50) <= spectrum.resolution);
  assert.ok(Math.abs(spectrum.peak.amplitude - 0.8) < 0.1, `amplitude ${spectrum.peak.amplitude}`);
  assert.ok(spectrum.amplitudes[0] < 0.01, "mean removed (only window leakage remains)");
});

test("spectrum peak is interpolated between bins", () => {
  // 1 Hz square-wave-like case from the field: 1 Hz at 2 kSPS with 32768
  // points falls between bins (resolution 0.061 Hz).
  const sampleRate = 2000;
  for (const window of ["hann", "none"]) {
    for (const frequency of [1, 5.03, 123.456]) {
      const values = Array.from({ length: 40000 }, (_, index) => 3 * Math.sin((2 * Math.PI * frequency * index) / sampleRate));
      const spectrum = amplitudeSpectrum(values, sampleRate, { window });
      assert.ok(Math.abs(spectrum.peak.frequency - frequency) < spectrum.resolution / 50, `${window} ${frequency}: ${spectrum.peak.frequency}`);
      assert.ok(Math.abs(spectrum.peak.amplitude - 3) < 0.03, `${window} ${frequency}: amplitude ${spectrum.peak.amplitude}`);
    }
  }
});

test("a constant signal reports no spectral peak", () => {
  assert.equal(amplitudeSpectrum(new Array(1024).fill(2.5), 1000).peak, null);
});

test("noise statistics and ADC resolution figures", () => {
  // Alternating ±1 µV around 2.5 V: RMS 1 µV, p-p 2 µV.
  const values = Array.from({ length: 1000 }, (_, index) => 2.5 + (index % 2 ? 1e-6 : -1e-6));
  const stats = noiseStatistics(values, 5);
  assert.ok(Math.abs(stats.rms - 1e-6) < 1e-12);
  assert.ok(Math.abs(stats.peakToPeak - 2e-6) < 1e-12);
  assert.ok(Math.abs(stats.effectiveBits - Math.log2(5 / 1e-6)) < 1e-6);
  assert.ok(Math.abs(stats.noiseFreeBits - Math.log2(5 / 2e-6)) < 1e-6);
  assert.ok(Number.isNaN(noiseStatistics(values).effectiveBits));
});

test("histogram counts every value", () => {
  const result = histogram([0, 0.5, 1, 1, 1], 4);
  assert.equal(result.bins.reduce((sum, count) => sum + count, 0), 5);
  assert.equal(result.bins[3], 3);
});
