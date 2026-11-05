---
titulo: Órdenes de compra al exterior
menu: Compras › Órdenes de compra al exterior
ruta: /compras/ordenes
rutas: /compras/ordenes, /compras/ordenes/[id], /compras/ordenes/[id]/etiquetas
permiso: compras_ver
resumen: Cargar lo que se compró al exterior y cuándo llega (una orden por cada llegada), con sus cajas y etiquetas; cuenta como mercadería entrante, habilita la preventa en la web y en Mercado Libre y se recibe por cajas.
---

## Para qué sirve

Para tener en el sistema lo que viene en camino desde el exterior. Cada **orden** es una llegada: un aéreo, un marítimo o un courier. Con la orden cargada y confirmada:

- cada producto muestra su **mercadería entrante** (llegando · prevendido · saldo) en todas las pantallas de stock y en la [Sugerencia de compra](/compras/sugerencia);
- el FOB de cada producto pasa a ser el de la orden (el costo puesto estimado se calcula con él);
- se puede **vender en preventa** lo que todavía no llegó, en la tienda web y en Mercado Libre (ver [Preventas](/ventas/preventas));
- se **recibe por cajas** en [Recepción](/deposito/recepcion), con la caja como ubicación y su etiqueta.

## Cómo se llega

Menú **Compras › Órdenes de compra al exterior**. Pide el permiso de Compras.

## Qué hay en la pantalla

### La lista

- Arriba, la caja para crear una orden: **Proveedor**, **Llega por** (Aéreo, Marítimo o Courier) y el **Excel del proveedor** (.xlsx). «Crear la orden» lo lee y abre la orden nueva, a revisar.
- El buscador (código, proveedor o archivo) y el filtro de **Estado**.
- La tabla: **Orden** (su código y la vía), **Estado**, **Arribo** (la fecha para la web y, si es otra, la de Mercado Libre), **Preventa** (dónde se ofrece y cuántas se prevendieron), **Proveedor**, **Unidades**, **Total** en dólares, **Cajas**, **Fecha** y el tacho (sólo en las que están a revisar).

### El código de la orden

Letra de la vía + número del año (dos cifras) + año (dos cifras): **A** aéreo, **M** marítimo, **C** courier. **M0226** es el segundo marítimo de 2026. Las cajas llevan el código de la orden y su número: **M0226-34** es la caja 34. El número lo pone el sistema solo y se puede corregir con el lápiz.

### La ficha de una orden

- Arriba a la derecha: **Ver el Excel ↗**, **Etiquetas de las cajas ↗**, **Nuevo renglón**, **Confirmar** (o **Volver a revisar**) y el lápiz.
- Los datos: vía, número y año, proveedor, **Fecha de la orden**, **Arribo (web)**, **Arribo para Mercado Libre** (con más margen que la de la web), **Descuento de preventa %**, **Margen de seguridad** (unidades, % y si toma el menor o el mayor) y notas. Vacíos, valen los generales de [Preventas › Configuración](/ventas/preventas?ver=config).
- **Preventa**: los interruptores **Publicar en la web** y **Publicar en Mercado Libre**, y cuánto se vendió en preventa. Con las cuentas de Mercado Libre sin «Preventa automática», el botón **Preparar el lote para Mercado Libre** arma el cambio para mandarlo desde la cola.
- **Recepción**: elegir el depósito y **Recibir** (o **Seguir recibiendo** si ya hay una recepción abierta). Muestra cuánto se recibió.
- Las pestañas:
  - **Renglones**: producto (con su foto), cantidad, lo recibido, lo prevendido, lo que traen las cajas (en rojo si no coincide con la orden), FOB y total, y el SKU como venía en el Excel. Lápiz y tacho en cada renglón.
  - **Cajas**: subir el **packing list** del proveedor (.xlsx) y la lista de cajas con su código, contenido, peso, volumen, medidas y si ya se recibió (y cuántas unidades quedan adentro).
  - **Preventas**: los pedidos vendidos en preventa de esta orden.

## Cómo se hace

### Cargar una orden

1. En la lista, elegí el **Proveedor**, **Llega por** y el Excel del proveedor.
2. Tocá **Crear la orden**. Se abre la orden, a revisar.
3. Revisá los renglones: los que dicen «No está en el sistema» se corrigen con el lápiz (el SKU) o hay que dar de alta el producto.
4. Corregí con el lápiz de arriba la **fecha de arribo** (la web) y la de **Mercado Libre**. De entrada se calculan con la demora de la vía (la de [Invoices de compra](/compras/invoices)).
5. Tocá **Confirmar**.

### Subir el packing list e imprimir las etiquetas

1. En la orden, pestaña **Cajas**, elegí el Excel del packing list y tocá **Subir y leer**.
2. Revisá los avisos (por ejemplo, un producto que la orden dice 100 y las cajas traen 90).
3. Arriba, **Etiquetas de las cajas ↗**: se imprimen todas de un saque, dos por hoja A4 o en una térmica de 100 × 150 mm. Cada una tiene el código de la caja en grande, su código de barras y lo que trae.

### Ofrecer en preventa

1. Con la orden confirmada, prendé **Publicar en la web** y/o **Publicar en Mercado Libre**.
2. Lo que no tiene stock de esa orden pasa a ofrecerse en preventa (ver los criterios en [Preventas](/ventas/preventas)).

### Recibir la orden

1. En la orden, elegí el depósito y tocá **Recibir**. Se abre la recepción de la orden.
2. Seguí en [Recepción](/deposito/recepcion): se escanea la etiqueta de cada caja.

## Criterios y reglas

- **Estados**: *A revisar* (recién cargada; no cuenta para nada), *En camino* (confirmada: cuenta como entrante y se puede publicar en preventa) y *Recibida* (al cerrar su recepción).
- **Confirmar** deja confirmado el invoice de la orden (para el historial de compras de cada producto), pone el **FOB** del Excel en cada producto y, si es courier, arma su compra en [Compras por courier](/compras/courier) (ahí se cargan el flete por kilo y el % courier y se graba el costo real). **No cambia el costo último ni el promedio**: esos los graba el ingreso real con su factura o despacho. Para confirmar hacen falta proveedor, fechas y que todos los renglones tengan su producto.
- El Excel de la orden queda como invoice de compra: no hace falta subirlo otra vez en Invoices de compra.
- **Volver a revisar** sólo si todavía no entró nada y no tiene ventas en preventa. Borrar, sólo a revisar.
- **Achicar un renglón** con ventas en preventa: no se puede bajar de lo ya vendido. Primero se resuelve cada pedido que sobra, uno por uno, en [Preventas](/ventas/preventas) (pasarlo a otra orden, dejarlo en espera o cancelarlo).
- **Cambiar la fecha** de una orden cambia también la fecha prometida de sus pedidos de preventa que todavía esperan.
- **Mercadería entrante** de un producto: *llegando* (lo que las órdenes en camino todavía tienen que traer), *prevendido* (lo vendido en preventa de esas órdenes) y *saldo* (llegando − prevendido).
- **Packing list**: cada caja con su número, peso, volumen y contenido. Si un renglón dice varias cajas («1-20»), la cantidad se reparte entre ellas. El peso y el volumen por unidad de cada producto se guardan como en la ficha del producto (exacto si el producto vino en cajas propias, aproximado si vino mezclado). Una vez recibida alguna caja, el packing list ya no se cambia.

## Relacionado

[Preventas](/ventas/preventas) · [Recepción](/deposito/recepcion) · [Invoices de compra](/compras/invoices) · [Compras por courier](/compras/courier) · [Sugerencia de compra](/compras/sugerencia)
