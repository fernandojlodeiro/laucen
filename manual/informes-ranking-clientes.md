---
titulo: Ranking de clientes
menu: Informes › Ranking de clientes
ruta: /informes/ranking-clientes
rutas: /informes/ranking-clientes
permiso: informes_ventas_ver
resumen: Los clientes que más compraron (los primeros 50, 100 o 200) en un período, por cantidad de compras, por productos distintos o por monto, en todos los canales.
---

## Para qué sirve

Para saber quiénes son los mejores clientes: los que compran más seguido, los que compran más variedad y los que más facturan. Toma **todas las ventas de todos los canales** (Mercado Libre, la tienda web, el local y el historial importado de Virtual Seller), sin las canceladas.

## Cómo se llega

Menú **Informes › Ranking de clientes**. Pide el permiso «Informes de ventas».

## Qué hay en la pantalla

- **Fechas** con atajos (Hoy, Este mes, Último año…). Sin fechas, toda la historia.
- **Mostrar**: los primeros 50 (de entrada), 100 o 200.
- **Ordenados por**: Monto (el de entrada), Cantidad de compras o Productos distintos. La columna elegida se ve en negrita.
- La caja **«Excluye compras de notebooks»**: tildada, las notebooks vendidas no cuentan (ni en compras, ni en productos, ni en monto).
- La tabla: puesto, cliente, último canal por el que compró, **compras**, **productos distintos**, unidades, **monto**, ticket promedio (monto ÷ compras), primera y última compra del período.
- Tocando el cliente se abre su ficha. Si no está en el sistema como cliente, se abren sus compras en el [Historial de ventas](/ventas/historial).

## Criterios y reglas

- **Quién es el cliente**: el cliente del sistema cuando se lo reconoce (el del pedido; el del historial de Virtual Seller, por CUIT o documento; el comprador de Mercado Libre que ya compró con el sistema andando). Si no, el comprador de Mercado Libre (por su usuario en esa cuenta, marcado «comprador de ML») o el nombre que figuraba en Virtual Seller (marcado «de Virtual Seller»).
- **Una compra** es un pedido, un carrito de Mercado Libre (o la venta, si no fue en carrito) o un pedido de Virtual Seller, sin importar cuántos productos tenga.
- **Productos distintos**: cuántos productos diferentes compró en el período (las variaciones de un mismo producto cuentan una vez).
- **Monto**: lo cobrado, en pesos de cada momento (sin ajustar por inflación).
- **No entran** las ventas sin datos del comprador ni los nombres genéricos («Consumidor final», «CF», «Varios»…).
- **Notebook** es un producto de la familia Notebooks o cuyo nombre empieza con «Notebook», «Netbook», «Laptop», «Ultrabook», «Chromebook» o «MacBook Air/Pro», o que nombra un procesador y una capacidad (ej. «HP Core i5… 256GB SSD»). Los accesorios para notebook (cargadores, memorias, discos, fundas) **no** son notebooks.
- **Se actualiza cada 30 minutos** (y al terminar de importar un historial de ventas): una venta recién entrada puede tardar hasta media hora en sumar.
- Un mismo comprador que usó varias cuentas de Mercado Libre, o que no está como cliente, puede aparecer en más de un renglón.

## Relacionado

- [Historial de ventas](/ventas/historial)
- [Clientes](/ventas/clientes)
- [Rentabilidad por venta](/informes/rentabilidad)
