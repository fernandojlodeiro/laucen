---
titulo: Empresa
menu: Configuración › Empresa
ruta: /config/empresa
rutas: /config/empresa
permiso: empresa_config
resumen: Los datos generales de la empresa (nombre de fantasía, logo, contacto, dirección) y un resumen de sus razones sociales (los datos fiscales se cargan en Razones sociales).
---

## Para qué sirve

Es la ficha de la propia empresa. Tiene:

- **Datos generales**: el nombre de fantasía, el logo y los datos de contacto y dirección (se edita con su lápiz).
- **Pedidos**: los **días de reserva sin pagar** (se edita con su lápiz).
- **Datos fiscales**: sólo un resumen de las razones sociales (CUIT, condición IVA, punto de venta). Los datos fiscales de cada CUIT —razón social, CUIT, condición frente al IVA, domicilio comercial, Ingresos Brutos, inicio de actividades y punto de venta— se cargan y se editan en [Razones sociales](/config/razones-sociales).

El logo es lo que más se ve: sale en el PDF de las facturas y en la tienda web cuando la tienda no tiene un logo propio. Los datos fiscales salen en las facturas y en el pie de la tienda web (razón social, CUIT, condición IVA y domicilio).

La conexión con ARCA (el certificado, el ambiente de prueba o producción, la facturación automática) NO se maneja acá: está en [Configuración › Facturación (ARCA)](/config/arca).

## Cómo se llega

- Menú **Configuración › Empresa**.
- Sólo la ve quien tiene en su rol el permiso «Empresa».

## Qué hay en la pantalla

La pantalla abre en **modo vista**: los datos se ven en sus marcos, en gris, sin poder tocarlos. Un dato vacío se ve como "—".

### Caja "Datos generales"

A la derecha del título está el **lápiz** para editarla. Campos:

- **Logo**: la imagen. Ayuda: "Sale en las facturas y en la tienda web (si la tienda no tiene uno propio)." Mejor PNG o JPG.
- **Nombre de fantasía**: si está vacío, en edición se sugiere el nombre de la organización.
- **Mail**
- **Teléfono**
- **WhatsApp**: en formato internacional, sin "+" ni espacios (ej. 5493511234567).
- **Web**: ej. laucen.com.ar.
- **Dirección**, **Localidad**, **Provincia**, **Código postal**.

### Caja "Pedidos"

A la derecha del título, su **lápiz**. Un solo dato:

- **Días de reserva sin pagar** (7 de entrada): cuántos días se le guarda el stock a un pedido Nuevo sin pagar. Al terminar el último día, si sigue sin pagar, se cancela solo. Va de 1 a 90, sin decimales; si no, dice "Los días de reserva van de 1 a 90, sin decimales.". El detalle, en [Pedidos](/ventas/pedidos) ("Reserva de un pedido sin pagar").

### Caja "Datos fiscales" (sólo lectura)

Muestra un renglón por cada razón social: nombre, CUIT, condición IVA y punto de venta, y el botón **"Ver razones sociales"**. Para cargar o corregir los datos fiscales (CUIT, razón social, condición IVA, domicilio, Ingresos Brutos, inicio de actividades y punto de venta) se va a [Razones sociales](/config/razones-sociales). Si todavía no hay ninguna, la caja lo avisa.

### Botones en edición

Al apretar el lápiz de Datos generales, la caja pasa a campos editables y en el lugar del lápiz aparecen **"Grabar"** y **"Cancelar"**. "Cancelar" vuelve a la vista sin grabar nada.

## Cómo se hace

### Cargar o cambiar el logo

1. Apretá el lápiz de **Datos generales**.
2. En **Logo**, subí la imagen (PNG o JPG).
3. Apretá **"Grabar"**. Arriba aparece "Guardado." y la caja vuelve a la vista.

Desde ese momento las facturas nuevas salen con ese logo, y la tienda web lo usa si no tiene uno propio cargado en [Tienda web](/config/tienda).

### Cambiar los datos de contacto

1. Lápiz de **Datos generales**.
2. Cambiá Mail, Teléfono, WhatsApp, Web o la dirección.
3. **"Grabar"**.

Errores típicos:
- "El mail no parece válido." → falta la arroba o el dominio.
- "El WhatsApp va en formato internacional, sólo números (ej. 5493511234567)." → quedó con menos de 10 o más de 15 dígitos.

### Cargar los datos fiscales para poder facturar

Se hace en [Razones sociales](/config/razones-sociales) (y la conexión con ARCA, en [Facturación (ARCA)](/config/arca)).

## Criterios y reglas

- **Una sola ficha de datos generales por organización**: la primera vez que se graba, se crea; después se actualiza. Los datos fiscales son de cada razón social y se cargan en [Razones sociales](/config/razones-sociales).
- **Logo**: sólo se acepta una imagen subida (una dirección que empiece con https://); cualquier otra cosa queda vacía.
- **Web**: si la escribís sin "http://" o "https://", el sistema le agrega "https://" adelante.
- **WhatsApp**: se le sacan todos los caracteres que no son números; tiene que quedar con entre 10 y 15 dígitos.
- **Condición IVA** (en Razones sociales): decide la letra de las facturas: Responsable inscripto emite A y B; Monotributo y Exento, C.
- **Dónde se usa cada dato hoy**:
  - El **logo** sale en el PDF de las facturas y es el logo de la tienda web si la tienda no tiene uno propio.
  - Los **datos fiscales de la razón social principal** salen en el pie de la tienda web (razón social, CUIT, condición IVA, domicilio). En la ficha de producto de la tienda, si la principal es Responsable inscripta, se muestra "Hace factura A." Cada factura lleva los datos de la razón social que la emitió.
  - El nombre de fantasía, mail, teléfono, WhatsApp, web y dirección de "Datos generales" se guardan, pero los datos de contacto que ve el comprador en la tienda se cargan aparte, en [Tienda web](/config/tienda).

## Preguntas frecuentes

**¿Dónde cambio el logo de las facturas?**
Acá, en Datos generales → Logo. El de la tienda también sale de acá salvo que la tienda tenga uno propio.

**Cargué el logo acá pero la tienda muestra otro. ¿Por qué?**
Porque la tienda tiene su propio logo cargado en [Tienda web](/config/tienda); ése gana. Si lo borrás de la tienda, usa el de la empresa.

**¿Qué letra de factura emitimos?**
Depende de la Condición IVA: Responsable inscripto emite A y B; Monotributo y Exento, C.

**¿Acá conecto con ARCA?**
No. Los datos fiscales están en [Razones sociales](/config/razones-sociales); la conexión (certificado, prueba/producción) está en [Configuración › Facturación (ARCA)](/config/arca).

**Cambié el CUIT y ahora no factura. ¿Qué pasa?**
El permiso de ARCA es del CUIT anterior: hay que hacer el trámite de nuevo en [Configuración › Facturación (ARCA)](/config/arca). El CUIT se cambia en [Razones sociales](/config/razones-sociales).

**¿El mail y el WhatsApp de acá son los que ve el comprador en la tienda?**
No. Los de la tienda se cargan en [Tienda web](/config/tienda).

## Relacionado

- [Razones sociales](/config/razones-sociales)
- [Facturación (ARCA)](/config/arca)
- [Facturación](/administracion/facturacion)
- [Tienda web](/config/tienda)
