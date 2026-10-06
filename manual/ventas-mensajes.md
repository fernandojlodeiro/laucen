---
titulo: WhatsApp
menu: Ventas › WhatsApp
ruta: /ventas/mensajes
rutas: /ventas/mensajes, /ventas/mensajes/probar, /ventas/mensajes/configuracion
permiso: mensajes_ver
resumen: La carpeta de mensajes de WhatsApp de los clientes, tipo WhatsApp Web: los contesta sola la IA de la tienda y, lo que no sabe, queda en espera para una persona. Probar la IA, conectar el número y configurarla.
---

## Para qué sirve

Los clientes le escriben al WhatsApp del negocio y les contesta sola una IA (de fábrica se llama Estela), a cualquier hora. Sabe los productos, precios y stock de la tienda web, los envíos y medios de pago, lo que le escribas en "Lo que sabe para los clientes" y el estado de los pedidos de ese cliente. Lo que no puede resolver (un reclamo, una devolución, un precio especial, o si piden hablar con una persona) lo deja **En espera** para que lo atienda alguien, y sigue contestando lo demás.

El número sigue andando en el teléfono (coexistencia): lo que contesten desde el teléfono también aparece acá.

## Cómo se llega

Menú **Ventas › WhatsApp** ([WhatsApp](/ventas/mensajes)). Tiene tres pestañas:
- **Chats**: la carpeta de mensajes.
- **Probar la IA** ([Probar la IA](/ventas/mensajes/probar)): chatear con la IA como si fueras un cliente.
- **Configuración** ([Configuración de WhatsApp](/ventas/mensajes/configuracion)): conectar el número y configurar la IA. Pide el permiso «Configurar los mensajes».

## Qué hay en la pantalla

**Chats**: a la izquierda la lista de chats, del más nuevo al más viejo, con un buscador (por nombre del chat o del cliente, teléfono —con o sin guiones o espacios— o notas) y las pestañas **Todos**, **Sin responder** (el último mensaje es del cliente), **En espera** (tienen algo que la IA pasó a una persona) y **Con persona** (la IA de ese chat está apagada). A la derecha, el chat abierto:
- Arriba: el nombre (si es un cliente cargado, es un enlace a su ficha), el teléfono, **📝 Notas** (notas internas que el cliente no ve) y el **interruptor de la IA de ese chat**.
- Los casos **En espera**, con su motivo y el botón **"Resolver"**.
- Los mensajes: los del cliente a la izquierda; los nuestros a la derecha, marcados 🤖 (la IA), con el nombre de quien lo mandó desde el panel, o 📱 Desde el teléfono. ✓ enviado, ✓✓ entregado, ✓✓ celeste leído; **NO ENTREGADO** con el motivo.
- Abajo: el cuadro para escribir y **"Enviar"** (Enter envía; Mayúscula+Enter, renglón nuevo).

La pantalla se actualiza sola cada pocos segundos.

**Probar la IA**: un chat con aspecto de WhatsApp donde vos sos el cliente. Contesta igual que por WhatsApp, pero no se manda nada. Debajo de cada respuesta muestra lo que costó. **"Empezar de nuevo"** borra la prueba (pregunta Sí/No).

**Configuración**: el número conectado (**"Conectar WhatsApp"**, **"Volver a conectar"**, **"Desconectar"**), el interruptor de la IA para todos los chats, y la ficha de la IA: Nombre, Tope por mes (US$), Respuestas por hora y chat, Espera (segundos), Marca del teléfono y Lo que sabe para los clientes. Se edita con el lápiz y se graba con **"Grabar"**.

## Cómo se hace

### Conectar el WhatsApp del negocio
1. En [Configuración de WhatsApp](/ventas/mensajes/configuracion), apretá **"Conectar WhatsApp"**.
2. Se abre Meta: entrá con tu Facebook, elegí la cuenta de WhatsApp Business del negocio y el número.
3. Te pide escanear un código con la app WhatsApp Business del teléfono: escanealo.
4. Volvés a Laucen con el aviso "¡WhatsApp conectado!". Desde ese momento los mensajes nuevos llegan a Chats y los contesta la IA.

### Contestar vos un chat
1. Abrí el chat.
2. Si vas a atenderlo vos, **apagá el interruptor de la IA** de ese chat (si no, la IA puede contestar también).
3. Escribí y apretá **"Enviar"**. Si tenía casos en espera sin dueño, quedan a tu nombre.
4. Cuando termines, si querés que la IA siga, prendé el interruptor. Si el cliente quedó esperando respuesta, contesta en el momento.

### Prender o apagar la IA desde el teléfono
Escribile al cliente desde el teléfono un mensaje que empiece con la **marca** (de fábrica, `*`):
- Si la IA estaba prendida, se apaga en ese chat, y el resto del mensaje le llega al cliente tal cual ("* Hola, soy Fer, te atiendo yo").
- Si estaba apagada, se prende, y lo que escribas después de la marca es un encargo para la IA ("* pasale el link de los auriculares"): la IA le escribe al cliente haciéndolo.
Contestar desde el teléfono sin la marca no cambia nada: la IA sigue atendiendo.

### Resolver algo que quedó en espera
1. Pestaña **En espera** y abrí el chat.
2. Atendé al cliente (apagá la IA del chat si hace falta).
3. En el caso, apretá **"Resolver"**, escribí cómo se resolvió (opcional) y **"Listo"**.

### Enseñarle cosas a la IA
En [Configuración de WhatsApp](/ventas/mensajes/configuracion), lápiz, y escribí en **Lo que sabe para los clientes** lo que tiene que saber: envíos y plazos, formas de pago, horarios, si hacen factura A, garantía, preguntas frecuentes. Grabá y probalo en **Probar la IA**.

## Criterios y reglas

- **La IA contesta siempre**, salvo que: esté apagada para todos (Configuración), el interruptor de ese chat esté apagado, se haya llegado al tope de gasto del mes, o haya contestado más de lo permitido en la última hora en ese chat. En los dos últimos casos deja el chat **En espera** con el motivo.
- **Espera a que el cliente termine de escribir**: si manda varios mensajes seguidos, contesta una sola vez después del último (de fábrica, 12 segundos).
- **Qué sabe**: productos, precios y stock de la tienda web (los mismos que ve el comprador, con el link para comprar); envíos, retiro y medios de pago de la tienda; horario, dirección, garantía y devoluciones de Configuración › Tienda web; y lo que escribas en "Lo que sabe". No inventa productos, precios ni plazos.
- **Pedidos**: le cuenta el estado de un pedido sólo a quien lo hizo (el teléfono del chat tiene que coincidir con el del cliente del pedido). Si no coincide, le pide que consulte desde el teléfono con el que compró o lo pasa a una persona.
- **No vende ni cobra por el chat**: para comprar manda el link de la tienda. No promete descuentos ni reservas.
- **Nunca cambia nada del sistema** (ni pedidos, ni precios, ni stock, ni Mercado Libre).
- **Las 24 horas de WhatsApp**: desde Laucen sólo se le puede escribir a un cliente dentro de las 24 horas desde su último mensaje (regla de WhatsApp). Pasado eso, hay que escribirle desde el teléfono; cuando conteste, se sigue desde acá.
- **Clientes cargados**: si el teléfono del chat coincide con el de un cliente (teléfono o celular), el chat muestra su nombre y enlaza a su ficha.
- **Costo**: usa un modelo más económico que el asistente del panel; cada respuesta cuesta alrededor de un centavo de dólar. El tope del mes es aparte del del asistente del panel.
- Mientras no haya un número conectado, se puede usar todo en **Probar la IA**.

## Preguntas frecuentes

**¿Los clientes se dan cuenta de que es una IA?** Escribe como una persona del negocio. Si le preguntan directamente si es una IA, dice la verdad.

**¿Puedo seguir usando WhatsApp en el teléfono?** Sí: el número sigue andando en la app WhatsApp Business. Lo que contestes desde ahí aparece en Chats, y la IA no lo pisa.

**¿Por qué no me deja escribirle a un cliente?** Pasaron más de 24 horas desde su último mensaje: escribile desde el teléfono.

**¿Por qué un mensaje dice NO ENTREGADO?** WhatsApp no lo aceptó; el motivo está al lado (por ejemplo, que el número no tiene WhatsApp).

**¿Qué pasa si la IA no sabe algo?** Le dice al cliente que ya le avisó a alguien del equipo y deja el chat **En espera** con el asunto.

## Relacionado

- [Tienda web](/config/tienda): el catálogo, los precios y los datos (horario, garantía, devoluciones) que usa la IA.
- [Preguntas y mensajes](/ventas/preguntas): las preguntas y mensajes de Mercado Libre (otra bandeja).
- [Asistente](/config/asistente): el asistente del panel, para la gente del negocio.
