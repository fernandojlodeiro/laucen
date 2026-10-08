---
titulo: Consulta de stock
menu: Stock › Consulta de stock
ruta: /stock/consulta
rutas: /stock/consulta
permiso: stock_ver
resumen: Qué hay de cada producto en cada depósito y ubicación (cantidad, reservado y disponible) y sus últimos movimientos.
---

## Para qué sirve

Es la pantalla para saber cuánto hay de cada producto (de cada variación, en realidad: cada talle, color o modelo tiene su propio stock), en qué depósito y en qué ubicación está, cuánto está reservado para pedidos y cuánto queda disponible para vender. Al abrir un producto se ven también sus últimos movimientos de stock.

También es el punto de partida para corregir un stock: desde un producto abierto, el botón **"Ajustar"** lleva a [Ajustes de stock](/stock/ajustes) con el SKU ya cargado.

## Cómo se llega

- Menú **Stock › Consulta de stock**.
- En el celular, el acceso **"Stock"** (🔎) de la barra de abajo.
- Desde [Depósitos y ubicaciones](/stock/depositos): el número de **Unidades** de un depósito abre esta consulta filtrada por ese depósito; la cantidad de un producto adentro de una ubicación abre este producto.
- Desde [Ajustes de stock](/stock/ajustes): el SKU de cada ajuste de la lista "Últimos ajustes y transferencias" abre el producto acá.
- Desde [Movimientos de stock](/stock/movimientos): el botón **"Consulta de stock"** de arriba a la derecha.

## Qué hay en la pantalla

### Filtros (arriba)

- **Buscador** ("SKU, título o código de barras"): busca mientras escribís, desde la segunda letra, en todos los datos de la variación y de su producto (SKU, título, código de barras, marca, modelo, descripción, número…). Con la caja **"Comienza por"** tildada (viene tildada) busca lo que empieza con lo escrito; destildada, lo que lo contiene en cualquier parte. El código de barras tiene que coincidir completo. La X adentro del cuadro borra lo escrito. **"Mostrar inactivos"** suma los productos archivados; si lo escrito no está en ningún activo pero sí en alguno archivado, salen igual aunque la caja esté apagada.
- Interruptor **"Todos los depósitos"**: prendido, suma todos los depósitos activos. Apagado, aparece el desplegable **"Depósito"** para ver uno solo. La elección queda recordada en ese navegador: la próxima vez la pantalla abre con el último depósito elegido.
- Interruptor **"Sólo bajo el mínimo"**: deja sólo los productos cuyo disponible está por debajo del stock mínimo cargado en el producto.
- Interruptor **"Sólo con disponible negativo"**: deja sólo los que tienen disponible menor que cero (se vendió más de lo que había).

### La tabla

Columnas: **SKU**, **Variación** (el título; los kits llevan la marca "Kit"), **Cantidad**, **Reservado**, **Disponible** y **Mínimo**.

- **Cantidad** es lo que hay físicamente. Tocando el número se abre un cuadrito con las ubicaciones donde está (y el depósito, si está en más de uno).
- **Reservado** es lo comprometido con pedidos que todavía no salieron.
- **Disponible** = Cantidad − Reservado. Se pinta en rojo si es negativo y en ámbar si está por debajo del mínimo.
- En un kit, Cantidad y Reservado muestran "—" y Disponible dice cuántos kits se pueden armar con los componentes.
- Se muestran como mucho 100 productos, ordenados por SKU; si hay más, abajo dice "Se muestran las primeras 100: buscá para afinar."

Abajo de la tabla una nota aclara si los totales son de todos los depósitos activos o de uno.

### Un producto abierto

Tocando el SKU se abre una caja arriba de la tabla con:

- El SKU, el título, el código de barras, el stock mínimo (o "Sin stock mínimo cargado") y el enlace **"ver producto"** a su ficha.
- Botones **"Ajustar"** (no aparece en un kit) y **"Cerrar"**.
- **Si es un producto común**: una tabla por **Depósito** y **Ubicación** con **Cantidad**, **Reservado** y **Disponible**, y una fila de **Total** si hay más de una. Aparecen también los depósitos archivados que todavía tengan algo (con la marca "Archivado"). La ubicación general de cada depósito se muestra como "General".
- **Si es un kit**: la lista de sus componentes (cada uno se puede tocar para abrirlo) y una tabla de **Kits disponibles** por depósito, con el total.
- **Últimos movimientos**: los 20 más nuevos, con Fecha, Tipo, Origen, Destino, Cantidad, Referencia (por ejemplo "pedido #123" o "recepcion #8"), Nota y Usuario ("Sistema" si lo hizo un proceso automático). En un kit se agrega la columna **Componente**, porque los movimientos son de sus componentes. El botón **"Ver todos los movimientos"** lleva a [Movimientos de stock](/stock/movimientos) filtrado por ese producto.

## Cómo se hace

### Ver cuánto hay de un producto y dónde está

1. Escribí parte del SKU o del título en el buscador (o escaneá el código de barras).
2. Mirá la fila: Cantidad, Reservado y Disponible.
3. Para ver las ubicaciones, tocá el número de **Cantidad**, o tocá el SKU para abrir el detalle completo por depósito y ubicación.

### Ver el stock de un solo depósito

1. Apagá **"Todos los depósitos"**.
2. Elegí el depósito en el desplegable **"Depósito"**. La pantalla cambia sola y queda recordado para la próxima.

### Encontrar lo que hay que reponer

Prendé **"Sólo bajo el mínimo"**. Para que un producto aparezca acá, tiene que tener cargado el **Stock mínimo** en su ficha de [Productos](/catalogo/productos).

### Encontrar lo vendido sin stock

Prendé **"Sólo con disponible negativo"**. Son productos que se vendieron sin tener (o con menos de lo vendido). Hay que contar la mercadería y corregir con un ajuste, o reponer.

### Corregir el stock de un producto

Abrí el producto y apretá **"Ajustar"**: te lleva a [Ajustes de stock](/stock/ajustes) con el SKU ya cargado.

## Criterios y reglas

### Cantidad, reservado y disponible

- **Cantidad (stock físico)**: lo que hay en cada ubicación.
- **Reservado**: lo apartado para pedidos que todavía no se despacharon.
- **Disponible = Cantidad − Reservado**. Es lo que se puede vender y es lo que se informa a Mercado Libre y a la tienda web.
- El disponible **puede dar negativo**: el sistema no frena una venta por falta de stock; la deja pasar y el negativo queda a la vista acá para resolverlo.
- Los totales de la lista cuentan **sólo depósitos activos**. Un depósito archivado no suma ni para la lista ni para lo que se vende en los canales (en el detalle de un producto sí aparece, marcado "Archivado", si le quedó algo).

### Cómo se reserva y cuándo se descuenta (el ciclo de un pedido)

- **Al pasar el pedido a pagado** (o al saltear ese estado) se reserva. Los pedidos «A cobrar» (efectivo al retirar) y «a convenir» reservan apenas se crean, sin esperar el pago.
- **De qué depósito**: el que tiene asignado el pedido; si no tiene, el primer depósito activo del canal (según la prioridad cargada en [Canales](/config/canales)); si el canal no tiene, el primer depósito activo de la empresa (los propios primero).
- **De qué ubicación**: primero las ubicaciones que tienen disponible, en el orden de recorrido; lo que falte se reserva en la ubicación General del depósito (y ahí queda el disponible negativo, con la nota "sin stock suficiente").
- **Al despachar** el pedido, la reserva se convierte en venta: baja la cantidad y baja el reservado.
- **Al cancelar o devolver** el pedido, se libera lo que siga reservado.
- Preparar el pedido en el [Picking](/deposito/picking) no mueve stock: el pedido ya tenía todo reservado y la venta se descuenta recién al despachar.
- Las ventas históricas importadas no reservan ni descuentan stock.

### Kits

- Un kit no tiene stock propio. Su disponible en cada depósito es cuántos kits completos se pueden armar: para cada componente, su disponible dividido la cantidad que lleva el kit, redondeado para abajo; manda el menor. Nunca da menos de cero.
- Al reservar o vender un kit se mueve el stock de cada componente (cantidad del kit × la del componente), y esos movimientos quedan marcados como "del kit".
- Un kit no se ajusta ni se recibe: se ajustan o reciben sus componentes.

### Sincronización con Mercado Libre

- Se prende **por canal**, con el interruptor **"Laucen manda el stock a ML y pausa al llegar al umbral"** de la cuenta de Mercado Libre en [Canales](/config/canales). Apagado, Laucen no toca el stock ni las pausas en esa cuenta (sirve para conectar una cuenta y cargar el stock tranquilo antes de que empiece a mandar). Prenderlo es una decisión del usuario: nunca se prende solo.
- **Qué se informa**: cada publicación vinculada informa el **disponible del canal**, que es la suma de los disponibles de los depósitos activos desde los que vende ese canal (se eligen en [Canales](/config/canales)). Si el disponible es negativo se informa 0. Todas las cuentas de ML comparten el mismo stock.
- **Al instante**: cada vez que cambia la cantidad o el reservado de un producto (venta, reserva, ajuste, recepción, compra, transferencia), el cambio sale enseguida hacia Mercado Libre y hacia la tienda web. Si ese aviso inmediato se pierde, un proceso que revisa cada 2 minutos levanta lo que haya quedado pendiente de más de un minuto. Además hay un barrido cada media hora que revisa todo, y una **barrida nocturna** (de 2 a 5 de la mañana) que lee de Mercado Libre todas las publicaciones de cada cuenta y corrige las diferencias.
- **Pausa por umbral**: cuando el disponible del canal llega al **umbral de pausa** o queda por debajo, la publicación se pausa (si es una variación de una publicación con variaciones, se le informa 0, porque una variación sola no se puede pausar). La pausa sale con la prioridad más alta.
- **Reactivación**: cuando vuelve a haber disponible por encima del umbral, la publicación pausada se reactiva con la cantidad nueva, la haya pausado quien la haya pausado. Si Mercado Libre la había pausado por una infracción, rechaza la reactivación y queda con error en la [Cola de Mercado Libre](/config/canales/cola).
- **De dónde sale el umbral**: el de la publicación; si no tiene, el del producto (campo "Umbral de pausa" de la ficha); si no, el del canal ("Umbral de pausa" en [Canales](/config/canales)); si no, el general de la empresa; y si nada está cargado, **0** (pausa sólo cuando no queda nada).
- **Full**: las publicaciones con logística Full no se tocan nunca (el stock lo maneja Mercado Libre).
- Nada se manda directo: todo entra a la [Cola de Mercado Libre](/config/canales/cola), que manda respetando los límites de Mercado Libre, reintenta si falla y registra qué se mandó y con qué resultado. Si hay un cambio de cantidad esperando y llega otro para la misma publicación, el nuevo reemplaza al viejo. Lo que queda grabado en Laucen (pausada, cantidad informada) se graba recién cuando Mercado Libre lo acepta.

## Preguntas frecuentes

**¿Por qué el disponible es menor que lo que hay en el estante?**
Porque parte está reservada para pedidos que todavía no se despacharon. Disponible = cantidad − reservado.

**¿Por qué un producto tiene disponible negativo?**
Se vendió más de lo que había (el sistema no frena la venta). Contá la mercadería y corregí con un [ajuste](/stock/ajustes), o reponé.

**¿Por qué un kit no muestra cantidad?**
Porque no tiene stock propio: su disponible son los kits que se pueden armar con lo que hay de cada componente.

**¿El stock que veo es el que ve Mercado Libre?**
Mercado Libre recibe el disponible del canal: la suma de los depósitos desde los que vende ese canal, y sólo si el canal tiene prendida la sincronización. Si mirás "Todos los depósitos" puede no coincidir con un canal que vende desde uno solo.

**No me aparece un producto en "Sólo bajo el mínimo".**
Tiene que tener cargado el stock mínimo en su ficha de producto.

**¿Cuándo se descuenta el stock de una venta?**
Al despachar el pedido. Antes queda reservado.

**¿Por qué no veo un depósito en la lista?**
Sólo aparecen los depósitos activos. Los archivados se ven en [Depósitos y ubicaciones](/stock/depositos).

**¿Por qué la pantalla me abre siempre con un depósito y no con todos?**
Recuerda el último depósito elegido en ese navegador. Prendé "Todos los depósitos" y queda así.

## Relacionado

- [Ajustes de stock](/stock/ajustes)
- [Movimientos de stock](/stock/movimientos)
- [Depósitos y ubicaciones](/stock/depositos)
- [Stock valorizado](/informes/stock-valorizado) y [Stock por ubicación](/informes/stock-por-ubicacion)
- [Productos](/catalogo/productos)
- [Canales](/config/canales) y [Cola de Mercado Libre](/config/canales/cola)
