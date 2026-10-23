---
titulo: Google Drive
menu: Configuración › Google Drive
ruta: /config/google-drive
rutas: /config/google-drive, /privacidad
permiso: empresa_config
resumen: Conectar el Google Drive de la empresa y decir, por razón social, en qué carpeta de cada mes van los archivos del Libro de IVA Digital (el árbol de carpetas que se comparte con el contador).
---

## Para qué sirve

Para que los archivos del Libro de IVA Digital de cada mes queden solos en la carpeta del Drive donde el contador los busca, sin bajarlos y subirlos a mano. Se respeta el árbol de carpetas que ya se usa: por ejemplo Administracion › Impuestos › … › **año** › **mes** › IVA DIGITAL. Cada mes el sistema busca la carpeta del año y la del mes que correspondan y, si todavía no existen, las crea con el mismo formato de nombre.

El sistema pide acceso al Drive, pero sólo recorre el camino que se carga acá: el resto del Drive no lo lee ni lo toca.

## Cómo se llega

Menú: **Configuración › Google Drive**. También desde [Libros de IVA](/administracion/libros-iva), con el enlace del recuadro «Libro de IVA Digital (ARCA)» cuando todavía no está conectado o falta la ruta.

## Qué hay en la pantalla

Tres recuadros:

1. **Conexión**: sin conectar, el botón **Conectar Google Drive** (arriba a la derecha del recuadro) y cómo es la pantalla de Google. Conectado: **Cuenta de Google**, **Conectada el** y el botón **Desconectar** (pregunta "¿Desconectar Google Drive?" con Sí / No). Si la conexión es de un permiso que no alcanza, un cartel amarillo y el botón **Volver a conectar**. Si falta la aplicación de Google del sistema, lo avisa.
2. **Dónde van los TXT de cada mes**: una explicación y, por cada razón social, el campo con su nombre para pegar la ruta, el botón **Grabar** y, abajo, dónde van a quedar los archivos este mes ("Este mes van a: Administracion › … › 2026 › 10 Octubre › IVA DIGITAL") o "Sin ruta: no se le pueden mandar archivos."
3. **Mandar los archivos**: dónde está el botón para mandarlos y, si ya se mandó algo, el **Último envío** (fecha y dónde quedó).

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
