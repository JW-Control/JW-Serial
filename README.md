# JW-Serial

JW-Serial es una aplicación de escritorio para Windows orientada a lectura, visualización y documentación de datos por puerto serial. Está pensada para trabajar con microcontroladores, sensores, tarjetas electrónicas y sistemas embebidos durante pruebas cortas o sesiones largas de varias horas.

La aplicación combina un plotter en tiempo real, monitor serial, capturas PNG automáticas, exportación CSV, plantillas de configuración y registro de sesión.

![JW-Serial icon](build/icon.png)

## Características Principales

- Lectura de datos por puerto serial.
- Plotter en tiempo real con múltiples gráficos.
- Monitor serial integrado.
- Variables configurables con nombre, color, estilo y grosor.
- Asignación de señales por drag and drop hacia X, Y1 o Y2.
- Menú contextual por gráfico para asignar, quitar y configurar señales rápidamente.
- Ejes X, Y1 y Y2 con modo automático y manual.
- Escalas canónicas para ejes y grillas legibles.
- Capturas PNG manuales y automáticas de cada plot.
- Capturas funcionando incluso con la ventana minimizada.
- Nombres de captura con lote, prefijo y subcarpeta.
- Registro `session_log.csv` para documentar sesiones de prueba.
- Marcadores de eventos durante la adquisición.
- Cálculo de métricas de recepción desde el software.
- Modo claro y modo oscuro.
- Plantillas internas de configuración.
- Guardado y carga de configuración por archivo JSON.
- Exportación CSV de datos capturados.
- Instalador y versión portable para Windows.

## Descarga

En la sección de releases de GitHub se publican dos opciones:

- `JW-Serial-Setup-1.1.0-x64.exe`: instalador para Windows.
- `JW-Serial-Portable-1.1.0-x64.exe`: versión portable, no requiere instalación.

Para la mayoría de usuarios, la versión portable es suficiente: descarga el ejecutable, ábrelo y conecta tu dispositivo serial.

## Uso Rápido

1. Conecta tu placa o dispositivo serial al PC.
2. Abre JW-Serial.
3. Pulsa **Refrescar** para listar puertos disponibles.
4. Selecciona el puerto y el baudrate.
5. Pulsa **Conectar**.
6. Arrastra variables hacia un plot.
7. Asigna cada variable a **X**, **Y1** o **Y2**.
8. Usa **Capturar plots** para guardar evidencia visual.
9. Usa **CSV** si necesitas exportar datos.

## Formato Serial Soportado

JW-Serial espera líneas de texto separadas por salto de línea. Cada línea debe contener valores numéricos separados por coma o tabulador.

Ejemplo con coma:

```text
12.3,45.6,78.9
12.4,45.8,78.7
```

Ejemplo con tabulador:

```text
12.3	45.6	78.9
12.4	45.8	78.7
```

La aplicación detecta automáticamente si la trama usa coma o tabulador.

### Timestamp en X

Por defecto, JW-Serial puede usar el índice de muestra como eje X. Si tu firmware envía un timestamp como primer valor, puedes activar **Incluye timestamp en X** desde **Configuración**.

Ejemplo:

```text
1250,3.31,7.52,0.14
1262,3.32,7.51,0.16
```

En ese caso, el primer valor puede usarse como X y los demás valores como variables.

## Interfaz

La ventana principal está organizada en dos zonas: panel lateral y área principal.

### Panel Lateral

Incluye:

- Estado de conexión.
- Selector de tema claro/oscuro.
- Puerto y baudrate.
- Botones de conexión.
- Métricas de recepción:
  - SPS calculados por el software.
  - Tiempo promedio entre muestras.
  - Jitter aproximado.
- Lista de variables detectadas.
- Acciones rápidas:
  - Configuración.
  - Pausar.
  - Limpiar buffer.
  - Exportar CSV.
  - Evento.
  - Capturar plots.
  - Configuración de capturas.
  - Guardar y cargar configuración.

### Área Principal

Incluye:

- Vista **Plotter**.
- Vista **Monitor**.
- Botones para agregar o quitar plots.
- Gráficos con título, leyenda, ejes, grilla y controles de escala.

## Plots y Asignación de Ejes

Cada plot puede trabajar con:

- Una variable en **X**.
- Una o más variables en **Y1**.
- Una o más variables en **Y2**.

Puedes asignar variables de varias formas:

- Arrastrando desde la lista de variables del panel lateral hacia el eje correspondiente.
- Soltando sobre el área del plot para que JW-Serial pregunte dónde asignarla.
- Usando el menú contextual del gráfico con click derecho.

En el menú contextual, las variables pueden arrastrarse hacia las zonas **X**, **Y1** o **Y2**, lo que permite reasignar señales rápidamente sin recorrer toda la pantalla.

## Curvas de Referencia

Desde el menú contextual de cada plot puedes activar curvas de referencia por señal:

- Promedio.
- Mínimo.
- Máximo.

La ventana de cálculo puede definirse por cantidad de muestras o por segundos.

## Ejes y Escalas

JW-Serial usa pasos de escala legibles y consistentes, por ejemplo:

```text
0.05, 0.1, 0.5, 1, 5, 10, 50, 100, 500
```

Los ejes pueden trabajar en modo automático o manual. En modo manual puedes desplazar la vista con la rueda del mouse o arrastrando sobre la zona correspondiente.

## Capturas

JW-Serial puede guardar una imagen PNG de cada plot. Las capturas incluyen:

- Título del plot.
- Leyenda.
- Ejes.
- Grilla.
- Curvas visibles.

Las capturas pueden ser:

- Manuales, con **Capturar plots**.
- Manuales, desde la ventana **Capturas** con **Capturar ahora**.
- Automáticas, usando un intervalo configurable.

El botón **Capturar plots** también muestra el tiempo restante para la siguiente captura automática. Si las capturas automáticas están activadas pero el puerto está desconectado, la intención del usuario se conserva y el sistema espera hasta que el puerto vuelva a estar conectado.

### Carpeta de Capturas

Desde **Configurar capturas** puedes:

- Elegir carpeta de salida.
- Abrir la carpeta configurada.
- Activar o desactivar capturas automáticas.
- Definir intervalo en minutos.
- Definir un identificador de tarjeta o lote.
- Usar ese identificador como prefijo.
- Guardar dentro de una subcarpeta con ese identificador.

Ejemplo usando subcarpeta:

```text
Capturas/PCB_0116/Plot01_260510-120203-00.png
Capturas/PCB_0116/Plot02_260510-120204-00.png
```

Ejemplo usando prefijo:

```text
PCB_0116_Plot01_260510-120203-00.png
PCB_0116_Plot02_260510-120204-00.png
```

Formato del nombre:

```text
PlotXX_AAMMDD-HHMMSS-NN.png
```

Donde:

- `XX`: número de plot con dos dígitos.
- `AAMMDD`: fecha.
- `HHMMSS`: hora.
- `NN`: contador para evitar sobrescrituras si hay más de una captura en el mismo segundo.

## Registro de Sesión

Cuando se usa identificador y subcarpeta, JW-Serial crea un archivo:

```text
session_log.csv
```

Ese archivo registra eventos importantes de la sesión, como:

- Conexión.
- Desconexión.
- Capturas manuales.
- Capturas automáticas.
- Eventos agregados por el usuario.
- Métricas de recepción.

Esto ayuda a documentar pruebas largas y asociar capturas con momentos concretos.

## Eventos

El botón **Evento** permite anotar sucesos durante una prueba.

Ejemplos:

```text
Inicio de prueba
Se conectó carga
Lectura estabilizada
Se movió sensor
Fin de prueba
```

Los eventos se guardan en `session_log.csv` cuando la sesión está configurada con subcarpeta de lote.

## Plantillas

Las plantillas guardan configuraciones reutilizables dentro de la app.

Pueden incluir:

- Configuración serial.
- Baudrate.
- Puerto seleccionado.
- Configuración de canales.
- Colores y nombres de variables.
- Plots creados.
- Asignaciones de ejes.
- Configuración de capturas.

No guardan:

- Datos recibidos.
- Buffer de muestras.
- Historial del monitor.

Las plantillas se guardan internamente en el perfil de usuario de Electron. En Windows, normalmente se ubican dentro del espacio de datos de la aplicación:

```text
C:\Users\<usuario>\AppData\Roaming\JW-Serial
```

La ventana de plantillas muestra las plantillas existentes, por lo que no necesitas recordar los nombres exactos. Las acciones **Guardar como** y **Eliminar** piden confirmación antes de modificar una plantilla.

## Configuración JSON

Además de las plantillas internas, JW-Serial permite guardar y cargar configuración como archivo `.json`.

Esto es útil para:

- Respaldar configuraciones.
- Compartir configuraciones entre PCs.
- Guardar una configuración junto con la documentación de un proyecto.

## Modo Claro y Oscuro

JW-Serial incluye modo claro y modo oscuro. El modo oscuro está pensado para sesiones largas, pruebas nocturnas o ambientes de baja luz. El modo claro es útil para oficina, capturas limpias y documentación.

## Recomendaciones Para Pruebas Largas

- Usa un identificador de lote, por ejemplo `PCB_0116`.
- Activa **Guardar en subcarpeta**.
- Activa capturas automáticas.
- Define un intervalo adecuado, por ejemplo 10 o 15 minutos.
- Agrega eventos cuando ocurra algo relevante.
- Al finalizar, revisa la carpeta del lote y el `session_log.csv`.

## Desarrollo

Instalar dependencias:

```bash
npm install
```

Ejecutar en modo desarrollo:

```bash
npm run dev
```

Compilar renderer:

```bash
npm run build
```

Generar instalador y portable para Windows:

```bash
npm run dist:win
```

Los archivos generados se ubican en:

```text
release/
```

## Licencia

Este proyecto usa licencia MIT. Consulta el archivo `LICENSE`.
