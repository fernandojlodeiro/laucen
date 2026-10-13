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

- Arriba a la derecha, a la altura del título, los filtros y **Descargar Excel** (lo mismo que se ve, todas las filas):
  - buscador (SKU o producto);
  - **Historia**: el período que se estudia (de entrada, los últimos 6 años);
  - **Comprar para**: 30, 45, 60 (de entrada), 90, 120 o 180 días;
  - **Días con venta**: sólo los que vendieron más de 5, 10, 20, 30, 50, 100 o 200 días en el período;
  - **Última venta**: sólo los que se vendieron por última vez en el último mes, 3 o 6 meses, el último año, 2 o 3 años (para no ver los que dejaron de venderse);
  - **Proveedor**: sólo los productos de ese proveedor preferido (el de la ficha del producto), o «Sin proveedor preferido».
  - **Categorías**: abre el árbol de categorías (hasta el tercer nivel), sólo las que tienen productos en la lista, con cuántos tiene cada una; todas vienen tildadas. Destildar una esconde sus productos y los de sus subcategorías. «Tildar todas» y «Destildar todas» arriba; «Sin categoría» para los productos que no tienen.
  - la caja **«Incluye los que tienen stock suficiente»**: de entrada no se muestran los productos que no hace falta comprar (lo que hay alcanza para los días elegidos); tildada, aparecen también.
  Estos filtros **sólo esconden renglones**: los cálculos se hacen siempre con todo el período de la historia.
- Cuatro recuadros: cuántos productos (y cuántos tienen costo), las **unidades a comprar**, la **inversión** en dólares y la **ganancia estimada**, cada una según el ritmo típico y según el mejor momento.
- La tabla tiene letra un poco más chica y columnas angostas para que entren todas sin desplazarse de costado. Los títulos son cortos (al pasar el mouse por cada uno se ve qué es) y **quedan fijos arriba** al bajar por la lista.
- **El cálculo se guarda 30 minutos** para cada período y cantidad de días: filtrar, ordenar y cambiar de página no lo rehacen, así anda rápido. Abajo dice cuándo se calculó; mientras calcula la primera vez, aparece un aviso.
- La tabla, de entrada de lo que más se vende a lo que menos; **se ordena tocando el título de cada columna** (por ejemplo, por inversión o por ganancia). Un renglón por producto:
  - **Producto** con su foto (enlace a la ficha), en un renglón. «Inactivo» si está archivado y «No está en el catálogo» si es un código viejo que ya no existe. Debajo, en una línea: cuántos tramos con venta regular encontró y, en ámbar, las **compras grandes no consideradas**.
  - **N días · típico** y **· mejor**: lo que se vendería.
  - **Según compras**: lo que se vendería en los días elegidos al ritmo con que se vendieron las últimas compras registradas del producto (hasta 3 que ya se terminaron de vender; de [Invoices de compra](/compras/invoices) y [Compras por courier](/compras/courier)). Debajo, cuántas compras tiene y cuántos días tarda en venderse una compra (la del medio). Al pasar el mouse, cuándo llegó la última y cuántas unidades trajo. Sirve para comparar con el típico: si da mucho más, en la historia hubo cortes de stock que el típico no ve.
  - **Días con venta** en el período (se puede ordenar por esta columna).
  - **Stock hoy** (disponible) y **A comprar** = lo que se vendería menos el stock (al pasar el mouse, el del mejor momento).
  - **Costo US$** y la **inversión** (lo que hay que comprar por el costo).
  - **Última venta**: la fecha, el precio en pesos y el dólar oficial de ese día (al pasar el mouse, lo que daba en dólares).
  - **Precio hoy**: ese precio en dólares, al dólar oficial de hoy. Al lado, la **Clásica de hoy** para comparar.
  - **Mercado Libre**: comisión de su categoría más el cargo fijo (precios bajos) o el envío gratis (precios altos).
  - **Ganancia** por unidad, **% s/ venta** (ganancia sobre el precio), **% s/ costo** (ganancia sobre el costo) y la **ganancia total** de lo que hay que comprar, según el típico y el mejor momento.

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
