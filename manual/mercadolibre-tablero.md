---
titulo: Tablero de Mercado Libre
menu: Mercado Libre
ruta: /mercadolibre
rutas: /mercadolibre
permiso: tablero_ml_ver
resumen: Todas las cuentas de Mercado Libre en una pantalla: reputación con los colores de ML, publicaciones, lo que hay para atender hoy (etiquetas, pedidos, preguntas, mensajes, reclamos, devoluciones) y las alertas del catálogo.
---

## Para qué sirve

Para ver de un vistazo cómo está cada cuenta de Mercado Libre y qué hay que hacer hoy, sin entrar cuenta por cuenta. Es una tabla con **una columna por cuenta** (con el apodo de ML y la razón social con la que factura), más dos columnas para lo que no es de Mercado Libre —**Web** (la tienda web, minorista y mayorista) y **Otros** (el local, los pedidos manuales y cualquier otro canal)— y una columna **Total**. En Web y Otros se ven los pedidos, envíos, reclamos, devoluciones y ventas de esos canales; lo propio de Mercado Libre (reputación, publicaciones, preguntas, mensajes, cola y conexión) figura con una raya. Casi cada número es un **enlace** a la pantalla donde se resuelve, ya filtrada por esa cuenta.

## Cómo se llega

Menú **Mercado Libre** (arriba, al lado de Panel). Sólo lo ve quien tiene el permiso «Tablero de Mercado Libre».

## Qué hay en la pantalla

Pasando el mouse por el ⓘ de cada fila se lee qué cuenta. Cada número en grande es lo que **hay para atender** (en rojo si es mayor que cero, en verde si es cero) y el chico, "de N", es el **total** de esa clase.

### Reputación
Lo que informa Mercado Libre; cada dato cuenta el período que se muestra al lado (por ejemplo "60 días").
- **Color de la reputación**: el termómetro de cinco colores de ML (rojo, naranja, amarillo, verde claro y verde) con el color actual resaltado, y si la cuenta es **MercadoLíder** (y de qué nivel). Una cuenta nueva figura "Sin reputación todavía".
- **Reclamos que afectan la reputación**: cuántos y qué porcentaje de las ventas, en el período que cuenta ML.
- **Entregas demoradas**: despachos hechos fuera del plazo de manipulación, en el período que cuenta ML.
- **Cancelaciones**, **Ventas completadas** y **Calificaciones positivas**.

### Publicaciones
- **Activas** (de las totales), **Pausadas**.
- **Con cuestiones para resolver**: en revisión, inactivas o con el pago pendiente; ML las frena hasta que se corrija algo.
- **Sin producto asociado**: publicaciones de ML que todavía no están vinculadas a un producto de Laucen (con la cantidad de activas). Enlace: [Vincular con Mercado Libre](/catalogo/publicaciones/ml).

### Para hacer hoy
- **Etiquetas para imprimir**: envíos por despachar con la etiqueta sin imprimir (de los envíos por despachar), y cuántos son para hoy o están vencidos. Enlace: [Envíos](/ventas/envios).
- **Pedidos para preparar**: los pendientes de [Pedidos](/ventas/pedidos), sin los carritos que todavía esperan. 
- **Pedidos en camino**: envíos despachados que todavía no se entregaron.
- **Preguntas para responder** (y cuánto hace de la más vieja) y **Mensajes para responder** (conversaciones con mensajes sin leer). Enlace: [Preguntas y mensajes](/ventas/preguntas).
- **Reclamos para atender**: los abiertos, con cuántos esperan tu respuesta, cuántos vencen en 24 horas y cuántos están en mediación. Enlace: [Reclamos y devoluciones](/ventas/reclamos).
- **Devoluciones**: las abiertas y cuántas vienen en camino.

### Movimiento y salud de la cuenta
**Ventas de hoy** y **de los últimos 7 días** (cantidad e importe), **Cola de Mercado Libre con error** (cambios que Laucen quiso mandar a ML y no pudo; enlace a la [Cola](/config/canales/cola)) y el estado de la **Conexión** (si se desconectó, el enlace para volver a conectar).

### Alertas del catálogo
No son de una cuenta en particular:
- **Productos con stock disponible y sin publicación activa en Mercado Libre**: mercadería parada. Enlace: [Productos](/catalogo/productos) filtrado ("Con stock y sin publicación activa en ML").
- **Productos de la tienda web sin fotos**: activos, con precio en la tienda y ninguna foto. Enlace: [Productos](/catalogo/productos) filtrado ("De la web, sin fotos").

## Cómo se hace

### Actualizar la reputación
El botón **"Actualizar reputación"** (arriba a la derecha) le pregunta a Mercado Libre. Además, al abrir el tablero se actualiza sola si la última lectura tiene más de una hora. Arriba dice cuándo se leyó.

### Resolver algo
Tocá el número: te lleva a la pantalla correspondiente con esa cuenta ya elegida. En Web y Otros, si el grupo tiene varios canales, el enlace lleva a la lista completa (sin filtrar por canal).

## Criterios y reglas

- **Todo, salvo la reputación, sale de lo que Laucen ya tiene guardado** (pedidos, envíos, preguntas, reclamos, publicaciones traídas); no llama a Mercado Libre. Si algo parece desactualizado, se trae desde su pantalla ("Traer preguntas ahora", "Traer reclamos de ML", "Traer publicaciones de ML").
- Cada número usa **la misma condición que la pantalla a la que enlaza**, para que coincidan.
- **Reclamos y entregas demoradas**: ML sólo informa cuántos y el porcentaje del período; Laucen no los recalcula. Para ver cuáles son, usá [Reclamos y devoluciones](/ventas/reclamos) y [Envíos](/ventas/envios).
- **Etiquetas**: los envíos de Full no tienen etiqueta para imprimir y no cuentan.
- **Con stock y sin publicación activa**: cuenta productos activos con stock disponible (un kit se calcula desde sus componentes) que no tienen ninguna publicación activa vinculada en ninguna cuenta de ML. Una publicación de ML sin vincular **no** cuenta como publicación del producto.
- **De la web sin fotos**: sólo productos activos que tienen precio en la lista de un canal web activo.
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
