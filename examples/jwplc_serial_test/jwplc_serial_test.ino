/*
  JW-Serial test sketch for JWPLC Basic (ESP32-WROOM-32E, Arduino IDE)

  Generates known signals at a precise sample rate so every JW-Serial
  feature can be checked against expected values:

    sine   : 5 Hz sine, amplitude 1000, plus gaussian noise  -> FFT peak at 5 Hz
    ramp   : sawtooth 0..100 every 2 s                         -> X/Y, cursors, delta
    square : 1 Hz square wave 0/1                               -> alarms, thresholds
    vref   : 2.500000 V with 2 uV RMS gaussian noise            -> noise analysis,
                                                                   effective bits (FSR 5 V)
    adc    : optional real analog input (USE_ANALOG_INPUT)

  Frame formats (command FMT):
    CSV : seq,t_ms,sine,ramp,square,vref[,adc]
    KV  : SEQ:12,T:123.456,sine:..,ramp:..,square:..,vref:..[,adc:..]

  Commands (send with newline, e.g. from JW-Serial's monitor or quick commands):
    HELP              list commands
    RATE <sps>        sample rate, 1..5000 (default 60)
    FMT CSV|KV        frame format (default CSV)
    SEQ ON|OFF        sequence counter column (default ON)
    TS ON|OFF         device timestamp column in ms (default ON)
    NOISE <uV>        vref noise RMS in microvolts (default 2)
    DROP <n>          skip n samples once (tests "Perdidos"/gap detection)
    GLITCH            one +5000 spike on sine (tests alarms/cursors)
    WRAP              jump the sequence to 65530 (the jump counts as one gap;
                      the 65535 -> 0 rollover after it must NOT count as a reset)
    INFO              print a non-data "+INFO:" line (tests frame filters)
    STOP / START      pause / resume streaming
    PROFILE LOW       60 SPS, CSV        (preset for normal use)
    PROFILE HIGH      2000 SPS, CSV      (preset for the 2 kSPS test)

  Throughput: at 921600 baud the link carries ~92 kB/s. A CSV frame with
  seq + timestamp + 4 values is ~40 bytes, so 2000 SPS uses ~80 kB/s (~87 %
  of the link). Use FMT CSV at 2 kSPS (KV frames are longer); TS OFF saves
  another ~9 bytes per frame if you need margin.
*/

#include <Arduino.h>
#include <math.h>
#include <esp_random.h>
#include <esp_timer.h>

// ----------------------------------------------------------------- config

#define SERIAL_BAUD 921600       // must match JW-Serial's baudrate
#define DEFAULT_SPS 60
#define USE_ANALOG_INPUT 0       // 1 = add an "adc" column read from ANALOG_PIN
#define ANALOG_PIN 34            // set to the JWPLC Basic analog input pin you use

// ------------------------------------------------------------------ state

static uint32_t samplesPerSecond = DEFAULT_SPS;
static uint32_t periodUs = 1000000UL / DEFAULT_SPS;
static uint64_t nextSampleUs = 0;
static uint16_t sequence = 0;
static uint64_t sampleIndex = 0;
static bool streaming = true;
static bool formatKeyValue = false;
static bool includeSequence = true;
static bool includeTimestamp = true;
static float vrefNoiseUv = 2.0f;
static uint32_t pendingDrops = 0;
static bool pendingGlitch = false;

static char frame[160];
static char commandBuffer[48];
static size_t commandLength = 0;
static uint32_t lastCommandCharMs = 0;

// --------------------------------------------------------------- helpers

// Standard normal random number (Box-Muller) from the hardware RNG.
static float gaussian() {
  static bool hasSpare = false;
  static float spare = 0.0f;
  if (hasSpare) {
    hasSpare = false;
    return spare;
  }
  float u1 = (esp_random() + 1.0f) / 4294967297.0f;
  float u2 = esp_random() / 4294967296.0f;
  float radius = sqrtf(-2.0f * logf(u1));
  spare = radius * sinf(2.0f * PI * u2);
  hasSpare = true;
  return radius * cosf(2.0f * PI * u2);
}

static void setRate(uint32_t sps) {
  samplesPerSecond = constrain(sps, 1UL, 5000UL);
  periodUs = 1000000UL / samplesPerSecond;
  nextSampleUs = esp_timer_get_time();
}

static void printHelp() {
  Serial.println(F("+INFO: JW-Serial test. Commands: HELP, RATE <sps>, FMT CSV|KV, SEQ ON|OFF, TS ON|OFF,"));
  Serial.println(F("+INFO: NOISE <uV>, DROP <n>, GLITCH, WRAP, INFO, STOP, START, PROFILE LOW|HIGH"));
  Serial.printf("+INFO: rate=%lu SPS fmt=%s seq=%s ts=%s noise=%.2f uV baud=%d\n",
                (unsigned long)samplesPerSecond, formatKeyValue ? "KV" : "CSV",
                includeSequence ? "ON" : "OFF", includeTimestamp ? "ON" : "OFF", vrefNoiseUv, SERIAL_BAUD);
}

static bool parseOnOff(const char *argument, bool current) {
  if (!strcasecmp(argument, "ON") || !strcmp(argument, "1")) {
    return true;
  }
  if (!strcasecmp(argument, "OFF") || !strcmp(argument, "0")) {
    return false;
  }
  return current;
}

static void handleCommand(char *line) {
  char *command = strtok(line, " \t");
  char *argument = strtok(nullptr, " \t");
  if (!command) {
    return;
  }
  const char *value = argument ? argument : "";

  if (!strcasecmp(command, "HELP")) {
    printHelp();
  } else if (!strcasecmp(command, "RATE")) {
    setRate(strtoul(value, nullptr, 10));
    Serial.printf("+INFO: rate=%lu SPS\n", (unsigned long)samplesPerSecond);
  } else if (!strcasecmp(command, "FMT")) {
    formatKeyValue = !strcasecmp(value, "KV");
    Serial.printf("+INFO: fmt=%s\n", formatKeyValue ? "KV" : "CSV");
  } else if (!strcasecmp(command, "SEQ")) {
    includeSequence = parseOnOff(value, includeSequence);
    Serial.printf("+INFO: seq=%s\n", includeSequence ? "ON" : "OFF");
  } else if (!strcasecmp(command, "TS")) {
    includeTimestamp = parseOnOff(value, includeTimestamp);
    Serial.printf("+INFO: ts=%s\n", includeTimestamp ? "ON" : "OFF");
  } else if (!strcasecmp(command, "NOISE")) {
    vrefNoiseUv = max(0.0f, (float)atof(value));
    Serial.printf("+INFO: noise=%.2f uV\n", vrefNoiseUv);
  } else if (!strcasecmp(command, "DROP")) {
    pendingDrops = strtoul(value, nullptr, 10);
    Serial.printf("+INFO: dropping %lu samples\n", (unsigned long)pendingDrops);
  } else if (!strcasecmp(command, "GLITCH")) {
    pendingGlitch = true;
  } else if (!strcasecmp(command, "WRAP")) {
    sequence = 65530;
    Serial.println(F("+INFO: sequence set to 65530"));
  } else if (!strcasecmp(command, "INFO")) {
    Serial.println(F("+INFO: this line is not a data frame"));
  } else if (!strcasecmp(command, "STOP")) {
    streaming = false;
    Serial.println(F("+INFO: stopped"));
  } else if (!strcasecmp(command, "START")) {
    streaming = true;
    nextSampleUs = esp_timer_get_time();
    Serial.println(F("+INFO: started"));
  } else if (!strcasecmp(command, "PROFILE")) {
    bool high = !strcasecmp(value, "HIGH");
    formatKeyValue = false;
    setRate(high ? 2000 : 60);
    Serial.printf("+INFO: profile %s (%lu SPS, CSV)\n", high ? "HIGH" : "LOW", (unsigned long)samplesPerSecond);
  } else {
    Serial.printf("+INFO: unknown command '%s' (send HELP)\n", command);
  }
}

static void runPendingCommand() {
  if (commandLength) {
    commandBuffer[commandLength] = '\0';
    handleCommand(commandBuffer);
    commandLength = 0;
  }
}

static void readCommands() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    lastCommandCharMs = millis();
    if (c == '\r' || c == '\n') {
      runPendingCommand();
    } else if (commandLength < sizeof(commandBuffer) - 1) {
      commandBuffer[commandLength++] = c;
    }
  }
  // Commands sent without a line ending ("Sin ajuste") run after 150 ms of
  // silence, so they never get glued to the next command.
  if (commandLength && millis() - lastCommandCharMs > 150) {
    runPendingCommand();
  }
}

// Appends one field to the frame, as "name:value" (KV) or "value" (CSV).
static int appendField(int position, const char *name, const char *format, double value) {
  if (position > 0) {
    frame[position++] = ',';
  }
  if (formatKeyValue) {
    position += snprintf(frame + position, sizeof(frame) - position, "%s:", name);
  }
  position += snprintf(frame + position, sizeof(frame) - position, format, value);
  return position;
}

static void emitSample() {
  const double t = sampleIndex / (double)samplesPerSecond;  // ideal sample time, seconds
  sampleIndex++;

  double sine = 1000.0 * sin(2.0 * PI * 5.0 * t) + 20.0 * gaussian();
  if (pendingGlitch) {
    sine += 5000.0;
    pendingGlitch = false;
  }
  const double ramp = fmod(t, 2.0) * 50.0;
  const double square = fmod(t, 1.0) < 0.5 ? 1.0 : 0.0;
  const double vref = 2.5 + vrefNoiseUv * 1e-6 * gaussian();

  int position = 0;
  if (includeSequence) {
    position = appendField(position, "SEQ", "%.0f", sequence);
  }
  if (includeTimestamp) {
    // Real send time (not the ideal schedule), so JW-Serial's jitter
    // reading reflects how regular the firmware actually is.
    position = appendField(position, "T", "%.1f", esp_timer_get_time() / 1000.0);
  }
  position = appendField(position, "sine", "%.1f", sine);
  position = appendField(position, "ramp", "%.1f", ramp);
  position = appendField(position, "square", "%.0f", square);
  position = appendField(position, "vref", "%.7f", vref);
#if USE_ANALOG_INPUT
  position = appendField(position, "adc", "%.0f", analogRead(ANALOG_PIN));
#endif
  frame[position++] = '\n';
  Serial.write((const uint8_t *)frame, position);
  sequence++;
}

// ------------------------------------------------------------ Arduino API

void setup() {
  // A large TX buffer absorbs USB/CH340 hiccups at 2 kSPS.
  Serial.setTxBufferSize(8192);
  Serial.begin(SERIAL_BAUD);
#if USE_ANALOG_INPUT
  analogReadResolution(12);
#endif
  delay(300);
  printHelp();
  nextSampleUs = esp_timer_get_time();
}

void loop() {
  readCommands();
  if (!streaming) {
    return;
  }
  // Fixed schedule (next += period): no drift, and if the loop is late it
  // catches up instead of silently lowering the rate.
  uint64_t now = esp_timer_get_time();
  int burst = 0;
  while ((int64_t)(now - nextSampleUs) >= 0 && burst < 32) {
    if (pendingDrops) {
      pendingDrops--;
      sequence++;      // the sample "exists" but is never sent
      sampleIndex++;
    } else {
      emitSample();
    }
    nextSampleUs += periodUs;
    burst++;
  }
  if (burst == 32) {
    // Too far behind (e.g. serial blocked): resync instead of flooding.
    nextSampleUs = esp_timer_get_time() + periodUs;
  }
}
