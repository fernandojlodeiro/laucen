---
titulo: Cuotas y descuentos
menu: Configuración › Tienda web › Cuotas y descuentos
ruta: /config/tienda/financiacion
rutas: /config/tienda/financiacion
permiso: tienda_config
resumen: El precio de la web contra Mercado Libre y el esquema de cuotas de la tienda web por escala de precio (desde qué precio se ofrece cada plan, su costo y el interés que paga el comprador) y el descuento por pagar contado con transferencia, efectivo o débito.
---

## Para qué sirve

Define, en un solo lugar, **en cuántas cuotas se puede pagar en la tienda web según el precio del producto**, si cada plan es sin interés o con interés, y el **descuento por pagar contado** (transferencia, efectivo o tarjeta de débito). Todo lo que se carga acá se ve enseguida en la tienda: debajo del precio de cada producto, en su ficha y en el pago.

## Cómo se llega

Menú **Configuración › Tienda web › Cuotas y descuentos**. Si hay más de una tienda web, arriba elegís cuál.

## Qué hay en la pantalla

- **El interruptor de arriba**: prendido, la tienda usa este esquema; apagado, usa los planes por familia o producto de [Cuotas](/config/cuotas) y el descuento que tenga cargado cada medio de pago en [Medios de pago](/config/medios-pago).
- **Precio de la web contra Mercado Libre**: con su propio interruptor. Prendido, el precio de cada producto en la tienda se calcula contra la Clásica de Mercado Libre (ver más abajo). Campos: **Te tiene que quedar** (qué % de lo que te queda vendiendo en la Clásica de ML; 97 = hasta 3 % menos), **Costo de cobro de referencia** (lo que cuesta, con IVA, el plan sin interés más largo, que es lo más caro que se cobra al mismo precio), **Tachado de** (el canal de Mercado Libre cuyo tachado se copia), **Comisión si no se sabe** (para productos sin publicación en ML), **Promo web** (qué % del cargo fijo por unidad que cobra ML en los productos baratos se le descuenta al precio) y **Promo web desde (unidades en stock)** (sólo la tienen los productos con al menos ese stock en la tienda).
- **Planes de cuotas**: una fila por plan con **Cuotas**, **Se cobra con** (Payway o Mercado Pago), **En la tarjeta desde $** (desde qué precio del producto se muestra ese plan debajo del precio; al pagar se ofrece siempre), **Costo del plan** (lo que te cobra el banco o la tarjeta por ese plan, sólo para comparar), **Interés al cliente** ("Sin interés" o el %), **Cód. Payway** (el número que se le manda a Payway para ese plan; vacío = la cantidad de cuotas) y **Cómo queda** (si el interés cubre el costo del plan, si lo ponés vos o si lo cubre el precio).
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

Ejemplo: 3 cuotas (en la tarjeta desde $ 0) y 6 cuotas (en la tarjeta desde $ 30.000), las dos sin interés, por Payway; hasta 12 cuotas por Mercado Pago (cucarda desde $ 600.000; el comprador paga el interés de Mercado Pago); 10 % de descuento con transferencia, efectivo y débito. Con el precio contra Mercado Libre al 97 % y costo de referencia 9,8 % (las 6 cuotas sin interés), una notebook de Clásica $ 1.181.240 queda: tachado $ 2.147.709, precio $ 1.136.235 (47 % OFF), 6 cuotas sin interés de $ 189.372 y $ 1.022.611 con transferencia (52 % OFF).

## Criterios y reglas

- **Qué planes se pueden elegir**: todos, cueste lo que cueste la compra. El **"En la tarjeta desde"** decide sólo qué se muestra.
- **Qué se muestra en la tarjeta del producto** (listados y portada; la ficha igual):
  - arriba, el **precio tachado** chico con el **"% OFF"** verde a su derecha; abajo, el **precio** grande en negro;
  - el **plan de Payway sin interés más largo** cuyo "En la tarjeta desde" llega al precio: "**6 cuotas sin interés de $ …**" (sólo "sin interés" en verde); si no hay ninguno sin interés, el más largo;
  - si hay descuento contado, el **precio contado** en un recuadro verde suave: "**$ …** / con transferencia o débito" (en la tarjeta no se nombra el efectivo, para que entre; en la ficha sí);
  - abajo, "**Llega gratis**" y, si llega al "desde" de un plan de Mercado Pago, la cucarda chica "**Hasta 12 cuotas**";
  - con bonificación web, la cucarda verde "**Bonificación web $ …**" arriba del título.
- **En la ficha**, en "Medios de pago", el recuadro **"Precio según cómo pagues"**: una fila por forma de pago con su precio y su **% OFF contra el tachado**, para que se vea de frente que contado sale menos y en cuotas con interés sale más: el contado (transferencia, efectivo o débito), "Tarjeta en 1 pago o Mercado Pago" (el precio grande), cada plan de Payway (sin interés: el mismo precio y el valor de la cuota; con interés: el total y la cuota) y "Hasta N cuotas con Mercado Pago" (sin %: el interés lo pone Mercado Pago; con la cuota de referencia).
- **Valor de la cuota = precio × (1 + interés %) ÷ cuotas.**
- **En el pago (checkout)**:
  - Con **tarjeta de crédito** (Payway), debajo aparece **"Cuotas"** para elegir: un pago o cada plan que le toca a la compra (según lo que suman los productos), con el valor de la cuota y, si tiene interés, el total. **El interés se suma al total del pedido** (renglón "Interés por pagar en N cuotas" en el resumen) y es lo que se cobra; en el pedido y en la factura queda incluido en el precio de los productos. Después, al pagar con la tarjeta, las cuotas son las elegidas.
  - Con **descuento de débito**, aparecen dos opciones: **"Tarjeta de crédito"** (con las cuotas) y **"Tarjeta de débito"** (un pago, con el descuento). Pagando con débito, sólo se aceptan tarjetas de débito y en un pago.
  - **Transferencia** y **efectivo**: el descuento del esquema si están tildados; si no, sin descuento.
  - **Mercado Pago**: se limita la cantidad máxima de cuotas a la del plan de Mercado Pago más largo; el interés de cada cuota lo pone Mercado Pago según la cuenta.
- **Cód. Payway**: Payway reconoce el programa de cuotas (y su costo) por ese número, no por la cantidad de cuotas. Con el código vacío se manda la cantidad de cuotas.
- **Planes por Mercado Pago**: el comprador paga en Mercado Pago, hasta esas cuotas, y **el interés lo cobra Mercado Pago** (Laucen no suma nada; vos pagás la comisión de un cobro de Mercado Pago). Debajo del precio dice "**Hasta 12 cuotas de $ … con Mercado Pago**" con una cuota **de referencia**: la tasa que Mercado Pago informa para Visa y Mastercard (la más baja), consultada con la cuenta de Mercado Pago de la tienda y renovada cada 6 horas; abajo, en chico, "Cuota de referencia, según tu tarjeta. También sin tarjeta." Si Mercado Pago no contesta, dice "Hasta 12 cuotas con Mercado Pago", sin valor. En la tarjeta, sólo la cucarda "Hasta 12 cuotas" (desde su "En la tarjeta desde"); la cuota de referencia, en la ficha. En el pago, la opción Mercado Pago permite hasta esa cantidad de cuotas; las cuotas por Payway que se eligen en "Tarjeta de crédito" son sólo las de Payway. En esa fila, "Interés al cliente" y "Cód. Payway" no se usan.
- **Cuotas sin tarjeta**: con Mercado Pago el comprador también puede pagar en cuotas sin tarjeta (se aclara debajo del precio, en la ficha, en el pago y en Ayuda).
- **Costo del plan**: sólo informativo, para comparar con el interés que cobrás. No cambia ningún precio.
- **Precio contra Mercado Libre** (prendido): la base es la Clásica de ML (lista 1) y:
  - **Precio grande = Clásica × (1 − d)**, con d calculado por producto para que, cobrando con el costo de referencia, te quede el % elegido de lo que queda en la Clásica: **d = 1 − objetivo × (1 − comisión ÷ 1,21) ÷ (1 − costo de referencia)**. La comisión es la real de la categoría de ML del producto (con IVA; se compara sin IVA porque se recupera); el envío no se cuenta. Ej., con costo de referencia 9,8 % (6 cuotas sin interés): notebooks e impresoras (12,77 %) → 3,8 % menos que la Clásica; la mayoría (16,34 %) → 7 % menos.
  - **Promo web**: en los productos de menos de $ 33.000 (donde ML cobra un cargo fijo por unidad que sube por escalones: $ 1.330 hasta $ 15.000, $ 2.740 hasta $ 25.000 y $ 3.320 hasta $ 32.999), al precio se le resta ese % del cargo fijo, y la tarjeta y la ficha lo muestran con la cucarda azul "Promo web $ …". Sólo si el producto tiene en la tienda al menos el stock de "Promo web desde"; con menos, ni descuento ni cucarda (y si el stock baja de ahí, el precio vuelve a subir).
  - **Tachado = Clásica × (1 + % de tachado de ML)** del canal elegido: la regla del producto, si no la de su familia más cercana, si no la general.
  - Reemplaza los descuentos por familia de la lista de la tienda. Nunca toca Mercado Libre.
  - Apagado, la tienda usa los precios de su lista como siempre.
- **El esquema de cuotas no toca los precios**: el precio de cada producto es el de su lista (o el de "contra Mercado Libre", si está prendido).
- Prendido, **reemplaza** en la tienda los planes por familia o producto de [Cuotas](/config/cuotas) y el descuento cargado en [Medios de pago](/config/medios-pago) para transferencia y efectivo (los demás medios conservan el suyo).

## Preguntas frecuentes

**¿Por qué un producto no muestra cuotas?** Porque su precio es menor que el "En la tarjeta desde" de todos los planes. Cargá un plan desde $ 0 para que todos muestren uno (al pagar se ofrecen igual).

**¿Puedo ofrecer 12 cuotas sin interés?** Sí: interés 0. El costo del plan lo pagás vos (por eso conviene que esté cubierto en el precio).

## Relacionado

[Cuotas](/config/cuotas) · [Medios de pago](/config/medios-pago) · [Tienda web](/config/tienda)
