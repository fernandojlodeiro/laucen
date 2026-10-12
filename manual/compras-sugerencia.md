---
titulo: Sugerencia de compra
menu: Compras › Sugerencia de compra
ruta: /compras/sugerencia
rutas: /compras/sugerencia
permiso: compras_ver
resumen: Qué comprar para una cantidad de días según el ritmo real de venta de algún momento de la historia (el típico y el mejor), cuánto se invierte y qué ganancia podría dejar.
---

## Para qué sirve

Para armar la próxima compra mirando la historia: para cada producto, cuántas unidades se venderían en los días que se quiere cubrir si se vende al ritmo de algún momento real en que hubo stock, cuánto cuesta comprarlas y cuánto podrían dejar. Es una referencia para chequear: no compra ni cambia nada.

## Cómo se llega

Menú **Compras › Sugerencia de compra**.

## Qué hay en la pantalla

- Arriba a la derecha, **Descargar Excel** con lo mismo que se ve (todas las filas).
- Filtros: buscador (SKU o producto), **Período de la historia** (de entrada, los últimos 6 años) y **Comprar para** (30, 45, 60 —de entrada—, 90, 120 o 180 días).
- Cuatro recuadros: cuántos productos (y cuántos tienen costo), las **unidades a comprar**, la **inversión** en dólares y la **ganancia estimada**, cada una según el ritmo típico y según el mejor momento.
- La tabla, de entrada de lo que más se vende a lo que menos; **se ordena tocando el título de cada columna** (por ejemplo, por inversión o por ganancia). Un renglón por producto:
  - **Producto** con su foto (enlace a la ficha), en un renglón. «Inactivo» si está archivado y «No está en el catálogo» si es un código viejo que ya no existe. Debajo, en una línea: cuántos días vendió en el período, cuántos tramos con venta regular encontró y, en ámbar, las **compras grandes no consideradas**.
  - **N días · típico** y **· mejor**: lo que se vendería.
  - **Stock hoy** (disponible) y **A comprar · típico** = lo que se vendería menos el stock (al pasar el mouse, el del mejor momento).
  - **Costo US$** y la **inversión** (lo que hay que comprar por el costo).
  - **Última venta**: la fecha, el precio en pesos y el dólar oficial de ese día (al pasar el mouse, lo que daba en dólares).
  - **Precio hoy**: ese precio en dólares, al dólar oficial de hoy. Al lado, la **Clásica de hoy** para comparar.
  - **Mercado Libre**: comisión de su categoría más el cargo fijo (precios bajos) o el envío gratis (precios altos).
  - **Ganancia** por unidad, **margen** y la **ganancia total** de lo que hay que comprar, según el típico y el mejor momento.

## Criterios y reglas

- **Qué productos entran**: todos los que se vendieron en el período, activos o no, incluidos los códigos viejos que ya no están en el catálogo. **Las notebooks no entran.** Ventas de todos los canales, sin canceladas.
- **Cuándo hubo stock**: no hay historia del stock, así que se deduce de las ventas. Se recorre el período con tramos de la cantidad de días elegida, cada uno arrancando en un día con venta. Un tramo vale si adentro no hay un hueco sin ventas más largo de lo normal para **ese** producto (3 veces su hueco típico entre ventas, nunca menos de 7 días) y si siguió vendiendo hasta cerca del final. Así no cuentan los quiebres de stock.
- **Típico** = lo que se vendió en un tramo común de los que valen (la mediana). **Mejor momento** = el tramo en que más se vendió.
- **Compras grandes**: un renglón de venta con más de 3 veces la cantidad típica de ese producto (y 6 unidades o más) no cuenta para el ritmo, porque no se repite; se avisa en la nota del producto.
- **Costo**: el último costo en dólares de la ficha, al dólar oficial de hoy. Sin costo, no hay inversión ni ganancia.
- **Precio**: el de la última venta del producto en el período (de cualquier canal), pasado a dólares con el oficial de ese día y a pesos con el de hoy. Por eso puede diferir de la Clásica actual: refleja a cuánto se vendió de verdad, actualizado por el dólar.
- **A comprar**: lo que se vendería en los días elegidos menos el stock disponible de hoy (nunca menos de cero). La inversión, las unidades y la ganancia de los recuadros son sobre eso.
- **Ganancia por unidad** = precio de hoy − comisión de Mercado Libre de su categoría (si no se conoce, la más común) − cargo fijo o envío gratis − costo. No incluye publicidad ni impuestos.

## Relacionado

- [Compras por courier](/compras/courier)
- [Stock valorizado](/informes/stock-valorizado)
