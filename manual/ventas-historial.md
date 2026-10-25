---
titulo: Historial de ventas
menu: Ventas › Historial de ventas
ruta: /ventas/historial
rutas: /ventas/historial, /ventas/historial/[id]
permiso: pedidos_ver
resumen: Todas las ventas de todos los canales, incluidas las anteriores a que el sistema tomara los pedidos (de Mercado Libre y del historial importado de Virtual Seller), con su detalle.
---

## Para qué sirve

Junta en una sola lista **todo lo vendido en cualquier canal**: Mercado Libre (todas las cuentas), la tienda web, el local y los pedidos cargados a mano. Las ventas de Mercado Libre del último año que son **anteriores a que el sistema tomara los pedidos** también están, y lo anterior de todos los canales sale del **historial de Virtual Seller** importado en [Importar datos](/importar). Todas esas figuran **«Sin pedido»** y son sólo para consultar y para las estadísticas. Nunca generan un pedido, ni mueven stock, ni se facturan.

## Cómo se llega

- Menú **Ventas › Historial de ventas**.
- Desde la ficha de un cliente (sección **Ventas**), desde una conversación de Mercado Libre en [Mensajes](/ventas/mensajes) («Ver la venta») y desde un reclamo sin pedido («Ver la venta»).

## Qué hay en la pantalla

- Arriba, **Descargar Excel** con lo que se ve.
- Filtros: buscador (SKU, producto, comprador, número de venta o de pedido, también el de Virtual Seller), **fechas** con atajos, **canal**, **de dónde** (Mercado Libre, pedidos de otros canales o historial de Virtual Seller) y **con o sin pedido**. Si se llegó desde un producto, un cliente o un comprador, aparece una etiqueta con una ✕ para sacar ese filtro.
- Un renglón por producto vendido: fecha, canal, producto (con su foto), cantidad, precio, total, comisión de Mercado Libre, estado, pedido (o «Sin pedido») y comprador. Las canceladas se ven más claras. Arriba de la tabla, cuántas ventas, unidades y pesos suman (sin las canceladas).
- Las del historial de Virtual Seller muestran sólo el día y, al lado de «Sin pedido», su número de pedido de Virtual Seller («VS PED-…»). Una cuenta que ya no existe en el sistema aparece con el nombre de canal de Virtual Seller.
- Tocando la fecha: si es de Mercado Libre se abre **la ficha de la venta**; si es de otro canal, su pedido.

### La ficha de una venta de Mercado Libre

- Los datos guardados: estado, comprador, pedido (si tiene), total, comisión y los artículos del carrito con su publicación y tipo (Clásica, Premium…).
- Leído **en el momento** de Mercado Libre: el **envío** (estado, seguimiento, cuándo se despachó y se entregó), los **reclamos y devoluciones** y los **mensajes con el comprador**. Leerlos no los marca como leídos ni cambia nada.
- **Ver en Mercado Libre ↗** abre la venta en Mercado Libre.

## Criterios y reglas

- **Mercado Libre**: se toman todas las ventas de cada cuenta; las del último año se trajeron una sola vez y las nuevas se suman solas cada vez que entra una venta. Mercado Libre no deja leer ventas de más de un año.
- **Otros canales**: salen de los pedidos, sin presupuestos ni cancelados.
- **Historial de Virtual Seller**: lo que el sistema no tiene por otro lado. Una venta de Mercado Libre que ya está leída de Mercado Libre no se repite; en los demás canales cuenta lo anterior al primer pedido del sistema en ese canal. Su comprador se enlaza con la ficha del cliente cuando el CUIT o el documento coinciden con un cliente que ya existía.
- **Nada se cuenta dos veces**: una venta de Mercado Libre que tiene pedido aparece una sola vez (como venta de Mercado Libre, con su pedido al lado).
- **El comprador** de una venta de Mercado Libre se reconoce como cliente cuando ya compró alguna vez con el sistema funcionando (por su usuario de Mercado Libre en esa cuenta).
- **Comisión**: el cargo por venta que informa Mercado Libre en cada venta.

## Relacionado

- [Pedidos y presupuestos](/ventas/pedidos)
- [Clientes](/ventas/clientes)
- [Mercado Libre en Mensajes](/ventas/mensajes/internet)
- [Reclamos y devoluciones](/ventas/reclamos)
