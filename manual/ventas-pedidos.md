---
titulo: Pedidos
menu: Ventas › Pedidos
ruta: /ventas/pedidos
rutas: /ventas/pedidos, /ventas/pedidos/[id]
permiso: pedidos_ver
resumen: Los pedidos de todos los canales (Mercado Libre, tienda web, local, mayorista): lista con filtros, alta a mano, ficha con estado, pago, reserva de stock, envío, cargos de Mercado Libre y facturación.
---

## Para qué sirve

Es **la lista única de ventas** de Laucen: acá están los pedidos de todos los canales —Mercado Libre, la tienda web, el local, los mayoristas y los que entran por otros sistemas— con su estado, su pago, su envío y su factura. Desde acá:

- Se ve qué hay que preparar, despachar, cobrar o facturar.
- Se carga un pedido a mano (venta del local, de WhatsApp, de un mayorista).
- Se abre la ficha de un pedido para confirmar el pago, cambiarle el estado, cancelarlo, facturarlo o avisarle al cliente por WhatsApp.

Los pedidos de Mercado Libre **entran solos** y se mueven solos según lo que pasa en Mercado Libre.

## Cómo se llega

- Menú **Ventas › Pedidos** (o 🧾 **Pedidos** en la barra de abajo del celular).
- Contador **"Pedidos sin preparar"** de la barra de estado (abre la lista con el filtro Pendientes).
- Tarjeta **"Pedidos abiertos"** del [Panel](/panel): cada renglón abre la lista filtrada por ese estado.
- El [buscador global](/buscar): por Nº de pedido o por id externo (número de venta de Mercado Libre).
- Desde la ficha de un cliente (su lista de pedidos), desde [Envíos](/ventas/envios), [Reclamos](/ventas/reclamos), [Preguntas y mensajes](/ventas/preguntas) y [Facturación](/administracion/facturacion): el número de pedido es un enlace a su ficha.
- En la lista de [Clientes](/ventas/clientes), el número de la columna "Pedidos" abre esta lista filtrada por ese cliente.

## Qué hay en la pantalla

### La lista ([Pedidos](/ventas/pedidos))

**Arriba a la derecha**: el desplegable de columnas del Excel, **"⬇ Descargar Excel"**, **"⚙ Configurar…"** y **"+ Nuevo pedido"**.

**Filtros** (todos aplican al momento, sin botón "Filtrar"):

- **"Buscar"** (cuadro "Nº, id externo o cliente"): busca en los datos del pedido (Nº, id externo, medio de pago, código de seguimiento, notas) y en todos los del cliente (N.º, nombre, razón social, mail, apodo de ML, documento, CUIT, teléfonos, notas). Busca en cualquier parte del texto (no tiene "Comienza por"). **Si escribís el número de un pedido** (el de Laucen, con o sin "#", o el número de venta de Mercado Libre), ese pedido aparece siempre, aunque el filtro de estado, pago, cuenta o fechas lo dejaría afuera (por ejemplo, buscando un pedido despachado con el filtro en "Pendientes").
- **"Estado"**: **"Todos"**, **"Pendientes (nuevo + pagado)"** o un estado puntual (Nuevo, Pagado, En preparación, Preparado, Despachado, Entregado, Cancelado, Devuelto). **Si no elegís nada, la lista abre en Pendientes.**
- **"Canal"**: todos o uno.
- **"Pago"**: Pendiente, Pagado, A cobrar, A convenir, Reembolsado.
- **"Fechas"**: rango con atajos (Hoy, Ayer, Últimos 7 días…) o **"Todas las fechas"**.
- **"Limpiar filtros"**: aparece cuando hay algún filtro puesto; vuelve a la lista de entrada (Pendientes).

**"Vista"** (arriba de la tabla, a la derecha): elegí qué columnas ver; **"⚙ Configurar vistas…"** para armar otras.

**Columnas de la vista "Estándar"**:

| Columna | Qué muestra |
|---|---|
| **Nº** | el número del pedido en Laucen (enlace a la ficha) |
| **Fecha** | fecha y hora en que entró (enlace a la ficha) |
| **Canal** | el canal; tocándolo filtra la lista por ese canal |
| **Id externo** | el número en el canal de origen (en Mercado Libre, el de la venta o el del carrito) |
| **Cliente** | enlace a la ficha del cliente |
| **Estado** | el estado del pedido; si es un carrito de Mercado Libre en espera, al lado dice **"Carrito en espera · faltan N min"** |
| **Pago** | Pendiente, Pagado, **A cobrar** (en ámbar fuerte, para que se vea de lejos), A convenir, Reembolsado |
| **Total** | en la moneda que estés viendo |
| **Unidades** | suma de las cantidades de todas las líneas |
| **Factura en ML** | sólo en ventas de Mercado Libre ya facturadas: **"✓ Subida"**, **"⏳ Pendiente"**, **"⚠ Error"** u **"○ Falta"** |

**Otras columnas** que se pueden sumar en una vista o en el Excel: Fecha y hora, Documento del cliente, Mail del cliente, Teléfono del cliente, Medio de pago, Total US$, Costo de envío, Comisión del canal, **Cargos ML**, **Neto ML**, Líneas, Código de seguimiento, Notas.

**Orden**: con el filtro Pendientes, **del más viejo al más nuevo** (se preparan en orden de llegada). Con cualquier otro filtro, del más nuevo al más viejo. Se puede ordenar tocando el título de cualquier columna (salvo Notas).

### El formulario "Nuevo pedido"

Se abre con **"+ Nuevo pedido"**, debajo del encabezado. Sirve para los canales de tipo **local, web minorista, web mayorista u otro** que estén activos (nunca Mercado Libre). Campos:

- **"Canal"**: desplegable con esos canales (el del local primero).
- **"Cliente"**: **"Consumidor final"** o **"Un cliente"**. Con "Un cliente" aparece un buscador ("Nombre, documento, CUIT, mail o N.º"; busca en todos los datos del cliente) con su caja "Comienza por"; al elegir uno se muestra "N.º … · nombre · documento" (y "con cuenta corriente" si la tiene) con el botón **"Cambiar"**. Si el cliente no aparece, debajo del buscador está **"+ Cargar cliente nuevo"**: pide nombre (viene con lo que escribiste), documento, mail, teléfono y tipo; con **"Grabar y elegir"** se crea y queda elegido en el pedido, sin salir de la pantalla. Si el documento ya lo tiene otro cliente, avisa cuál es. También hay un enlace para cargarlo con todos los datos en la pantalla de [Clientes](/ventas/clientes) (se abre aparte, y después volvés y lo buscás).
- **"Productos"**: buscador "SKU, título o código de barras" (busca desde la segunda letra, con "Comienza por"). Cada resultado muestra SKU, título, precio de lista (o "sin precio" en rojo) y lo disponible para el canal ("N disp.", en rojo si es 0 o menos). Al elegir uno (clic o Enter sobre el primero) se suma una línea.
- **Tabla de líneas**: SKU, Producto (con avisos "Sin stock disponible en el canal" o "Sin precio en la lista: escribilo"), **Cantidad** (arranca en 1), **Precio** (el de la lista, editable), **Descuento %**, Subtotal y el tacho (pregunta **"¿Sacar?"** **"Sí"** / **"No"**).
- **"Pago"**: **"A cobrar (a convenir)"** (marcado de entrada), **"Pagado"** o **"Cuenta corriente"**. Debajo, **"Medio de pago"**: Efectivo, Transferencia, Tarjeta de débito, Tarjeta de crédito, Mercado Pago, Cheque, Otro (con "A cobrar" es opcional, "si ya se sabe"; con "Pagado" es obligatorio; con "Cuenta corriente" no se pide).
- **"Entrega"**: **"Retira"** o **"Envío"**. Con Envío aparecen Calle, Número, Piso/depto, Localidad, Provincia, CP, Referencia y **"Costo del envío"**. Si elegiste un cliente con dirección, se completa sola (primero la que tiene etiqueta "Envío", si no la principal).
- **"Notas"**.
- Abajo, el **"Total"** (se recalcula mientras escribís) y el botón **"Crear pedido"**.

### La ficha del pedido ([Pedido](/ventas/pedidos))

Título "Pedido 1234 · id externo", con el canal y la fecha y hora debajo. Bloques, de arriba hacia abajo:

1. **Cabecera**: Estado (y la marca de carrito en espera, con un recuadro que explica desde qué hora se puede tocar), Pago (con el medio), el cartel **"A COBRAR $ …"** si corresponde, Total (y "cargado en dólares/pesos" si se cargó en la otra moneda), Depósito (o "no mueve stock"), Cliente (con documento y mail), Canal, Fecha, Unidades y Notas.
2. **"Líneas"**: SKU (enlace al producto, con su foto si tiene), Título (en un carrito de Mercado Libre con varias órdenes, debajo dice "Orden ML …"), Cantidad, Lista, Descuento, Unitario, Subtotal y el Total.
3. **"Envío"**: si es de Mercado Envíos, Logística (Full, Flex, Colecta, Despacho en correo, A convenir), Estado del envío, "Despachar antes de", "Entrega estimada", las fechas del envío según Mercado Libre (**"Etiqueta impresa"**, **"Lista para despachar"**, **"En camino"**, **"Entregado"**: en verde con la fecha y hora cuando pasó, **"Pendiente"** en amarillo mientras no; "No entregado", "Devuelto" o "Cancelado" en rojo si pasó). "Despachar antes de" es el plazo que figura en la etiqueta (en azul; en rojo si ya venció sin despachar), "Recibe", "Seguimiento" y "Dirección". Si no, los datos de entrega cargados ("Sin datos de envío." si no hay). En los pedidos que no son de Mercado Libre y tienen dirección con código postal, el botón **"🚚 Despachar por OCA"**; ya dado de alta en OCA, el número de envío, **"🖨 Etiqueta de OCA"**, **"↻ Actualizar seguimiento"**, **"Anular en OCA"** (mientras no salió) y los últimos movimientos que informó OCA. Ver [OCA](/config/envios/oca). Debajo, la **"Comisión de Mercado Libre"** (y el número de carrito) y, en rojo, el aviso si tiene artículos sin vincular.
4. **"Historial de estados"**: fecha, cambio ("Pagado → **En preparación**"), quién (o "Sistema") y nota.
5. **"Cargos de Mercado Libre"** (sólo si ya están): la venta, cada cargo restado por tipo y el **"Neto de Mercado Libre"**; aparte, las retenciones y percepciones.
6. **"Operación"** (sólo pedidos que **no** son de Mercado Libre): ver más abajo.
7. **"Pagos"**: los pagos registrados (Fecha, Medio, Estado, Importe, Detalle). En los de Mercado Libre aparece sólo si hay alguno.
8. **"Facturación"**: los comprobantes del pedido (tipo y número, estado, **"PDF"** si está autorizado, y si es de Mercado Libre, "En ML: …") y los botones **"Facturar"** y **"Subir factura a Mercado Libre"**.
9. **"Movimientos de stock"**: cada reserva, venta o liberación que generó el pedido (fecha, tipo, SKU, producto —o "del kit …"—, cantidad, desde, hacia, nota).

### El bloque "Operación"

Aparece en los pedidos que no son de Mercado Libre. Según el estado y el pago muestra:

- **"Entrega: …"** (el método de envío, si tiene).
- El cartel **"A COBRAR $ … al retirar"** (o "al entregar").
- **"Confirmar pago de $ …"** con el desplegable **"Pagó con"**: cuando el pago está Pendiente, A convenir o A cobrar y el pedido no está cerrado.
- **"Cliente presente: retira"**: cuando el pedido **retira** en el local y ya está **Preparado**. Si se paga al retirar («A cobrar»), dice **"Cliente presente: retira y paga $ …"** con **"Cobró con"**. Ver "El cliente retira en el local".
- Si el método de envío tiene el **seguimiento automático** (OCA), no hay botones de "Despachado" ni "Entregado": dice "El envío lo sigue el transportista: el pedido pasa solo a «Despachado» cuando lo retiran y a «Entregado» cuando lo entregan."
- Los botones del **estado siguiente** (ver la tabla de "Criterios").
- **"Cancelar pedido"**: pregunta ahí mismo "¿Cancelar el pedido?" y dice qué más va a hacer (liberar el stock, anular el envío de OCA, anular o devolver el pago de Payway), con **"Sí"** / **"No"**. Si el pedido tiene factura, pregunta aparte "¿Emitir la nota de crédito…?". No aparece en pedidos entregados, cancelados o devueltos. **Un pedido Despachado, o con el envío de OCA ya en camino, no se cancela**: en su lugar dice "Ya salió: no se cancela. Si la mercadería vuelve, hacé la devolución." (así no se devuelve el pago ni se anula la factura de algo que está viajando). **En una venta de Mercado Libre**, "Cancelar pedido" no cancela: explica que las ventas de Mercado Libre se cancelan desde Mercado Libre, que Laucen lee el cambio enseguida (el pedido queda cancelado y el stock vuelve) y deja el botón **"Abrir la venta en Mercado Libre ↗"**.
- **"Avisar por WhatsApp"**: abre WhatsApp con un mensaje armado para el cliente según el estado. Si el cliente no tiene teléfono: "El cliente no tiene teléfono cargado: no se le puede avisar por WhatsApp."

## Cómo se hace

### Ver qué hay que preparar

1. Abrí [Pedidos](/ventas/pedidos): entra con el filtro **Pendientes**, del más viejo al más nuevo.
2. Los «A cobrar» se ven con el pago en ámbar.
3. La preparación en sí (juntar las unidades) se hace en [Picking](/deposito/picking); al armar el lote, los pedidos pasan solos a "En preparación" y al terminar a "Preparado".

### Cargar un pedido a mano (local, WhatsApp, mayorista)

1. Apretá **"+ Nuevo pedido"**.
2. Elegí el **"Canal"**.
3. En **"Cliente"**: dejá **"Consumidor final"** o elegí **"Un cliente"** y buscalo. Si el cliente tiene una lista de precios propia, los precios cambian a los de esa lista.
4. En **"Productos"**, buscá cada producto y elegilo. Ajustá **Cantidad**, **Precio** y **Descuento %** si hace falta.
5. Elegí el **"Pago"**:
   - **"A cobrar (a convenir)"**: el cliente paga después (por ejemplo, en efectivo al retirar).
   - **"Pagado"**: ya pagó; elegí el **"Medio de pago"**.
   - **"Cuenta corriente"**: se le carga a la cuenta del cliente (hace falta un cliente, no consumidor final).
6. Elegí la **"Entrega"**: **"Retira"** o **"Envío"** (con Envío completá al menos calle y localidad; el **"Costo del envío"** se suma al total).
7. Si querés, escribí **"Notas"**.
8. Apretá **"Crear pedido"**. Si sale bien, vas a la ficha del pedido nuevo con el aviso "Pedido N creado.". Si algo falla, el error aparece arriba del formulario y lo cargado queda como estaba.

Errores típicos: "Elegí el cliente (o marcá «Consumidor final»).", "Línea N: falta el precio.", "Línea N: la cantidad tiene que ser un entero mayor que cero.", "Elegí con qué pagó.", "La cuenta corriente necesita un cliente (no consumidor final).", "Para el envío completá al menos la calle y la localidad.", "Los pedidos de Mercado Libre entran solos: no se cargan a mano.". Si no hay canales para cargar a mano, el formulario dice "No hay canales para cargar pedidos a mano (local, web, mayorista u otro). Crealos en Configuración → Canales."

### Confirmar el pago de un pedido

1. Abrí la ficha del pedido.
2. En **"Operación"**, elegí en **"Pagó con"** el medio.
3. Apretá **"Confirmar pago de $ …"**. Aviso: "Pago confirmado: el pedido quedó pagado."
4. Si el pedido estaba Nuevo, pasa a **Pagado** y se reserva el stock. Si era «A cobrar» y ya venía avanzando (en preparación, preparado…), el estado no cambia: sólo el pago queda Pagado, y desde ahí se puede facturar.

### El cliente retira en el local

1. Cuando el pedido está **Preparado** y el cliente viene a buscarlo, en **"Operación"** apretá **"Cliente presente: retira"**.
2. Si lo paga al retirar («A cobrar»), el botón dice **"Cliente presente: retira y paga $ …"**: elegí antes en **"Cobró con"** con qué pagó.
3. En un solo paso: se confirma el cobro (si hacía falta), el pedido queda **Entregado** (el stock reservado pasa a vendido) y, **si todavía no tiene factura, se factura en el momento**. Aviso: "Entregado · Factura B … emitida." Si la factura no sale (por ejemplo, ARCA no responde), el pedido queda entregado igual y el aviso dice qué falló: se reintenta desde la factura.

### Avanzar el estado a mano (pedidos que no son de Mercado Libre)

1. En **"Operación"**, apretá el botón del estado siguiente (por ejemplo **"Preparado"**, **"Despachado"**, **"Entregado"**).
2. Para **"Despachado"** podés escribir en **"Seguimiento / nota"** el número de seguimiento (por ejemplo "OCA 1234567890"); queda en el historial y se usa en el mensaje de WhatsApp.

### Cancelar un pedido

1. En **"Operación"**, apretá **"Cancelar pedido"**. Pregunta "¿Cancelar el pedido?" y dice qué más va a pasar. Confirmá con **"Sí"**.
2. Si el pedido tiene una factura autorizada, pregunta aparte **"¿Emitir la nota de crédito de la Factura …?"**: **"Sí, cancelar con nota de crédito"**, **"No, cancelar sin nota de crédito"** o **"No cancelar"**.
3. Corre de fondo (el botón dice "Trabajando…") y al terminar aparece el cartel abajo a la derecha con lo que se hizo. En orden:
   - El pedido queda **Cancelado** y se libera el stock que tenía reservado (las publicaciones de Mercado Libre que se habían pausado por falta de stock se reactivan solas).
   - Si tiene un **envío de OCA** que todavía no salió, se **anula en OCA**. Si ya salió, avisa que no se pudo.
   - Si se pagó con **Payway**, se le pide a Payway la devolución total: si el pago es **del mismo día** (antes del cierre de lote) Payway lo toma como **anulación**; si es de **otro día**, como **devolución** (el dinero vuelve al resumen de la tarjeta). El pago queda "Reembolsado".
   - Si elegiste la nota de crédito, se emite por el total de la factura.
4. Si algún paso falla (por ejemplo OCA o Payway no responden), el cartel sale en rojo diciendo cuál. El pedido queda cancelado igual; lo que falló se hace a mano: "Anular en OCA" en el pedido, la devolución en el panel de Payway, o "Anular con nota de crédito" en la factura.

Un pedido cancelado no cambia más de estado.

### Facturar un pedido

1. Abrí la ficha. En el bloque **"Facturación"**, apretá **"Facturar"** (hace falta el permiso «Facturación»).
2. Laucen arma la factura y la manda a ARCA. Si queda autorizada, aparece el comprobante con su número y el botón **"PDF"**, y un aviso verde con el CAE.
3. Si ARCA la rechaza o falta un dato, el aviso rojo explica por qué; si el problema es del cliente (por ejemplo, falta el CUIT para una factura A), al lado aparece **"Corregir en la ficha del cliente"**.

El botón **no aparece** si el pedido está Nuevo o Cancelado, o si ya tiene una factura autorizada. Está **deshabilitado** si el pedido es «A cobrar» ("Primero confirmá el cobro: el pedido está «A cobrar» y se factura cuando se cobra.") o si es un carrito de Mercado Libre en espera.

### Subir la factura a la venta de Mercado Libre

1. En la ficha de un pedido de Mercado Libre con factura autorizada que todavía no está en Mercado Libre, apretá **"Subir factura a Mercado Libre"**.
2. La factura (y la nota de crédito, si la hay) va a la cola de Mercado Libre y sale en un momento. El estado se ve en "En ML: …" y en la columna "Factura en ML" de la lista.

### Avisarle al cliente por WhatsApp

1. En **"Operación"**, apretá **"Avisar por WhatsApp"**.
2. Se abre WhatsApp con un mensaje listo según el estado (por ejemplo "¡Hola Juan! Confirmamos el pago de tu pedido #1234. Ya lo estamos preparando."). Revisalo y mandalo desde WhatsApp.

### Ver cuánto quedó neto de una venta de Mercado Libre

1. Abrí la ficha: el bloque **"Cargos de Mercado Libre"** muestra la venta, cada cargo y el **"Neto de Mercado Libre"**.
2. En la lista, sumá a tu vista las columnas **"Cargos ML"** y **"Neto ML"**.

## Criterios y reglas

### Canales: de dónde vienen los pedidos

| Canal | Cómo entra el pedido |
|---|---|
| **Mercado Libre** | solo: Mercado Libre avisa cada venta al instante y, por si se perdió un aviso, cada 30 minutos se revisan las órdenes que cambiaron (la primera vez, los últimos 3 días; después, desde la última revisión con 1 hora de margen) |
| **Tienda web** | solo, cuando el comprador termina la compra en la tienda |
| **Local, web mayorista, otro** | a mano con **"Nuevo pedido"**, o por la conexión con otros sistemas (planilla mayorista, WhatsApp) |
| **Ventas históricas** | por la importación de datos: nacen Entregadas y **no mueven stock** |

Un mismo pedido nunca se duplica: si llega dos veces con el mismo id externo en el mismo canal, se devuelve el que ya existe.

### Estados del pedido y cómo pasan

Los estados, en orden: **Nuevo → Pagado → En preparación → Preparado → Despachado → Entregado**. Aparte: **Cancelado** y **Devuelto**.

- **Sólo se avanza**, nunca se vuelve atrás (por ejemplo, un Despachado no puede volver a Pagado). Se puede saltar estados hacia adelante.
- **Cancelado** y **Devuelto** se pueden poner desde cualquier estado que no esté cerrado. Un pedido cancelado o devuelto **no cambia más**.
- Repetir el mismo estado no hace nada.
- Todo cambio queda en el **"Historial de estados"** con quién lo hizo (una persona o "Sistema") y su nota.

**Quién mueve cada estado:**

| Paso | Pedido de Mercado Libre | Otros canales |
|---|---|---|
| → **Pagado** | solo, cuando Mercado Libre informa que todas las órdenes del carrito que siguen en pie están pagas | al confirmar el pago (**"Confirmar pago"**, o el pago online de la tienda); con **"Cuenta corriente"** pasa a Pagado al crearse |
| → **En preparación** | [Picking](/deposito/picking), al armar el lote | Picking, o el botón **"En preparación"** |
| → **Preparado** | Picking, al terminar | Picking, o el botón **"Preparado"** |
| → **Despachado** | solo, cuando Mercado Envíos marca el envío "en camino" | botón **"Despachado"** |
| → **Entregado** | solo, cuando Mercado Envíos u OCA marcan el envío entregado | botón **"Entregado"** o **"Cliente presente: retira"** |
| → **Cancelado** | solo, cuando se cancelan **todas** las órdenes del carrito | botón **"Cancelar pedido"** |
| → **Devuelto** | al cerrar la recepción de la devolución en el depósito | igual |

Los pedidos de Mercado Libre **no tienen botones de estado** en la ficha: los mueve Mercado Libre. Si en Laucen ya están más adelante (por ejemplo, Preparado por el picking), lo que llega de Mercado Libre no los hace retroceder.

**Botones de estado siguiente en "Operación"** (pedidos que no son de Mercado Libre):

| Estado actual | Botones |
|---|---|
| Nuevo esperando el pago | ninguno (sólo "Confirmar pago" y "Cancelar pedido") |
| Nuevo «A cobrar» o a convenir | "En preparación", "Preparado" |
| Pagado | "En preparación", "Preparado" |
| En preparación | "Preparado" |
| Preparado | "Despachado" (con "Seguimiento / nota") y "Entregado" si el envío es manual (cadetería, envío propio); "Cliente presente: retira" si retira en el local; ninguno si el seguimiento es automático (OCA) |
| Despachado | "Entregado" |

### Reservas de stock: cuándo se aparta y cuándo se descuenta

- **Al pasar a Pagado** (o al saltearlo hacia un estado posterior) el pedido **reserva** su stock: lo aparta para que no se venda dos veces. El disponible baja, pero las unidades siguen en el estante.
- **Al llegar a Despachado** (o directamente a Entregado), la reserva se convierte en **venta**: ahí sale del stock.
- **Al cancelar o devolver**, se **libera** lo que siga reservado (vuelve a estar disponible). Lo que ya se había vendido (un pedido despachado) no vuelve solo: la mercadería que regresa entra por la recepción de la devolución.
- **De qué depósito sale**: el que tenga el pedido; si no tiene, el primer depósito activo asignado al canal (por prioridad); si el canal no tiene, el primer depósito activo de la organización (los propios primero). Las ventas de Mercado Libre por **Full** salen del depósito Full del canal.
- **De qué ubicación**: primero de las ubicaciones que tienen disponible, en el orden de recorrido del depósito. Si no alcanza, lo que falta se reserva igual en la ubicación general y queda **disponible negativo** (se vendió sin stock: aparece en el Panel, en "Vendido sin stock").
- Un **kit** reserva cada uno de sus componentes.
- Una línea **sin vincular** (artículo de Mercado Libre que no está atado a un producto de Laucen) **no reserva ni descuenta** nada.
- Un pedido marcado "no mueve stock" (las ventas históricas) nunca toca el stock.
- Después de reservar o vender, Laucen avisa el stock nuevo a Mercado Libre (en los canales que tienen prendida la sincronización de stock).
- Cada reserva, venta y liberación queda en **"Movimientos de stock"** de la ficha.

### «A cobrar» y «A convenir»: pedidos que no esperan el pago

- **«A cobrar»** es un pedido que se paga **en efectivo al retirar o al entregar**. No espera el pago: **reserva el stock apenas se crea** y **entra en picking estando Nuevo**. El pago queda «A cobrar» hasta que se confirma el cobro.
- Un pedido cargado a mano con **"A cobrar (a convenir)"** queda «A cobrar». También queda «A cobrar» cualquier pedido nuevo (que no sea de Mercado Libre) con pago pendiente y medio **efectivo**. Los pedidos viejos con pago pendiente en efectivo también se muestran como «A cobrar».
- **Se factura recién cuando se cobra**: mientras esté «A cobrar», el botón "Facturar" está deshabilitado y la facturación automática no lo toma. Al confirmar el cobro, si el pedido ya llegó al estado en que se factura, la facturación automática lo factura.
- **«A convenir»** (cuenta corriente): los pedidos de la tienda con "Cuenta corriente / a convenir" y los cargados a mano con **"Cuenta corriente"**. También reservan y entran en picking sin esperar el pago, pero **se facturan como siempre** (la cuenta corriente se arma con la factura).
- En la ficha, un «A cobrar» muestra el cartel ámbar **"A COBRAR $ …"** con el total en pesos.
- El filtro **Pendientes** y el contador "Pedidos sin preparar" incluyen los Nuevos, los Pagados y los «A cobrar» que todavía no se entregaron (aunque estén en preparación, preparados o despachados).

### Precios de un pedido

- **Lista de precios**: la del **cliente** si tiene una propia (en su ficha); si no, la del **canal**. La moneda del pedido es la de esa lista (si el canal no tiene lista, pesos).
- En **"Nuevo pedido"**, el precio que aparece es el de esa lista y se puede cambiar. Si se deja igual, la línea guarda el precio de lista y su descuento; si se cambia, guarda el precio escrito.
- **Descuento %**: se aplica sobre el precio de la línea. Si la lista ya tenía un descuento, **se acumulan**: 10 % de la lista + 10 % extra = 19 % (no 20 %).
- Cada importe se guarda en pesos y en dólares con el dólar oficial del día del pedido.
- **Total** = suma de (precio unitario × cantidad) de todas las líneas + costo de envío que paga el comprador. Redondeado a centavos.
- Las ventas de Mercado Libre entran con el precio al que se vendieron en Mercado Libre.

### Clientes de los pedidos

Cuando entra un pedido, Laucen busca al cliente en este orden: el id del comprador en ese canal → el CUIT → el número de documento → el apodo de Mercado Libre → el mail. Si lo encuentra, **completa los datos que le falten** (nunca pisa uno ya cargado). Si no, crea un cliente nuevo. Las direcciones nuevas se suman sin repetir las que ya tiene. Un pedido a mano como "Consumidor final" queda sin cliente.

### Mercado Libre: el carrito es UN pedido

- Un **carrito** de Mercado Libre (varias órdenes compradas juntas, con un solo envío) es **un solo pedido** en Laucen, con las líneas de todas sus órdenes. Su id externo es el número del carrito; cada línea dice de qué orden vino ("Orden ML …").
- Si una orden del carrito **llega después**, sus líneas **se suman** al mismo pedido (con su reserva de stock si el pedido ya estaba pagado, y como venta si ya había salido). Si el pedido ya estaba facturado, el historial lo avisa: "(el pedido ya estaba facturado: revisar la factura)".
- Si **se cancela una orden** y las otras siguen, sus líneas **salen** del pedido y se libera su reserva (salvo que el pedido ya esté despachado o entregado). Si se cancelan **todas**, el pedido queda Cancelado.
- El pago queda Pagado cuando **todas** las órdenes que siguen en pie están pagas.

### La espera de 10 minutos de los carritos

Como las órdenes de un carrito pueden llegar con minutos de diferencia, para que nadie prepare ni facture un carrito al que todavía le falta un ítem:

- Mientras un pedido es carrito de Mercado Libre, **nadie lo puede tocar hasta que pasen 10 minutos desde su último cambio** (llegó una orden, una cambió de estado o se canceló, se sumaron o sacaron líneas). Cada cambio nuevo vuelve a arrancar los 10 minutos.
- Durante la espera **no se puede**: cambiarle el estado a mano, meterlo en picking, facturarlo (ni a mano ni automáticamente), imprimir su etiqueta ni operarlo desde la ficha. Lo que manda Mercado Libre sí entra.
- Se ve con la marca ámbar **"Carrito en espera · faltan N min"** en la lista, en la ficha (con el texto "se puede tocar desde las HH:MM") y en Envíos ("Carrito: esperando"). El botón "Facturar" se ve deshabilitado con ese texto.
- Pasada la espera, la marca desaparece sola y todo vuelve a andar (la facturación automática lo toma en su próxima vuelta).
- Un carrito que entra tarde (por la revisión de cada 30 minutos) cuenta la espera desde su orden más reciente, así que puede no esperar nada.

### Artículos sin vincular

Si una venta de Mercado Libre trae un artículo que no está vinculado a un producto de Laucen, Laucen lo busca por SKU (el SKU de la publicación igual al SKU de una variación) y, si lo encuentra, deja la publicación vinculada. Si no, la línea entra igual con su título, SKU y precio, **sin tocar stock**, y el pedido queda marcado: la ficha lo avisa en rojo y el [Panel](/panel) lo cuenta. Se arregla en [Vincular con Mercado Libre](/catalogo/publicaciones/ml).

### Facturación

- **Cuándo se puede**: un pedido que no esté Nuevo ni Cancelado, sin factura autorizada, que no sea «A cobrar» y que no sea un carrito en espera.
- **Qué tipo de factura**: si la empresa no es Responsable Inscripta, **C**. Si es Responsable Inscripta: **A** si el cliente es Responsable Inscripto o Monotributista (y entonces el cliente **necesita CUIT**), **B** para el resto (consumidor final, exento…). Un cliente sin condición de IVA cargada se toma como consumidor final.
- **Documento del receptor**: el CUIT si tiene 11 dígitos; si no, el DNI (7 u 8 dígitos); si no hay ninguno, consumidor final sin identificar.
- **Líneas**: las del pedido, con el IVA de cada producto (21 % si el producto no tiene otro). El **costo de envío** que pagó el comprador va como una línea más "Envío", con IVA 21 %. En una factura C no se discrimina IVA.
- **Facturación automática**: si está prendida en [Facturación (ARCA)](/config/arca), cada pedido se factura solo al llegar al estado elegido ahí (**Pagado**, **Preparado** o **Despachado**). Al prenderla no se facturan los pedidos que ya habían pasado. Los «A cobrar» esperan al cobro.
- Un comprobante que quedó con error se reintenta solo, hasta 5 veces.
- **Subida a Mercado Libre**: la factura de una venta de Mercado Libre se sube sola a la venta si el canal tiene prendido "Subir facturas a Mercado Libre" (es un clic de Fer en la configuración del canal); si no, con el botón **"Subir factura a Mercado Libre"** de la ficha. Todo sale por la [cola de Mercado Libre](/config/canales/cola). Una factura ya subida no se vuelve a subir.
- Estados de "Factura en ML": **Subida a ML** (✓), **Pendiente de subir**, **Subiendo** o **Preparada, falta tu clic** (⏳), **Con error** (⚠), **Falta subirla** o **No se subió (descartada)** (○).

### Comisión, cargos de Mercado Libre y neto

- **"Comisión del canal"** (y "Comisión de Mercado Libre" en la ficha): la comisión por venta que informa Mercado Libre en cada orden, apenas entra la venta. En pesos.
- **"Cargos ML"**: lo que Mercado Libre realmente facturó por esa venta, leído de su facturación mensual: comisión por venta, envíos, cargo fijo, publicidad, bonificaciones y otros cargos. **No incluye** los impuestos (percepciones y retenciones de IVA, Ingresos Brutos, Ganancias), que no son costo: se toman a cuenta de impuestos y se muestran aparte en la ficha.
- **"Neto ML"** = Total del pedido − Cargos ML. Se muestra "—" mientras todavía no hay cargos de la facturación para esa venta.
- Los cargos están tal como los factura Mercado Libre (con IVA). Se traen una vez por noche y con el botón de [Facturación de Mercado Libre](/administracion/facturacion-ml).

### WhatsApp

- Usa el celular del cliente y, si no tiene, el teléfono. Lo pasa al formato de WhatsApp (549 + característica + número, sin 0 ni 15).
- El mensaje depende del estado (recibido, pago confirmado, preparando, listo, salió con su seguimiento, entregado, cancelado, devolución). En los pedidos de la tienda web suma el link de seguimiento del pedido.
- Laucen no manda nada solo: abre WhatsApp con el texto y lo mandás vos.

## Preguntas frecuentes

**¿Por qué la lista no me muestra los pedidos entregados?**
Porque abre con el filtro Pendientes. Elegí "Todos" o "Entregado" en "Estado".

**¿Puedo cargar a mano un pedido de Mercado Libre?**
No: entran solos. El canal de Mercado Libre ni aparece en "Nuevo pedido".

**¿Por qué no puedo facturar un pedido «A cobrar»?**
Porque se factura cuando se cobra. Confirmá el pago (o usá "Cliente presente: retira y paga", que también factura) y después facturá.

**Un pedido de Mercado Libre dice "Carrito en espera". ¿Qué hago?**
Esperá los minutos que indica: puede que todavía falte llegar otra orden del mismo carrito. Después se puede preparar y facturar normalmente.

**¿Por qué un pedido de Mercado Libre no tiene botones de estado?**
Porque lo mueve Mercado Libre (pago, envío, entrega). La preparación la marca el Picking.

**Cancelé un pedido despachado y el stock no volvió.**
Al despachar el stock ya se descontó como vendido. La mercadería que vuelve entra por la recepción de la devolución en el depósito.

**¿Qué es el disponible negativo?**
Que se reservó más de lo que había: el pedido entró sin stock suficiente.

**¿Por qué el "Neto ML" dice "—"?**
Porque Mercado Libre todavía no facturó los cargos de esa venta (se leen de su facturación mensual, una vez por noche).

**El cliente tiene una lista de precios especial, ¿se aplica sola?**
Sí: al elegirlo en "Nuevo pedido", los precios pasan a los de su lista.

**¿Qué factura sale para un monotributista?**
Si la empresa es Responsable Inscripta, una factura A (el cliente tiene que tener CUIT cargado).

## Relacionado

- [Clientes](/ventas/clientes)
- [Envíos](/ventas/envios)
- [Reclamos y devoluciones](/ventas/reclamos)
- [Picking](/deposito/picking)
- [Recepción](/deposito/recepcion)
- [Facturación](/administracion/facturacion)
- [Facturación (ARCA)](/config/arca)
- [Facturación de Mercado Libre](/administracion/facturacion-ml)
- [Vincular con Mercado Libre](/catalogo/publicaciones/ml)
- [Canales](/config/canales)
- [Cola de Mercado Libre](/config/canales/cola)
- [Listas de precios](/catalogo/precios)
