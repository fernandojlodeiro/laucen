---
titulo: Google Drive
menu: Configuración › Google Drive
ruta: /config/google-drive
rutas: /config/google-drive, /privacidad
permiso: empresa_config
resumen: Conectar el Google Drive de la empresa y decir, por razón social, dónde está la carpeta de cada mes (el árbol que se comparte con el contador): ahí van los archivos del Libro de IVA Digital y de ahí se leen las declaraciones del contador.
---

## Para qué sirve

Para que los archivos del Libro de IVA Digital de cada mes queden solos en la carpeta del Drive donde el contador los busca, sin bajarlos y subirlos a mano. Se respeta el árbol de carpetas que ya se usa: por ejemplo Administracion › Impuestos › … › **año** › **mes** › IVA DIGITAL. Cada mes el sistema busca la carpeta del año y la del mes que correspondan y, si todavía no existen, las crea con el mismo formato de nombre.

Con la misma ruta, el sistema **lee las declaraciones juradas** que el contador deja en las subcarpetas IVA, Ingresos Brutos y Comercio e Industria de cada mes (ver [Impuestos](/administracion/impuestos)).

El sistema pide acceso al Drive, pero sólo recorre el camino que se carga acá: el resto del Drive no lo lee ni lo toca.

## Cómo se llega

Menú: **Configuración › Google Drive**. También desde [Libros de IVA](/administracion/libros-iva), con el enlace del recuadro «Libro de IVA Digital (ARCA)» cuando todavía no está conectado o falta la ruta.

## Qué hay en la pantalla

Cuatro recuadros:

1. **Conexión**: sin conectar, el botón **Conectar Google Drive** (arriba a la derecha del recuadro) y cómo es la pantalla de Google. Conectado: **Cuenta de Google**, **Conectada el** y el botón **Desconectar** (pregunta "¿Desconectar Google Drive?" con Sí / No). Si la conexión es de un permiso que no alcanza, un cartel amarillo y el botón **Volver a conectar**. Si falta la aplicación de Google del sistema, lo avisa.
2. **Dónde van los TXT de cada mes**: una explicación y, por cada razón social, el campo con su nombre para pegar la ruta, el botón **Grabar** y, abajo, dónde van a quedar los archivos este mes ("Este mes van a: Administracion › … › 2026 › 10 Octubre › IVA DIGITAL") o "Sin ruta: no se le pueden mandar archivos."
3. **Carpetas de facturas de compra**: las carpetas donde se dejan las facturas de gastos y servicios y las de Mercado Libre, cada una con dónde busca este mes ("este mes: … › 2026 › 10 Octubre") y su tacho; abajo, el campo **Sumar una carpeta** con el botón **Sumar**.
4. **Mandar los archivos**: dónde está el botón para mandarlos y, si ya se mandó algo, el **Último envío** (fecha y dónde quedó).

## Cómo se hace

### Conectar Google Drive
1. Apretá **Conectar Google Drive**.
2. Google pide entrar con la cuenta de la empresa (la dueña de las carpetas). Puede mostrar «Google no verificó esta app»: entrá en «Configuración avanzada» › «Ir a laucen.com».
3. En «Seleccioná a qué puede acceder», **tildá la casilla** de Google Drive y apretá **Continuar**. Sin la casilla, vuelve con "No se tildó el permiso sobre Google Drive…".
4. Vuelve solo con "Google Drive conectado: cuenta@gmail.com."

### Cargar la ruta de una razón social
1. En el Drive, abrí la carpeta donde van los TXT de **un mes cualquiera** (por ejemplo la de septiembre) y copiá su ruta tal como se ve: `\Mi unidad\Administracion\Impuestos\…\2026\09 Septiembre\IVA DIGITAL`.
2. Pegala en el campo de la razón social y apretá **Grabar**. El sistema controla que las carpetas de antes del año existan: "Ruta grabada: la encontré en el Drive."
3. Abajo del campo se ve dónde van a quedar los archivos del mes en curso.

Errores típicos: "En la ruta no está la carpeta del año…", "Después de la carpeta del año tiene que venir la del mes, empezando con su número…", "No encuentro la carpeta «…» en el Drive de la cuenta conectada…".

### Sumar una carpeta de facturas de compra
1. En el Drive, copiá la ruta de la carpeta que adentro tiene los años y los meses (por ejemplo `\Mi unidad\Administracion\Deirolab\Servicios y Gastos Deirolab`, que tiene `2026 › 10 Octubre`). También sirve la ruta de un mes cualquiera.
2. Pegala en **Sumar una carpeta** y apretá **Sumar**: "Carpeta sumada: la encontré en el Drive."
3. Se pueden sumar varias (una por empresa, la de Mercado Libre…). No hace falta decir de qué razón social es cada una: cada factura va a la razón social que figura como receptora.
4. Para dejar de leer una, su tacho → **Sí**. Lo que ya se leyó queda cargado.

La carpeta del mes se reconoce por su número, esté adelante o atrás ("09 Septiembre", "Abril 04"), o por el nombre del mes. Se leen también las subcarpetas del mes (por ejemplo, una por cuenta de Mercado Libre).

### Mandar los archivos de un mes
En [Libros de IVA](/administracion/libros-iva), con el mes y la razón social elegidos, botón **Mandar al Drive** (ver esa página).

### Desconectar
**Desconectar** → **Sí**. El sistema deja de poder subir archivos; lo que ya se subió sigue en el Drive.

## Criterios y reglas
- **La ruta**: la carpeta de cuatro dígitos es la del **año**; la que sigue, la del **mes** (se reconoce por su número al principio: "09 Septiembre", "9 - Sept"…). Todo lo demás es fijo. Los nombres se comparan sin mayúsculas ni acentos.
- **Al mandar**: las carpetas de antes del año tienen que existir (si no, avisa y no sube nada). El año, el mes y las de después se buscan y, si faltan, se crean con el formato del ejemplo ("10 Octubre", "11-NOVIEMBRE", según cómo esté escrito el ejemplo).
- Si un archivo con el mismo nombre ya está en la carpeta, se reemplaza (no se duplica).
- Cada razón social tiene su propia ruta.
- Si alguien le saca el acceso al sistema desde su cuenta de Google, el envío avisa que hay que volver a conectar.

### Política de privacidad
La página pública [/privacidad](/privacidad) explica qué hace el sistema con los datos de Google (sólo deja los archivos que se mandan en la carpeta indicada). Es la que se carga como «Política de privacidad» en la aplicación de Google.

## Relacionado
- [Libros de IVA](/administracion/libros-iva)
- [Impuestos](/administracion/impuestos)
