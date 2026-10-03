---
titulo: Rentabilidad por venta
menu: Informes › Rentabilidad por venta
ruta: /informes/rentabilidad
rutas: /informes/rentabilidad
permiso: informes_ventas_ver
resumen: Por cada venta o producto: lo vendido, los cargos del canal (Mercado Libre), el costo de la mercadería y el margen.
---

## Para qué sirve

Muestra cuánto se ganó con cada venta (o con cada producto) en un período: lo vendido, lo que se llevó el canal (comisión, envío y cargo fijo de Mercado Libre), el costo de la mercadería y el margen en pesos y en porcentaje.

## Cómo se llega

- Menú **Informes › Rentabilidad por venta**.

## Qué hay en la pantalla

Título "Rentabilidad por venta" y la aclaración: "Lo vendido, lo que cobró el canal (cargos de la facturación de Mercado Libre: comisión, envío, cargo fijo; sin impuestos), el costo de la mercadería al tipo de cambio del día de la venta y el margen."

### Arriba a la derecha

- **"Descargar Excel"**: baja lo mismo que se ve, con los mismos filtros, todas las filas y una fila de **Total** al final.

### Filtros (cambian la pantalla al momento)

- **Fechas** desde/hasta con atajos. Si no se elige, va **del 1.º del mes actual a hoy**.
- **Canal**: Todos o uno (Mercado Libre, tienda, etc.).
- **Ver**: **Por venta** o **Por producto**.
- **Costo**: **Costo promedio** (el de siempre), **Último costo** o **Costo FOB**.

### Recuadros de totales

**Venta**, **Cargos del canal**, **Costo**, **Margen** y **Margen %** de todo lo filtrado.

Si hay ventas o productos sin costo, o ventas sin cargos de la facturación de ML, aparece un aviso amarillo explicándolo (ver "Criterios y reglas").

### Tabla "Por venta"

Columnas: **Fecha** (fecha y hora de la venta; enlace al pedido), **Venta** (número del pedido, enlace; debajo, el número de Mercado Libre u otro canal), **Canal**, **Productos** (los títulos de las líneas), **Unidades**, **Venta** (importe), **Cargos**, **Costo** ("sin costo" si algún producto no tiene), **Margen** y **Margen %** (en rojo si son negativos). Orden de entrada: la más reciente primero.

### Tabla "Por producto"

Columnas: **Código** (enlace a la ficha del producto), **Producto**, **Ventas** (en cuántas ventas distintas aparece), **Unidades**, **Venta**, **Cargos**, **Costo**, **Margen**, **Margen %**. Orden de entrada: el que más vendió en pesos primero.

En las dos, se ordena tocando el título de la columna y se ve de a 50 filas con el paginador abajo. Un **asterisco** (*) al lado de los cargos indica que se usó la comisión de la orden porque todavía no hay cargos de la facturación de ML.

## Cómo se hace

### Ver cuánto se ganó el mes pasado en Mercado Libre

1. En el atajo de fechas elegí **"Último mes"**.
2. En **Canal** elegí la cuenta de Mercado Libre.
3. Mirá los recuadros de arriba (Venta, Cargos, Costo, Margen, Margen %).

### Ver qué productos dejan más margen

1. En **Ver** elegí **Por producto**.
2. Tocá el título **Margen** (o **Margen %**) para ordenar.

### Comparar con otro costo

En **Costo** elegí **Último costo** o **Costo FOB**: todo se recalcula con esa base.

### Bajar el informe a Excel

Con los filtros puestos, apretá **"Descargar Excel"**. El archivo trae las mismas columnas, una columna **"Cargos de"** que dice "Facturación ML" o "Comisión de la orden", y una fila **Total**.

## Criterios y reglas

### Qué ventas entran

Todos los pedidos con fecha dentro del rango (en hora argentina, el día "hasta" incluido) que **no** estén en estado **Nuevo** (sin pagar), **Cancelado** ni **Devuelto**, del canal elegido o de todos. No importa si están facturados o no.

### Venta

Suma de las líneas del pedido: precio unitario en pesos × cantidad (con IVA, tal como se vendió). El costo de envío que pagó el comprador **no** entra.

### Cargos del canal

- Si ya se leyó la facturación de Mercado Libre de esa venta (ver [Facturación de Mercado Libre](/administracion/facturacion-ml)): la suma de **sus cargos de costo** unidos a la venta (comisión, envío, cargo fijo, publicidad, bonificaciones), **sin los impuestos** (percepciones y retenciones). Van tal como los factura ML, **con IVA**.
- Si todavía no se leyó (la lectura se hace de noche) o la venta no es de ML: la **comisión que vino con la orden**. Se marca con asterisco.
- **Por producto**, los cargos de cada venta se reparten entre sus líneas en proporción a lo que vendió cada una.

### Costo

Cantidad × costo unitario de la variación, en pesos, según la base elegida:
- **Costo promedio**: el costo promedio en dólares × el **tipo de cambio del día de la venta**; si no hay costo en dólares, el costo promedio en pesos.
- **Último costo**: igual, con el último costo.
- **Costo FOB**: el FOB del producto; si está en pesos va directo, si está en dólares se multiplica por el tipo de cambio del día de la venta.

### Margen

- **Margen** = Venta − Cargos − Costo.
- **Margen %** = Margen ÷ Venta × 100, con un decimal.
- Si en una venta (o producto) hay **alguna línea sin costo**, su margen y su margen % no se calculan (se ve "—") y en Costo dice "sin costo".
- En los **recuadros de totales**, el costo suma lo que haya (las filas sin costo completo suman sólo la parte que tiene costo), así que con productos sin costo **el margen total queda más alto de lo real**. El aviso amarillo dice cuántas ventas o productos están en esa situación.

## Preguntas frecuentes

**¿Por qué una venta dice "sin costo"?**
Porque algún producto de esa venta no tiene costo cargado. Cargale el costo (por ejemplo, registrando su factura de compra o despacho).

**¿Qué significa el asterisco en Cargos?**
Que todavía no se leyó la facturación de Mercado Libre de esa venta y se usó la comisión que vino con la orden. Al día siguiente, después de la lectura nocturna, suele estar el dato real.

**¿Los cargos incluyen IVA?**
Sí: van tal como los factura Mercado Libre. No incluyen percepciones ni retenciones.

**¿La venta incluye IVA?**
Sí, es el precio de venta tal cual. El envío cobrado al comprador no se suma.

**¿Entran las ventas canceladas o devueltas?**
No. Tampoco las que están "Nuevo" (sin pagar).

**¿Con qué tipo de cambio se calcula el costo?**
Con el del día de cada venta.

**¿Por qué el total de margen no coincide con la suma de los márgenes de la tabla?**
Porque los totales incluyen las ventas sin costo completo (con el costo que tengan), y en la tabla esas filas no muestran margen.

## Relacionado

- [Pedidos](/ventas/pedidos)
- [Facturación de Mercado Libre](/administracion/facturacion-ml)
- [Productos](/catalogo/productos)
- [Tipo de cambio](/config/tipo-cambio)
- [Stock valorizado](/informes/stock-valorizado)
