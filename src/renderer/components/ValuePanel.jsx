import React, { useRef, useState } from "react";
import { useEngineSnapshot } from "../hooks/useEngineSnapshot.js";
import { formatReadout } from "../lib/plotOverlay.js";
import { rawChannelValue } from "./channelDrag.js";

/**
 * Large readouts for a few selected channels, readable from a distance,
 * with the min/max seen since the panel was last reset.
 */
const ValuePanel = ({ engine, channels, selectedIds, onSelectionChange }) => {
  const snapshot = useEngineSnapshot(engine);
  const rangesRef = useRef(new Map());
  const [, setResetCount] = useState(0);

  const selected = channels.filter((channel) => selectedIds.includes(channel.id));

  // Track min/max once per snapshot (render-time, so the card is never a
  // refresh behind the value it shows).
  const lastSnapshotRef = useRef(null);
  if (lastSnapshotRef.current !== snapshot) {
    lastSnapshotRef.current = snapshot;
    selected.forEach((channel) => {
      const value = rawChannelValue(snapshot, channel.id);
      if (!Number.isFinite(value)) {
        return;
      }
      const range = rangesRef.current.get(channel.id);
      if (!range) {
        rangesRef.current.set(channel.id, { min: value, max: value });
        return;
      }
      range.min = Math.min(range.min, value);
      range.max = Math.max(range.max, value);
    });
  }

  const toggle = (channelId) =>
    onSelectionChange(selectedIds.includes(channelId)
      ? selectedIds.filter((id) => id !== channelId)
      : [...selectedIds, channelId]);

  const resetRanges = () => {
    rangesRef.current = new Map();
    lastSnapshotRef.current = null;
    setResetCount((count) => count + 1);
  };

  return (
    <div className="value-panel">
      <div className="value-panel__toolbar">
        <span>Mostrar:</span>
        {channels.map((channel) => (
          <button
            key={channel.id}
            type="button"
            className={`value-panel__chip ${selectedIds.includes(channel.id) ? "value-panel__chip--active" : ""}`}
            onClick={() => toggle(channel.id)}
          >
            <span className="plot__legend-dot" style={{ backgroundColor: channel.color }} />
            {channel.name}
          </button>
        ))}
        <button type="button" className="value-panel__reset" onClick={resetRanges}>
          Reiniciar min/max
        </button>
      </div>
      {selected.length === 0 ? (
        <p className="monitor__placeholder">Elige las variables que quieres ver en grande.</p>
      ) : (
        <div className="value-panel__grid">
          {selected.map((channel) => {
            const range = rangesRef.current.get(channel.id);
            return (
              <section key={channel.id} className="value-card" style={{ "--card-color": channel.color }}>
                <header>{channel.name}</header>
                <strong>
                  {formatReadout(rawChannelValue(snapshot, channel.id))}
                  {channel.calibration?.unit ? <small> {channel.calibration.unit}</small> : null}
                </strong>
                <footer>
                  <span>min {formatReadout(range?.min)}</span>
                  <span>max {formatReadout(range?.max)}</span>
                </footer>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ValuePanel;
