// Per-channel calibration: value' = filter(value * scale + offset).
// Filters: moving average over N samples, or first-order low-pass with a
// cutoff in Hz (uses the real time between samples).

export const defaultCalibration = { scale: 1, offset: 0, unit: "", filter: "none", filterValue: 10 };

export const isIdentityCalibration = (calibration) =>
  !calibration
  || ((Number(calibration.scale ?? 1) === 1 || !Number.isFinite(Number(calibration.scale)))
    && !Number(calibration.offset)
    && (calibration.filter || "none") === "none");

const createFilter = (calibration) => {
  const filterValue = Number(calibration.filterValue);
  if (calibration.filter === "average") {
    const size = Math.max(1, Math.round(filterValue) || 1);
    const ring = new Float64Array(size);
    let count = 0;
    let index = 0;
    let sum = 0;
    return (value) => {
      if (!Number.isFinite(value)) {
        return value;
      }
      if (count === size) {
        sum -= ring[index];
      } else {
        count += 1;
      }
      ring[index] = value;
      sum += value;
      index = (index + 1) % size;
      return sum / count;
    };
  }
  if (calibration.filter === "lowpass") {
    const cutoff = Math.max(1e-6, filterValue || 1);
    const rc = 1 / (2 * Math.PI * cutoff);
    let state = Number.NaN;
    let lastTime = Number.NaN;
    return (value, time) => {
      if (!Number.isFinite(value)) {
        return value;
      }
      if (!Number.isFinite(state)) {
        state = value;
      } else {
        const dt = Math.max(0, (time - lastTime) / 1000);
        state += (dt / (rc + dt)) * (value - state);
      }
      lastTime = time;
      return state;
    };
  }
  return (value) => value;
};

/**
 * Builds the transform for a channel list. Returns null when no channel is
 * calibrated, otherwise `apply(values, time)` returning a new array.
 */
export const createCalibrationTransform = (calibrations) => {
  if (!calibrations?.some((calibration) => !isIdentityCalibration(calibration))) {
    return null;
  }
  const channels = calibrations.map((calibration) => {
    if (isIdentityCalibration(calibration)) {
      return null;
    }
    const scale = Number.isFinite(Number(calibration.scale)) ? Number(calibration.scale) : 1;
    const offset = Number(calibration.offset) || 0;
    const filter = createFilter(calibration);
    return (value, time) => filter(value * scale + offset, time);
  });
  return (values, time) => values.map((value, index) => (channels[index] ? channels[index](value, time) : value));
};
