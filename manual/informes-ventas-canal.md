---
titulo: Ventas por canal
menu: Informes › Ventas por canal
ruta: /informes/ventas-canal
rutas: /informes/ventas-canal
permiso: informes_ventas_ver
resumen: Monto y cantidad de pedidos de un período, separados por canal de venta o por razón social, con gráfico de barras o de líneas y el detalle por día, semana o mes.
---

## Para qué sirve

Para ver cuánto se vendió y cuántos pedidos hubo en un período, en cada canal (cada cuenta de Mercado Libre, la tienda web, el local) o en cada razón social, y cómo fue cambiando día a día, semana a semana o mes a mes.

Toma **todas las ventas de todos los canales** (Mercado Libre, la tienda web, el local y el historial importado de Virtual Seller), sin las canceladas.

## Cómo se llega

Menú **Informes › Ventas por canal**.

## Qué hay en la pantalla

- Arriba, los filtros (cambian la pantalla al momento):
  - **Fechas**: un atajo (Hoy, Ayer, Últimos 7 días, Este mes, Último mes, Último trimestre, Último año) o las dos fechas a mano (Personalizado). De entrada, este mes.
  - **Separado por**: **Canal** (cada canal por separado) o **Razón social** (los canales juntos según la razón social con la que factura cada uno).
  - **Agrupado**: **Automático**, **Por día**, **Por semana** o **Por mes**.
  - **Gráfico de**: **Monto** o **Pedidos**.
  - **En**: **Barras** o **Líneas**.
- Tres recuadros: **Monto**, **Pedidos** y **Ticket promedio** del período, de todos los canales juntos.
- El **gráfico**: arriba, cada canal (o razón social) con su color y su total. En barras, cada barra es un período con un tramo por canal, uno arriba del otro (la altura total es lo de todos los canales). En líneas, una línea por canal. Al pasar el mouse por una barra o un punto se ve el período, el canal y el valor.
- Tabla **Por canal** (o **Por razón social**): **Pedidos**, **% ped.**, **Monto**, **% monto** y **Ticket prom.** de cada uno, y el total.
- Tabla por período: lo que se eligió en «Gráfico de» (monto o pedidos) de cada período, por canal, con el total de cada período.

## Criterios

- **Un pedido es un carrito, no cada producto.** Un pedido del sistema cuenta una vez aunque tenga varios productos; un carrito de Mercado Libre (varias compras que el comprador pagó juntas) también cuenta una vez; un pedido del historial de Virtual Seller, una vez.
- **Monto**: lo vendido (precio por cantidad de cada producto), en pesos de cada momento, **sin el costo de envío**. No descuenta comisiones ni costos: para eso está la [Rentabilidad por venta](/informes/rentabilidad).
- **Sin canceladas**: no entran las ventas canceladas ni los presupuestos.
- **Razón social de un canal**: la que tiene elegida el canal para facturar (Configuración › Canales); si no tiene, la principal de la empresa. El historial de Virtual Seller sin canal conocido va a la razón social principal.
- **Agrupado automático**: hasta dos meses, por día; hasta un año, por semana; más largo, por mes. La semana empieza el lunes y se nombra por ese día.
- **Fechas** en hora de la Argentina.
- El **color** de cada canal es siempre el mismo (sale del orden de los canales), aunque cambie el período.

## Preguntas frecuentes

**¿Por qué la cantidad de pedidos es menor que la de ventas que veo en Mercado Libre?**
Porque acá un carrito cuenta una vez, aunque Mercado Libre lo muestre como varias ventas (una por producto).

**¿Por qué el monto no coincide con lo cobrado?**
Porque es lo vendido sin el envío y antes de las comisiones y cargos de Mercado Libre.

## Relacionado

- [Rentabilidad por venta](/informes/rentabilidad)
- [Ranking de clientes](/informes/ranking-clientes)
