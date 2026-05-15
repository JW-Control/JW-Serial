# JW-Serial v1.1.0

Esta versión consolida JW-Serial como una herramienta más cómoda para pruebas largas de tarjetas, sensores y sistemas embebidos. Incluye mejoras importantes en la interfaz, capturas, plantillas, escalas de gráficos y distribución para Windows.

## Descargas

- `JW-Serial-Setup-1.1.0-x64.exe`: instalador para Windows.
- `JW-Serial-Portable-1.1.0-x64.exe`: versión portable, no requiere instalación.

## Novedades Principales

- Nuevo menú contextual para plots con asignación rápida de señales.
- Drag and drop dentro del menú contextual hacia `X`, `Y1` y `Y2`.
- Sección de señales asignadas más clara, con opción directa para quitar cada señal.
- Curvas de referencia por señal: promedio, mínimo y máximo.
- Modo claro y modo oscuro.
- Capturas PNG manuales y automáticas de plots completos.
- Capturas automáticas compatibles con ventana minimizada.
- Configuración de carpeta de capturas, prefijo y subcarpeta por lote.
- Nombres de captura con formato ordenado por plot, fecha, hora y contador.
- Botón para abrir directamente la carpeta de capturas.
- Registro `session_log.csv` para documentar sesiones de prueba.
- Marcadores de evento durante la adquisición.
- Plantillas internas de configuración.
- Confirmación antes de guardar o eliminar plantillas.
- Guardado y carga de configuración mediante archivo JSON.
- Nuevo icono de aplicación e icono integrado en instalador/portable.

## Mejoras del Plotter

- Mejor comportamiento responsive de los plots.
- La curva ahora ocupa correctamente el ancho útil del gráfico.
- Asignación de variables por arrastre desde el panel lateral o desde el menú contextual.
- Ejes `X`, `Y1` y `Y2` con controles más consistentes.
- Ajustes de escala para usar pasos canónicos como `0.05`, `0.1`, `0.5`, `1`, `5`, `10`, `50`, etc.
- Mejor alineación visual de escalas y etiquetas.
- Correcciones en el comportamiento del eje `Y2` cuando sigue a `Y1`.
- Si `Y2` no tiene señales asignadas, evita mostrar una escala independiente innecesaria.

## Capturas

- Las capturas incluyen título, leyenda, ejes, grilla y curvas visibles.
- `Capturar plots` muestra el progreso hacia la próxima captura automática.
- El temporizador se reinicia al capturar manualmente o automáticamente.
- Si las capturas automáticas están activadas pero el COM está desconectado, la intención del usuario se conserva y el sistema espera a que el puerto vuelva a conectarse.
- Se evita capturar modales o ventanas de configuración encima del gráfico.
- Soporte para guardar capturas en subcarpeta de lote.

Ejemplo:

```text
Capturas/PCB_0116/Plot01_260510-120203-00.png
Capturas/PCB_0116/Plot02_260510-120204-00.png
```

## Sesiones y Eventos

- Cuando se usa identificador de lote y subcarpeta, JW-Serial genera `session_log.csv`.
- El log registra conexiones, desconexiones, capturas manuales, capturas automáticas y eventos del usuario.
- El botón `Evento` permite anotar momentos importantes durante una prueba.

## Configuración y Plantillas

- Las plantillas guardan configuración serial, canales, colores, plots, asignaciones y capturas.
- La lista de plantillas disponibles aparece dentro de la ventana de configuración.
- `Guardar como` y `Eliminar` ahora muestran confirmación antes de modificar una plantilla.
- También se mantiene la opción de guardar/cargar configuración como archivo `.json`.

## Métricas de Recepción

- JW-Serial calcula métricas desde el software:
  - SPS recibidos.
  - Tiempo promedio entre muestras.
  - Jitter aproximado.

## Correcciones

- Corrección del empaquetado para evitar pantalla en blanco en el portable.
- Corrección de carga de recursos empaquetados en Electron.
- Corrección de capturas cuando la ventana estaba minimizada.
- Corrección de capturas accidentales con modales visibles.
- Corrección de comportamiento del temporizador de capturas.
- Corrección de escalas Y1/Y2 superpuestas o poco legibles.
- Corrección de confirmaciones faltantes en acciones destructivas de plantillas.

## Checks Recomendados Después de Descargar

1. Abrir JW-Serial.
2. Conectar un puerto serial.
3. Confirmar recepción de datos.
4. Asignar señales a `X`, `Y1` y `Y2`.
5. Probar captura manual.
6. Probar captura automática.
7. Guardar y cargar una plantilla.
8. Exportar CSV si se requiere respaldo de datos.

## Hashes SHA256

```text
JW-Serial-Setup-1.1.0-x64.exe
34FE6B00915FCC6C9A2E09F150E3A05356F9B78C4DB48C244BD6B563C5481213

JW-Serial-Portable-1.1.0-x64.exe
84B51A047A77BCE7DFED302B71985DA7BB0F0FE38DDC8778EB417FA4F1AE6343
```
