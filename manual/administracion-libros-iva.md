---
titulo: Libros de IVA
menu: Administración › Libros de IVA
ruta: /administracion/libros-iva
rutas: /administracion/libros-iva
permiso: libros_iva_ver
resumen: Libro IVA Ventas y Libro IVA Compras del mes, ventas por provincia, resumen por alícuota y saldo técnico, avisos para revisar, Excel, los archivos del Libro de IVA Digital de ARCA y su subida automática al Drive; los meses con declaración jurada de IVA quedan trabados.
---

## Para qué sirve

Muestra, para un mes (o un rango de fechas), los dos libros de IVA:
- **IVA Ventas**: los comprobantes de venta electrónicos autorizados por ARCA.
- **IVA Compras**: las facturas de compra registradas y los despachos de importación registrados.

Cada comprobante con su neto gravado e IVA por alícuota, no gravado, exento, percepciones y total, en pesos. Arriba, el **resumen** del mes: débito fiscal − crédito fiscal = **saldo técnico**. Además, las **ventas por provincia** (para Ingresos Brutos), una pestaña de **Avisos** con lo que conviene revisar antes de presentar, el **Excel** de cada libro, los **archivos del Libro de IVA Digital** para importar en ARCA y el **registro de lo que se subió al Drive**, que se hace solo.

Esta pantalla no carga nada: sólo lee lo que ya está en [Facturación](/administracion/facturacion), [Facturas de compra](/compras/facturas) y [Despachos de importación](/compras/despachos).

## Cómo se llega

- Menú: **Administración › Libros de IVA**.

## Qué hay en la pantalla

Arriba a la derecha: **Descargar Excel** (en las pestañas IVA Ventas, IVA Compras y Ventas por provincia; baja lo que estás mirando).

Filtros (en un renglón):
- **Mes**: los últimos 24 meses. **De entrada se muestra el mes pasado**, que es el que se presenta.
- **Fechas**: desde/hasta con atajos (Hoy, Ayer, Últimos 7 días, Este mes, Último mes, Último trimestre, Último año, Personalizado). Elegir fechas a mano deja el Mes en "Personalizado".
- **Canal** (sólo en IVA Ventas, si hay canales): Todos o uno.

**Resumen** (dos cajas):
- Tabla por alícuota del período: Base ventas, Débito fiscal, Base compras, Crédito fiscal, con su total.
- Caja de saldo: **Débito fiscal (ventas)**, **− Crédito fiscal (compras y despachos)**, **Saldo técnico a pagar** (en rojo) o **a favor** (en verde), **Percepciones de IVA sufridas (saldo a favor, aparte)** y **Saldo después de percepciones**. Con la aclaración "Orientativo: no incluye saldos de meses anteriores, retenciones ni restituciones. La declaración jurada la arma el contador."

**Declaración jurada de IVA simulada · <mes>** (con un mes entero elegido), debajo del resumen: la declaración de IVA del mes como la arma el contador, con los saldos que dejó el mes anterior: **Débito fiscal**, **− Crédito fiscal**, **− Saldo técnico a favor del mes anterior**, **Saldo técnico a favor** (si da negativo; pasa al mes que viene) o **Impuesto del mes**, **− Percepciones de IVA (pagos a cuenta)**, **− Saldo de libre disponibilidad del mes anterior** y **A pagar** (en rojo) o **Saldo de libre disponibilidad a favor** (en verde). Si el mes anterior todavía no tiene declaración, sus saldos salen de su simulación y los renglones dicen «(simulado)». Con el enlace **ver en Impuestos**, donde está también la de Ingresos Brutos y la municipal. Si el mes ya tiene su declaración, el título dice «calculada con lo cargado», para compararla. Los pagos a cuenta salen de lo importado de **Mis Retenciones** de ARCA (ver «Cargar las percepciones y retenciones sufridas»); en un mes que no está ahí, de las percepciones de IVA de las facturas de compra y los despachos, y el renglón lo dice. Los criterios, en [Impuestos](/administracion/impuestos).

Pestañas, con su cantidad: **IVA Ventas (N)**, **IVA Compras (N)**, **Ventas por provincia (N provincias)**, **Avisos (N)**.

**Tabla del libro** (Ventas o Compras):
- Fecha; Comprobante (con el código de ARCA en gris, ej. "001", y el texto "FA 00002-00000123"; enlace al comprobante; si es en dólares, "US$ × cotización"); Cliente o Proveedor (con tipo y número de documento, condición de IVA y, en ventas, el canal).
- Neto por cada alícuota usada en el período, **No gravado**, **Exento** (si hay), **B / C sin crédito** (sólo en compras, si hay), IVA por cada alícuota, **Perc. IVA**, **Perc. IIBB**, **Otros** y **Total**.
- Las notas de crédito salen en rojo y en negativo.
- De a 50 filas, con paginador. Abajo, la fila **Total del período** (de todo el período, no sólo de la página) y la línea "Neto gravado … · IVA …".

**Ventas por provincia**: una fila por provincia, de la que más vendió a la que menos: Provincia, **Cbtes.** (cantidad de comprobantes), **Sin prov.** (cuántos no tenían provincia y se asignaron a Córdoba), **Neto sin IVA**, **Total con IVA** y **% del neto**; abajo, la fila de totales. Siempre en pesos.

**Avisos**: lista de cosas para revisar, cada una con enlace a lo que hay que mirar. Si no hay nada: "Nada para revisar en el período."

**Libro de IVA Digital (ARCA)**, al pie:
- Si no elegiste un mes entero: "Los archivos se arman por mes entero: elegí un mes arriba."
- Con un mes: **Bajar los 5 archivos (.zip)**, **ventas por provincia (.xlsx)** y un botón por archivo con su cantidad de renglones: ventas cbte, ventas alicuotas, compras cbte, compras alicuotas, importaciones.
- Al lado, si Google Drive está conectado y la razón social tiene su ruta cargada: **Mandar al Drive** (corre de fondo: el botón pasa a "Trabajando…" y al terminar aparece el cartel). Si no, el enlace "Conectar Google Drive (y la ruta de esta razón social) para mandarlos a su carpeta", que lleva a [Configuración › Google Drive](/config/google-drive).
- El aviso: antes de presentar, validarlos importándolos en el Libro de IVA Digital de ARCA (Portal IVA → Libro IVA Digital → Importar), que el primero lo revise el contador, y mirar la pestaña «Avisos».

**Subidas al Drive · <mes>**, debajo (con un mes elegido):
- Si el mes tiene cargada la declaración jurada de IVA: **🔒 Mes liquidado**, con enlace a la declaración y su fecha de presentación (ver «Meses liquidados» más abajo).
- Si no: cómo se suben solos los archivos de ese mes.
- La lista de subidas, de la más nueva a la más vieja: **Fecha y hora**, **Qué** («Libro entero (5 archivos + ventas por provincia)» o «Compras (3 archivos)»; al pasar el mouse, los nombres de los archivos), **Cómo** (Automática o A mano) y **Resultado** («Subido a …» con la carpeta, o en rojo «No se subió: …» con el motivo). Si no hay ninguna: "Todavía no se subió nada de este mes."

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

### Mandarlos a la carpeta del mes en Google Drive
1. Elegí un **Mes** entero (y la razón social, si hay más de una).
2. En el recuadro «Libro de IVA Digital (ARCA)», apretá **Mandar al Drive**.
3. Al terminar sale "Listo: 6 archivos del Libro de IVA de mm/aaaa en …" con la carpeta donde quedaron (la del año y el mes según la ruta cargada en [Configuración › Google Drive](/config/google-drive); si no existían, se crean): los 5 TXT y las ventas por provincia (VENTAS_POR_PROVINCIA_AAAAMM.xlsx). Si se mandan de nuevo, se reemplazan (no se duplican).
4. Queda anotado en «Subidas al Drive» como «A mano».

No hace falta mandarlos: se suben solos (ver «Subida automática al Drive»).

### Ver las ventas por provincia
1. Elegí el **Mes** (y la razón social, si hay más de una).
2. Tocá la pestaña **Ventas por provincia**.
3. Para el Excel, **Descargar Excel** arriba a la derecha (o **ventas por provincia (.xlsx)** en el recuadro del Libro de IVA Digital). Es el mismo archivo que se sube al Drive.

### Sumar las ventas facturadas con otro sistema
Si antes se facturaba con otro sistema (con el mismo punto de venta), sus ventas se suman al libro como si las hubiera emitido este, así el libro y los archivos de ARCA quedan completos y con la numeración seguida.
1. En el otro sistema, exportá los dos archivos del Libro de IVA Digital de **ventas** (comprobantes y alícuotas), **del mismo período**.
2. Apretá **+ Importar ventas o compras anteriores** (arriba a la derecha).
3. En «Ventas facturadas con otro sistema», elegí la razón social, escribí el nombre del sistema y elegí los dos archivos.
4. Apretá **Importar ventas**. Sale cuántas ventas se sumaron y de qué fechas a qué fechas.

- Lo que también está emitido acá (mismo tipo, punto de venta y número) se saltea: vale lo de acá.
- Importar de nuevo el mismo período reemplaza lo anterior; no duplica.
- En la tabla, esas ventas muestran el nombre del sistema al lado del documento del cliente y no tienen enlace.
- Si la numeración de un tipo de comprobante tiene un salto, la pestaña **Avisos** lo muestra.

### Sumar las compras de antes de cargarlas en el sistema
Para los meses en que las facturas de compra no se cargaban acá, el libro de IVA compras se completa con lo que ARCA tiene registrado.
1. En ARCA, **Mis Comprobantes › Recibidos**, bajá el Excel del período (ARCA deja bajar hasta 365 días por vez: si es más, en varios archivos).
2. Apretá **+ Importar ventas o compras anteriores** (arriba a la derecha).
3. En «Compras de antes de cargarlas en Laucen», elegí la razón social y el o los archivos.
4. Apretá **Importar compras**.

- Entran **sólo al libro de IVA** (y a sus archivos, al Excel y a la posición de impuestos): no son facturas de compra, así que no generan deuda con el proveedor, ni asiento, ni piden cuenta de gasto.
- Las que ya están cargadas como factura de compra se saltean.
- Si el archivo es del CUIT de la otra razón social, no se importa y avisa.
- En la tabla, esas compras dicen «anterior a Laucen (Mis Comprobantes)» debajo del proveedor y no tienen enlace.

### Corregir algo de un mes ya liquidado
No se puede: el mes quedó trabado al cargar su declaración jurada de IVA. Lo que haga falta va en el mes en curso:
- Una factura de compra con fecha de ese mes que llegó tarde: cargala y registrala como siempre; entra sola en el primer mes sin liquidar.
- Una factura registrada que estaba mal: se corrige con una nota de crédito o de débito, que entra en el mes en curso.

### Cargar las percepciones y retenciones sufridas (Mis Retenciones de ARCA)
Son los pagos a cuenta de IVA que el contador resta en la declaración: las percepciones de servicios, bancos, seguros, Mercado Libre, etc. Las facturas de compra muchas veces no las traen todas.
1. En ARCA, servicio **Mis Retenciones**, consultá las de la razón social desde el primer mes que quieras hasta hoy y bajalas en Excel.
2. Apretá **+ Importar ventas o compras anteriores** (arriba a la derecha).
3. En «Percepciones y retenciones sufridas (Mis Retenciones de ARCA)», elegí la razón social (el archivo no dice de cuál es) y el archivo.
4. Apretá **Importar percepciones y retenciones**. Sale cuántas entraron y de qué fecha a qué fecha.

- Volver a importar no duplica: lo que ya estaba se saltea. Lo de un mes ya liquidado no se toca.
- Conviene importarlo cada mes, antes de mirar la declaración simulada.

### Ver sólo las ventas de un canal
En la pestaña IVA Ventas, elegí el **Canal**. Aparece la aclaración "Filtrado por canal: el resumen de arriba y los archivos de ARCA son siempre de todos los canales."

## Criterios y reglas

### Qué entra en cada libro
- **IVA Ventas**: comprobantes electrónicos **autorizados** por ARCA, en **producción** (los de homologación/prueba no entran), con número, cuya **fecha** cae en el período.
- **IVA Compras**:
  - facturas de compra **registradas** (las en borrador no entran) cuya **fecha de la factura** cae en el período, salvo que al registrarlas su mes ya estuviera liquidado: entonces entran en el **primer mes sin liquidar** (ver «Meses liquidados»);
  - despachos de importación **registrados**, con el mismo criterio.
  - **Facturas E (exterior) y X no entran** (sale un aviso: la mercadería del exterior entra por el despacho; la X no es un comprobante fiscal).
- El período se toma por la **fecha del comprobante**, no por el día en que se cargó (salvo el caso de los meses liquidados). En los archivos de ARCA, el comprobante va siempre con su fecha original.

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
- Facturas de compra y despachos **registrados en este período pero con fecha de otro**: están en el libro de ese otro mes (que todavía no estaba liquidado).
- Facturas de compra y despachos **con fecha de un mes anterior que entran en este libro** porque su mes ya estaba liquidado cuando se registraron.
- Facturas de compra y despachos del período que **siguen en borrador** (no entran hasta registrarlos).
- Ventas del período de **homologación** (prueba) o **no autorizadas** por ARCA (pendientes, con error o rechazadas).

### Archivos del Libro de IVA Digital
- Se arman **sólo por mes entero** (eligiendo un mes, o un rango del 1 al último día de un mes).
- Son cinco: VENTAS_CBTE, VENTAS_ALICUOTAS, COMPRAS_CBTE, COMPRAS_ALICUOTAS e IMPORTACIONES (los despachos van a IMPORTACIONES, no a COMPRAS_ALICUOTAS). Nombre: LIBRO_IVA_DIGITAL_<archivo>_<AAAAMM>.txt; el zip, LIBRO_IVA_DIGITAL_<AAAAMM>.zip.
- Formato de ARCA (mismo diseño que el ex régimen de información de compras y ventas): campos de ancho fijo, importes en centavos sin punto, fechas AAAAMMDD, textos sin acentos, renglones con fin de línea de Windows.
- Las ventas son siempre de **todos los canales**, aunque estés filtrando por uno.
- A un comprobante que discrimina IVA sin ninguna alícuota se le informa una de 0 % con base cero (ARCA pide al menos una).
- En las **compras**, lo que figura como neto gravado al 0 % (así trae Mis Comprobantes de ARCA la parte exenta de una factura A) se informa en el archivo como **operaciones exentas** y no como alícuota: el Libro de IVA Digital rechaza una alícuota 0 % con importe en una compra. En pantalla se sigue viendo en la columna 0 %.
- **Hay que validarlos importándolos en ARCA** antes de presentar.

### Ventas por provincia
- Son los mismos comprobantes del libro de IVA ventas del período (los de este sistema y los importados de otro sistema).
- La provincia de cada comprobante sale, en este orden: 1) la **dirección de entrega del pedido** (la de Mercado Libre, o la del envío cargado en el pedido); 2) si no tiene, la **dirección cargada del cliente** (la principal; si no hay principal, la última cargada); 3) las ventas importadas de otro sistema no tienen pedido: se busca al cliente por su **CUIT o DNI** y se usa su dirección; 4) si no hay ninguna, **Córdoba**, y se cuenta en «Sin prov.».
- La provincia se lee con los 24 nombres de la lista de provincias («Capital Federal» para la Ciudad de Buenos Aires).
- **Neto sin IVA** = neto gravado + no gravado + exento (y, en las facturas C, el total), igual que la base de Ingresos Brutos de [Impuestos](/administracion/impuestos). **Total con IVA** = el total del comprobante.
- Las notas de crédito restan; lo que está en dólares va a la cotización del comprobante. El **%** es sobre el neto sin IVA del período.

### Subida automática al Drive
Con Google Drive conectado y la ruta de la razón social cargada en [Configuración › Google Drive](/config/google-drive), los archivos se suben solos, a la madrugada (entre las 3 y las 5, después de leer las declaraciones del contador que haya en el Drive), a la carpeta del mes:
- **El día 1 de cada mes**, el **libro entero del mes que terminó**: los 5 TXT del Libro de IVA Digital y las ventas por provincia. Si esa noche no se pudo (por ejemplo, el Drive estaba desconectado), se vuelve a intentar cada noche hasta que salga.
- **Todas las noches**, los **3 archivos de compras** (COMPRAS_CBTE, COMPRAS_ALICUOTAS e IMPORTACIONES) de cada mes **todavía sin liquidar** (incluido el mes en curso), **sólo si cambiaron** desde la última vez que se subieron. Un mes sin ninguna compra no se sube.
- Cuando el mes se liquida (se carga su declaración jurada de IVA), sus compras dejan de subirse: ya no pueden cambiar.
- Cada subida, automática o a mano, queda en «Subidas al Drive» con fecha, hora y resultado.
- Lo que se sube reemplaza al archivo del mismo nombre que ya estaba en la carpeta.

### Meses liquidados
Un mes de una razón social queda **liquidado** apenas se carga su **declaración jurada de IVA** en [Impuestos](/administracion/impuestos) (subida a mano o leída del Drive). Desde ese momento **nadie puede alterar nada que haya entrado en ese libro**:
- Las facturas de compra y los despachos registrados en ese mes no vuelven a borrador ni cambian sus importes, fechas, proveedor ni número. En su ficha dice **🔒 liquidado**.
- No se importan, reemplazan ni borran ventas de otro sistema ni compras anteriores de ese mes (al importar, esas se saltean y se avisa cuántas).
- Una factura de compra o un despacho **con fecha de un mes liquidado** que se registra después entra en el **primer mes sin liquidar** desde su fecha (si el mes siguiente también está liquidado, en el que sigue, y así). Su ficha muestra en qué mes del Libro de IVA entró, y el libro de ese mes lo marca en Avisos.
- La traba vale por cualquier camino, no sólo desde las pantallas.
- La declaración jurada de IVA no se puede borrar ni pasar a otro mes. Sólo un **superadministrador** puede borrarla desde su ficha en Impuestos, y queda anotado quién lo hizo y cuándo; al borrarla, el mes se destraba.
- Corregir lo que trae la declaración (sus importes, fecha o notas) sí se puede: eso no cambia el libro.

## Con más de una razón social

**Cada razón social presenta su propio libro de IVA**, así que esta pantalla se mira de **una sola** (no hay "Todas"): arriba aparece el selector **"Razón social"** y, sin elegir, se ve la principal.

- **IVA Ventas** muestra los comprobantes emitidos por esa razón social (por el CUIT con el que se facturó, sin importar el canal).
- **IVA Compras** muestra las facturas de compra y los despachos registrados **a nombre de esa razón social**.
- El resumen, las **ventas por provincia**, los **Avisos**, el **Excel** y los **archivos de ARCA** (Libro de IVA Digital) salen de la razón social elegida.
- Cada razón social se sube a su propia carpeta del Drive y se liquida por separado: la declaración de IVA de una no traba el libro de la otra.
- Una factura de compra cargada a nombre de la otra razón social no entra acá; entra en el libro de la otra.

## Preguntas frecuentes

**¿Cómo importo el archivo de ARCA del libro de IVA compras?**
Lo que se importa es "Mis Comprobantes – Recibidos" de ARCA, en Compras › Facturas de compra → **Importar de ARCA (Mis Comprobantes)** (vista previa, cuenta de gasto por proveedor, **Importar**). Después el libro se ve acá, pestaña IVA Compras.

**¿Por qué no aparece una factura de compra en el libro?**
Puede estar en borrador (no entra hasta registrarla), tener fecha de otro mes, o ser letra E o X. Mirá la pestaña Avisos.

**¿Por qué de entrada me muestra el mes pasado?**
Porque es el que se presenta. Elegí otro en "Mes".

**Cargué una factura vieja este mes, ¿en qué libro queda?**
En el del mes de su fecha, si ese mes todavía no está liquidado (en la pestaña Avisos del mes en que la cargaste aparece "se cargó en este período pero tiene fecha …"). Si ya está liquidado, en el primer mes sin liquidar; su ficha lo dice.

**¿Por qué no puedo volver a borrador una factura?**
Si dice 🔒 liquidado, su mes del Libro de IVA ya tiene la declaración jurada de IVA cargada y no se toca. Corregila con una nota de crédito o de débito.

**¿Tengo que mandar los archivos al Drive todos los meses?**
No: el día 1 se sube solo el libro entero del mes que terminó, y las compras se van subiendo cada noche que cambian, hasta que el mes se liquida. Lo ves en «Subidas al Drive».

**¿De dónde sale la provincia de cada venta?**
De la dirección de entrega del pedido; si no tiene, de la dirección del cliente; si no hay ninguna, se asigna a Córdoba (columna «Sin prov.»).

**¿El saldo técnico es lo que tengo que pagar?**
No: es el del mes suelto. Lo que se pagaría lo muestra el recuadro «Declaración jurada de IVA simulada», que resta los saldos a favor del mes anterior y las percepciones. Las retenciones de IVA que no están cargadas no se ven; la declaración la arma el contador.

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
- [Razones sociales](/config/razones-sociales)
