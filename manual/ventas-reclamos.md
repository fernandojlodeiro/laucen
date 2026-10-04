---
titulo: Reclamos y devoluciones
menu: Ventas › Reclamos y devoluciones
ruta: /ventas/reclamos
rutas: /ventas/reclamos, /ventas/reclamos/[id], /ventas/reclamos/ml/[claim]
permiso: reclamos_ver
resumen: Los reclamos de Mercado Libre (entran solos, con su plazo para responder y las acciones que ofrece ML) y los de la web o el local (se cargan a mano), con su conversación, historia y la recepción de la devolución.
---

## Para qué sirve

Junta todos los **reclamos y devoluciones** de las ventas:

- Los de **Mercado Libre** entran solos, con el **plazo para responder** y los botones de lo que Mercado Libre te deja hacer en ese momento (mandar un mensaje, devolver la plata, aceptar la devolución, pedir mediación). Cada botón es un clic tuyo que sale por la cola de Mercado Libre: **nada se contesta solo**.
- Los de la **web o el local** se cargan a mano con **"Nuevo reclamo"** y se manejan acá (estado, reembolso anotado, notas).

En los dos casos, cuando el producto vuelve, **"Recibir devolución"** abre la recepción en el depósito.

## Cómo se llega

- Menú **Ventas › Reclamos y devoluciones**.
- La tarjeta **"Reclamos y devoluciones"** del [Panel](/panel) (sus renglones abren la lista o las pestañas En mediación y Devoluciones en camino).
- Desde la [Cola de Mercado Libre](/config/canales/cola): las acciones de un reclamo enlazan a su ficha (por la dirección `/ventas/reclamos/ml/<número de reclamo de ML>`, que lleva directo a la ficha del reclamo en Laucen).

## Qué hay en la pantalla

### La lista ([Reclamos y devoluciones](/ventas/reclamos))

**Arriba a la derecha**: **"Traer reclamos de ML"** (sólo si hay una cuenta de Mercado Libre conectada), el desplegable de columnas del Excel, **"⬇ Descargar Excel"**, **"⚙ Configurar…"** y **"+ Nuevo reclamo"**.

**Pestañas** (con su cantidad):

| Pestaña | Qué muestra |
|---|---|
| **Abiertos** (la de entrada) | no resueltos, que no están en mediación ni con la devolución en camino |
| **En mediación** | no resueltos en la etapa de mediación de Mercado Libre |
| **Devoluciones en camino** | no resueltos con el producto volviendo (etiqueta generada, lista para despachar o en camino) |
| **Cerrados** | resueltos |

**Filtros** (aplican al momento): **"Buscar"** ("Nº de pedido, orden de ML o comprador"; busca también por Nº de reclamo), **"Canal / cuenta"**, **"Motivo"** y **"Fechas"** (con atajos o "Todas las fechas"). **"Limpiar filtros"** cuando hay alguno.

**Columnas de pantalla**:

| Columna | Qué muestra |
|---|---|
| **Nº** | número del reclamo en Laucen (enlace a la ficha) |
| **Para responder** | "Quedan 5 h", "Quedan 3 días" o "Venció hace 2 h"; "Espera tu respuesta" si no tiene plazo; "—" si está resuelto |
| **Fecha** | fecha y hora del reclamo |
| **Canal / cuenta** | la cuenta o canal |
| **Pedido** | Nº de pedido (enlace); si la orden de ML no tiene pedido en Laucen, el número de la orden en gris |
| **Comprador** | el cliente (enlace) o "Usuario ML …" |
| **Tipo** | Reclamo, Devolución, Cancelación, Mediación, Cambio |
| **Motivo** | |
| **Etapa** | (ML) Reclamo (entre vos y el comprador), Mediación de Mercado Libre, Recontacto, Sin movimiento |
| **Estado** | Abierto, En proceso, Resuelto |
| **Devolución** | estado del envío de vuelta (Pendiente, Etiqueta generada, En camino, Entregada a vos…) |
| **Monto** | |

Otras columnas para el Excel: Vence (crudo), Espera tu respuesta, Origen, Orden de ML, Nº de cliente, Devuelto $, Resolución, Id del reclamo (ML).

Las filas que esperan tu respuesta y vencen en menos de 24 horas se pintan de **rojo claro**.

### El alta "Nuevo reclamo" (web o local)

Con **"+ Nuevo reclamo"**:
- **"Nº de pedido (de la web o el local)"** (el de Laucen o el de la tienda), **"…o Nº de cliente (si no hay pedido)"**, **"Origen (si no hay pedido)"** (Web / Local).
- **"Tipo"** (Reclamo de entrada), **"Motivo"** (obligatorio, por ejemplo "llegó roto"), **"Monto reclamado $ (vacío = el total del pedido)"**, **"Notas"**.
- Botón **"Crear"**. Debajo: "Los reclamos de Mercado Libre no se cargan acá: entran solos."

### La ficha del reclamo

Título "Reclamo N"; debajo el origen, la cuenta y el número de reclamo de ML. Arriba a la derecha: **"Actualizar desde ML"** (reclamos de Mercado Libre) o el **lápiz** (reclamos de la web o el local).

Si Mercado Libre espera tu respuesta, arriba aparece el cartel **"Mercado Libre espera tu respuesta · Quedan … (vence …)"** (en rojo si quedan menos de 24 horas o ya venció).

**Columna izquierda**:
- **"Datos"**: Pedido (enlace), Comprador o Cliente, Estado, Tipo, Motivo, Etapa (ML), Fecha, Para responder (ML), Monto, Devuelto (web/local), Resolución y Notas (web/local). En los de ML, además, **"Qué pide cada parte"** (por ejemplo "El comprador: Que le devuelvan el dinero (pendiente)").
- **"Productos (N)"**: las líneas del pedido de esa orden (en un carrito de ML, sólo las de esa orden): SKU (enlace y 📷), Producto, Cantidad, Precio.
- **"Conversación (N)"**: los mensajes del comprador, los de la tienda (con **"Respondió <nombre>"**: quién lo mandó desde Laucen; "Respondió alguien desde Mercado Libre" si se escribió fuera de Laucen), los de Mercado Libre y las notas internas (con quién las anotó), con fecha. En **"Historia"** cada acción mandada también dice quién la mandó. Abajo, **"Nota interna"** y **"Anotar nota"**.

**Columna derecha**:
- Reclamos de Mercado Libre: **"Qué podés hacer (N)"** con un botón por cada acción que ofrece Mercado Libre ahora, con su plazo ("Obligatoria · Quedan …" o "Sin plazo"), y debajo **"Mandado a Mercado Libre"** con lo que salió por la cola y su estado.
- Reclamos de la web o el local: **"Estado y reembolso"** con los botones **"Volver a abrir"**, **"Pasar a en proceso"**, **"Marcar resuelto"** (los que no son el estado actual) y **"Reembolso $ (sólo se anota)"** con **"Anotar reembolso"**.
- **"Devolución"**: el botón **"Recibir devolución"** (o **"Ver recepción N"** si ya se abrió), el envío de vuelta y su seguimiento (ML) y la recepción en el depósito.
- **"Historia (N)"**: todo lo que pasó (alta, cambios de etapa y estado, acciones mandadas, resultados, devolución, reembolsos), lo más nuevo arriba.

## Cómo se hace

### Atender un reclamo de Mercado Libre

1. En **Abiertos**, los que esperan tu respuesta están primero, ordenados por vencimiento.
2. Abrí la ficha. Leé **"Datos"**, **"Qué pide cada parte"** y la **"Conversación"**.
3. En **"Qué podés hacer"**, elegí la acción:
   - **"Mandar mensaje al comprador"**: escribí el mensaje (hasta 2.000 caracteres) y apretá el botón.
   - **"Mandar mensaje a Mercado Libre"**: para el mediador, en mediación.
   - **"Devolver el dinero (total)"**: Mercado Libre le devuelve todo lo que pagó y el reclamo se cierra.
   - **"Devolver parte del dinero"**: poné el **"Porcentaje a devolver"** (de 1 a 99) y el comprador se queda con el producto.
   - **"Aceptar la devolución"**: el comprador manda el producto con la etiqueta de Mercado Libre y después se le devuelve la plata.
   - **"Pedir que intervenga Mercado Libre"**: abre la mediación.
4. Las que mueven plata o abren mediación preguntan ahí mismo "¿…? Va a Mercado Libre." con **"Sí"** / **"No"**.
5. Aviso: "En la cola para Mercado Libre: … Sale en un momento; el resultado queda en la historia del reclamo." El estado se ve en **"Mandado a Mercado Libre"** y en la **"Historia"**.

Las acciones que Mercado Libre ofrece pero Laucen todavía no hace (mandar archivos, cargar prueba del envío, informar el envío o el número de seguimiento, generar la etiqueta de devolución) se ven deshabilitadas con "Próximamente desde Laucen: por ahora, desde Mercado Libre."

### Ver lo último de un reclamo de Mercado Libre

Apretá **"Actualizar desde ML"** (en la ficha) o **"Traer reclamos de ML"** (en la lista, para todos). Sólo leen: no cambian nada en Mercado Libre. "Traer reclamos de ML" revisa todas las cuentas a la vez; si alguna no se pudo traer (o algún reclamo puntual), el aviso dice cuál y por qué (por ejemplo "ML no da permiso de reclamos a esta cuenta" o "la cuenta está desconectada"), y lo de las demás cuentas entra igual.

### Cargar un reclamo de la web o el local

1. **"+ Nuevo reclamo"**.
2. Poné el **Nº de pedido** (de Laucen o de la tienda). Si no hay pedido, poné el **Nº de cliente** y el **"Origen"**.
3. Elegí el **"Tipo"**, escribí el **"Motivo"** y, si querés, el **"Monto reclamado"** (vacío = el total del pedido) y **"Notas"**.
4. **"Crear"**: vas a la ficha del reclamo nuevo.

Errores típicos: "No hay ningún pedido con el número …", "Los reclamos de Mercado Libre entran solos: no se cargan a mano.", "Elegí el pedido o el cliente del reclamo.", "Poné el motivo del reclamo.".

### Manejar un reclamo de la web o el local

1. **Cambiar el estado**: en **"Estado y reembolso"**, **"Pasar a en proceso"**, **"Marcar resuelto"** o **"Volver a abrir"**.
2. **Anotar lo devuelto**: escribí el importe en **"Reembolso $ (sólo se anota)"** y **"Anotar reembolso"** (se suma a lo ya anotado; no mueve plata).
3. **Corregir los datos**: lápiz arriba a la derecha → Estado, Tipo, Motivo, Monto reclamado, Notas → **"Grabar"** (o **"Cancelar"**).

### Dejar una nota interna

En **"Conversación"**, escribí en **"Nota interna"** y apretá **"Anotar nota"**. Sólo se ve en Laucen (al comprador de Mercado Libre se le escribe con "Mandar mensaje al comprador").

### Recibir el producto devuelto

1. En la ficha, bloque **"Devolución"**, apretá **"Recibir devolución"**.
2. Se abre la recepción de devolución del pedido en [Recepción](/deposito/recepcion): ahí se escanea lo que vuelve y se elige si entra como nuevo o caja abierta.
3. El reclamo queda enlazado ("Ver recepción N"). Al **cerrar** esa recepción, el pedido pasa a **Devuelto**.

## Criterios y reglas

- **Cómo entran los de Mercado Libre**: al instante, por el aviso de Mercado Libre, y además cada 30 minutos se revisan todos los abiertos y los últimos cerrados (sólo se vuelven a traer los que cambiaron, y los que en Laucen siguen abiertos pero Mercado Libre ya no lista como abiertos). "Traer reclamos de ML" y "Actualizar desde ML" lo hacen en el momento. **Todo eso sólo lee** de Mercado Libre.
- **Estado de un reclamo de Mercado Libre**: Abierto mientras está abierto en Mercado Libre; Resuelto cuando Mercado Libre lo cierra (con su resolución, por ejemplo "Se devolvió el dinero", y a favor de quién). Los de la web o el local además pueden estar **En proceso**.
- **"Espera tu respuesta"**: un reclamo de Mercado Libre abierto con alguna acción **obligatoria** para vos.
- **Plazo ("Para responder")**: la fecha límite de la primera acción obligatoria (o, si no hay obligatorias, la primera con fecha). Se muestra "Quedan …" en rojo si faltan menos de 24 h, en amarillo si faltan menos de 72 h; "Venció hace …" en rojo si ya pasó. Hasta 48 horas se cuenta en horas, después en días.
- **Orden de Abiertos, En mediación y Devoluciones en camino**: primero los que esperan tu respuesta, por vencimiento (el más próximo arriba); después por fecha, lo más nuevo primero. **Cerrados**: por la última actualización, lo más reciente primero.
- **Botones de Mercado Libre**: salen de lo que Mercado Libre ofrece **en ese momento** para ese reclamo. Antes de mandar, Laucen verifica que Mercado Libre la siga ofreciendo (si no: "Mercado Libre no ofrece «…» en este reclamo ahora. Tocá «Actualizar» para ver lo que se puede hacer.").
- **Todo cambio en Mercado Libre es un clic tuyo** y sale por la [Cola de Mercado Libre](/config/canales/cola), con prioridad de botón (sale enseguida). Queda registrado qué se mandó, cuándo y con qué resultado.
- **Una sola vez**: una acción que no es un mensaje (devolver, aceptar devolución, mediación) se saca de los botones apenas se manda, hasta que se vuelva a leer el reclamo. Dos clics iguales seguidos no se duplican ("Eso ya está en la cola: sale en un momento.").
- **Mensajes en un reclamo**: hasta 2.000 caracteres.
- **Devolución parcial**: porcentaje entero entre 1 y 99.
- **Reclamos de la web o el local**: si se cargan con pedido, toman el canal, el cliente y el origen del pedido (local si el canal es el local; si no, web), y el monto es el total del pedido salvo que pongas otro. El reembolso **sólo se anota**: no mueve plata ni genera nota de crédito.
- **"Recibir devolución"**: usa la recepción de devolución abierta de ese pedido si ya hay una; si no, abre una nueva en el depósito del pedido (o en el primer depósito propio o tercerizado activo). Hace falta que el reclamo tenga un pedido de Laucen.
- **Pedido Devuelto**: el pedido pasa a Devuelto al cerrar la recepción de la devolución.
- **Panel**: "Reclamos por responder" cuenta los de Mercado Libre que esperan tu respuesta más los de la web o el local en estado Abierto.

## Preguntas frecuentes

**¿Tengo que cargar los reclamos de Mercado Libre?**
No: entran solos. "Nuevo reclamo" es sólo para la web o el local.

**¿Laucen le contesta solo al comprador?**
No. Cada acción es un botón que apretás vos.

**No aparece el botón que necesito.**
Mercado Libre no lo ofrece en este momento para ese reclamo, o ya lo mandaste. Tocá "Actualizar desde ML". Si se ve deshabilitado con "Próximamente desde Laucen", hacelo desde Mercado Libre.

**Mandé "Devolver el dinero" y el reclamo sigue abierto.**
Salió por la cola; el cambio se ve cuando se vuelve a leer el reclamo (al rato solo, o con "Actualizar desde ML"). El resultado queda en la "Historia".

**¿Qué significa "Venció hace …"?**
Que pasó el plazo de Mercado Libre para responder. Conviene actuar cuanto antes.

**Anoté un reembolso, ¿se le devolvió la plata al cliente?**
No: sólo queda anotado. La devolución de plata se hace por fuera.

**¿Cómo entra al stock lo que devuelven?**
Con "Recibir devolución": se abre la recepción en el depósito, donde se escanea lo que vuelve.

**¿Las notas internas las ve el comprador?**
No, sólo se ven en Laucen.

## Relacionado

- [Pedidos](/ventas/pedidos)
- [Recepción](/deposito/recepcion)
- [Preguntas y mensajes](/ventas/preguntas)
- [Cola de Mercado Libre](/config/canales/cola)
- [Clientes](/ventas/clientes)
- [Panel](/panel)
