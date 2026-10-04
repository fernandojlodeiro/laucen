---
titulo: Preguntas y mensajes
menu: Ventas › Preguntas y mensajes
ruta: /ventas/preguntas
rutas: /ventas/preguntas
permiso: preguntas_ver
resumen: Las preguntas de los compradores en las publicaciones de Mercado Libre y los mensajes de posventa, de todas las cuentas en una bandeja; la IA propone la respuesta y vos la revisás y la mandás.
---

## Para qué sirve

Junta en una sola bandeja, de **todas las cuentas de Mercado Libre**:

- **Preguntas**: lo que preguntan los interesados en una publicación antes de comprar.
- **Mensajes**: la conversación de posventa con el comprador de una venta.

Para cada una, la **IA puede proponer una respuesta** con los datos de la publicación, la ficha del producto y el stock; vos la revisás, la cambiás si hace falta y la mandás. **Nada se contesta solo.**

## Cómo se llega

- Menú **Ventas › Preguntas y mensajes**.
- Contadores de la barra de estado: **"Preguntas sin responder"** (abre la pestaña Preguntas) y **"Mensajes sin leer"** (abre la pestaña Mensajes).
- La tarjeta **"Preguntas sin responder"** del [Panel](/panel).

## Qué hay en la pantalla

**Arriba a la derecha** (en la pestaña Preguntas): **"Traer preguntas ahora"**.

**Pestañas principales**:
- **"Preguntas (N)"**: N = preguntas sin responder.
- **"Mensajes (N)"**: N = conversaciones con mensajes sin leer.

### Pestaña Preguntas

Dos pestañas chicas: **"Sin responder (N)"** y **"Respondidas (N)"**.

**Sin responder** (las más viejas primero, hasta 200). Cada pregunta es una tarjeta con:
- Desde el [Tablero de Mercado Libre](/mercadolibre) se llega con una cuenta ya elegida (la dirección lleva el filtro de esa cuenta): se ven sólo sus preguntas y mensajes.
- La **publicación**: foto, título, la cuenta (canal), el número de publicación (enlace "↗" que abre la publicación en Mercado Libre) y **"Stock del canal: N"** (o "Sin vincular a un producto" si la publicación no está atada a un producto de Laucen).
- Hace cuánto llegó ("recién", "hace 5 min", "hace 3 h", "hace 2 días"; con el mouse encima, la fecha y hora).
- El texto de la pregunta.
- El cuadro **"Respuesta"** (si la IA ya propuso una, viene escrita y la etiqueta dice "(la propuso la IA: revisala)").
- Los botones **"Proponer con IA"** y **"Responder"**.

**Respondidas** (las últimas 100, lo más reciente primero): la publicación, la pregunta, la respuesta en verde y "Respondió <nombre> · fecha" (o "alguien desde Mercado Libre" si se contestó fuera de Laucen).

### Pestaña Mensajes

- **A la izquierda**, la lista de conversaciones (las que tienen mensajes sin leer primero, después por el último mensaje; hasta 100): el cliente (o "Pack …"), la marca **"N sin leer"**, la cuenta, el Nº de pedido, hace cuánto y el último mensaje.
- **A la derecha**, la conversación elegida: el comprador, la cuenta y el enlace **"Pedido N"** (o "Pack … (sin pedido en Laucen)"), el botón **"Actualizar"**, los mensajes (los de la tienda a la derecha, con **"Respondió <nombre>"** de quien lo mandó desde Laucen, o "Respondió alguien desde Mercado Libre" si se escribió fuera de Laucen; los del comprador a la izquierda) y abajo el cuadro **"Mensaje"** con **"Proponer con IA"** y **"Enviar"**.
- Sin conversación elegida: "Elegí una conversación para verla y contestar."

## Cómo se hace

### Responder una pregunta

1. En **Preguntas › Sin responder**, buscá la tarjeta.
2. Si querés que la IA arme la respuesta, apretá **"Proponer con IA"**. Al rato la pantalla vuelve con el texto escrito en **"Respuesta"** y el aviso "La IA propuso una respuesta: revisala antes de mandarla."
3. Leé y corregí el texto (o escribilo vos de cero).
4. Apretá **"Responder"**. La respuesta se manda a Mercado Libre y la pregunta pasa a **Respondidas**. Aviso: "Respuesta enviada."

Errores típicos: "La respuesta está vacía.", "Mercado Libre acepta hasta 2.000 caracteres.", "Esa pregunta ya no está pendiente (se respondió o se borró).", "La cuenta de Mercado Libre de esta pregunta ya no está conectada.", "Falta la llave de Claude: no se puede sugerir la respuesta.".

### Traer las preguntas en el momento

1. Apretá **"Traer preguntas ahora"**.
2. Laucen pide a Mercado Libre las preguntas sin responder de todas las cuentas conectadas y actualiza las que ya no están pendientes (respondidas desde Mercado Libre o borradas).
3. El aviso dice cuántas hay sin responder (y de qué cuentas no se pudo traer, si alguna falló).

### Contestar un mensaje de posventa

1. Andá a la pestaña **Mensajes** y elegí la conversación de la izquierda. Al abrirla, queda leída en Laucen.
2. Si querés, apretá **"Proponer con IA"**: la IA arma una respuesta con los datos del pedido y del envío.
3. Revisá o escribí el texto en **"Mensaje"** (hasta 350 caracteres; sin teléfonos, mails ni links).
4. Apretá **"Enviar"**. El mensaje sale a Mercado Libre, la conversación se vuelve a leer y queda marcada como leída también en Mercado Libre. Aviso: "Mensaje enviado."

### Ver lo último de una conversación

Apretá **"Actualizar"** en la conversación: la vuelve a leer entera desde Mercado Libre y la marca como leída allá.

## Criterios y reglas

- **Corte**: las preguntas hechas en Mercado Libre antes de las 21:35 del 3/10 y las conversaciones sin ningún mensaje posterior a esa hora no entran (están en Virtual Seller). Es el mismo corte de los pedidos.

- **Cómo entran**: Mercado Libre avisa cada pregunta y cada mensaje nuevo al instante, y además cada 30 minutos se revisan las preguntas pendientes por si se perdió algún aviso. Con **"Traer preguntas ahora"** se fuerza en el momento.
- **Sin responder** = preguntas que Mercado Libre tiene como no respondidas. Si alguien la contesta desde Mercado Libre, o el interesado la borra, sale de la lista cuando se actualiza.
- **La IA nunca contesta sola**: sólo propone cuando apretás "Proponer con IA". La propuesta queda guardada en el cuadro hasta que respondas.
- **Qué sabe la IA para una pregunta**: el título, precio, stock en Mercado Libre, estado, si tiene envío gratis o es Full, los atributos, las variaciones y la descripción de la publicación; la ficha del producto en Laucen (descripción, marca, medidas, peso, atributos) y el **stock disponible del canal**; y las últimas 8 preguntas ya respondidas de esa misma publicación.
- **Cómo escribe la IA una respuesta a una pregunta**: castellano rioplatense, cordial y breve (1 a 3 oraciones, nunca más de 600 caracteres), empieza con "Hola" y termina con un saludo corto. Respeta las reglas de Mercado Libre: nada de teléfonos, mails, direcciones, links, redes ni nombres de otras tiendas, y no invita a comprar por fuera. Usa sólo los datos que tiene: si un dato no está, no lo inventa (dice que lo consulta o sugiere ver la descripción); si preguntan por stock usa el disponible; si preguntan por envío dice lo que figura sin prometer fechas.
- **Mensajes de posventa con IA**: usa el estado del pedido, sus líneas y el envío (estado, logística, tracking, entrega estimada) y la conversación. Hasta 350 caracteres (el límite de Mercado Libre), 1 a 4 oraciones, sin teléfonos, mails, links ni redes, sin arreglos por fuera de Mercado Libre y sin prometer fechas que no figuran; si el comprador reclama, primero empatía y una solución concreta.
- **Límites**: una respuesta a una pregunta, hasta 2.000 caracteres; un mensaje de posventa, hasta 350.
- **"Stock del canal"**: lo disponible para ese canal según Laucen (nunca menos de 0). Si la publicación no está vinculada a un producto, no se puede calcular.
- **Leído / sin leer**: abrir una conversación en Laucen la marca leída **en Laucen**. En Mercado Libre se marca leída al contestar o al tocar "Actualizar".
- **Quién respondió**: queda guardado el usuario de Laucen que mandó la respuesta.
- Responder una pregunta o mandar un mensaje es una acción tuya con un clic: no pasa por la cola de cambios de Mercado Libre.

## Preguntas frecuentes

**¿La IA contesta sola las preguntas?**
No. Sólo propone un texto cuando apretás "Proponer con IA"; lo mandás vos con "Responder".

**La IA dijo algo que no es cierto.**
Corregí el texto antes de responder. La IA usa sólo los datos de la publicación y de la ficha: si la ficha está incompleta o mal, conviene corregirla.

**Respondí desde la app de Mercado Libre y la pregunta sigue en "Sin responder".**
Apretá "Traer preguntas ahora": la actualiza y pasa a Respondidas.

**¿Por qué dice "Sin vincular a un producto"?**
La publicación no está atada a un producto de Laucen; vinculala en [Vincular con Mercado Libre](/catalogo/publicaciones/ml) para ver el stock y para que la IA tenga la ficha.

**¿Puedo mandar mi teléfono o mail en un mensaje?**
No: Mercado Libre no lo permite y la propia pantalla lo recuerda.

**¿Por qué mi mensaje no salió?**
Puede superar los 350 caracteres, estar vacío o la cuenta de Mercado Libre estar desconectada; el aviso rojo dice cuál.

**¿Qué es el "Pack" de una conversación?**
El número de la venta (o del carrito) en Mercado Libre. Si dice "sin pedido en Laucen", esa venta todavía no entró como pedido.

## Relacionado

- [Pedidos](/ventas/pedidos)
- [Reclamos y devoluciones](/ventas/reclamos)
- [Publicaciones](/catalogo/publicaciones)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Canales](/config/canales)
- [Panel](/panel)
