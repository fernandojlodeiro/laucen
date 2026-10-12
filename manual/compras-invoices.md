---
titulo: Invoices de compra
menu: Compras › Invoices de compra
ruta: /compras/invoices
rutas: /compras/invoices, /compras/invoices/[id]
permiso: compras_ver
resumen: Subir los invoices (Excel o PDF) de las compras al exterior para tener el historial de compras de cada producto —fecha, cantidad y precio— y su proveedor preferido. No mueve stock ni costos.
---

## Para qué sirve

Para guardar qué se compró, cuándo, cuánto y a qué precio, a partir de los invoices de los proveedores del exterior. Con eso cada producto tiene su **historial de compras** (pestaña Compras de su ficha), cuánto tardó en venderse cada compra y su **proveedor preferido**, que sirve para filtrar la [Sugerencia de compra](/compras/sugerencia) y la lista de [Productos](/catalogo/productos).

**Es sólo estadística**: no mueve stock, no cambia costos ni precios.

## Cómo se llega

Menú **Compras › Invoices de compra**. También desde [Importar datos](/importar), con el recuadro «Invoices de compra». Pide el permiso de Compras.

## Qué hay en la pantalla

### La lista

- Arriba, la caja para subir: **Proveedor** (desplegable con buscador; propone el del último invoice) y los **archivos**: uno o varios juntos, en Excel (.xlsx) o PDF. «Subir y leer» los procesa de a uno y abajo dice qué pasó con cada archivo (cuántos renglones leyó, o por qué no se pudo).
- Arriba a la derecha, **«Confirmar los N con fecha segura»**: confirma de una vez los que están a revisar, tienen renglones y una fecha que no se presta a confusión.
- La tabla: **Fecha** (con ⚠ si hay que revisarla), **Número**, **Archivo**, **Proveedor**, **Vía** (y la compra por courier, si está vinculada), **Renglones** (en rojo cuántos no se encontraron en el sistema), **Unidades**, **Total** en dólares («sin precio» si está marcado así), **Estado** (A revisar o Confirmado) y el tacho para borrarlo. Se ordena tocando los títulos.
- Abajo, **Demora estimada de llegada**: cuántos días tarda en llegar lo que viene por avión y por barco (de entrada, 15 y 60). Se cambian con el lápiz.

### La ficha de un invoice (vista previa)

Tocando la fecha o el número se abre lo que se leyó, para revisarlo antes de confirmar:

- Arriba, los avisos de la lectura (por ejemplo, una fecha que se puede leer de dos formas).
- Los datos: **Fecha del invoice** (y cómo venía escrita), **Vino por** (Avión o Barco), **Llegada estimada**, **Número**, **Proveedor**, **Es la compra por courier** (si este invoice es el de una compra ya cargada en [Compras por courier](/compras/courier)), la caja **«No tomar el precio»** y las **Notas**. Se corrigen con el lápiz de arriba a la derecha.
- Los totales: renglones, cuántos no están en el sistema, unidades y total.
- Los renglones: fila del Excel, **SKU del invoice**, el **producto** del sistema que le corresponde (con su foto; lleva a la pestaña Compras del producto) o, en rojo, que no está; descripción, cantidad, precio unitario y total. Cada renglón se corrige con su lápiz (SKU, cantidad y precio) o se borra con el tacho.
- Arriba a la derecha: **Ver el archivo ↗** (el original), **Nuevo renglón** (para cargar a mano), **Confirmar** (o **Volver a revisar** si ya está confirmado) y el lápiz.

## Cómo se hace

### Subir invoices

1. Elegí el proveedor y los archivos (pueden ser varios a la vez).
2. «Subir y leer». Cada uno queda **A revisar**.
3. Abrí cada uno, mirá la fecha y los renglones en rojo (SKU que no se encontró: corregilo con el lápiz) y apretá **Confirmar**. Si están todos bien, «Confirmar los N con fecha segura» los confirma juntos.

### Un invoice en PDF

El PDF queda guardado sin renglones. Abrilo, cargá la fecha con el lápiz y los renglones con **Nuevo renglón** (SKU, cantidad, precio y descripción), y confirmalo. «Ver el archivo ↗» abre el PDF para ir copiando.

### Un invoice con precios que no son reales

Marcá **«No tomar el precio»** con el lápiz: cuentan la fecha, la cantidad y el proveedor, pero el precio no aparece en el historial ni en los totales.

## Criterios y reglas

- **Cómo se lee el Excel**: se busca solo el renglón de títulos de la tabla, el que tiene la cantidad («Qty», «Quantity», «Cantidad») y el precio («Unit Price», «Price», «Precio») o el importe («Amount», «Total»). El SKU es la columna cuyos valores coinciden con el formato de los SKU del sistema; si ninguna coincide, la que se titula «SKU», «Item No.», «Model» o «Code». Sin precio unitario, se calcula importe ÷ cantidad. Se lee hasta el renglón «Total». Arriba de la tabla se buscan la **fecha** (al lado de «Date» o «Fecha», o la primera fecha que aparezca) y el **número** (al lado de «Invoice No.», «PI No.» o «No.»). Si el libro tiene varias hojas, se usa la primera que tenga tabla.
- **La fecha** se entiende en cualquier forma: fecha de Excel, «2025-10-05», «Oct. 5, 2025», «5-Oct-2025», «2025年10月5日», «05/10/2025». Cuando día y mes son los dos 12 o menos, se toma el mes primero si el invoice está en inglés y el día primero si no, y se marca **⚠** para revisarla.
- **El SKU** se busca sin importar mayúsculas ni espacios. Un renglón cuyo SKU no está en el sistema se guarda igual, pero no cuenta para ningún producto hasta que se corrige.
- **El mismo invoice dos veces** no entra: mismo número del mismo proveedor, o misma fecha con los mismos renglones.
- **Sólo cuenta lo confirmado**: un invoice a revisar no aparece en el historial de los productos ni cambia el proveedor preferido. Para confirmar hace falta la fecha y al menos un renglón.
- **Llegada estimada** = fecha del invoice + la demora de la vía (avión o barco). Desde la llegada se cuenta cuánto tardó en venderse cada compra (ver la pestaña Compras en [Productos](/catalogo/productos)).
- **Proveedor preferido**: al confirmar (o corregir un confirmado), cada producto del invoice toma el proveedor de su invoice confirmado más reciente. Se puede cambiar a mano en la ficha del producto, y vuelve a cambiar si llega un invoice más nuevo de otro proveedor.
- **Compra por courier vinculada**: si un invoice es el de una compra por courier ya cargada, al vincularlo esa compra deja de contarse aparte en el historial, para no sumarla dos veces.
- Se aceptan Excel .xlsx y PDF. Un .xls viejo hay que abrirlo y guardarlo como .xlsx.

## Relacionado

- [Compras por courier](/compras/courier)
- [Sugerencia de compra](/compras/sugerencia)
- [Productos](/catalogo/productos)
- [Proveedores](/compras/proveedores)
