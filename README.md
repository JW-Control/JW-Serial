# JW-Serial

JW-Serial es una aplicación de escritorio para Windows que permite leer datos por puerto serial, visualizarlos en tiempo real y guardar evidencia de pruebas mediante capturas PNG, exportaciones CSV y registros de sesión.

Esta pensada para pruebas con microcontroladores, sensores, tarjetas electrónicas y sistemas embebidos donde necesitas observar señales durante minutos u horas sin depender del Serial Plotter del IDE.

![JW-Serial icon](build/icon.png)

## Características

- Lectura de datos por puerto serial.
- Plotter en tiempo real con múltiples gráficos.
- Monitor serial integrado.
- Asignación rápida de variables por drag and drop.
- Ejes X, Y1 y Y2 configurables por plot.
- Modo de ejes automático, manual y ventana deslizante.
- Capturas PNG manuales y automáticas.
- Capturas funcionando incluso con la ventana minimizada.
- Nombres de captura por lote, prefijo y subcarpeta.
- Registro `session_log.csv` por sesión de prueba.
- Marcadores de eventos durante la adquisición.
- Modo claro y modo oscuro.
- Plantillas internas de configuración.
- Guardado y carga de configuración por archivo JSON.
- Exportación CSV de datos capturados.
- Versión portable e instalador para Windows.

## Descarga

En la sección de releases de GitHub se publican dos opciones:

- `JW-Serial-Setup-1.0.0-x64.exe`: instalador para Windows.
- `JW-Serial-Portable.exe`: versión portable, no requiere instalación.

Para la mayoría de usuarios, la versión portable es suficiente: descárgala, ejecútala y conecta tu dispositivo serial.

## Uso Rápido

1. Conecta tu placa o dispositivo serial al PC.
2. Abre JW-Serial.
3. Pulsa **Refrescar** para listar puertos disponibles.
4. Selecciona el puerto y el baudrate.
5. Pulsa **Conectar**.
6. Arrastra variables desde el panel izquierdo hacia un plot.
7. Asigna cada variable a X, Y1 o Y2.
8. Usa **Capturar plots** para guardar evidencia visual.
9. Usa **CSV** si necesitas exportar datos.

## Formato Serial Soportado

JW-Serial espera líneas de texto separadas por salto de linea.

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

La app detecta automáticamente si la trama usa coma o tabulador.

### Timestamp en X

Por defecto, JW-Serial usa el índice de muestra como eje X. Si tu firmware envía un timestamp como primer valor, puedes activar **Incluye timestamp en X** desde **Configuración**.

Ejemplo:

```text
1250,3.31,7.52,0.14
1262,3.32,7.51,0.16
```

En ese caso, el primer valor puede usarse como X y los demás como variables.

## Interfaz

La ventana principal esta organizada en dos zonas.

### Panel Izquierdo

Incluye:

- Estado de conexión.
- Selector de tema claro/oscuro.
- Puerto y baudrate.
- Botones de conexión.
- Metricas de recepción:
  - SPS calculados por el software.
  - Tiempo promedio entre muestras.
  - Jitter aproximado.
- Lista de variables detectadas.
- Acciones rapidas:
  - Configuración.
  - Pausar.
  - Limpiar.
  - CSV.
  - Evento.
  - Capturar plots.
  - Configuración de capturas.
  - Guardar y cargar configuración.

### Area Principal

Incluye:

- Vista **Plotter**.
- Vista **Monitor**.
- Botones para agregar o quitar plots.
- Gráficos con leyenda, ejes, grilla y controles manuales.

## Plots y Asignación de Ejes

Cada plot puede trabajar con:

- Una variable en X.
- Una o mas variables en Y1.
- Una o mas variables en Y2.

Puedes asignar variables de tres formas:

- Arrastrando desde la lista de variables hacia el eje correspondiente.
- Soltando sobre el area del plot para que JW-Serial pregunte donde asignarla.
- Usando los controles del plot.

Cuando arrastras una variable, las zonas validas se resaltan para guiar la asignación.

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

El boton **Capturar plots** también muestra el tiempo restante para la siguiente captura automática.

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

- `XX`: numero de plot con dos digitos.
- `AAMMDD`: fecha.
- `HHMMSS`: hora.
- `NN`: contador para evitar sobrescrituras si hay mas de una captura en el mismo segundo.

## Registro de Sesion

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

El boton **Evento** permite anotar sucesos durante una prueba.

Ejemplos:

```text
Inicio de prueba
Se conectó carga
Lectura estabilizada
Se movió sensor
Fin de prueba
```

Los eventos se guardan en el `session_log.csv` cuando la sesión esta configurada con subcarpeta de lote.

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

Las plantillas se guardan internamente en el perfil de usuario de Electron. En Windows, esto corresponde al espacio de datos de la aplicacion, normalmente bajo:

```text
C:\Users\<usuario>\AppData\Roaming\JW-Serial
```

La ventana de plantillas muestra las plantillas existentes, por lo que no necesitas recordar los nombres exactos.

## Configuracion JSON

Ademas de las plantillas internas, JW-Serial permite guardar y cargar configuracion como archivo `.json`.

Esto es util para:

- Respaldar configuraciones.
- Compartir configuraciones entre PCs.
- Guardar una configuracion junto con la documentacion de un proyecto.

## Modo Claro y Oscuro

JW-Serial incluye modo claro y modo oscuro.

El modo oscuro esta pensado para sesiones largas, pruebas nocturnas o ambientes de baja luz. El modo claro es util para oficina, capturas limpias y documentación.

## Recomendaciones Para Pruebas Largas

- Usa un identificador de lote, por ejemplo `PCB_0116`.
- Activa **Guardar en subcarpeta**.
- Activa capturas automáticas.
- Define un intervalo adecuado, por ejemplo 10 o 15 minutos.
- Agrega eventos cuando ocurra algo relevante.
- Al finalizar, revisa la carpeta del lote y el `session_log.csv`.