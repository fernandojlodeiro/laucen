---
titulo: Despachos de importación
menu: Compras › Despachos de importación
ruta: /compras/despachos
rutas: /compras/despachos, /compras/despachos/[id], /compras/despachos/nuevo
permiso: despachos_ver
resumen: Cargar la mercadería importada con FOB, flete, seguro, gastos e impuestos, prorratear el costo puesto en depósito y registrar (ingresa stock y costo).
---

## Para qué sirve

Un despacho de importación es la mercadería que nacionalizaste con todos sus costos. Acá se carga cada despacho con:
- las **líneas** (qué productos, cuántos y a qué FOB unitario en dólares);
- el **flete** y el **seguro** internacionales (en dólares);
- los **gastos** que suman al costo (derechos, tasa estadística, despachante, depósito fiscal, flete interno, gastos bancarios…), en pesos;
- los **impuestos** que son crédito fiscal y no costo (IVA, IVA adicional, Ganancias, IIBB), en pesos.

El sistema **prorratea** flete, seguro y gastos entre las líneas según su FOB y calcula el **costo unitario puesto en depósito** de cada producto. Al **registrar**, entra el stock al depósito y queda ese costo en cada producto.

La factura del proveedor del exterior y las del despachante **no** se cargan acá: van en [Facturas de compra](/compras/facturas), sin productos.

## Cómo se llega

- Menú: **Compras › Despachos de importación**.
- Desde el pie del detalle de un despacho hay enlace a [Facturas de compra](/compras/facturas).
- Desde [Libros de IVA](/administracion/libros-iva) (IVA Compras y Avisos), cada despacho es un enlace a su detalle.

## Qué hay en la pantalla

### La lista

Arriba a la derecha: **Descargar Excel** (con configuraciones) y **+ Nuevo despacho**.

Filtros: **Proveedor** (sólo los que tienen despachos), **Estado** (Todos, Borrador, Registrado, Anulado), **Filtrar** y **Limpiar**.

Columnas (se ordenan tocando el título; de a 50 filas):
- **Fecha** y **Despacho** (el número; si no tiene, "#N (sin número)"): llevan al detalle.
- **Proveedor**: enlace a su fila en Proveedores.
- **Líneas**.
- **FOB** (US$), **Flete + seguro** (US$), **Gastos** ($).
- **Costo total** ($) = (FOB + flete + seguro) × cotización + gastos.
- **Estado**.

El Excel puede traer además: unidades, flete y seguro por separado, cotización, impuestos (crédito fiscal), depósito, fecha de registro y notas.

### Nuevo despacho (/compras/despachos/nuevo)

Sólo la cabecera y el botón **Crear y cargar las líneas**. Si no hay tipo de cambio cargado avisa "No hay tipo de cambio cargado: poné la cotización a mano.".

### El detalle (/compras/despachos/[id])

Título "Despacho" con su número; debajo, fecha y proveedor.

**En borrador:**
- Arriba a la derecha: **Registrar** y el **tacho** (borrar el borrador).
- **Cabecera** con su estado, "FOB (suma de las líneas)" y el botón **Grabar cabecera**. Campos: **Nº de despacho** (ej. 26001IC04012345X), **Proveedor del exterior (opcional)** (primero los de afuera, con su país), **Fecha**, **Cotización del dólar** (de entrada la del día), **Flete (US$)**, **Seguro (US$)**, **Depósito donde entra** y **Notas**. El FOB no se carga: es la suma de las líneas.
- **Gastos (suman al costo)** e **Impuestos (crédito fiscal, no costo)**: dos tablas de Concepto e Importe ($), con su total. Cada renglón tiene lápiz (se edita en la fila, con **Guardar** / **Cancelar**) y tacho. Abajo de cada una, para agregar: **Concepto** (con sugerencias), importe y **Agregar**. Sugerencias de gastos: Derechos de importación, Tasa estadística, Despachante, Depósito fiscal, Flete interno, Gastos bancarios. De impuestos: IVA, IVA adicional, Ganancias, IIBB.
- **Líneas**: Descripción, NCM, Cantidad, FOB unit., FOB total; lápiz y tacho en cada una. Las líneas sin producto dicen "(sin producto: no entra al stock)".
- **Agregar línea**: buscador "Buscar producto por SKU, código o título" (con **Mostrar inactivos** y **Buscar**), **Producto** (o "— Línea libre (sin producto: no entra al stock) —"), **Descripción (si es libre)**, **NCM**, **Cantidad**, **FOB unit. (US$)** y **Agregar**.
- **Prorrateo: costo puesto en depósito**: por línea, Cantidad, Parte del FOB (%), Costo unit. ($), Costo unit. (US$) y Costo total ($). Se recalcula con cada cambio.
- La caja de totales: FOB × cotización, flete y seguro en pesos, gastos, **Costo total puesto en depósito**, el mismo en dólares, e "Impuestos (crédito fiscal, aparte)".

**Registrado:** todo en sólo lectura (Estado con fecha y hora, Proveedor, Cotización, Depósito, FOB, Flete, Seguro, Notas), con el prorrateo que quedó guardado al registrar.

## Cómo se hace

### Cargar un despacho
1. En [Despachos de importación](/compras/despachos), apretá **+ Nuevo despacho**.
2. Completá **Nº de despacho**, **Proveedor del exterior (opcional)**, **Fecha**, **Cotización del dólar** (la del despacho), **Flete (US$)**, **Seguro (US$)** y **Depósito donde entra**.
3. Apretá **Crear y cargar las líneas**. Te lleva al detalle: "Despacho creado: cargale las líneas y los gastos.".
4. Por cada producto, en **Agregar línea**: buscalo, elegilo en **Producto**, poné **NCM** (opcional), **Cantidad** (entera) y **FOB unit. (US$)**, y **Agregar**.
5. Cargá los **Gastos** en pesos (derechos, tasa estadística, despachante, etc.), uno por renglón, con **Agregar**.
6. Cargá los **Impuestos** en pesos (IVA, IVA adicional, Ganancias, IIBB).
7. Mirá el **Prorrateo** y el **Costo total puesto en depósito**.
8. Apretá **Registrar** → "¿Registrar? Ingresa el stock y deja el costo puesto en depósito. Después no se puede cambiar." → **Sí**.
9. Sale "Despacho registrado: entró el stock y quedó el costo puesto en depósito de cada producto.".

Errores típicos:
- "Poné la fecha del despacho." / "Poné la cotización del dólar del despacho." / "El flete y el seguro no pueden ser negativos.".
- "Poné una cantidad entera mayor a cero." / "Poné el FOB unitario en dólares." / "Una línea sin producto necesita una descripción.".
- "Poné el concepto." / "Poné el importe en pesos." (en gastos e impuestos).
- Al registrar: "Elegí a qué depósito entra la mercadería.", "El depósito elegido no tiene ubicación general, así que la mercadería no tiene dónde entrar: elegí otro depósito.", "Falta la cotización del dólar del despacho.", "El despacho no tiene líneas con FOB.".
- "El despacho ya está registrado: no se cambia.".

### Corregir un borrador
Cambiá la cabecera y apretá **Grabar cabecera**. Gastos, impuestos y líneas se editan con su lápiz en la fila y se borran con su tacho.

### Borrar un borrador
Tacho de arriba a la derecha → "¿Borrar el borrador?" → **Sí**. Sólo borradores.

### Cargar las facturas del exterior y del despachante
En [Facturas de compra](/compras/facturas), con líneas libres (sin productos). La del exterior con letra **E**. Así no se duplica el stock ni el costo: esos entran por el despacho.

## Criterios y reglas

### Prorrateo (costo puesto en depósito)
- **FOB de cada línea** = cantidad × FOB unitario (US$). **FOB total** = suma de las líneas (se guarda redondeado a centavos).
- **Extra en pesos** = (flete + seguro) × cotización + suma de los **gastos**.
- **Parte de cada línea** = FOB de la línea / FOB total.
- **Costo unitario en pesos** = (FOB de la línea × cotización + parte × extra) / cantidad, redondeado a centavos.
- **Costo unitario en dólares** = costo unitario en pesos / cotización, a 4 decimales.
- **Costo total puesto en depósito** = FOB total × cotización + extra.
- Los **impuestos** (IVA, IVA adicional, Ganancias, IIBB) **no** suman al costo: son crédito fiscal o pagos a cuenta.
- Las líneas sin producto también reciben su parte del prorrateo (cuentan en el FOB), pero no entran al stock.
- Todo se calcula con la **cotización del despacho**, no con la del día.

### Qué pasa al registrar
1. Controles: borrador, con cotización, con depósito, y con líneas y FOB total mayor a cero.
2. Para cada línea se guarda su costo unitario en pesos y en dólares.
3. Para cada línea con producto:
   - **costo**: se actualiza el último costo y el promedio ponderado del producto (stock que había × promedio anterior + cantidad × costo nuevo, dividido el total; si no había stock, el promedio pasa a ser el costo nuevo);
   - **stock**: ingresa la cantidad a la ubicación general del depósito elegido.
4. Queda **Registrado** con fecha y hora. Desde ese momento no se modifica.
5. Se avisa a Mercado Libre el stock nuevo de esos productos (si el canal tiene prendida la sincronización de stock).

El despacho **no** genera deuda en cuenta corriente: la deuda la dejan las facturas del exterior y del despachante.

### Asiento contable (automático)
- **Debe**: Mercaderías (costo puesto en depósito de las líneas) y cada impuesto a su cuenta: el concepto que dice "adicional" o "percepción" de IVA → Percepciones de IVA; "IVA" → IVA crédito fiscal; "Ganancias" → Retenciones sufridas; "IIBB" o "Ingresos Brutos" → Percepciones de IIBB; cualquier otro → Impuestos.
- **Haber**: Importaciones en curso (por el total). Esa cuenta se cancela con la factura del exterior y las del despachante.

### En el Libro de IVA
Los despachos registrados entran al **Libro IVA Compras** como comprobante tipo 066, con el CUIT de la Dirección General de Aduanas, por su fecha:
- el **IVA** es crédito fiscal; el **IVA adicional** va como percepción de IVA; **Ganancias** como otras percepciones nacionales; **IIBB** como percepción de IIBB; lo demás, otros.
- La alícuota (21 % o 10,5 %) se deduce comparando el IVA con CIF + derechos + tasa estadística (los gastos cuyo concepto dice "derecho" o "tasa estad"); la base que se informa es IVA / alícuota. Si no se parece a ninguna, aviso para revisar.
- Por eso conviene escribir los conceptos con esas palabras (usá las sugerencias).
- Avisos: despacho sin número ("ARCA lo pide"), sin IVA en sus impuestos, o con IVA que no da 21 ni 10,5 %.

## Con más de una razón social

Cada despacho se registra **a nombre de una razón social** (campo **"A nombre de (razón social)"**, sólo si hay más de una; sin elegir, la principal): de ella son el IVA y las percepciones (crédito fiscal del libro de IVA Compras) y el asiento. **La mercadería entra igual al stock general.** La lista tiene un selector **"Razón social"**.

## Preguntas frecuentes

**¿Dónde cargo el flete interno o el despachante?**
Como **Gastos** del despacho, en pesos: suman al costo de los productos. Además, la factura del despachante va en Facturas de compra (sin productos) para que quede la deuda.

**¿El IVA de la importación suma al costo?**
No. Va en **Impuestos (crédito fiscal, no costo)**.

**¿Cómo se reparten los gastos entre los productos?**
Según el FOB de cada línea: una línea que es el 30 % del FOB se lleva el 30 % del flete, seguro y gastos.

**¿Qué cotización usa?**
La que pongas en la cabecera del despacho, para todo el cálculo.

**¿Puedo cambiar un despacho registrado?**
No. Registrar es definitivo.

**¿Por qué no me deja registrar?**
Revisá que tenga depósito elegido, cotización y al menos una línea con FOB mayor a cero.

**¿Tengo que cargar también la factura del proveedor chino?**
Sí, en Facturas de compra, sin productos y con letra E: deja la deuda con el proveedor. El stock y el costo entran por el despacho.

## Relacionado

- [Facturas de compra](/compras/facturas)
- [Proveedores](/compras/proveedores)
- [Libros de IVA](/administracion/libros-iva)
- [Contabilidad](/administracion/contabilidad)
- [Consulta de stock](/stock/consulta)
- [Tipo de cambio](/config/tipo-cambio)
- [Importaciones ARCA](/importaciones)
- [Razones sociales](/config/razones-sociales)
