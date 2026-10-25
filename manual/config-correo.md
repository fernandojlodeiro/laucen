---
titulo: Correo
menu: Configuración › Correo
ruta: /config/correo
rutas: /config/correo
permiso: empresa_config
resumen: La cuenta de Google que manda los mails a los clientes (facturas, avisos del pedido y bienvenida), a qué casilla llegan las respuestas, desde qué dirección sale cada marca, una prueba y el registro de lo enviado.
---

## Para qué sirve

Laucen les manda mails a los clientes:

- **La factura en PDF**, apenas se autoriza, a los clientes con la casilla **"Enviarle la factura por mail"** tildada en su ficha y el mail cargado. Las ventas de Mercado Libre no (su factura va a Mercado Libre) ni las notas de crédito.
- **Pedido recibido**, al comprar en la tienda web: el detalle, el total, el medio de pago (con los datos para transferir si eligió transferencia) y el link para seguir el pedido.
- **Pago confirmado**, cuando el pedido pasa a "Pagado".
- **Pedido en camino**, cuando se despacha (con la nota del despacho, por ejemplo el número de seguimiento).
- **Listo para retirar**, cuando un pedido con retiro queda "Preparado".
- **Bienvenida**, cuando el comprador crea su cuenta en la tienda.

Cada cliente recibe los mails **desde la marca donde compró**: si compró en otra marca de la tienda (otro dominio), desde el mail de esa marca y con su nombre. Lo demás, desde la tienda principal. **Las respuestas** del cliente llegan a la casilla de **"Responder a"**. Cada mail sale una sola vez.

## Cómo se llega

Menú **Configuración › Correo**.

## Qué hay en la pantalla

- **El interruptor**: prendido salen los mails; apagado no sale ninguno.
- **Cuenta que manda**: la casilla de Google (Workspace) por la que salen, su **contraseña de aplicación** (no se muestra nunca: dice "Cargada") y **Responder a**. Se cambian con el **lápiz** de arriba a la derecha y **"Grabar"**.
- **Remitentes**: cada marca, su dominio y desde qué dirección sale.
- **Probar**: manda un mail de prueba a la dirección que escribas.
- **Últimos mails**: fecha, qué mail era, a quién, el asunto y si salió (o por qué no).

## Cómo se hace

### Dejarlo andando
1. En la cuenta de Google que va a mandar (tiene que tener la verificación en dos pasos), entrá a **Seguridad › Contraseñas de aplicación** y creá una: son 16 letras.
2. En **Gmail › Configuración › Cuentas › Enviar como**, agregá el mail de cada marca (los de la tabla **Remitentes**). Si una dirección no está ahí, Google manda desde la casilla en su lugar.
3. Acá, **lápiz** → la casilla, la contraseña de aplicación y "Responder a" → **"Grabar"**.
4. **"Mandar mail de prueba"** y fijate que llegue a la bandeja de entrada.

## Criterios y reglas

- Sale por la casilla de Google porque llega mejor a la bandeja de entrada que un servicio de envíos masivos.
- No se le manda a una dirección cuyo dominio no recibe correo (escrita mal o inventada): queda en el registro como "Esa dirección de mail no existe o está mal escrita".
- Los avisos de pagado, despachado y listo para retirar salen en el minuto; si no se pudieron mandar, se reintentan hasta 5 veces.
- Los mismos tres avisos salen también **por WhatsApp** a los clientes que eligieron WhatsApp al comprar y tienen el número cargado: dentro de las 24 horas del último mensaje del cliente, como mensaje con el link del pedido; fuera de ese plazo, con la **plantilla** de Meta de cada aviso (pedido pagado, despachado, listo para retirar) y el botón **"Ver mi pedido"**. Las plantillas las pide Laucen solas a Meta la primera vez que hacen falta; mientras Meta no las aprueba, el aviso queda pendiente y se reintenta cada 10 minutos durante 3 días. Los mensajes quedan en el chat del cliente.
- Todos los mails terminan con la firma: «Saludos», la marca y «Cualquier cosa, podés comunicarte respondiendo este mail o por WhatsApp al …» (el WhatsApp de la tienda, con link).
- Sin la cuenta cargada (o con el interruptor apagado) no sale nada.
- El mail de cada marca se cambia en [Tienda web](/config/tienda): el de la tienda en su ficha, y el de otra marca con el lápiz de su dominio.

## Relacionado

[Tienda web](/config/tienda) · [Clientes](/ventas/clientes)
