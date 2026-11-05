---
titulo: Preventas
menu: Ventas › Preventas
ruta: /ventas/preventas
rutas: /ventas/preventas
permiso: pedidos_ver
resumen: Vender lo que viene en camino en una orden de compra al exterior (web y Mercado Libre), con la fecha de llegada, precio de preventa y seña; y resolver a mano los casos que quedan (sin cubrir, saldos vencidos, en espera).
---

## Para qué sirve

Para vender, con fecha de entrega, lo que todavía no llegó pero viene en una [orden de compra al exterior](/compras/ordenes). Mientras un producto no tiene stock, se ofrece en preventa en la tienda web (con seña) y en Mercado Libre (con entrega diferida). Cuando llega la mercadería, lo vendido se reserva primero para quienes lo compraron, en el orden en que compraron. Acá se ve todo eso y se resuelve lo que el sistema no decide solo.

## Cómo se llega

Menú **Ventas › Preventas**. Desde una orden, el enlace «ver en Preventas» abre sólo esa orden.

## Qué hay en la pantalla

- **Por producto**: cada producto de cada orden en camino, con su disponible físico de hoy, la orden, las fechas de arribo (web y Mercado Libre), lo que llega, lo prevendido, el saldo y dónde se está ofreciendo.
- **Esperando su orden**: los pedidos de preventa que todavía no llegaron.
- **Sin cubrir**: los pedidos que no alcanzaron a cubrirse porque la orden llegó con menos de lo vendido.
- **Saldos vencidos**: pedidos con seña que ya llegaron y no pagaron el saldo en el plazo.
- **En espera sin orden**: pedidos que esperan que una orden nueva traiga sus productos.
- **Configuración**: los valores generales (con el lápiz arriba a la derecha).

En las listas de pedidos, cada fila tiene **Resolver**: **Pasar** a otra orden en camino (elegida en el desplegable), **Dejar en espera**, **Más plazo** (en saldos vencidos) y **Cancelar**.

## Cómo se hace

### Configurar la preventa

1. Pestaña **Configuración**, lápiz de arriba a la derecha.
2. Tildá si los productos admiten preventa en la web y en Mercado Libre (cada producto puede decir otra cosa en su ficha, pestaña Preventa).
3. Cargá el margen de seguridad, el descuento de preventa, el % de seña, el plazo para el saldo y el tope de días de Mercado Libre.
4. **Grabar**.

### Resolver un pedido que no se cubrió

1. Pestaña **Sin cubrir**.
2. En la fila del pedido, elegí qué hacer: **Pasar** a otra orden, **Dejar en espera** (lo cubre primero la próxima orden que traiga sus productos) o **Cancelar** (la seña se devuelve desde el pedido).
3. Si es de Mercado Libre, hablalo antes con el comprador por la mensajería de la venta.

## Criterios y reglas

- **Cuándo hay preventa**: un producto se ofrece en preventa en un canal cuando no tiene stock disponible (lo que hay menos lo reservado, en los depósitos de ese canal; Full no cuenta), lo admite (su ficha o lo general), no es «No publicable» (ni «Jamás publicar en Mercado Libre», para ML) y hay una orden en camino con **Publicar** prendido en ese canal. Si vuelve a haber stock (una devolución, un ajuste), se corta sola la preventa y se vende normal; lo ya vendido sigue esperando su orden. Cuando el stock vuelve a 0, sigue la misma orden.
- **Una orden por vez**: de cada producto se ofrece una sola orden, la primera que se publicó en ese canal. Recién cuando se agota pasa a la siguiente, con su fecha.
- **Cupo** = lo que falta que traiga la orden − el margen de seguridad − lo ya vendido en preventa de esa orden.
- **Margen de seguridad**: unidades y %, y si toma el menor o el mayor; el % se redondea para arriba. Con 5 u. / 10 % / el menor: si llegan 10 se guarda 1, si llegan 15 se guardan 2, si llegan 100, 5. Gana el más particular: el del producto, si no el de la orden, si no el general.
- **Precio de preventa** = el precio normal de cada canal − el descuento de preventa (el del producto, si no el de la orden, si no el general). En Mercado Libre se aplica sobre la Clásica de la publicación mientras está en preventa, y de ahí salen los demás planes.
- **Kits**: entran en preventa si todos sus componentes vienen en la misma orden; el cupo lo marca el componente más escaso.
- **Nunca se mezcla**: un pedido es todo de stock o todo de una sola orden. En la web, un carrito con productos en stock y en preventa se parte en dos pedidos que se pagan juntos; lo de stock sale ya y lo de preventa cuando llega. Productos de dos órdenes distintas van en compras separadas. Al cargar un pedido a mano, se avisa y se tilda «Pedido de preventa».
- **Seña (sólo web)**: el cliente elige pagar todo o una seña (el % de la configuración) si toda la compra es de preventa; mezclada con productos en stock, se paga todo. El precio queda fijo. Con la seña pagada la reserva ya no vence sola. El envío se cobra con el saldo.
- **Llegada**: al recibir cada caja o producto de la orden, lo que entra se reserva primero para los pedidos de preventa, del más viejo al más nuevo. Un pedido con todo reservado pasa a ser un pedido común (se prepara como siempre) y, si debe el saldo, le llega un mail con el enlace para pagarlo y corre el plazo. Hasta que llega, un pedido de preventa no se prepara ni se despacha.
- **Nada se cancela ni se pierde solo**: si la orden llega con menos, los últimos en comprar quedan *sin cubrir*; si no paga el saldo a tiempo, queda en *saldos vencidos*. Cada caso lo resuelve una persona.
- **Mercado Libre**: la publicación sin stock pasa a «disponible N días después de la compra» (la entrega diferida de Mercado Libre) con su parte del cupo, repartido en partes iguales entre las cuentas; los días se actualizan cada día hasta la fecha de arribo para Mercado Libre. La orden se ofrece en Mercado Libre recién cuando esa fecha entra en el tope de días. Cuando llega la mercadería, se le saca la demora. Lo hace solo en las cuentas con **Preventa automática** prendida (Configuración › Canales); en las demás, se prepara el lote desde la orden y se manda con el botón de la cola. Sólo publicaciones sin variaciones; las de Full no entran. Una venta de Mercado Libre de una publicación en preventa entra como pedido de preventa de esa orden.

## Relacionado

[Órdenes de compra al exterior](/compras/ordenes) · [Pedidos](/ventas/pedidos) · [Recepción](/deposito/recepcion) · [Canales](/config/canales)
