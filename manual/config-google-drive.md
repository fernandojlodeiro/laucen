---
titulo: Google Drive
menu: Configuración › Google Drive
ruta: /config/google-drive
rutas: /config/google-drive
permiso: empresa_config
resumen: Conectar el Google Drive de la empresa y crear la carpeta del contador, donde el sistema deja los archivos del Libro de IVA Digital de cada mes.
---

## Para qué sirve

Para mandarle archivos al contador sin bajarlos y mandarlos a mano: el sistema crea una carpeta en el Google Drive de la empresa, la comparte con el mail del contador y, desde [Libros de IVA](/administracion/libros-iva), sube ahí los archivos del Libro de IVA Digital de cada mes.

El sistema pide a Google sólo el permiso de **crear archivos y ver los que crea él**: el resto del Drive no lo ve.

## Cómo se llega

Menú: **Configuración › Google Drive**. También desde [Libros de IVA](/administracion/libros-iva), con el enlace "Conectar Google Drive para mandárselos al contador" cuando todavía no está conectado.

## Qué hay en la pantalla

Tres recuadros:

1. **Conexión**: si no está conectado, el botón **Conectar Google Drive** (arriba a la derecha del recuadro). Conectado: **Cuenta de Google** y **Conectada el**, y el botón **Desconectar** (pregunta "¿Desconectar Google Drive?" con Sí / No). Si falta la aplicación de Google del sistema, lo avisa.
2. **Carpeta del contador** (con la marca "Lista" cuando existe): **Nombre de la carpeta** (de entrada "Laucen – Contador"), **Mail del contador (se la comparte)** y el botón **Crear la carpeta** (o **Grabar y compartir** si ya existe). Con la carpeta creada, arriba a la derecha **Abrir la carpeta ↗** (en otra pestaña).
3. **Mandar los archivos**: dónde está el botón para mandar los archivos y, si ya se mandó algo, el **Último envío** (fecha y qué se mandó).

## Cómo se hace

### Conectar Google Drive
1. Apretá **Conectar Google Drive**.
2. Google pide entrar con la cuenta de Google de la empresa y aprobar que el sistema cree y suba archivos en el Drive. Aprobalo.
3. Vuelve solo con "Google Drive conectado: cuenta@gmail.com. Ahora creá la carpeta del contador."

### Crear la carpeta y compartirla con el contador
1. Escribí el nombre de la carpeta (o dejá el que viene) y el mail del contador.
2. Apretá **Crear la carpeta**. Sale "Carpeta «…» lista y compartida con … (le llega un aviso de Google)."
3. El contador queda como **editor**: puede ver, bajar y dejar archivos en la carpeta.

La carpeta se crea en la raíz del Drive; después se puede mover adonde se quiera dentro del Drive y sigue andando. Para cambiar el nombre o compartirla con otro mail, cambialo y apretá **Grabar y compartir**.

### Mandar los archivos de un mes
En [Libros de IVA](/administracion/libros-iva), con el mes elegido, botón **Mandar al Drive del contador** (ver esa página).

### Desconectar
**Desconectar** → **Sí**. El sistema deja de poder subir archivos; la carpeta y lo que ya se subió siguen en el Drive.

## Criterios y reglas
- Cada envío va a una subcarpeta "AAAA-MM · razón social" dentro de la carpeta del contador. Si un archivo con el mismo nombre ya está ahí, se reemplaza (no se duplica).
- Si la carpeta se borró del Drive, el envío avisa: "La carpeta del contador ya no está en el Drive (¿la borraron?): creala de nuevo en Configuración › Google Drive." Apretando **Grabar y compartir** se crea otra.
- Si alguien le saca el acceso al sistema desde su cuenta de Google, el envío avisa que hay que volver a conectar.

## Relacionado
- [Libros de IVA](/administracion/libros-iva)
- [Impuestos](/administracion/impuestos)
