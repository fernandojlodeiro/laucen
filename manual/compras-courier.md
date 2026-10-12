---
titulo: Compras por courier
menu: Compras › Compras por courier
ruta: /compras/courier
rutas: /compras/courier, /compras/courier/[id], /compras/courier/control, /compras/courier/informe
permiso: compras_ver
resumen: Las importaciones por courier con su flete por kilo y su porcentaje único; de acá sale el costo de cada producto.
---

## Para qué sirve

En una importación por courier la factura del proveedor entra entera en una sola posición arancelaria: no hay derechos por producto. El costo de cada producto sale de dos datos de la compra: **lo que se paga de flete por kilo** y **un único porcentaje** para toda la compra (los impuestos del courier). Esta pantalla guarda cada compra con esos datos y sus productos, y calcula el costo de cada uno.

La compra **no mueve stock**: la mercadería entra al stock por su recepción (o ya estaba cargada). Sólo calcula y graba costos.

## Cómo se llega

Menú **Compras › Compras por courier**. Tocando el nombre de una compra se abre su ficha.

## Qué hay en la pantalla

- **La lista**: cada compra con la fecha en que se cargó al stock, cuántos productos y unidades trae, el FOB total, los kilos, el flete por kilo, el porcentaje courier y si sus costos ya se grabaron en los productos.
- **La ficha**: arriba, el flete por kilo, el porcentaje courier, la fecha y hora de ingreso al stock, el proveedor y notas (se cambian con el lápiz de arriba a la derecha y **Grabar**). Debajo, los totales (unidades, FOB, kilos, flete, costo total y el dólar de hoy) y una tabla con cada producto: lo comprado, lo que se cargó al stock (en rojo si no coincide), FOB por unidad, peso por unidad, kilos, flete, costo por unidad en dólares y en pesos.

## Cómo se hace

### Grabar los costos en los productos

1. Abrí la compra.
2. Revisá el flete por kilo y el porcentaje courier.
3. Apretá **Grabar costos en los productos** (arriba a la derecha) y confirmá con **Sí**.

## Criterios y reglas

- **Costo por unidad en dólares** = (FOB + peso en kilos × flete por kilo) × (1 + porcentaje courier).
- **Costo en pesos de la tabla** = el costo en dólares al dólar oficial de hoy: es el **costo de reposición**, lo que costaría volver a traerlo.
- **Al grabar**, cada producto queda con: el FOB en dólares, el **último costo** en dólares y en pesos (en pesos, al dólar del día de ingreso), el promedio si todavía no tenía uno, y el peso de la ficha del producto.
- **Ingreso al stock**: es el momento desde el que se cuentan las ventas de esa mercadería en los análisis.
- La compra no suma ni resta stock.

## Control de stock de las compras

Botón **Control de stock**, arriba a la derecha de la lista de compras. Muestra, por cada producto de cada compra (o de la compra elegida en el desplegable **Compra**):

- **Comprado** y **cargado** (lo que efectivamente entró al stock).
- **Vendido**: todo lo vendido desde la fecha y hora de ingreso de la compra, en todos los canales y sin canceladas, separado en Mercado Libre, otros canales (web, local, incluido el historial de Virtual Seller) y **en kits** (cada kit vendido cuenta sus componentes). Tocando lo vendido en ML se abren esas ventas en el historial.
- **Saldo** = cargado − vendido: lo que tendría que quedar.
- **Disponible hoy**: el stock de todos los depósitos menos lo reservado (lo vendido que todavía no salió).
- **Diferencia** = disponible hoy − saldo. En rojo falta mercadería; en verde sobra.
- **Precio Clásica** y **Diferencia $** = diferencia × precio de la Clásica.
- Ordenado de la diferencia más grande en plata (falte o sobre) a la más chica.
- Arriba, el total de unidades y pesos que faltan y que sobran; abajo, la fila de totales.

Si el producto ya tenía stock antes de la compra, sus ventas también cuentan: no se puede saber de qué compra salió cada unidad. Una diferencia positiva suele ser eso, o devoluciones y ajustes.

## Informe de importaciones

Botón **Informe de importaciones**, arriba a la derecha de la lista de compras. Arriba se tildan las **compras** a analizar (de entrada, todas): se pueden mirar una sola o varias juntas.

- **Resumen** por compra (y el total si hay más de una): cargado, vendido y %, ventas, comisión y cargo fijo de Mercado Libre, costo de lo vendido, **ganancia** y margen, disponible hoy, diferencia de stock y su valor a precio de la Clásica, lo que queda en stock al costo y a precio de la Clásica, la **compra real en dólares** (lo que se compró por su costo en dólares de esa compra: FOB más flete por kilo, más el % del courier) y el **stock que queda en dólares** a ese mismo costo, con el % que representa de la compra.
- **Para la próxima importación**: qué conviene hacer con cada producto, agrupado:
  - **Comprar más cantidad**: vendió casi todo (90 % o más) en 60 días o menos y deja 25 % o más de margen; sugiere la cantidad para 120 días de venta.
  - **Reponer**: vendió el 60 % o más con margen razonable; sugiere la cantidad para 120 días.
  - **Comprar menos o no repetir**: después de 60 días vendió menos del 35 %; dice para cuántos días alcanza lo que queda.
  - **Revisar precio o costo**: deja menos del 10 % sobre la venta.
  - **Revisar el stock**: falta mercadería contra lo vendido.
- Cuatro listas de 10: **los que más ganancia dejaron**, **los que menos margen dejaron**, **los que más rápido se venden** (unidades por día) y **los que más tardan en venderse** (días que faltan para agotar lo que queda, al ritmo de venta).
- **Detalle por producto**, de la ganancia más alta a la más baja: cargado, vendido y %, días (desde que entró hasta que se agotó, marcado ✓, o hasta hoy), venta por día, ventas, ganancia, margen, disponible, días para agotar y diferencia de stock.

Criterios: las ventas son de todos los canales desde la fecha y hora de ingreso de la compra, sin canceladas, y un kit vendido cuenta sus componentes. Ganancia = ventas − comisión y cargo fijo de Mercado Libre − costo de lo vendido al dólar de hoy (costo de reposición); no incluye el envío gratis que paga el vendedor ni la publicidad. Si el producto ya tenía stock antes de la compra, sus ventas también cuentan.

## Relacionado

- [Despachos de importación](/compras/despachos)
- [Productos](/catalogo/productos)
