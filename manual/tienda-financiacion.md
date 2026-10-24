---
titulo: Cuotas y descuentos
menu: Configuración › Tienda web › Cuotas y descuentos
ruta: /config/tienda/financiacion
rutas: /config/tienda/financiacion
permiso: tienda_config
resumen: El esquema de cuotas de la tienda web por escala de precio (desde qué precio se ofrece cada plan, su costo y el interés que paga el comprador) y el descuento por pagar contado con transferencia, efectivo o débito.
---

## Para qué sirve

Define, en un solo lugar, **en cuántas cuotas se puede pagar en la tienda web según el precio del producto**, si cada plan es sin interés o con interés, y el **descuento por pagar contado** (transferencia, efectivo o tarjeta de débito). Todo lo que se carga acá se ve enseguida en la tienda: debajo del precio de cada producto, en su ficha y en el pago.

## Cómo se llega

Menú **Configuración › Tienda web › Cuotas y descuentos**. Si hay más de una tienda web, arriba elegís cuál.

## Qué hay en la pantalla

- **El interruptor de arriba**: prendido, la tienda usa este esquema; apagado, usa los planes por familia o producto de [Cuotas](/config/cuotas) y el descuento que tenga cargado cada medio de pago en [Medios de pago](/config/medios-pago).
- **Planes de cuotas**: una fila por plan con **Cuotas**, **Desde $** (desde qué precio del producto se ofrece; "Todos" si es desde cero), **Costo del plan** (lo que te cobra el banco o la tarjeta por ese plan, sólo para comparar), **Interés al cliente** ("Sin interés" o el %), **Cód. Payway** (el número que se le manda a Payway para ese plan; vacío = la cantidad de cuotas) y **Cómo queda** (si el interés cubre el costo del plan, si lo ponés vos o si lo cubre el precio).
- **Descuento por pagar contado**: el **%** y **con qué medios** (Transferencia, Efectivo, Tarjeta de débito).
- **Cómo se ve en la tienda**: cuatro productos con stock (el más barato, dos del medio y el más caro) con lo que va a decir debajo de su precio.

La pantalla abre en vista; se cambia con el **lápiz** de arriba a la derecha, y **"Grabar"** o **"Cancelar"** quedan en ese mismo lugar.

## Cómo se hace

### Cargar o cambiar el esquema
1. Apretá el **lápiz** de arriba a la derecha.
2. En **Planes de cuotas**, por cada plan: (si el plan es de un programa de Payway, como Cuotas MiPyME, poné en **Cód. Payway** la «Opción en terminal» que da Payway: 13 para 3 cuotas y 16 para 6 cuotas) las **cuotas** (de 2 a 24), **desde qué precio** se ofrece, el **costo del plan** y el **interés al cliente** (0 = sin interés). Para sacar un plan, borrá sus cuotas. Aparecen filas vacías para agregar planes nuevos.
3. En **Descuento por pagar contado**, el **%** y tildá los medios que lo tienen.
4. **"Grabar"**. Mirá abajo **Cómo se ve en la tienda** para revisar.
5. Si está apagado, prendé el **interruptor** de arriba.

Ejemplo: 3 cuotas desde $ 0 sin interés, 6 cuotas desde $ 150.000 sin interés y 12 cuotas desde $ 600.000 con 25 % de interés; 10 % de descuento con transferencia, efectivo y débito.

## Criterios y reglas

- **Qué planes le tocan a un producto**: todos los que tienen el **"desde"** menor o igual a su precio. Un producto de $ 700.000, en el ejemplo, se puede pagar en 3, 6 o 12 cuotas.
- **Qué se muestra debajo del precio** (listados, portada y ficha): el **plan más largo que le toca**: "Mismo precio en 6 cuotas de $ …" (verde) si es sin interés, o "en 12 cuotas de $ …" si tiene interés. Y si hay descuento contado, otra línea verde: "**$ … con transferencia**" (o "con transferencia, efectivo o débito", según los medios tildados que estén activos en la tienda).
- **En la ficha**, en "Medios de pago", todos los planes que le tocan con el valor de la cuota y, en los que tienen interés, el total.
- **Valor de la cuota = precio × (1 + interés %) ÷ cuotas.**
- **En el pago (checkout)**:
  - Con **tarjeta de crédito** (Payway), debajo aparece **"Cuotas"** para elegir: un pago o cada plan que le toca a la compra (según lo que suman los productos), con el valor de la cuota y, si tiene interés, el total. **El interés se suma al total del pedido** (renglón "Interés por pagar en N cuotas" en el resumen) y es lo que se cobra; en el pedido y en la factura queda incluido en el precio de los productos. Después, al pagar con la tarjeta, las cuotas son las elegidas.
  - Con **descuento de débito**, aparecen dos opciones: **"Tarjeta de crédito"** (con las cuotas) y **"Tarjeta de débito"** (un pago, con el descuento). Pagando con débito, sólo se aceptan tarjetas de débito y en un pago.
  - **Transferencia** y **efectivo**: el descuento del esquema si están tildados; si no, sin descuento.
  - **Mercado Pago**: se limita la cantidad máxima de cuotas a la del plan más largo que le toca a la compra; el interés de cada cuota lo pone Mercado Pago según la cuenta.
- **Cód. Payway**: Payway reconoce el programa de cuotas (y su costo) por ese número, no por la cantidad de cuotas. Con el código vacío se manda la cantidad de cuotas.
- **Costo del plan**: sólo informativo, para comparar con el interés que cobrás. No cambia ningún precio.
- **El esquema no toca los precios** ni Mercado Libre: el precio de cada producto sigue siendo el de su lista de precios.
- Prendido, **reemplaza** en la tienda los planes por familia o producto de [Cuotas](/config/cuotas) y el descuento cargado en [Medios de pago](/config/medios-pago) para transferencia y efectivo (los demás medios conservan el suyo).

## Preguntas frecuentes

**¿Por qué un producto no muestra cuotas?** Porque su precio es menor que el "desde" de todos los planes. Cargá un plan desde $ 0 para que todos tengan.

**¿Puedo ofrecer 12 cuotas sin interés?** Sí: interés 0. El costo del plan lo pagás vos (por eso conviene que esté cubierto en el precio).

## Relacionado

[Cuotas](/config/cuotas) · [Medios de pago](/config/medios-pago) · [Tienda web](/config/tienda)
