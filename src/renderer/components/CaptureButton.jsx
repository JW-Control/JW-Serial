import React, { useEffect, useState } from "react";
import { clamp } from "../lib/axisScale.js";

const formatRemaining = (ms) => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/** Capture button with the auto-capture countdown. Owns its 1 s ticker. */
const CaptureButton = ({ captureConfig, isConnected, nextCaptureAt, onCapture }) => {
  const [now, setNow] = useState(Date.now());
  const isCounting = Boolean(captureConfig.enabled && isConnected && captureConfig.directory && nextCaptureAt);

  useEffect(() => {
    if (!isCounting) {
      return undefined;
    }
    setNow(Date.now());
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, [isCounting]);

  const intervalMs = Math.max(1, Number(captureConfig.intervalMinutes) || 10) * 60 * 1000;
  const remainingMs = nextCaptureAt ? Math.max(0, nextCaptureAt - now) : intervalMs;
  const progress = isCounting ? clamp(1 - remainingMs / intervalMs, 0, 1) : 0;
  let label = "Capturar plots";
  if (isCounting) {
    label = `Capturar plots - ${formatRemaining(remainingMs)}`;
  } else if (captureConfig.enabled && !isConnected) {
    label = "Capturar plots - sin COM";
  } else if (captureConfig.enabled && !captureConfig.directory) {
    label = "Capturar plots - sin carpeta";
  }

  return (
    <button
      type="button"
      className="capture-status-button"
      style={{ "--capture-progress": `${progress * 100}%` }}
      onClick={() => onCapture()}
    >
      <span>{label}</span>
    </button>
  );
};

export default CaptureButton;
