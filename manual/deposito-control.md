---
titulo: Control de stock
menu: Stock › Control de stock
ruta: /deposito/control
rutas: /deposito/control, /deposito/control/a-buscar
permiso: control_stock
resumen: Recorrer el depósito con el celular, de a un producto, confirmando si está en su ubicación; lo que falta se descuenta y lo que no se encuentra pasa a «En búsqueda» hasta resolverlo.
---

## Para qué sirve

Para que el stock del sistema sea el de verdad y no se venda algo que no está. En los ratos libres, alguien va con el celular: le aparece **un producto por vez**, con la foto grande, el SKU, el título y **la ubicación**, va hasta ahí y dice si está. Empieza por lo más riesgoso: los productos con **menos stock** (una sola unidad primero) y, entre ellos, los de **más plata en stock**.

## Cómo se llega

- En el celular: **Menú → 📱 Modo depósito → ✅ Control de stock**.
- Menú **Stock › Control de stock**.
- Se puede dejar fijo en la barra de abajo del celular desde [Mis accesos del celular](/config/accesos).

## Qué hay en la pantalla

Dos pestañas: **Por controlar** (con cuántos quedan) y **A buscar** (con cuántos están sin resolver).

### Por controlar

- Dos tildes, los dos tildados de entrada:
  - **"Sin GENERAL ni A UBICAR"**: deja afuera lo que no tiene una ubicación fija (lo que está en la ubicación General de un depósito o en A UBICAR).
  - **"Sólo con publicación activa en Mercado Libre"**: deja afuera el stock que no se está vendiendo en Mercado Libre (cuenta también la publicación de un kit que lleva el producto).
- La tarjeta del producto: la foto grande (si tiene varias, abajo se elige otra), **la ubicación** bien grande con su depósito, el SKU (enlace a la ficha), el título, cuántas unidades dice el sistema que hay ahí (y cuántas en otras ubicaciones) y el precio. Marcas: **"Ingresó mercadería el …"** (le entró mercadería después del último control), **"… vendida sin despachar"** y la fecha del último control (o **"Nunca se controló"**).
- Si el sistema dice más de una unidad: **"¿Cuántas ves?"**, que viene con lo del sistema, con − y + para corregirla.
- Tres botones grandes: **✓ Está**, **✗ No está** y **? A buscar**. Abajo, **"Saltar este por ahora"**.

### A buscar

Los productos que quedaron con **?**, del más viejo al más nuevo: foto, SKU, título, en qué ubicación faltaba(n), cuándo y quién lo marcó, y cuánta plata representa. Un buscador por SKU, título o ubicación.

## Cómo se hace

### Controlar un producto

1. Andá a la ubicación que dice la tarjeta.
2. Si hay más de una unidad, contá y corregí **"¿Cuántas ves?"** si hace falta.
3. Tocá:
   - **✓ Está**: está todo lo que dice el sistema (si contaste de más, se suman las que sobran).
   - **✗ No está**: falta. Se descuenta en el momento.
   - **? A buscar**: no está ahí pero puede estar en otro lado. Sale de la venta en el momento y queda en la pestaña **A buscar**.
4. Abajo aparece cómo salió y enseguida la tarjeta siguiente.

Si no podés llegar a una ubicación, **"Saltar este por ahora"**: no se anota nada y te vuelve a aparecer en un par de horas.

### Resolver lo que quedó a buscar

1. Pestaña **A buscar**: tocá el producto.
2. Si apareció: elegí **"¿Dónde apareció?"** (viene su ubicación; si estaba en otra, buscala), si eran varias poné cuántas aparecieron, y tocá **✓ Apareció**. Vuelve al stock en esa ubicación; las que no aparecieron se descuentan.
3. Si no apareció: **✗ No apareció** y confirmá con **Sí**. Se descuenta.

## Criterios y reglas

- **Qué se controla**: el stock de los depósitos propios que venden por algún canal, de a un producto en una ubicación. Un producto en dos ubicaciones son dos tarjetas.
- **Orden**: primero los productos con menos unidades en total (1, después 2, y así); con el mismo stock, primero el de más valor en stock (todas sus unidades por el precio de venta de la lista de precios por defecto).
- **Cuándo vuelve a aparecer**: un producto controlado queda al día **60 días**. Antes de eso vuelve a aparecer si le entra mercadería en esa ubicación (una recepción, una devolución, una transferencia o un ajuste que suma): **cada ingreso pide un control**.
- **✗ No está**: descuenta lo que falta con un ajuste de stock con el motivo "Control de stock: no está". El disponible baja al instante, así que Mercado Libre y la tienda reciben la cantidad nueva y, si llega al límite de pausa, la publicación se pausa, como con cualquier cambio de stock (en las cuentas que sincronizan stock).
- **? A buscar**: lo que falta pasa al depósito **En búsqueda**, que no vende por ningún canal: para la venta es igual que si faltara (baja el disponible y se pausa), pero no se descuenta del stock de la empresa hasta resolverlo. **✓ Apareció** lo devuelve a la ubicación elegida (la publicación se reactiva si se había pausado por stock); **✗ No apareció** lo descuenta con un ajuste ("Control de stock: no apareció").
- **Contaste de más**: con **✓ Está** y más unidades de las del sistema, la diferencia se suma con un ajuste ("Control de stock: había … de más").
- **Con más de una unidad y algunas faltan**: poné cuántas ves y tocá **✗** o **?**: se descuenta (o pasa a buscar) sólo la diferencia. Sin cambiar la cantidad, **✗** y **?** quieren decir que no está ninguna.
- **Vendido sin despachar**: si lo que queda no alcanza para lo que ya está vendido, el aviso sale en rojo con los pedidos que lo esperan, para resolverlos ya.
- **Dos personas a la vez**: la tarjeta que una tiene en pantalla no le aparece a la otra durante 10 minutos.
- **Si el stock cambia mientras se mira la tarjeta** (por ejemplo, entra una venta), no se anota nada: avisa y la muestra de nuevo con lo actual.
- Cada control queda anotado con fecha, hora y persona; en el historial del producto ([Consulta de stock](/stock/consulta)) se ven los movimientos que hizo. El resumen está en el informe [Control de stock](/informes/control-stock).

## Relacionado

- [Control de stock (informe)](/informes/control-stock)
- [Modo depósito](/deposito/celular)
- [Depósitos y ubicaciones](/stock/depositos)
- [Ajustes de stock](/stock/ajustes)
