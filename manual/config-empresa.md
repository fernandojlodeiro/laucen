---
titulo: Empresa
menu: Configuración › Empresa
ruta: /config/empresa
rutas: /config/empresa
permiso: empresa_config
resumen: Los datos generales de la empresa (nombre de fantasía, logo, contacto, dirección) y los datos fiscales de quien factura (CUIT, razón social, condición IVA, punto de venta).
---

## Para qué sirve

Es la ficha de la propia empresa. Tiene dos cajas que se graban por separado:

- **Datos generales**: el nombre de fantasía, el logo y los datos de contacto y dirección.
- **Datos fiscales**: los datos de quien emite las facturas electrónicas (CUIT, razón social, condición frente al IVA, domicilio comercial, Ingresos Brutos, inicio de actividades y punto de venta).

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

### Caja "Datos fiscales"

A la derecha del título, su propio **lápiz**. Campos:

- **CUIT**: se escribe con guiones o sin; se muestra como 30-71234567-8.
- **Razón social**: "Como figura en ARCA."
- **Condición IVA**: Responsable inscripto, Monotributo o Exento. Ayuda: "Responsable inscripto factura A y B; los demás, C."
- **Domicilio comercial**: "El que sale en las facturas."
- **Ingresos Brutos**
- **Inicio de actividades** (fecha)
- **Punto de venta**: el número habilitado en ARCA para "Factura electrónica – Web services".
- Abajo, el enlace **"Conectar con ARCA para facturar →"**, que lleva a [Configuración › Facturación (ARCA)](/config/arca).

### Botones en edición

Al apretar el lápiz de una caja, esa caja pasa a campos editables y en el lugar del lápiz aparecen **"Grabar"** y **"Cancelar"**. Mientras editás una caja, el lápiz de la otra no aparece (se edita una por vez). "Cancelar" vuelve a la vista sin grabar nada.

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

1. Lápiz de **Datos fiscales**.
2. Completá **CUIT**, **Razón social** (obligatoria), **Condición IVA**, **Domicilio comercial**, **Ingresos Brutos**, **Inicio de actividades** y **Punto de venta**.
3. **"Grabar"**.
4. Si todavía no está conectado con ARCA, seguí con el enlace "Conectar con ARCA para facturar →".

Errores típicos:
- "Falta la razón social."
- "El punto de venta es un número entre 1 y 99998."
- "La fecha de inicio de actividades no se pudo leer."
- Un CUIT mal escrito también se rechaza con su motivo.

### Cambiar el CUIT

Si cambiás el CUIT y ya estaba conectado con ARCA, al grabar aparece: "Guardado. Ojo: cambiaste el CUIT y el permiso de ARCA es del anterior; hacé el trámite de nuevo en Configuración → Facturación (ARCA)." El permiso de ARCA es de un CUIT: con el CUIT nuevo hay que volver a hacer el trámite en [Configuración › Facturación (ARCA)](/config/arca).

## Criterios y reglas

- **Una sola ficha por organización**: la primera vez que se graba, se crea; después se actualiza.
- **Las dos cajas son independientes**: grabar los datos generales no toca los fiscales, y al revés. Grabar los datos fiscales tampoco cambia el ambiente de ARCA ni la facturación automática.
- **Logo**: sólo se acepta una imagen subida (una dirección que empiece con https://); cualquier otra cosa queda vacía.
- **Web**: si la escribís sin "http://" o "https://", el sistema le agrega "https://" adelante.
- **WhatsApp**: se le sacan todos los caracteres que no son números; tiene que quedar con entre 10 y 15 dígitos.
- **Condición IVA**: si llegara un valor raro, queda "Responsable inscripto". La condición decide la letra de las facturas: Responsable inscripto emite A y B; Monotributo y Exento, C.
- **Punto de venta**: entero entre 1 y 99998. De entrada, en edición, propone 1.
- **Dónde se usa cada dato hoy**:
  - El **logo** sale en el PDF de las facturas y es el logo de la tienda web si la tienda no tiene uno propio.
  - Los **datos fiscales** salen en las facturas y en el pie de la tienda web (razón social, CUIT, condición IVA, domicilio). En la ficha de producto de la tienda, si la empresa es Responsable inscripto, se muestra "Hace factura A."
  - El nombre de fantasía, mail, teléfono, WhatsApp, web y dirección de "Datos generales" se guardan, pero los datos de contacto que ve el comprador en la tienda se cargan aparte, en [Tienda web](/config/tienda).

## Preguntas frecuentes

**¿Dónde cambio el logo de las facturas?**
Acá, en Datos generales → Logo. El de la tienda también sale de acá salvo que la tienda tenga uno propio.

**Cargué el logo acá pero la tienda muestra otro. ¿Por qué?**
Porque la tienda tiene su propio logo cargado en [Tienda web](/config/tienda); ése gana. Si lo borrás de la tienda, usa el de la empresa.

**¿Qué letra de factura emitimos?**
Depende de la Condición IVA: Responsable inscripto emite A y B; Monotributo y Exento, C.

**¿Acá conecto con ARCA?**
No. Acá se cargan los datos fiscales; la conexión (certificado, prueba/producción) está en [Configuración › Facturación (ARCA)](/config/arca).

**Cambié el CUIT y ahora no factura. ¿Qué pasa?**
El permiso de ARCA es del CUIT anterior: hay que hacer el trámite de nuevo en [Configuración › Facturación (ARCA)](/config/arca).

**¿Puedo editar las dos cajas a la vez?**
No: mientras editás una, la otra queda en vista sin lápiz. Grabá o cancelá y después editá la otra.

**¿El mail y el WhatsApp de acá son los que ve el comprador en la tienda?**
No. Los de la tienda se cargan en [Tienda web](/config/tienda).

## Relacionado

- [Facturación (ARCA)](/config/arca)
- [Facturación](/administracion/facturacion)
- [Tienda web](/config/tienda)
