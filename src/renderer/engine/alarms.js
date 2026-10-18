// Threshold alarms evaluated on every sample (not on the UI refresh), so
// short spikes are not missed. A rule triggers once when its condition has
// held for `minDurationSeconds`, and clears when the condition stops.

export const ALARM_CONDITIONS = [
  { id: "above", label: "Mayor que", values: 1 },
  { id: "below", label: "Menor que", values: 1 },
  { id: "outside", label: "Fuera del rango", values: 2 },
  { id: "inside", label: "Dentro del rango", values: 2 }
];

export const createAlarmRule = (channelId) => ({
  id: `alarm-${Date.now()}`,
  enabled: true,
  channelId,
  condition: "above",
  value: 0,
  value2: 1,
  minDurationSeconds: 0,
  notify: true,
  logEvent: true,
  capture: false,
  showOnPlot: true
});

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

const buildTest = (rule) => {
  const a = Number(rule.value);
  const b = Number(rule.value2);
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  switch (rule.condition) {
    case "below":
      return (value) => value < a;
    case "outside":
      return (value) => value < low || value > high;
    case "inside":
      return (value) => value >= low && value <= high;
    default:
      return (value) => value > a;
  }
};

export const describeAlarm = (rule, channelName) => {
  const condition = ALARM_CONDITIONS.find((item) => item.id === rule.condition) || ALARM_CONDITIONS[0];
  const range = condition.values === 2 ? `[${rule.value}, ${rule.value2}]` : `${rule.value}`;
  const duration = Number(rule.minDurationSeconds) > 0 ? ` durante ${rule.minDurationSeconds} s` : "";
  return `${channelName} ${condition.label.toLowerCase()} ${range}${duration}`;
};

/** Horizontal lines to draw on plots for a rule. */
export const alarmThresholds = (rule) => {
  const condition = ALARM_CONDITIONS.find((item) => item.id === rule.condition) || ALARM_CONDITIONS[0];
  return (condition.values === 2 ? [rule.value, rule.value2] : [rule.value]).map(Number).filter(Number.isFinite);
};

export class AlarmMonitor {
  constructor(readValue) {
    this.readValue = readValue;
    this.rules = [];
    this.pending = [];
  }

  setRules(rules) {
    const previous = new Map(this.rules.map((rule) => [rule.id, rule]));
    this.rules = rules
      .filter((rule) => rule.enabled !== false && rule.channelId)
      .map((rule) => {
        const old = previous.get(rule.id);
        const sameDefinition = old
          && old.channelId === rule.channelId
          && old.condition === rule.condition
          && Number(old.value) === Number(rule.value)
          && Number(old.value2) === Number(rule.value2);
        return {
          ...rule,
          test: buildTest(rule),
          minDurationMs: Math.max(0, Number(rule.minDurationSeconds) || 0) * 1000,
          // Keep the running state when only actions/duration changed.
          since: sameDefinition ? old.since : null,
          active: sameDefinition ? old.active : false
        };
      });
  }

  get activeIds() {
    return this.rules.filter((rule) => rule.active).map((rule) => rule.id);
  }

  check(sample) {
    for (const rule of this.rules) {
      const value = this.readValue(sample, rule.channelId);
      if (!isNumber(value)) {
        continue;
      }
      if (rule.test(value)) {
        if (rule.since === null) {
          rule.since = sample.timestamp;
        }
        if (!rule.active && sample.timestamp - rule.since >= rule.minDurationMs) {
          rule.active = true;
          this.pending.push({ type: "trigger", ruleId: rule.id, value, time: sample.timestamp });
        }
      } else {
        rule.since = null;
        if (rule.active) {
          rule.active = false;
          this.pending.push({ type: "clear", ruleId: rule.id, value, time: sample.timestamp });
        }
      }
    }
  }

  /** Returns and clears the events produced since the last call. */
  drain() {
    const events = this.pending;
    this.pending = [];
    return events;
  }

  reset() {
    this.rules.forEach((rule) => {
      rule.since = null;
      rule.active = false;
    });
    this.pending = [];
  }
}
