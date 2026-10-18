// Noise statistics, histogram and amplitude spectrum for ADC characterization.

/** In-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
export const fft = (re, im) => {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const stepRe = Math.cos(angle);
    const stepIm = Math.sin(angle);
    const half = size >> 1;
    for (let start = 0; start < n; start += size) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < half; k += 1) {
        const evenIndex = start + k;
        const oddIndex = evenIndex + half;
        const oddRe = re[oddIndex] * wRe - im[oddIndex] * wIm;
        const oddIm = re[oddIndex] * wIm + im[oddIndex] * wRe;
        re[oddIndex] = re[evenIndex] - oddRe;
        im[oddIndex] = im[evenIndex] - oddIm;
        re[evenIndex] += oddRe;
        im[evenIndex] += oddIm;
        const nextRe = wRe * stepRe - wIm * stepIm;
        wIm = wRe * stepIm + wIm * stepRe;
        wRe = nextRe;
      }
    }
  }
};

export const MAX_FFT_SIZE = 65536;

/**
 * Single-sided amplitude spectrum of the last power-of-two block of
 * `values`, mean removed, optionally Hann windowed. Amplitudes are in the
 * signal's units (a sine of amplitude A shows a peak of ~A).
 */
export const amplitudeSpectrum = (values, sampleRate, { window = "hann" } = {}) => {
  const size = Math.min(MAX_FFT_SIZE, 2 ** Math.floor(Math.log2(Math.max(2, values.length))));
  if (values.length < 8 || !(sampleRate > 0)) {
    return null;
  }
  const offset = values.length - size;
  let mean = 0;
  for (let index = 0; index < size; index += 1) {
    mean += values[offset + index];
  }
  mean /= size;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let windowSum = 0;
  for (let index = 0; index < size; index += 1) {
    const weight = window === "hann" ? 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1)) : 1;
    windowSum += weight;
    re[index] = (values[offset + index] - mean) * weight;
  }
  fft(re, im);
  const bins = size / 2 + 1;
  const frequencies = new Float64Array(bins);
  const amplitudes = new Float64Array(bins);
  let peakIndex = 1;
  for (let index = 0; index < bins; index += 1) {
    const scale = index === 0 || index === size / 2 ? 1 : 2;
    frequencies[index] = (index * sampleRate) / size;
    amplitudes[index] = (scale * Math.hypot(re[index], im[index])) / windowSum;
    if (index > 0 && amplitudes[index] > amplitudes[peakIndex]) {
      peakIndex = index;
    }
  }
  return {
    size,
    sampleRate,
    resolution: sampleRate / size,
    frequencies,
    amplitudes,
    peak: { frequency: frequencies[peakIndex], amplitude: amplitudes[peakIndex] }
  };
};

/**
 * Noise statistics. With a full-scale range (`fullScale`, same units as the
 * data) it also reports the ADC resolution figures used in datasheets:
 * effective resolution = log2(FSR / RMS noise) and
 * noise-free resolution = log2(FSR / peak-to-peak noise).
 */
export const noiseStatistics = (values, fullScale = Number.NaN) => {
  const count = values.length;
  if (!count) {
    return null;
  }
  const shift = values[0];
  let sum = 0;
  let sumSq = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const shifted = value - shift;
    sum += shifted;
    sumSq += shifted * shifted;
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  const meanShifted = sum / count;
  const rms = Math.sqrt(Math.max(0, sumSq / count - meanShifted * meanShifted));
  const peakToPeak = max - min;
  const hasRange = Number.isFinite(fullScale) && fullScale > 0;
  return {
    count,
    mean: shift + meanShifted,
    rms,
    peakToPeak,
    min,
    max,
    crestFactor: rms > 0 ? peakToPeak / rms : Number.NaN,
    effectiveBits: hasRange && rms > 0 ? Math.log2(fullScale / rms) : Number.NaN,
    noiseFreeBits: hasRange && peakToPeak > 0 ? Math.log2(fullScale / peakToPeak) : Number.NaN
  };
};

export const histogram = (values, binCount = 60) => {
  if (!values.length) {
    return null;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (min === max) {
    max = min + 1e-12;
  }
  const bins = new Uint32Array(binCount);
  const width = (max - min) / binCount;
  for (const value of values) {
    bins[Math.min(binCount - 1, Math.floor((value - min) / width))] += 1;
  }
  return { min, max, width, bins };
};
