# JW-Serial v1.2.0

Versión validada para análisis serial, capturas automáticas y funciones virtuales.

> Este archivo está preparado para usarse como cuerpo del release en GitHub. Al crear el **New release**, usa el tag `v1.2.0`, el título `JW-Serial v1.2.0` y pega estas notas en el campo **Release notes**.

## Descargas

Adjunta al release los ejecutables generados para esta versión:

- `JW-Serial-Setup-1.2.0-x64.exe`: instalador para Windows.
- `JW-Serial-Portable-1.2.0-x64.exe`: versión portable, no requiere instalación.
- `JW-Serial-v1.2.0.zip`: paquete comprimido con ejecutables de release, si decides publicarlo.

## Novedades principales

### Funciones virtuales

- Nueva sección `Funciones` para crear variables calculadas a partir de variables reales.
- Constructor visual por bloques, inspirado en Scratch, para evitar errores de sintaxis.
- Operadores disponibles: suma, resta, multiplicación, división, potencia y valor absoluto.
- Ventanas disponibles: actual, inicial, mínimo, máximo, promedio y diferencia absoluta `|Max-Min|`.
- Soporte para constantes numéricas y variables físicas arrastrables.
- Las funciones se pueden arrastrar al plotter como cualquier variable.
- Las funciones recalculan el historial completo, no solo los datos posteriores a su creación.
- Papelera funcional para eliminar bloques específicos sin borrar toda la fórmula.
- Ancho de la ventana de funciones ajustable y persistente entre sesiones.

Ejemplo:

```text
abs(max([uV], 200s) - min([uV], 200s))
```

Esto permite calcular la diferencia absoluta entre el máximo y mínimo de `uV` dentro de una ventana de 200 segundos.

### Filtro de tramas seriales

- Nueva configuración para aceptar o rechazar tramas según prefijos o textos configurados.
- Modo `Aceptar solo`: por ejemplo, aceptar solo tramas que empiecen con `LORA_`.
- Modo `Rechazar`: por ejemplo, ignorar tramas `+EVT:` y conservar las demás.
- Compatible con listas de filtros para manejar varias tramas no deseadas.

Formato validado:

```text
LORA_ADC:1409.96,RSSI:-29,SNR:12,FREQ:916.000
```

JW-Serial puede detectar y graficar campos numéricos como `LORA_ADC`, `RSSI`, `SNR` y `FREQ`.

### Plotter y escalas

- El autoescalado de `Y1` y `Y2` ahora usa el tramo visible cuando el eje `X` está en modo manual.
- Las escalas `Y1` y `Y2` mantienen divisiones legibles y alineadas con pasos canónicos.
- Mejor manejo visual de variables virtuales en leyenda, lista lateral y asignación de ejes.
- Mejoras en el menú de configuración del gráfico y en el flujo de asignación de señales.

### Conexión e inicio

- Timeout configurable al conectar: si no llega ninguna trama válida dentro del tiempo indicado, JW-Serial se desconecta automáticamente.
- Si está activo `Usar como prefijo`, al conectar se solicita el identificador de tarjeta/lote.
- Persistencia de última sesión con opciones para preguntar al iniciar, cargar automáticamente o iniciar limpio.
- Mejoras de responsividad en la ventana de configuración.

### Capturas y sesiones

- Se mantiene la lógica de capturas automáticas condicionada por dos estados: usuario activo y puerto conectado.
- El estado de `Capturas automáticas` ya no se desactiva por su cuenta al desconectar el COM.
- Las capturas soportan prefijo, subcarpeta por lote, contador anticolisión y nombres automáticos.
- Registro `session_log.csv` para documentar sesiones con eventos, capturas y metadatos del lote.

## Correcciones

- Corregido el cálculo de funciones virtuales para historiales ya existentes.
- Corregido el autoescalado de ejes Y al navegar manualmente por X.
- Corregida la papelera del constructor de funciones para eliminar solo el bloque arrastrado.
- Corregido el filtrado de tramas para trabajar con mensajes mixtos sin contaminar variables.
- Mejoras en textos, tildes y consistencia visual de modales.
- Mejoras de estabilidad en sesiones largas y recuperación visual.

## Checks recomendados

- Conectar un dispositivo serial y confirmar recepción de tramas válidas.
- Probar filtro `Aceptar solo` con `LORA_`.
- Crear una función `|Max-Min|` sobre `uV` en una ventana de 200 segundos.
- Arrastrar la función virtual al plotter y comprobar que se calcula desde el historial completo.
- Navegar manualmente en X y confirmar que `Y1`/`Y2` se autoescalan según el tramo visible.
- Probar una captura manual y una automática.
