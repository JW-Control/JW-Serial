# Sketch de prueba para JW-Serial (JWPLC Basic)

`jwplc_serial_test.ino` genera señales conocidas a una tasa exacta para verificar JW-Serial de 1 a 5000 SPS sin cablear nada.

| Señal | Qué es | Qué deberías ver en JW-Serial |
|---|---|---|
| `sine` | Seno de 5 Hz, amplitud 1000, con ruido | Pico FFT en 5 Hz (Análisis) |
| `ramp` | Diente de sierra 0–100 cada 2 s | ΔY = 100 entre cursores en un período |
| `square` | Cuadrada de 1 Hz, 0/1 | Una alarma "mayor que 0.5" se dispara cada segundo |
| `vref` | 2.5 V con ruido gaussiano de 2 µV RMS | Ruido RMS ≈ 2 µV; con escala completa 5: bits efectivos ≈ 21.2 |

## Cargar el sketch

1. Abre la carpeta `jwplc_serial_test` en el Arduino IDE con el paquete de placas de JWPLC Basic (ESP32).
2. Opcional: `USE_ANALOG_INPUT 1` y `ANALOG_PIN` para agregar una columna `adc` con una entrada real.
3. Sube el sketch. Arranca a 60 SPS, formato CSV, a **921600 baud**.

## Prueba a baja tasa (60 SPS)

En JW-Serial: baudrate 921600, **Configuración** → canales 0 (auto), activar **Incluye secuencia al inicio** e **Incluye timestamp en X**, SPS nominal 60. Conecta y arrastra las señales a los plots.

- `FMT KV` cambia a tramas `SEQ:..,T:..,sine:..` (los nombres se detectan solos).
- `INFO` envía una línea `+INFO:`: con el filtro **Rechazar** `+INFO` no aparece en los datos.

## Prueba a 2 kSPS

1. Envía `PROFILE HIGH` desde el monitor (2000 SPS, CSV).
2. En JW-Serial aplica **Perfil ESP32/CH340 2 kSPS** y cambia **canales** a 0 (auto) o 4, y activa **Incluye timestamp en X**.
3. Verifica: SPS ≈ 2000, periodo ≈ 0.50 ms, jitter (del timestamp del ESP32) bajo, 0 perdidos.
4. `DROP 5` → "Perdidos" sube exactamente 5. `GLITCH` → un pico de +5000 en `sine` (útil para probar alarmas y cursores).

A 921600 baud cada trama ocupa ~40 bytes, unos 80 kB/s a 2 kSPS (~87 % del enlace). Si aparecen pérdidas, envía `TS OFF` para ahorrar ~9 bytes por trama.

## Comandos rápidos sugeridos

Crea estos botones en el monitor (**+ Comandos rápidos**): `PROFILE LOW`, `PROFILE HIGH`, `DROP 5`, `GLITCH`, `FMT KV`, `FMT CSV`, `HELP`.
