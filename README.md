# JW-Serial

Plotter serial moderno inspirado en BetterSerialPlotter. Este repositorio documenta el alcance del MVP y las decisiones técnicas iniciales para la primera versión enfocada en Windows.

## Objetivo
Desarrollar una interfaz gráfica capaz de leer tramas por puerto serial y graficarlas en tiempo real con mayor capacidad de buffer y mejores herramientas de análisis que BetterSerialPlotter.

## Stack propuesto (MVP)
- **UI**: Electron + React con **Vite**.
- **Backend local**: Node + `serialport`.
- **Gráficas**: `uPlot` (rápido y liviano para grandes buffers).
- **Empaquetado**: `electron-builder` para generar `.exe` en Windows.

## Requisitos funcionales clave
### Entrada serial
- Tramas separadas por salto de línea (`\n`).
- Delimitador automático: **tabulador** (`\t`) o **coma** (`,`).
- Autodetección de “inicio de ploteo”:
  - Esperar **N tramas válidas consecutivas** antes de empezar a graficar.
- Reconexión automática:
  - Si otra app toma el puerto (ej. Arduino IDE), liberar temporalmente y reconectar cuando esté disponible.

### Envío de datos (Monitor)
- Modo **Monitor** con caja de texto para enviar mensajes al dispositivo.
- Opciones de terminación: **Sin ajuste**, **NL**, **CR**, **NL & CR** (estilo Arduino IDE).

### Datos y rendimiento
- Caso objetivo: **10 variables**, **80 tramas/s**, **10h de buffer**.
- Buffer por defecto: **~2.88 M muestras por canal** (80 SPS × 10h).
- Priorizar fluidez visual: actualización aprox. **100 ms** (10 FPS).
- Parseo a número con **2 decimales** para visualización (almacenamiento interno en `float`).

### Eje X
- **Opción “Incluye timestamp”**: si está activada, el **primer campo** se usa como eje X.
- Si está desactivada: el eje X incrementa por **índice de muestra** (1, 2, 3, …).

## UI (descripción general)
### Panel izquierdo (≈20% ancho)
- Selección de puerto (autodetección).
- Selección de baudios (lista de valores típicos).
- Tabla de variables:
  - Nombre (o `valX` si no se especifica) y valor actual.
  - Color asociado.
  - Menú contextual por variable:
    - Renombrar
    - Color
    - Estilo de línea
    - Grosor
- Acciones:
  - **Configuración básica**:
    - # canales por trama (0 = auto)
    - SPS o periodo entre paquetes (auto-recalcular)
    - segundos de buffer
    - tasa de refresco
    - modo de ploteo (normal / min-max agregado)
  - **Configuración avanzada**:
    - bits de datos, paridad, stop bits
  - Pausar
  - Limpiar buffer
  - Exportar CSV (datos visibles)
  - Guardar configuración / Cargar configuración

### Zona de gráficos (≈80% ancho)
- Pestañas: **Plotter** / **Monitor**.
- Botones: **Add Plot** / **Remove Plot**.
- Cada plot incluye leyenda con señales y eje (X, Y1, Y2).
- Menú contextual en plot:
  - **Add channel** (selección de variable + eje)
  - **Remove channel** (lista de variables en el plot + Remove All)
  - **Stat curves**:
    - Ventana (últimos N segundos / N muestras)
    - Promedio / Mínimo / Máximo por variable Y1/Y2
    - Grosor fijo 1 y línea continua
  - **X mode**: Automático / Ventana deslizante / Manual
  - **Y1 mode**: Automático / Manual
  - **Y2 mode**: Automático / Manual

## Persistencia
Guardar y cargar perfiles en **JSON** con:
- Configuración básica y avanzada.
- Nombres de variables.
- Colores, estilos y grosores de línea.
- Asignación de variables por plot/eje.

## Pendientes para el MVP
- Definir estructura de proyecto y convenciones de carpetas.
- Diseñar el esquema de configuración persistente (JSON).
- Implementar buffer circular eficiente con soporte de 10h.
- UX para detección de delimitador y arranque automático de ploteo.
- **Soporte multi-plot desde el inicio** (Add/Remove plot + layout dinámico).

## Inicio rápido (desarrollo)
```bash
npm install
npm run dev
```

## Estructura inicial
- `src/main`: proceso principal de Electron.
- `src/renderer`: UI React + Vite.
- `dist/renderer`: salida del build de Vite.
