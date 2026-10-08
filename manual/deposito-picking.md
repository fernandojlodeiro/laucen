---
titulo: Picking
menu: Stock › Picking
ruta: /deposito/picking
rutas: /deposito/picking, /deposito/picking/[lote]
permiso: picking_ver
resumen: Preparar los pedidos: imprimir la etiqueta y la hoja de preparación de cada uno, juntar la mercadería y cerrarlos como preparados (o empacar escaneando).
---

## Para qué sirve

Es la pantalla del depósito para preparar los pedidos que hay que despachar. El camino principal es: tildar los pedidos, apretar **"Imprimir etiquetas y hojas"** (sale un PDF con la etiqueta de envío y la hoja de preparación de cada pedido), juntar la mercadería con la hoja en la mano y cerrar cada pedido como **"Preparado"**, con el botón o escaneando el código de barras de su **etiqueta** (Mercado Libre u OCA).

Hay dos caminos alternativos: **empacar escaneando** (en la mesa se escanea cada producto y el sistema dice a qué pedido va) y **recorrer escaneando** (se recorre el depósito en orden de ubicación escaneando cada unidad).

Está pensada para usarse desde el celular.

## Cómo se llega

- Menú **Stock › Picking**.
- En el celular, el acceso **"Picking"** (🧺) de la barra de abajo.
- Un lote se abre tocando su tarjeta en la lista de lotes.

## Qué hay en la pantalla

### La pantalla principal (Picking)

- **Depósito**: si hay más de un depósito activo, un desplegable con el botón **"Ver"** para elegir de cuál se preparan pedidos. No aparecen los depósitos de Full de Mercado Libre. Si no hay ningún depósito activo, la pantalla avisa y manda a crearlo.
- **"Preparado rápido"** (sólo con el permiso **"Preparar sin escanear"**): un lector donde se escribe o escanea el número de pedido (el de Laucen, con o sin "#", o el de Mercado Libre) **o la etiqueta del envío** (Mercado Libre u OCA: el código de barras o el QR). Muestra el pedido, cliente y unidades y pregunta "¿Marcar preparado con todo juntado?" con **"Sí"** / **"No"** (escribir el mismo número otra vez también es "Sí"). Ver "Preparado rápido" más abajo.
- **Lotes abiertos (N)**: tarjetas de los lotes que se están preparando. Cada una dice el número de lote, el modo ("con hojas", "empacar escaneando" o "recorrido escaneando"), desde cuándo está abierto, cuántos pedidos tiene y cuántos están preparados, cuántas unidades se juntaron de cuántas, los faltantes y una barra de avance.
- **Para preparar en <depósito> (N)**: los pedidos que esperan preparación, lo más urgente primero.
- **Pestañas por tipo de envío** (cortas, para el celular), cada una con cuántos tiene: **Todos**, **Meli** (Mercado Libre: Colecta, Flex, Correo, A convenir), **OCA** (a domicilio y a sucursal), **Retiran** (retiro en el local) y **Otros** (envío propio, a convenir). La lista muestra sólo los de la pestaña elegida, y "Tildar todos" e "Imprimir etiquetas y hojas" trabajan con esos. La última pestaña elegida queda recordada.
- **"Orden"**: **"Despachar antes"** (de entrada: lo que vence primero arriba, sirve para Mercado Libre) o **"Más viejos primero"** (por fecha de compra, para OCA y retiros).
- **"Tildar todos (N)"**: tilda de una todos los de la lista que se ve (menos los carritos en espera).
- **"Sólo carritos (N)"** (al lado de "Orden"): caja para tildar; muestra sólo los pedidos que llevan **más de un producto**.
- Cada pedido muestra:
  - una caja para tildarlo;
  - el número de pedido (enlace al pedido), el número externo (de Mercado Libre o la tienda) y **una marca con el tipo de envío** ("Colecta", "Flex", "Correo", "OCA sucursal", "OCA domicilio", "Retira"…);
  - marcas: **"Ya empezado"** (quedó en preparación de un lote anterior), **"A cobrar $…"** (se cobra al entregar), **"Carrito: esperando"** (carrito de Mercado Libre en espera);
  - cliente y canal;
  - unidades y líneas, y **"Despachar antes: …"** (en rojo si vence hoy o ya venció; la tarjeta entera se pinta de rojo suave);
  - en letra chica, **qué lleva**: hasta 5 productos con su cantidad ("2× Botón interruptor…") y, si son más, **"y N más"**, para darse una idea de un vistazo (por ejemplo, que es un carrito largo);
  - el botón **"Preparar este"** (o **"Esperando"**, deshabilitado, si es un carrito en espera).
- Abajo, fija, la barra de acciones:
  - **"Papel"**: el tamaño de la impresión, **"10 × 15 cm (térmica)"** o **"A4"**. Queda recordado para la próxima.
  - **"🖨 Imprimir etiquetas y hojas"** (el botón principal).
  - **"Empacar escaneando (alternativo)"** y **"Recorrer escaneando"**.
  - La aclaración "Los impresos pasan a un lote abierto."
- **Últimos terminados**: los últimos 10 lotes terminados de ese depósito. No aparece un lote terminado que no dejó nada (todos sus pedidos quedaron incompletos y se volvieron a armar en un lote posterior).

### La pantalla de un lote (Lote #N)

Arriba, el camino "Stock › Picking › <depósito> › #N" y un subtítulo con el depósito, cuántos pedidos tiene y cuántos están preparados. Tiene tres pestañas; abre en la que corresponde al modo con que se armó:

- **"Etiquetas y hojas"**:
  - **"🖨 Imprimir etiquetas y hojas"** (o **"Reimprimir etiquetas y hojas"** si ya se imprimieron), con el selector **"Papel"**. Si ya se imprimieron, avisa "Ya impresas: la hoja sale marcada «REIMPRESIÓN»".
  - **"Cerrar un pedido escaneando su etiqueta (Mercado Libre u OCA; sin etiqueta, el N.º de la hoja)"**: un lector para escanear el código de barras (o el QR) de la etiqueta de envío ya pegada en el paquete. Los pedidos sin etiqueta de transportista (retiro en el local, envío propio) se cierran con el código de la hoja o escribiendo el número. Sólo con el permiso **"Preparar sin escanear"**; sin ese permiso, en su lugar dice que cada producto se escanea o escribe en "Empacar escaneando". El botón **"Preparado"** de cada pedido también pide ese permiso.
  - **"Pedidos del lote (N)"**: cada pedido con su número grande, cliente (y apodo de Mercado Libre), canal, unidades, "Despachar antes", las marcas "impreso" o "impreso N veces", "A cobrar" y "Carrito: esperando", y el botón verde **"Preparado"** (o "Preparado ✓" con la hora si ya está, o "Esperando" si es un carrito en espera).
- **"Empacar escaneando (alternativo)"**: el lector "Escaneá el producto que vas a empacar", el cartel que dice a qué pedido va cada producto, y la lista de pedidos (con "empacadas N" y, en los ya preparados, el botón **"🖨 Etiqueta"**).
- **"Recorrer escaneando"**: el avance ("N de M unidades", faltantes y porcentaje), una caja grande con el ítem que toca (la **Ubicación** bien grande, la foto, el SKU, el título, "Faltan N de M", si es parte de un kit y de qué pedido es) y el lector. Cuando está todo, dice "Todo escaneado ✓".
- En **"Empacar escaneando"** y **"Recorrer escaneando"**, al lado del lector, el campo **"Cantidad"** (viene en 1): para lo que no tiene etiqueta (diodos, packs que se arman al vender) se escribe cuántas unidades, después el SKU y Enter, y se cargan todas de una. Después de cada carga vuelve a 1.
- Arriba a la derecha, **"Desarmar lote"** (pregunta antes). Debajo de las pestañas, **"Terminar lote"**.
- **"Recorrido (N ítems)"**: la lista de todo lo que hay que juntar, en orden de ubicación, con lo escaneado sobre lo pedido y los faltantes. Cada fila tiene el lápiz **"Corregir"**, que la convierte ahí mismo en los campos **"Escaneadas"** y **"Faltantes"** con **"Guardar"** y **"Cancelar"**.

Un lote **terminado** muestra **Preparados (N)** con **"🖨 Imprimir etiquetas y hojas"** (la etiqueta junto con la hoja de preparación de cada preparado, con el selector **"Papel"**) y **"Sólo las etiquetas"**, e **Incompletos (N)** si quedó alguno. Un lote **desarmado** dice que sus pedidos volvieron a la lista.

### El PDF de etiquetas y hojas

Para cada pedido, en orden (lo que vence antes primero, después lo más viejo):

1. **La etiqueta de envío**: si es un envío de Mercado Libre, la etiqueta que se baja de Mercado Libre; si es de la tienda web o del local con envío, una etiqueta propia con el número de pedido y su código de barras, "ENVÍO" o "RETIRA EN EL LOCAL", destinatario, dirección y teléfono. Si el pedido es «A cobrar», un recuadro grande "A COBRAR $ total". **Lo que retiran en el local no lleva etiqueta**: sale sólo la hoja (la etiqueta propia sale únicamente si se pide imprimir sólo la etiqueta). Si la etiqueta de Mercado Libre no se pudo bajar, en su lugar sale una página de aviso ("falta la etiqueta de Mercado Libre") que dice que se reimprima desde [Envíos](/ventas/envios).
2. **La hoja de preparación**: "HOJA DE PREPARACIÓN", el número de pedido grande con su código de barras, número externo y pack, cliente (y apodo), canal, fecha, logística (Flex, Colecta, Full, Despacho en correo, A convenir, Retira, envío propio), "Despachar antes de", el recuadro "A COBRAR" si corresponde, y las líneas en orden de recorrido: ubicación, SKU, título, cantidad grande y un cuadrado para tildar a mano. **Las líneas que llevan más de una unidad salen resaltadas** (fondo gris, título en negrita y la cantidad en blanco sobre negro), y abajo dice cuántas son ("ojo: 2 líneas llevan más de una unidad"), para no juntar una sola. Cada línea ocupa **un solo renglón**: si el título no entra, se achica un poco la letra y, si igual no entra, se corta con "…". Los kits (packs, combos) van en una fila con el SKU y el título del kit y cuántos se vendieron y, debajo, un renglón más petiso por componente con cuántas unidades juntar en negrita, su SKU y su título: por ejemplo, 2 packs de 10 diodos dicen "20  SKU…-U — Diodos Led Verde…". Las notas del comprador van arriba, antes de las líneas, en letra más grande y en negrita (hay que leerlas al preparar). Si ya se había impreso, la hoja sale marcada **"REIMPRESIÓN"**.

**En A4 va todo en una sola hoja por pedido**: arriba a la izquierda la etiqueta (la de Mercado Libre a su tamaño, la propia o el aviso de que falta); al costado, pegado al margen derecho (así queda aire para cortar la etiqueta), el encabezado de la hoja de preparación (número grande, código de barras, datos, «A cobrar» y las notas si entran); y en la mitad de abajo, las líneas a juntar. Si son muchas líneas, siguen en otra página ("Pedido N.º … (sigue)"). De lo que manda Mercado Libre sólo se usa la etiqueta: su resumen de productos y su hoja "Despachá tus productos" no salen, porque nuestra hoja dice lo mismo y además de qué ubicación sale cada cosa. Para cortar, la etiqueta de Mercado Libre queda con su tamaño original (10 × 15).

En 10 × 15 (la térmica) cada cosa va en su página: primero la etiqueta y después la hoja.

## Cómo se hace

### Preparar lo que no tiene etiqueta (escribiendo el SKU y la cantidad)

1. Abrí el lote en **"Empacar escaneando"** o **"Recorrer escaneando"**.
2. En **"Cantidad"** escribí cuántas unidades juntaste (por ejemplo 20).
3. En el lector escribí el SKU del producto (el de la unidad, por ejemplo el del diodo suelto, no el del pack) y Enter.
4. Se cargan las 20 de una. Si al pedido le faltan menos, avisa cuántas le faltan y no carga nada.

**Con el SKU del pack**: también se puede escribir el SKU (o el código de barras) del pack o kit, con la cantidad de packs. Por ejemplo, "Cantidad" 2 y el SKU del pack de 10 diodos carga 20 diodos sueltos (y, si el kit tiene varios componentes, cada uno por lo que lleva el kit). En "Empacar escaneando" van todos al pedido más viejo que pide ese pack; si le faltan menos packs, avisa cuántos y no carga nada.

### Preparado rápido (sin escanear, con permiso)

Sirve para cuando hay apuro o cuando los productos no tienen etiqueta para escanear. Pide el permiso **"Preparar sin escanear"** (el rol Admin lo tiene).

1. En **Stock › Picking**, en **"Preparado rápido"**, escribí o escaneá el número de pedido, o escaneá la etiqueta de envío (código de barras o QR, de Mercado Libre u OCA), y Enter.
2. Aparece el pedido: revisá que sea ése y apretá **"Sí"**.
3. El pedido queda **preparado** con todos sus productos tildados como juntados. Si ya estaba en un lote abierto, se cierra en ese lote; si no, se arma un lote con él solo, que queda terminado.

### Preparar pedidos con etiqueta y hoja (el camino principal)

1. Entrá a **Stock › Picking** y, si hay varios, elegí el depósito y apretá **"Ver"**.
2. Tildá los pedidos que vas a preparar.
3. Elegí el **"Papel"** (térmica 10 × 15 o A4).
4. Apretá **"🖨 Imprimir etiquetas y hojas"**. Se abre el PDF en otra pestaña; imprimilo. Si no tildaste nada, avisa "Tildá al menos un pedido." Para tildar todos los de la lista de una, **"Tildar todos (N)"** arriba de la lista (los carritos de Mercado Libre en espera no se tildan).
5. Los pedidos impresos pasan solos a un **lote abierto** (modo "con hojas") y a estado "en preparación". La pantalla se actualiza a los pocos segundos y el lote aparece en **"Lotes abiertos"**.
6. Con cada hoja, juntá la mercadería de las ubicaciones que dice, tildando a mano en el papel.
7. Abrí el lote y cerrá cada pedido de una de estas dos formas:
   - Apretá **"Preparado"** en su fila.
   - O pegá la etiqueta en el paquete y escaneá **el código de barras de la etiqueta** (Mercado Libre u OCA) en **"Cerrar un pedido escaneando su etiqueta"**: aparece el número de pedido, el cliente, las unidades y de quién es la etiqueta, con la pregunta "¿Marcar preparado?" y los botones **"Sí"** / **"No"**. Escanear la misma etiqueta otra vez también es "Sí" (cómodo con la pistola). Así se asegura que lo que compró cada cliente va en el paquete con su etiqueta.
8. Al cerrar el último pedido, el lote se termina solo.

### Preparar un solo pedido

Apretá **"Preparar este"** en el pedido. Se arma un lote con ese pedido solo, en modo "Recorrer escaneando", y se abre. Desde la pestaña **"Etiquetas y hojas"** podés imprimir su etiqueta y su hoja.

### Reimprimir etiquetas y hojas de un lote

En la pestaña **"Etiquetas y hojas"** del lote apretá **"Reimprimir etiquetas y hojas"**. Salen todas las del lote, con la hoja marcada "REIMPRESIÓN". En un lote terminado están **"🖨 Imprimir etiquetas y hojas"** (etiqueta + hoja de los preparados) y **"Sólo las etiquetas"**.

### Empacar escaneando (alternativo)

1. Tildá los pedidos y apretá **"Empacar escaneando (alternativo)"**. Se arma el lote y se abre en esa pestaña.
2. En la mesa, escaneá cada producto (con la pistola, escribiendo el código y Enter, o con **"📷 Cámara"** en el celular).
3. La pantalla dice en grande **"Va al pedido #N"** y qué le falta a ese pedido ("Le falta: …", con cantidad, SKU y ubicación). El producto va siempre al pedido más viejo del lote que todavía lo necesita.
4. Cuando el pedido queda completo, se cierra solo como preparado ("Completo ✓ — quedó preparado") y se abre su etiqueta en otra pestaña para imprimirla. Si el navegador bloquea la pestaña, está el botón **"🖨 Imprimir su etiqueta"**.
5. Si el producto no es de ningún pedido del lote o ya están todas sus unidades, suena el pitido de error y dice "ésa sobra, dejala aparte".

### Recorrer escaneando

1. Tildá los pedidos y apretá **"Recorrer escaneando"**.
2. La caja grande muestra la ubicación a la que tenés que ir, qué producto y cuántos faltan. Escaneá cada unidad: el sistema suma de a una y pasa al siguiente ítem, en orden de recorrido.
3. Si una unidad no está, corregí la fila con el lápiz **"Corregir"**: poné cuántas **"Escaneadas"** y cuántas **"Faltantes"** y apretá **"Guardar"**.
4. Cuando dice "Todo escaneado ✓", apretá **"Terminar lote"**.

### Terminar o desarmar un lote

- **"Terminar lote"**: los pedidos con todo escaneado pasan a "preparado"; los que tienen faltantes o no se cerraron quedan "en preparación" y vuelven a la lista para un próximo lote. Si hay pedidos sin cerrar, antes de terminar pregunta ahí mismo cuáles son ("El #25 no está preparado: queda en preparación y vuelve a la lista. ¿Terminar igual?") con **"Sí"** / **"No"**. Terminar no mueve stock ni toca Mercado Libre: sólo cambia el estado de los pedidos completos a "preparado" (queda en su historial) y cierra el lote. La mercadería sigue reservada; el stock se descuenta recién al despachar. Muestra un resumen: "Picking terminado: N preparado(s), N incompleto(s)".
- **"Desarmar lote"** (arriba a la derecha): pregunta "¿Desarmar el lote?". Los pedidos sin preparar vuelven a la lista **como estaban antes del lote** (por ejemplo "pagado"), para armar otro; los que ya estaban preparados quedan preparados. Sirve, por ejemplo, si se tildó un pedido por error.

### Mensajes de error típicos

- "El pedido N espera el pago: no se prepara todavía." — está en "nuevo" y no es «A cobrar» ni a convenir.
- "El pedido N está frenado por la cuenta corriente: …" — es a cuenta corriente y el cliente no tiene la cuenta habilitada, no tiene límite cargado, o su saldo más los pedidos a cuenta pasan el límite (ver [Clientes](/ventas/clientes)). Esos pedidos no aparecen en la lista para preparar.
- "El pedido N sale de otro depósito." — elegí el depósito correcto arriba.
- "El pedido N ya está en otro picking abierto."
- "Esos pedidos no tienen nada reservado para preparar (¿productos sin vincular?)." — las líneas del pedido no están vinculadas a un producto de Laucen.
- "El código X no es de este picking." / "Ya están todas las unidades de X: ese sobra."
- Un carrito de Mercado Libre en espera: "cerralo pasados los 10 minutos".

## Criterios y reglas

- **Qué pedidos aparecen para preparar**: los de ese depósito que mueven stock, que no son de Full y que no están en un lote abierto, y que estén "pagado" o "en preparación" (por ejemplo, de un lote terminado sin cerrarlos), o que estén "nuevo" pero sean «A cobrar» (efectivo al retirar) o a convenir, que no esperan el pago.
- **Orden**: primero los que tienen fecha de "despachar antes" (la más cercana primero), después los que no tienen, por fecha del pedido.
- **Depósito de cada pedido**: el que tiene asignado; si no, el primero activo del canal; si no, el primero activo de la empresa.
- **Qué hay que juntar** sale de lo que cada pedido tiene **reservado**: la reserva ya dice de qué ubicación sale cada unidad, y los kits vienen abiertos en sus componentes. Un «A cobrar» que no tiene nada reservado reserva al armar el lote. Lo que no está vinculado a un producto va en la hoja igual, sin ubicación, al final.
- **Orden de recorrido**: por el orden de recorrido de la ubicación (de menor a mayor), después el código de la ubicación, después el SKU. El orden de cada ubicación se carga en [Depósitos y ubicaciones](/stock/depositos).
- **Estados del pedido**: al entrar en un lote (por imprimir o por armarlo con un botón) el pedido pasa a **"en preparación"**; al cerrarlo, a **"preparado"**. El picking **no mueve stock**: la venta se descuenta recién cuando el pedido se despacha.
- **Imprimir arma el lote**: los pedidos tildados que todavía no estaban en un lote abierto entran en uno nuevo (uno por depósito). Así no se imprimen dos veces sin querer. Los que ya estaban en un lote se imprimen igual sin tocarlos (es una reimpresión). Imprimir marca la etiqueta de Mercado Libre como impresa y cuenta cuántas veces se imprimió la hoja de cada pedido.
- **"Preparado"** da por juntado todo lo del pedido (pone todo como escaneado) y lo pasa a "preparado". Si era el último del lote, el lote queda terminado.
- **Carrito de Mercado Libre**: un carrito (varias compras del mismo comprador en un pack) es un solo pedido, y sus compras pueden llegar con minutos de diferencia. Durante los **10 minutos** posteriores a su último cambio no se puede tildar, imprimir ni cerrar. Si recibió un cambio mientras estaba en un lote, al terminar el lote no pasa a preparado: vuelve a la lista para prepararlo de nuevo pasada la espera.
- **Faltantes**: un pedido con faltantes no se cierra solo, ni al empacar ni al terminar el lote; queda en preparación y vuelve a la lista.
- **Preparar sin escanear**: dar un pedido por preparado sin escanear cada producto (el «preparado rápido», el botón "Preparado" y cerrar con el número o la hoja) pide el permiso "Preparar sin escanear". Escanear o escribir cada producto no lo pide. No se puede preparar así un pedido de Full, uno que espera el pago, ni un carrito de Mercado Libre en espera.
- **Cantidad**: con "Cantidad", todas las unidades van al mismo renglón (al mismo pedido en "Empacar escaneando"); si ese renglón necesita menos, avisa y no carga nada. Con el SKU de un pack, la cantidad es de packs: carga cada componente por las unidades que lleva el pack.
- **Cerrar con la etiqueta**: un pedido que lleva etiqueta de Mercado Libre (no Full) o de OCA se cierra **sólo** escaneando su etiqueta: si se escanea la hoja, avisa "El pedido N lleva etiqueta de …: escaneá el código de barras de la etiqueta, no el de la hoja". De Mercado Libre vale el código de barras, el QR o el número de seguimiento; de OCA, el número de envío (o el código de la pieza, que lo trae adentro). Un carrito de Mercado Libre con varios pedidos lleva una sola etiqueta: escanearla cierra todos juntos ("#12 + #13"). Lo que no lleva etiqueta de transportista (retiro, envío propio, local) se cierra con el número de la hoja. Una etiqueta que no es de ningún pedido del lote avisa y no cierra nada.
- **Lector**: acepta la pistola lectora (USB o Bluetooth, que tipea el código y Enter), escribir a mano, o la cámara del teléfono (**"📷 Cámara"**; anda en Android y en iPhone: en iPhone la primera vez carga un lector de repuesto, así que hace falta internet). Pitido agudo = bien; doble grave = error. Se acepta el código de barras o el SKU. El código de la hoja es el número de pedido (también acepta "#123" o "P123"); para cerrar en el lote, ver "Cerrar con la etiqueta".
- **Papel**: 10 × 15 cm (la térmica de las etiquetas de Mercado Libre: etiqueta y hoja en páginas separadas) o A4 (etiqueta y hoja juntas en una sola hoja por pedido); el último elegido queda recordado.

## Preguntas frecuentes

**¿Por qué un pedido no aparece para preparar?**
Puede estar esperando el pago (estado "nuevo"), ser de Full, ser de otro depósito, estar ya en un lote abierto, o no mover stock.

**¿Qué pasa si imprimo y después no lo preparo?**
El pedido queda en el lote abierto. Si desarmás el lote, vuelve a la lista como estaba; si lo terminás sin cerrarlo, vuelve "en preparación" (con la marca "Ya empezado").

**¿Puedo reimprimir una etiqueta?**
Sí, desde la pantalla del lote ("Reimprimir etiquetas y hojas"). La hoja sale marcada "REIMPRESIÓN".

**¿El picking descuenta el stock?**
No. El stock ya estaba reservado; se descuenta al despachar el pedido.

**¿Por qué un pedido dice "Esperando" y no lo puedo tildar?**
Es un carrito de Mercado Libre que tuvo un cambio hace menos de 10 minutos; puede llegarle otro ítem. Esperá.

**¿Qué hago si falta una unidad en el estante?**
En "Recorrer escaneando", corregí la fila con el lápiz y poné el faltante. El pedido queda en preparación hasta que haya. En el camino con hojas, simplemente no lo marques "Preparado".

**Salió una página que dice que falta la etiqueta de Mercado Libre.**
Mercado Libre no la entregó en ese momento. Reimprimila desde [Envíos](/ventas/envios) o reimprimí el lote.

**¿La cámara no anda en mi iPhone?**
Sí: el navegador del iPhone (Safari y también Chrome, que en iPhone usa el mismo motor) no trae lector de códigos, pero Laucen carga uno propio la primera vez que apretás "📷 Cámara"; tarda un par de segundos y hace falta internet. Si igual no anda, usá una pistola lectora o escribí el código.

## Relacionado

- [Pedidos](/ventas/pedidos)
- [Envíos](/ventas/envios) (también imprime etiquetas y hojas)
- [Consulta de stock](/stock/consulta)
- [Depósitos y ubicaciones](/stock/depositos) (orden de recorrido)
- [Etiquetas](/deposito/etiquetas)
