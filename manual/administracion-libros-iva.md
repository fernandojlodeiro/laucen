---
titulo: Libros de IVA
menu: Administración › Libros de IVA
ruta: /administracion/libros-iva
rutas: /administracion/libros-iva
permiso: libros_iva_ver
resumen: Libro IVA Ventas y Libro IVA Compras del mes, resumen por alícuota y saldo técnico, avisos para revisar, Excel y los archivos del Libro de IVA Digital de ARCA.
---

## Para qué sirve

Muestra, para un mes (o un rango de fechas), los dos libros de IVA:
- **IVA Ventas**: los comprobantes de venta electrónicos autorizados por ARCA.
- **IVA Compras**: las facturas de compra registradas y los despachos de importación registrados.

Cada comprobante con su neto gravado e IVA por alícuota, no gravado, exento, percepciones y total, en pesos. Arriba, el **resumen** del mes: débito fiscal − crédito fiscal = **saldo técnico**. Además, una pestaña de **Avisos** con lo que conviene revisar antes de presentar, el **Excel** de cada libro y los **archivos del Libro de IVA Digital** para importar en ARCA.

Esta pantalla no carga nada: sólo lee lo que ya está en [Facturación](/administracion/facturacion), [Facturas de compra](/compras/facturas) y [Despachos de importación](/compras/despachos).

## Cómo se llega

- Menú: **Administración › Libros de IVA**.

## Qué hay en la pantalla

Arriba a la derecha: **Descargar Excel** (en las pestañas IVA Ventas e IVA Compras; baja el libro que estás mirando).

Filtros (en un renglón):
- **Mes**: los últimos 24 meses. **De entrada se muestra el mes pasado**, que es el que se presenta.
- **Fechas**: desde/hasta con atajos (Hoy, Ayer, Últimos 7 días, Este mes, Último mes, Último trimestre, Último año, Personalizado). Elegir fechas a mano deja el Mes en "Personalizado".
- **Canal** (sólo en IVA Ventas, si hay canales): Todos o uno.

**Resumen** (dos cajas):
- Tabla por alícuota del período: Base ventas, Débito fiscal, Base compras, Crédito fiscal, con su total.
- Caja de saldo: **Débito fiscal (ventas)**, **− Crédito fiscal (compras y despachos)**, **Saldo técnico a pagar** (en rojo) o **a favor** (en verde), **Percepciones de IVA sufridas (saldo a favor, aparte)** y **Saldo después de percepciones**. Con la aclaración "Orientativo: no incluye saldos de meses anteriores, retenciones ni restituciones. La declaración jurada la arma el contador."

Pestañas, con su cantidad: **IVA Ventas (N)**, **IVA Compras (N)**, **Avisos (N)**.

**Tabla del libro** (Ventas o Compras):
- Fecha; Comprobante (con el código de ARCA en gris, ej. "001", y el texto "FA 00002-00000123"; enlace al comprobante; si es en dólares, "US$ × cotización"); Cliente o Proveedor (con tipo y número de documento, condición de IVA y, en ventas, el canal).
- Neto por cada alícuota usada en el período, **No gravado**, **Exento** (si hay), **B / C sin crédito** (sólo en compras, si hay), IVA por cada alícuota, **Perc. IVA**, **Perc. IIBB**, **Otros** y **Total**.
- Las notas de crédito salen en rojo y en negativo.
- De a 50 filas, con paginador. Abajo, la fila **Total del período** (de todo el período, no sólo de la página) y la línea "Neto gravado … · IVA …".

**Avisos**: lista de cosas para revisar, cada una con enlace a lo que hay que mirar. Si no hay nada: "Nada para revisar en el período."

**Libro de IVA Digital (ARCA)**, al pie:
- Si no elegiste un mes entero: "Los archivos se arman por mes entero: elegí un mes arriba."
- Con un mes: **Bajar los 5 archivos (.zip)** y un botón por archivo con su cantidad de renglones: ventas cbte, ventas alicuotas, compras cbte, compras alicuotas, importaciones.
- El aviso: antes de presentar, validarlos importándolos en el Libro de IVA Digital de ARCA (Portal IVA → Libro IVA Digital → Importar), que el primero lo revise el contador, y mirar la pestaña «Avisos».

## Cómo se hace

### Ver el libro de IVA compras de un mes
1. Si las facturas del mes no están cargadas, importalas primero: en [Facturas de compra](/compras/facturas), **Importar de ARCA (Mis Comprobantes)** con el archivo "Mis Comprobantes – Recibidos" de ese mes.
2. Entrá a **Administración › Libros de IVA**.
3. Elegí el **Mes**.
4. Tocá la pestaña **IVA Compras**.

### Ver el saldo técnico del mes
Elegí el mes: la caja de la derecha del resumen muestra débito, crédito y si el saldo es a pagar o a favor (antes y después de percepciones).

### Bajar el libro en Excel
Elegí período (y canal, si querés, en ventas), andá a la pestaña del libro y apretá **Descargar Excel**. Trae todas las columnas (todas las alícuotas, aunque estén vacías), la fila de totales y, abajo, el resumen del período (siempre con las ventas de todos los canales).

### Bajar los archivos para el Libro de IVA Digital de ARCA
1. Elegí un **Mes** entero.
2. Revisá la pestaña **Avisos**.
3. Apretá **Bajar los 5 archivos (.zip)** (o el archivo suelto que necesites).
4. Importalos en ARCA (Portal IVA → Libro IVA Digital → Importar) para validarlos. El primero, que lo revise el contador.

### Ver sólo las ventas de un canal
En la pestaña IVA Ventas, elegí el **Canal**. Aparece la aclaración "Filtrado por canal: el resumen de arriba y los archivos de ARCA son siempre de todos los canales."

## Criterios y reglas

### Qué entra en cada libro
- **IVA Ventas**: comprobantes electrónicos **autorizados** por ARCA, en **producción** (los de homologación/prueba no entran), con número, cuya **fecha** cae en el período.
- **IVA Compras**:
  - facturas de compra **registradas** (las en borrador no entran) cuya **fecha de la factura** cae en el período;
  - despachos de importación **registrados** cuya fecha cae en el período.
  - **Facturas E (exterior) y X no entran** (sale un aviso: la mercadería del exterior entra por el despacho; la X no es un comprobante fiscal).
- El período se toma por la **fecha del comprobante**, no por el día en que se cargó.

### Cómo se pasa cada comprobante al libro
- Todo **en pesos**: lo que está en dólares se multiplica por la **cotización del propio comprobante**.
- **Las notas de crédito restan** (salen en negativo).
- Alícuotas: 27, 21, 10,5, 5, 2,5 y 0 %. En pantalla sólo se muestran las columnas de alícuotas usadas en el período.
- **Compras A y M**: neto e IVA por alícuota (crédito fiscal). Si una factura A o M no tiene IVA discriminado, aviso "sin IVA discriminado (no suma crédito fiscal)" y su neto va a no gravado.
- **Compras B y C**: no dan crédito fiscal. Lo que no es percepción ni no gravado va a la columna **B / C sin crédito**.
- **Ventas C**: el total va sin discriminar. Ventas A, B y M: neto e IVA por alícuota; lo que el neto tiene de más sobre las bases va a no gravado, y lo que el total tiene de más sobre neto + IVA va a otros.
- **Otros** junta percepciones nacionales (ganancias), municipales, impuestos internos y otros tributos.
- **Despachos**: tipo 066, a nombre de la Dirección General de Aduanas (CUIT 33-69345023-9); el proveedor del exterior se ve en la columna de condición de IVA. El **IVA** es crédito fiscal; el **IVA adicional** suma en «Perc. IVA»; **ganancias** en «Otros»; **IIBB** en «Perc. IIBB». La alícuota (21 o 10,5 %) se deduce comparando el IVA con CIF + derechos + tasa estadística, y la base informada es IVA / alícuota.
- Proveedor sin CUIT válido (11 dígitos): sale como "sin identificar" (tipo de documento 99), con aviso.
- Orden de las filas: por fecha, tipo de comprobante, punto de venta y número.

### Resumen y saldo técnico
- **Débito fiscal** = IVA total del libro de ventas (todos los canales).
- **Crédito fiscal** = IVA total del libro de compras (facturas A/M y despachos).
- **Saldo técnico** = débito − crédito. Positivo: **a pagar**; negativo: **a favor**.
- **Percepciones de IVA sufridas** = las de compras y despachos (incluye el IVA adicional de aduana). **Saldo después de percepciones** = saldo técnico − percepciones.
- Es **orientativo**: no tiene en cuenta saldos de meses anteriores, retenciones ni restituciones.

### Avisos (qué revisa)
- Comprobantes de compra de letra E o X (no entran).
- Proveedor sin CUIT válido.
- Factura en dólares con cotización 1 o menos; venta en moneda extranjera con cotización 1 o menos.
- Factura A o M sin IVA discriminado.
- Despacho sin número, sin IVA, o con IVA que no da 21 ni 10,5 %.
- **Posible duplicado** en compras: mismo CUIT, tipo, punto de venta y número dos veces (despachos: mismo número).
- Comprobante de venta repetido; venta A cuyo receptor no tiene CUIT.
- Facturas de compra y despachos **registrados en este período pero con fecha de otro**: están en el libro de ese otro mes (si ya se presentó, consultarlo con el contador).
- Facturas de compra y despachos del período que **siguen en borrador** (no entran hasta registrarlos).
- Ventas del período de **homologación** (prueba) o **no autorizadas** por ARCA (pendientes, con error o rechazadas).

### Archivos del Libro de IVA Digital
- Se arman **sólo por mes entero** (eligiendo un mes, o un rango del 1 al último día de un mes).
- Son cinco: VENTAS_CBTE, VENTAS_ALICUOTAS, COMPRAS_CBTE, COMPRAS_ALICUOTAS e IMPORTACIONES (los despachos van a IMPORTACIONES, no a COMPRAS_ALICUOTAS). Nombre: LIBRO_IVA_DIGITAL_<archivo>_<AAAAMM>.txt; el zip, LIBRO_IVA_DIGITAL_<AAAAMM>.zip.
- Formato de ARCA (mismo diseño que el ex régimen de información de compras y ventas): campos de ancho fijo, importes en centavos sin punto, fechas AAAAMMDD, textos sin acentos, renglones con fin de línea de Windows.
- Las ventas son siempre de **todos los canales**, aunque estés filtrando por uno.
- A un comprobante que discrimina IVA sin ninguna alícuota se le informa una de 0 % con base cero (ARCA pide al menos una).
- **Hay que validarlos importándolos en ARCA** antes de presentar.

## Preguntas frecuentes

**¿Cómo importo el archivo de ARCA del libro de IVA compras?**
Lo que se importa es "Mis Comprobantes – Recibidos" de ARCA, en Compras › Facturas de compra → **Importar de ARCA (Mis Comprobantes)** (vista previa, cuenta de gasto por proveedor, **Importar**). Después el libro se ve acá, pestaña IVA Compras.

**¿Por qué no aparece una factura de compra en el libro?**
Puede estar en borrador (no entra hasta registrarla), tener fecha de otro mes, o ser letra E o X. Mirá la pestaña Avisos.

**¿Por qué de entrada me muestra el mes pasado?**
Porque es el que se presenta. Elegí otro en "Mes".

**Cargué una factura vieja este mes, ¿en qué libro queda?**
En el del mes de su fecha. En la pestaña Avisos del mes en que la cargaste aparece "se cargó en este período pero tiene fecha …".

**¿El saldo técnico es lo que tengo que pagar?**
Es orientativo: no incluye saldos a favor de meses anteriores, retenciones ni restituciones. La declaración jurada la arma el contador.

**¿Por qué no puedo bajar los archivos de ARCA?**
Porque elegiste un rango que no es un mes entero. Elegí un mes en el filtro "Mes".

**¿Las facturas de Mercado Libre entran al libro?**
Sí, si las importaste de ARCA en Facturas de compra (entran como cualquier factura de proveedor).

**¿Los despachos de importación están en el libro?**
Sí, los registrados, en IVA Compras, a nombre de la Aduana.

## Relacionado

- [Facturas de compra](/compras/facturas)
- [Despachos de importación](/compras/despachos)
- [Facturación](/administracion/facturacion)
- [Facturación de Mercado Libre](/administracion/facturacion-ml)
- [Contabilidad](/administracion/contabilidad)
- [Proveedores](/compras/proveedores)
