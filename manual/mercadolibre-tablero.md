---
titulo: Relevamiento completo
menu: Dashboard › Relevamiento completo
ruta: /mercadolibre
rutas: /mercadolibre
permiso: tablero_ml_ver
resumen: Todas las cuentas de Mercado Libre en una pantalla: reputación con los colores de ML, publicaciones, lo que hay para atender hoy (etiquetas, pedidos, preguntas, mensajes, reclamos, devoluciones) y las alertas del catálogo.
---

## Para qué sirve

Para ver de un vistazo cómo está cada cuenta de Mercado Libre y qué hay que hacer hoy, sin entrar cuenta por cuenta. Es una tabla centrada, compacta para que entre cómoda, con la **fila de títulos fija**: al bajar con la rueda, siempre se ve a qué cuenta o canal corresponde cada columna, con **una columna por cuenta** (arriba, en azul, el nombre del canal; debajo, chiquito, la razón social con la que factura; el apodo de la cuenta de ML se lee pasando el mouse por el título), más tres columnas para lo que no es de Mercado Libre —**Web minorista**, **Web mayorista** (aparece siempre, aunque todavía no exista la tienda mayorista) y **Otros** (el local, los pedidos manuales y cualquier otro canal)— y una columna **Total**. En las columnas de la web y en Otros se ven los pedidos, envíos, reclamos, devoluciones y ventas de esos canales; lo propio de Mercado Libre (reputación, preguntas, mensajes, cola y conexión) figura con una raya.

**En la web, Publicaciones y "Productos con stock sin publicar" usan el interruptor "Publicado en Web" de cada producto** (pestaña Publicaciones de la ficha): **Activas** son los productos activos con el interruptor prendido ("N de M productos activos"); **Pausadas** son los productos activos con el interruptor apagado (o que nunca se publicaron); y **Productos con stock sin publicar** son, de éstos, los que además tienen stock disponible. Cada número lleva a Productos filtrado. Casi cada número es un **enlace** a la pantalla donde se resuelve, ya filtrada por esa cuenta.

## Cómo se llega

Menú **Dashboard › Relevamiento completo**. Sólo lo ve quien tiene el permiso «Tablero de Mercado Libre». La versión resumida, con lo que hay para hacer, es [Para hacer](/panel).

## Qué hay en la pantalla

Pasando el mouse por el ⓘ de cada fila se lee qué cuenta. Cada número en grande es lo que **hay para atender** (en rojo si es mayor que cero, en verde si es cero) y el chico, "de N", es el **total** de esa clase.

### Reputación
Lo que informa Mercado Libre; cada dato cuenta el período que se muestra al lado (por ejemplo "60 días").
- **Color de la reputación**: el termómetro de cinco colores de ML (rojo, naranja, amarillo, verde claro y verde) con el color actual más alto y marcado con una flechita. Al lado hay un **?**: pasando el mouse se lee el nivel actual, cuál es el siguiente y tus números de reclamos, demoras, cancelaciones y ventas. Mercado Libre **no informa los límites exactos que faltan** para subir de nivel, por eso se muestran los números de hoy. Una cuenta nueva figura "Sin reputación" hasta que ML le da una.
- **MercadoLíder** (segundo renglón): la medalla con forma de escudo: gris plata (MercadoLíder), amarilla (Gold) o platino (Platinum); con una raya si la cuenta no es MercadoLíder.
- **Reclamos que afectan la reputación**: cuántos y qué porcentaje de las ventas, en el período que cuenta ML.
- **Entregas demoradas**: despachos hechos fuera del plazo de manipulación, en el período que cuenta ML.
- **Cancelaciones**, **Ventas completadas** y **Calificaciones positivas**.

### Publicaciones
- **Activas** (de las totales), **Pausadas**.
- **Con cuestiones para resolver**: en revisión, inactivas o con el pago pendiente; ML las frena hasta que se corrija algo.
- **Sin producto asociado**: publicaciones de ML que todavía no están vinculadas a un producto de Laucen (con la cantidad de activas). Enlace: [Vincular con Mercado Libre](/catalogo/publicaciones/ml).

### Para hacer (sólo en el tablero "Para hacer")
Estas filas **no están en el Relevamiento completo**: viven en [Dashboard › Para hacer](/panel), para no repetir información. Son siete:
- **Etiquetas para imprimir**: envíos por despachar con la etiqueta sin imprimir (de los envíos por despachar), y cuántos son para hoy o están vencidos. Enlace: [Envíos](/ventas/envios).
- **Pedidos para preparar**: los pendientes de [Pedidos](/ventas/pedidos) (nuevos o pagados), sin los carritos que todavía esperan. El número chico es el total sin despachar (los para preparar, los en preparación y los preparados); debajo, cuántos están "en preparación" y cuántos están **frenados por cuenta corriente** (a cuenta, sin crédito suficiente del cliente).
- **Reservados sin pagar**: pedidos Nuevos sin pagar (tienda web o cargados a mano) que tienen el stock apartado. Debajo, **cuántos vencen hoy o mañana**; si hay alguno, el número sale en rojo. Al terminar el último día de la reserva se cancelan solos (los días se configuran en [Empresa](/config/empresa)). Enlace: [Pedidos](/ventas/pedidos?reserva=1) con "Reservados sin pagar" tildado.
- **Pedidos para despachar**: los **preparados** que todavía no salieron (tocándolo, la lista de pedidos en estado Preparado). Debajo, el plazo más cercano para entregarlos, por ejemplo "antes de hoy 16:30" (es el "despachar antes de" de la etiqueta de Mercado Libre; cada cuenta tiene el suyo), y cuántos ya vencieron. 
- **Preguntas para responder** (y cuánto hace de la más vieja) y **Mensajes para responder** (conversaciones con mensajes sin leer). Enlace: [Preguntas y mensajes](/ventas/preguntas).
- **Reclamos para atender**: los abiertos, con cuántos esperan tu respuesta, cuántos vencen en 24 horas y cuántos están en mediación. El chico, "de N en 60 días", es cuántos hubo en los últimos 60 días (la ventana de la reputación de Mercado Libre). Enlace: [Reclamos y devoluciones](/ventas/reclamos).
- **Devoluciones**: las abiertas y cuántas vienen en camino; el chico, cuántas hubo en los últimos 60 días.

### Movimiento y salud de la cuenta
**Pedidos en camino** (envíos despachados que todavía no se entregaron), **Ventas de hoy** y **de los últimos 7 días** (cantidad e importe, en pesos o en dólares según el interruptor de abajo a la izquierda: cada venta guarda su total en dólares al tipo de cambio del día en que se hizo, y se suman esos), **Cola de Mercado Libre con error** (cambios que Laucen quiso mandar a ML y no pudo; enlace a la [Cola](/config/canales/cola)) y el estado de la **Conexión** (si se desconectó, el enlace para volver a conectar).

### Alertas del catálogo
No son de una cuenta en particular:
- **Productos con stock disponible y sin publicación activa en Mercado Libre**: mercadería parada. El número chico es **cuántos productos activos tienen stock disponible** (no el total del catálogo: los activos sin stock no cuentan). Cuenta los que no están publicados en **ninguna** cuenta; el detalle por cuenta está en la fila "Productos con stock sin publicar" de la tabla. Enlace: [Productos](/catalogo/productos) filtrado ("Con stock y sin publicación activa en ML").
- **Productos de la tienda web sin fotos**: publicados en la web (interruptor prendido), con precio en la tienda y ninguna foto. El número chico es **cuántos productos están publicados en la web**. Enlace: [Productos](/catalogo/productos) filtrado ("De la web, sin fotos").

## Cómo se hace

### Actualizar la reputación
El botón **"Actualizar reputación"** (arriba a la derecha) le pregunta a Mercado Libre. Además, al abrir el tablero se actualiza sola si la última lectura tiene más de una hora. Arriba dice cuándo se leyó.

### Resolver algo
Tocá el número: te lleva a la pantalla correspondiente con esa cuenta ya elegida. En Web y Otros, si el grupo tiene varios canales, el enlace lleva a la lista completa (sin filtrar por canal).

## Criterios y reglas

- **La fila con los nombres de las cuentas queda fija** arriba al bajar con la rueda, sólo en la PC (en el celular se mueve con la tabla).
- **Siempre entra en la pantalla**: la tabla se achica sola (letra más chica) lo justo para entrar en el ancho de la ventana, por ejemplo en 1920 × 1080 con muchas cuentas; nunca hace falta correrla de costado. Si agrandás la ventana, vuelve a su tamaño.
- **Todo, salvo la reputación, sale de lo que Laucen ya tiene guardado** (pedidos, envíos, preguntas, reclamos, publicaciones traídas); no llama a Mercado Libre. Si algo parece desactualizado, se trae desde su pantalla ("Traer preguntas ahora", "Traer reclamos de ML", "Traer publicaciones de ML").
- Cada número usa **la misma condición que la pantalla a la que enlaza**, para que coincidan.
- **Reclamos y entregas demoradas**: ML sólo informa cuántos y el porcentaje del período; Laucen no los recalcula. Para ver cuáles son, usá [Reclamos y devoluciones](/ventas/reclamos) y [Envíos](/ventas/envios).
- **Etiquetas**: los envíos de Full no tienen etiqueta para imprimir y no cuentan.
- **Con stock y sin publicación activa**: cuenta productos activos (y publicables: los marcados **No publicable** no cuentan) con stock disponible (un kit se calcula desde sus componentes) que no tienen ninguna publicación activa vinculada en ninguna cuenta de ML. Una publicación de ML sin vincular **no** cuenta como publicación del producto.
- **De la web sin fotos**: sólo productos activos que la tienda web muestra con precio (el precio que ve el cliente, que sale de la lista principal) y que no tienen ninguna foto.
- **Productos con stock sin publicar (fila de cada cuenta)**: productos activos con stock disponible que no tienen publicación activa en **esa** cuenta (pueden estar publicados en otra). La columna Total muestra los que no están en ninguna. Enlace: [Productos](/catalogo/productos) filtrado por esa cuenta.
- Sólo se muestran las cuentas conectadas a un canal.

## Preguntas frecuentes

**No veo una cuenta.**
Tiene que estar conectada a un canal de Mercado Libre: ver [Canales](/config/canales).

**La reputación dice "Sin leer todavía".**
Apretá "Actualizar reputación". Si sigue igual, la cuenta puede estar desconectada: mirá la fila "Conexión".

**Un número del tablero no coincide con el de la lista.**
Mirá si hay datos sin traer de Mercado Libre; si no, avisá, porque deberían coincidir.

## Relacionado

- [Canales](/config/canales)
- [Envíos](/ventas/envios)
- [Pedidos](/ventas/pedidos)
- [Preguntas y mensajes](/ventas/preguntas)
- [Reclamos y devoluciones](/ventas/reclamos)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Productos](/catalogo/productos)
