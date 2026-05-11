# JW-Serial 1.0.0

Primer release estable de JW-Serial para Windows.

JW-Serial es una aplicacion de escritorio para adquisicion, visualizacion y documentacion de datos por puerto serial. Esta version esta orientada a pruebas de tarjetas electronicas, sensores, microcontroladores y sistemas embebidos donde se necesita observar senales en tiempo real y guardar evidencia durante sesiones largas.

## Descargas

- `JW-Serial-Setup-1.0.0-x64.exe`: instalador para Windows.
- `JW-Serial-Portable.exe`: version portable, no requiere instalacion.

## Novedades Principales

- Plotter serial en tiempo real.
- Monitor serial integrado.
- Multiples plots.
- Asignacion de variables por drag and drop.
- Ejes X, Y1 y Y2 configurables por plot.
- Modos de eje automatico, manual y ventana deslizante.
- Capturas PNG manuales y automaticas.
- Capturas automaticas funcionando incluso con la ventana minimizada.
- Barra de progreso/contador para proxima captura.
- Carpeta de capturas configurable.
- Identificador de tarjeta/lote.
- Opcion de usar identificador como prefijo.
- Opcion de guardar capturas en subcarpeta por lote.
- Registro `session_log.csv` para sesiones por lote.
- Eventos manuales durante la prueba.
- Exportacion CSV.
- Guardado y carga de configuracion por JSON.
- Plantillas internas de configuracion.
- Modo claro y modo oscuro.
- Icono propio para la aplicacion, instalador y portable.

## Formato Serial

La aplicacion soporta tramas de texto separadas por salto de linea.

Valores separados por coma:

```text
12.3,45.6,78.9
```

Valores separados por tabulador:

```text
12.3	45.6	78.9
```

Tambien puede usar el primer valor como timestamp en X si se activa esa opcion desde Configuracion.

## Capturas

Las capturas se guardan como PNG e incluyen titulo, leyenda, ejes, grilla y curvas visibles.

Ejemplo usando subcarpeta por lote:

```text
Capturas/PCB_0116/Plot01_260510-120203-00.png
Capturas/PCB_0116/Plot02_260510-120204-00.png
```

Ejemplo usando prefijo:

```text
PCB_0116_Plot01_260510-120203-00.png
PCB_0116_Plot02_260510-120204-00.png
```

## Registro de Sesion

Cuando se usa identificador y subcarpeta, JW-Serial genera:

```text
session_log.csv
```

El registro puede incluir conexion, desconexion, capturas, eventos manuales y metricas de recepcion.

## Recomendado Para

- Pruebas de sensores.
- Validacion de tarjetas electronicas.
- Ensayos de larga duracion.
- Registro visual de senales.
- Documentacion tecnica e informes.

## Notas

- Windows puede cachear iconos de archivos `.exe`. Si un ejecutable recien generado muestra un icono viejo en Explorer, copiarlo con otro nombre o refrescar la cache de iconos suele resolverlo. El icono esta embebido correctamente en esta version.
- Si Windows SmartScreen muestra una advertencia, se debe a que el ejecutable aun no esta firmado con certificado de publicador.

## Cambios Tecnicos

- Aplicacion empaquetada con Electron Builder.
- Build de renderer con Vite.
- Rutas de assets ajustadas para funcionar en modo portable.
- Icono `.ico` generado en formato compatible con Windows/NSIS.
- Configuracion de icono aplicada a app, instalador y desinstalador.
