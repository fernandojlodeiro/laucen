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
- **Precio de la web contra Mercado Libre**: con su propio interruptor. Prendido, el precio de cada producto en la tienda se calcula contra la Clásica de Mercado Libre (ver más abajo). Campos: **Te tiene que quedar** (qué % de lo que te queda vendiendo en la Clásica de ML; 97 = hasta 3 % menos), **Costo de cobro de referencia** (lo que cuesta, con IVA, el plan sin interés más largo, que es lo más caro que se cobra al mismo precio), **Tachado de** (el canal de Mercado Libre cuyo tachado se copia) y **Comisión si no se sabe** (para productos sin publicación en ML).
- **Planes de cuotas**: una fila por plan con **Cuotas**, **Se cobra con** (Payway o Mercado Pago), **Desde $** (desde qué precio del producto se ofrece; "Todos" si es desde cero), **Costo del plan** (lo que te cobra el banco o la tarjeta por ese plan, sólo para comparar), **Interés al cliente** ("Sin interés" o el %), **Cód. Payway** (el número que se le manda a Payway para ese plan; vacío = la cantidad de cuotas) y **Cómo queda** (si el interés cubre el costo del plan, si lo ponés vos o si lo cubre el precio).
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

Ejemplo (el de Laucen, 24/10): 3 cuotas sin interés desde $ 20.000 y 6 cuotas con 4 % de interés desde $ 60.000, por Payway; hasta 12 cuotas desde $ 600.000 por Mercado Pago (el comprador paga el interés de Mercado Pago); 6 % de descuento con transferencia, efectivo y débito. Con el precio contra Mercado Libre al 97 % y costo de referencia 5,9 %, una notebook de Clásica $ 1.181.240 queda: tachado $ 2.147.709, precio $ 1.089.221 (49 % OFF), 3 cuotas de $ 363.074, 6 cuotas $ 1.132.790 en total (47 % OFF) y $ 1.023.868 con transferencia (52 % OFF).

## Criterios y reglas

- **Qué planes le tocan a un producto**: todos los que tienen el **"desde"** menor o igual a su precio. Un producto de $ 700.000, en el ejemplo, se puede pagar en 3, 6 o 12 cuotas.
- **Qué se muestra debajo del precio** (listados, portada y ficha): el **plan sin interés más largo que le toca**: "Mismo precio en 3 cuotas sin interés de $ …" (verde); si no tiene ninguno sin interés, el más largo ("en 12 cuotas de $ …"). Y si hay descuento contado, otra línea verde: "**$ … con transferencia**" (o "con transferencia, efectivo o débito", según los medios tildados que estén activos en la tienda).
- **En la ficha**, en "Medios de pago", el recuadro **"Precio según cómo pagues"**: una fila por forma de pago con su precio y su **% OFF contra el tachado**, para que se vea de frente que contado sale menos y en cuotas con interés sale más: el contado (transferencia, efectivo o débito), "Tarjeta en 1 pago o Mercado Pago" (el precio grande), cada plan de Payway (sin interés: el mismo precio y el valor de la cuota; con interés: el total y la cuota) y "Hasta N cuotas con Mercado Pago" (sin %: el interés lo pone Mercado Pago; con la cuota de referencia).
- **Valor de la cuota = precio × (1 + interés %) ÷ cuotas.**
- **En el pago (checkout)**:
  - Con **tarjeta de crédito** (Payway), debajo aparece **"Cuotas"** para elegir: un pago o cada plan que le toca a la compra (según lo que suman los productos), con el valor de la cuota y, si tiene interés, el total. **El interés se suma al total del pedido** (renglón "Interés por pagar en N cuotas" en el resumen) y es lo que se cobra; en el pedido y en la factura queda incluido en el precio de los productos. Después, al pagar con la tarjeta, las cuotas son las elegidas.
  - Con **descuento de débito**, aparecen dos opciones: **"Tarjeta de crédito"** (con las cuotas) y **"Tarjeta de débito"** (un pago, con el descuento). Pagando con débito, sólo se aceptan tarjetas de débito y en un pago.
  - **Transferencia** y **efectivo**: el descuento del esquema si están tildados; si no, sin descuento.
  - **Mercado Pago**: se limita la cantidad máxima de cuotas a la del plan más largo que le toca a la compra; el interés de cada cuota lo pone Mercado Pago según la cuenta.
- **Cód. Payway**: Payway reconoce el programa de cuotas (y su costo) por ese número, no por la cantidad de cuotas. Con el código vacío se manda la cantidad de cuotas.
- **Planes por Mercado Pago**: el comprador paga en Mercado Pago, hasta esas cuotas, y **el interés lo cobra Mercado Pago** (Laucen no suma nada; vos pagás la comisión de un cobro de Mercado Pago). Debajo del precio dice "**Hasta 12 cuotas de $ … con Mercado Pago**" con una cuota **de referencia**: la tasa que Mercado Pago informa para Visa y Mastercard (la más baja), consultada con la cuenta de Mercado Pago de la tienda y renovada cada 6 horas; abajo, en chico, "Cuota de referencia, según tu tarjeta. También sin tarjeta." Si Mercado Pago no contesta, dice "Hasta 12 cuotas con Mercado Pago", sin valor. En el pago, la opción Mercado Pago permite hasta la cantidad de cuotas del plan más largo que le toca a la compra; las cuotas por Payway que se eligen en "Tarjeta de crédito" son sólo las de Payway. En esa fila, "Interés al cliente" y "Cód. Payway" no se usan.
- **Cuotas sin tarjeta**: con Mercado Pago el comprador también puede pagar en cuotas sin tarjeta (se aclara debajo del precio, en la ficha, en el pago y en Ayuda).
- **Costo del plan**: sólo informativo, para comparar con el interés que cobrás. No cambia ningún precio.
- **Precio contra Mercado Libre** (prendido): la base es la Clásica de ML (lista 1) y:
  - **Precio grande = Clásica × (1 − d)**, con d calculado por producto para que, cobrando con el costo de referencia, te quede el % elegido de lo que queda en la Clásica: **d = 1 − objetivo × (1 − comisión ÷ 1,21) ÷ (1 − costo de referencia)**. La comisión es la real de la categoría de ML del producto (con IVA; se compara sin IVA porque se recupera); el envío no se cuenta. Ej.: notebooks e impresoras (12,77 %) → 7,8 % menos que la Clásica; la mayoría (16,34 %) → 10,4 % menos.
  - **Tachado = Clásica × (1 + % de tachado de ML)** del canal elegido: la regla del producto, si no la de su familia más cercana, si no la general.
  - Reemplaza los descuentos por familia de la lista de la tienda. Nunca toca Mercado Libre.
  - Apagado, la tienda usa los precios de su lista como siempre.
- **El esquema de cuotas no toca los precios**: el precio de cada producto es el de su lista (o el de "contra Mercado Libre", si está prendido).
- Prendido, **reemplaza** en la tienda los planes por familia o producto de [Cuotas](/config/cuotas) y el descuento cargado en [Medios de pago](/config/medios-pago) para transferencia y efectivo (los demás medios conservan el suyo).

## Preguntas frecuentes

**¿Por qué un producto no muestra cuotas?** Porque su precio es menor que el "desde" de todos los planes. Cargá un plan desde $ 0 para que todos tengan.

**¿Puedo ofrecer 12 cuotas sin interés?** Sí: interés 0. El costo del plan lo pagás vos (por eso conviene que esté cubierto en el precio).

## Relacionado

[Cuotas](/config/cuotas) · [Medios de pago](/config/medios-pago) · [Tienda web](/config/tienda)
