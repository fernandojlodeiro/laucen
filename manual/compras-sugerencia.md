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
- Cuatro recuadros: cuántos productos (y cuántos tienen costo), las **unidades**, la **inversión** en dólares y la **ganancia estimada**, cada una según el ritmo típico y según el mejor momento.
- La tabla, de lo que más se vende a lo que menos, un renglón por producto:
  - **Producto** con su foto (enlace a la ficha). «Inactivo» si está archivado y «No está en el catálogo» si es un código viejo que ya no existe. Debajo, cuántos días vendió en el período y cuántos tramos con venta regular encontró, y una nota en ámbar si tuvo **compras grandes no consideradas**.
  - **Para N días · típico** y **· mejor momento**: las unidades.
  - **Costo US$** y la **inversión típica**.
  - **Última venta**: la fecha, el precio en pesos, el dólar oficial de ese día y lo que daba en dólares.
  - **Precio hoy**: ese precio en dólares, al dólar oficial de hoy. Al lado, la **Clásica de hoy** para comparar.
  - **Mercado Libre**: comisión de su categoría más el cargo fijo (precios bajos) o el envío gratis (precios altos).
  - **Ganancia por unidad**, **margen** y la **ganancia** total según el típico y el mejor momento.

## Criterios y reglas

- **Qué productos entran**: todos los que se vendieron en el período, activos o no, incluidos los códigos viejos que ya no están en el catálogo. **Las notebooks no entran.** Ventas de todos los canales, sin canceladas.
- **Cuándo hubo stock**: no hay historia del stock, así que se deduce de las ventas. Se recorre el período con tramos de la cantidad de días elegida, cada uno arrancando en un día con venta. Un tramo vale si adentro no hay un hueco sin ventas más largo de lo normal para **ese** producto (3 veces su hueco típico entre ventas, nunca menos de 7 días) y si siguió vendiendo hasta cerca del final. Así no cuentan los quiebres de stock.
- **Típico** = lo que se vendió en un tramo común de los que valen (la mediana). **Mejor momento** = el tramo en que más se vendió.
- **Compras grandes**: un renglón de venta con más de 3 veces la cantidad típica de ese producto (y 6 unidades o más) no cuenta para el ritmo, porque no se repite; se avisa en la nota del producto.
- **Costo**: el último costo en dólares de la ficha, al dólar oficial de hoy. Sin costo, no hay inversión ni ganancia.
- **Precio**: el de la última venta del producto en el período (de cualquier canal), pasado a dólares con el oficial de ese día y a pesos con el de hoy.
- **Ganancia por unidad** = precio de hoy − comisión de Mercado Libre de su categoría (si no se conoce, la más común) − cargo fijo o envío gratis − costo. No incluye publicidad ni impuestos.

## Relacionado

- [Compras por courier](/compras/courier)
- [Stock valorizado](/informes/stock-valorizado)
