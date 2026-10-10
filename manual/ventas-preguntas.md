---
titulo: Preguntas y mensajes
menu: Ventas › Preguntas y mensajes
ruta: /ventas/preguntas
rutas: /ventas/preguntas
permiso: preguntas_ver
resumen: Las preguntas de los compradores en las publicaciones de Mercado Libre y los mensajes de posventa, de todas las cuentas en una bandeja; la IA propone la respuesta y vos la revisás y la mandás, o con el interruptor prendido la manda sola.
---

## Para qué sirve

Junta en una sola bandeja, de **todas las cuentas de Mercado Libre**:

- **Preguntas**: lo que preguntan los interesados en una publicación antes de comprar.
- **Mensajes**: la conversación de posventa con el comprador de una venta.

Para cada una, la **IA propone sola una respuesta** apenas entra (con los datos de la publicación, la ficha del producto y el stock; en los mensajes, con los datos del pedido y del envío); vos la revisás, la cambiás si hace falta y la mandás. **Con el interruptor "La IA contesta sola…" apagado, nada se contesta solo** (ver "Respuesta automática" más abajo). Si todavía no apareció (tarda unos segundos o, como mucho, hasta el próximo barrido de unos minutos), o querés otra, está el botón **"Proponer con IA"**.

## Cómo se llega

- Menú **Ventas › Preguntas y mensajes**.
- Contadores de la barra de estado: **"Preguntas"** (abre la pestaña Preguntas) y **"Mensajes"** (abre la pestaña Mensajes).
- La ventana que se abre sola cuando la IA no contesta una pregunta o un mensaje (le falta un dato o piden una persona), con el botón **"Ir a responder"**, si la tenés prendida en [Mis avisos](/config/avisos).
- La tarjeta **"Preguntas sin responder"** del [Panel](/panel).

## Qué hay en la pantalla

**Arriba a la derecha**: el interruptor **"La IA contesta sola las preguntas"** (en la pestaña Preguntas) o **"La IA contesta sola los mensajes"** (en la pestaña Mensajes), y en la pestaña Preguntas el botón **"Traer preguntas ahora"**.

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

**Respondidas** (las últimas 100, lo más reciente primero): la publicación, la pregunta, la respuesta en verde y "Respondió <nombre> · fecha" (si mandó exactamente lo que propuso la IA, sin cambiar nada, dice "Respondió <nombre> con la IA") (o "alguien desde Mercado Libre" si se contestó fuera de Laucen).

### Pestaña Mensajes

- **A la izquierda**, la lista de conversaciones (las que tienen mensajes sin leer primero, después por el último mensaje; hasta 100): el cliente (o "Pack …"), la marca **"N sin leer"**, la cuenta, el Nº de pedido, hace cuánto y el último mensaje.
- **Quién respondió**: debajo de cada mensaje de la tienda dice "Respondió <nombre>". Si mandó **exactamente** lo que había propuesto la IA, sin cambiar nada (ni una coma), dice "Respondió <nombre> con la IA"; si cambió algo, queda sólo el nombre. Igual en las preguntas.
- **A la derecha**, la conversación elegida: el comprador, la cuenta y el enlace **"Pedido N"** (o "Pack … (sin pedido en Laucen)"), el botón **"Actualizar"**, los mensajes (los de la tienda a la derecha, con **"Respondió <nombre>"** de quien lo mandó desde Laucen, o "Respondió alguien desde Mercado Libre" si se escribió fuera de Laucen; los del comprador a la izquierda) y abajo el cuadro **"Mensaje"** con **"Proponer con IA"** y **"Enviar"**.
- Sin conversación elegida: "Elegí una conversación para verla y contestar."

## Cómo se hace

### Responder una pregunta

1. En **Preguntas › Sin responder**, buscá la tarjeta.
2. La IA ya deja propuesta la respuesta en **"Respuesta"** (si no está, o querés otra, apretá **"Proponer con IA"**: al rato la pantalla vuelve con el texto y el aviso "La IA propuso una respuesta: revisala antes de mandarla.").
3. Leé y corregí el texto (o escribilo vos de cero).
4. Apretá **"Responder"**. La respuesta se manda a Mercado Libre y la pregunta pasa a **Respondidas**. Aviso: "Respuesta enviada."

Errores típicos: "La respuesta está vacía.", "Mercado Libre acepta hasta 2.000 caracteres.", "Esa pregunta ya no está pendiente (se respondió o se borró).", "La cuenta de Mercado Libre de esta pregunta ya no está conectada.", "Falta la llave de Claude: no se puede sugerir la respuesta.".

### Traer las preguntas en el momento

1. Apretá **"Traer preguntas ahora"**.
2. Laucen pide a Mercado Libre las preguntas sin responder de todas las cuentas conectadas y actualiza las que ya no están pendientes (respondidas desde Mercado Libre o borradas).
3. El aviso dice cuántas hay sin responder (y de qué cuentas no se pudo traer, si alguna falló).

### Contestar un mensaje de posventa

1. Andá a la pestaña **Mensajes** y elegí la conversación de la izquierda. Al abrirla, queda leída en Laucen.
2. La IA ya deja propuesta una respuesta con los datos del pedido y del envío; si no está o querés otra, apretá **"Proponer con IA"**.
3. Revisá o escribí el texto en **"Mensaje"** (hasta 350 caracteres; sin teléfonos, mails ni links).
4. Apretá **"Enviar"**. El mensaje sale a Mercado Libre, la conversación se vuelve a leer y queda marcada como leída también en Mercado Libre. Aviso: "Mensaje enviado."

### Ver lo último de una conversación

Apretá **"Actualizar"** en la conversación: la vuelve a leer entera desde Mercado Libre y la marca como leída allá.

## Criterios y reglas

- **Firma y reglas de cada cuenta**: cada canal de Mercado Libre puede tener su firma (va al final de cada respuesta, la proponga la IA o la escriba una persona, tal cual se escribió; si ya la tiene, no se repite; debajo del cuadro de la respuesta se ve cuál se va a agregar) y sus reglas para la IA (por ejemplo, «nunca sugerir abrir un reclamo»). Se cargan en «Textos de …» de [Canales](/config/canales).
- **Corte**: las preguntas hechas en Mercado Libre antes del momento de corte (la fecha y hora desde la que la empresa gestiona sus ventas en Laucen) y las conversaciones sin ningún mensaje posterior a ese momento no entran: quedan en el sistema que se usaba antes. Es el mismo corte de los pedidos (ver [Canales](/config/canales)).

- **Cómo entran**: Mercado Libre avisa cada pregunta y cada mensaje nuevo al instante, y además cada 30 minutos se revisan las preguntas pendientes por si se perdió algún aviso. Con **"Traer preguntas ahora"** se fuerza en el momento.
- **Sin responder** = preguntas que Mercado Libre tiene como no respondidas. Si alguien la contesta desde Mercado Libre, o el interesado la borra, sale de la lista cuando se actualiza.
- **Con el interruptor apagado, la IA no contesta sola**: propone sola el texto apenas entra la pregunta o el mensaje (una vez; si falla, reintenta cada 30 minutos como mucho), pero lo mandás vos. La propuesta queda guardada en el cuadro hasta que respondas. "Proponer con IA" arma otra a pedido.
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
Sólo si está prendido el interruptor "La IA contesta sola las preguntas" (ver "Respuesta automática"). Apagado, propone un texto (solo, o cuando apretás "Proponer con IA") y lo mandás vos con "Responder".

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

## Respuesta automática

Hay **dos interruptores, uno para preguntas y otro para mensajes**, arriba a la derecha de cada pestaña. Valen para **todas las cuentas** de Mercado Libre a la vez. Vienen apagados.

- **Apagado**: la IA sólo propone la respuesta; la mandás vos.
- **Prendido**: cuando entra una pregunta o un mensaje, la IA arma la respuesta y **la manda sola** a Mercado Libre, sin que nadie la apruebe. En el historial queda **"Respondió la IA sola"**.

La IA **no** manda sola (deja la respuesta escrita para que la revises vos) cuando:
- **El comprador pide hablar con una persona** (con un humano, con alguien de la tienda, o dice que no quiere que le conteste un robot). En la pregunta aparece la marca **"Pide hablar con una persona"**. En un mensaje, la conversación queda marcada **"Pidió hablar con una persona: la IA no contesta más sola"** y desde ahí **la IA no vuelve a contestar sola esa conversación**, aunque el comprador escriba de nuevo; la contestás vos.
- **Le falta un dato** para contestar bien (algo que no está en la publicación, la ficha, el stock o el pedido). Aparece **"La IA no la mandó sola: le falta un dato"**.
- En mensajes, además: sólo contesta si el último mensaje es del comprador y es de los últimos 3 días.

Al **prender** un interruptor, lo que está pendiente (preguntas sin responder, o conversaciones con mensajes sin leer) se vuelve a pasar por la IA, y en unos minutos (en el próximo barrido) se contesta lo que la IA puede contestar. Abrir una conversación en Laucen la da por leída: si la abrís, esa ya no la contesta la IA sola hasta que el comprador escriba de nuevo.

