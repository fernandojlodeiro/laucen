---
titulo: Tienda web, métodos de envío y medios de pago
menu: Tienda web › Tienda web
ruta: /config/tienda
rutas: /config/tienda, /config/envios, /config/medios-pago
permiso: tienda_config
resumen: Configurar lo que ve el comprador en la tienda web (nombre, dirección, colores, logo, banners, textos y contacto), los métodos de envío con sus costos y los medios de pago con sus descuentos y credenciales.
---

## Para qué sirve

Son las tres pantallas que arman la tienda web pública (laucen.com / laucen.com.ar):

- **Tienda web** ([/config/tienda](/config/tienda)): cómo se ve la tienda y qué datos de contacto muestra. Permiso «Tienda web».
- **Métodos de envío** ([/config/envios](/config/envios)): cómo le llega el pedido al comprador y cuánto cuesta. Permiso «Tienda web».
- **Medios de pago** ([/config/medios-pago](/config/medios-pago)): cómo puede pagar el comprador, con qué descuento o recargo, y las credenciales de Mercado Pago y Payway. Permiso «Medios de pago».

Lo que NO está acá y se cambia en [Canales](/config/canales): si la tienda está activa o pausada, con qué lista de precios vende y de qué depósitos toma el stock. Las promociones (reglas comerciales) y las cuotas tienen sus propias pantallas: [Reglas comerciales](/config/reglas) y [Cuotas](/config/cuotas).

## Cómo se llega

- Menú **Tienda web › Tienda web**, **Tienda web › Métodos de envío** y **Tienda web › Medios de pago**.

## Qué hay en la pantalla

### Tienda web

Si todavía no hay tienda: "Todavía no hay ninguna tienda web (un canal tipo Web minorista)." y el botón **"Crear la tienda web"** ("Se crea pausada, con la lista de precios "Web minorista" si existe.").

Con tienda, una caja de datos que no se editan acá:
- **Dirección de la tienda**: el enlace a la tienda pública (con dominio propio, https://laucen.com; si no, la dirección del sistema + /tienda/slug). Si tiene dominio propio, avisa que si le cambiás el slug deja de abrir en ese dominio.
- **Estado**: "Activa: toma pedidos" o "Pausada: no toma pedidos", con el enlace "Cambiarlo en Canales".
- **Lista de precios** (en rojo "Sin lista" si no tiene), con el enlace "Cambiarla en Configuración → Canales".
- **Feed para Meta (Facebook / Instagram)**: la dirección del feed ("…/feed.xml"), para cargar en Meta Commerce Manager como fuente de datos programada.
- **Vende el stock de**: los depósitos del canal (en rojo "Ningún depósito: elegilos en Canales").

Debajo, la ficha de la tienda, que abre en **modo vista**. Se edita con el **lápiz arriba a la derecha** (con una sola tienda, al lado del título de la pantalla; con varias, en el título de cada una); en edición aparecen **"Grabar"** y **"Cancelar"**. Campos:

- **Nombre que ve el comprador**
- **Dirección (slug)**: minúsculas, números y guiones; la tienda queda en …/tienda/slug.
- Cinco colores, cada uno con "el de siempre" de referencia: **Color de la marca** (la franja de arriba), **Texto sobre la marca** (links e íconos de la franja), **Botones y links** ("Comprar ahora", links, elegido), **Ofertas y envío gratis** (% OFF, cuotas sin interés, envío gratis), **Fondo de la página** (detrás de las tarjetas).
- **Productos sin stock**: "Mostrar (como "sin stock")" u "Ocultar".
- **Logo**, **Banner (la imagen grande de arriba)**, **Banner 2**, **Banner 3**.
- **Bajada (el texto sobre el banner)**: ej. "Envíos a todo el país".
- **Devoluciones (lo que ve el comprador en la ficha y en Ayuda)** y **Garantía**: textos largos.
- **WhatsApp**: formato internacional, sin "+" ni espacios: 54 9, la característica sin 0 y el número sin 15.
- **Mail**, **Dirección del local**, **Horario** (ej. "Lun a vie de 9 a 18").

### Métodos de envío

Arriba a la derecha, **"Descargar Excel"** y **"Nuevo método de envío"**. Buscador **"Buscar método de envío"**.

Columnas (se ordenan tocando el título; de entrada por **Orden**): **Nombre**, **Tipo**, **Activo** (un interruptor Sí/No), **Costo** ("Sin cargo" para retiro, "A convenir", "N provincias · resto $ …" para por provincia, o el importe), **Gratis desde** ("Nunca", el importe, o "—" para retiro y a convenir), **Plazo**, **Instrucciones**, **Orden**, y el lápiz y el tacho ("¿Borrar?").

Tipos: **Retiro en el local**, **Tarifa fija**, **Por provincia**, **A convenir**; **OCA (próximamente)** y **Andreani (próximamente)** se ven deshabilitados.

Al editar una fila (lápiz): Nombre, Tipo, **Costo $**, **Gratis desde $** (vacío = "nunca"), **Plazo**, **Instrucciones**, **Orden**, y el desplegable **"Tarifas por provincia (para el tipo "Por provincia")"** con un campo por cada una de las 24 provincias y **"Resto del país"**. Botones **"Guardar"** y **"Cancelar"**.

### Medios de pago

Una tabla con los cinco medios, siempre los mismos (no se agregan ni se borran): **Mercado Pago**, **Tarjeta (Payway)**, **Transferencia bancaria**, **Efectivo**, **Cuenta corriente / a convenir**. Columnas: **Medio** (con su ayuda), **Activo** (interruptor Sí/No), **Descuento** ("—", el porcentaje, o "recargo N %"), **Instrucciones para el comprador**, **Orden**, y el lápiz.

Al editar (lápiz): **Nombre que ve el comprador**, **Descuento %**, **Orden** e **Instrucciones (lo que ve el comprador al elegirlo)**. Ayuda: "Descuento negativo = recargo (ej. -10 = 10 % más caro)." Botones **"Guardar"** y **"Cancelar"**.

Abajo, **Credenciales** ("Nunca se muestran enteras. Se cambian con el lápiz de cada una: escribí la nueva; un campo vacío deja la que estaba."):
- **Mercado Pago**: **Access token de producción** y **Public key**. Se muestran sólo como "cargada" o "sin cargar".
- **Payway (tarjetas)**: **Llave pública**, **Llave privada**, **Site id** ("cargada"/"sin cargar") y **Ambiente** ("Prueba (sandbox)" o "Producción").
Cada caja tiene su lápiz y, en edición, "Grabar" y "Cancelar".

## Cómo se hace

### Crear la tienda web

1. En [Tienda web](/config/tienda), apretá **"Crear la tienda web"**.
2. Se crea un canal "Tienda web", tipo Web minorista, **pausado**, con la lista "Web minorista" si existe ("Tienda creada (pausada). Completá los datos y activala en Canales.").
3. Completá la ficha (siguiente tarea).
4. En [Canales](/config/canales): elegí la lista de precios si no la tomó, agregá los depósitos de los que vende y, cuando esté lista, pasala a **Activo**.

### Cambiar cómo se ve la tienda

1. Apretá el **lápiz** arriba a la derecha.
2. Cambiá nombre, colores, logo, banners, bajada, textos de devoluciones y garantía, contacto.
3. **"Grabar"**. Aparece "Guardado."

Errores típicos:
- "Poné el nombre que ve el comprador." / "Poné la dirección de la tienda (el slug)."
- "La dirección sólo lleva minúsculas, números y guiones (ej. mi-tienda)."
- "La dirección "…" ya la usa otra tienda. Elegí otra."
- "El WhatsApp va en formato internacional, sólo números (ej. 5493511234567)."
- "El mail no parece válido."

### Ocultar los productos sin stock

Lápiz → **Productos sin stock** → "Ocultar" → **"Grabar"**.

### Pausar la tienda (que no tome pedidos)

En [Canales](/config/canales), lápiz del canal de la tienda → Estado "Pausado" → "Guardar". La tienda se sigue viendo, con el cartel "La tienda no está tomando pedidos en este momento.", y no deja agregar al carrito ni comprar.

### Crear un método de envío

1. En [Métodos de envío](/config/envios), apretá **"Nuevo método de envío"**.
2. Completá **Nombre que ve el comprador**, **Tipo**, **Costo $**, **Gratis desde $** (vacío = nunca), **Plazo** e **Instrucciones**.
3. **"Crear"**. Nace **apagado**: "Creado (apagado). Prendelo cuando esté listo."
4. Si es "Por provincia", se abre solo para cargar las tarifas: "Creado (apagado). Cargá las tarifas por provincia."
5. Prendé el interruptor **Activo**: "Prendido: ya se ofrece en la tienda."

### Cargar tarifas por provincia

1. Lápiz del método → abrí **"Tarifas por provincia"**.
2. Cargá el importe de cada provincia que quieras; **"Resto del país"** para las demás.
3. **"Guardar"**.

### Prender un medio de pago

1. Si es Mercado Pago o Payway, cargá primero sus credenciales (lápiz de su caja en **Credenciales** → escribí las llaves → **"Grabar"**: "Credenciales guardadas.").
2. Prendé el interruptor **Activo** del medio. Si faltan credenciales: "Para prender Mercado Pago cargá primero el access token (abajo, en Credenciales)." o "Para prender Payway cargá primero la llave pública y la privada (abajo, en Credenciales)."

### Poner un descuento por pagar con transferencia

1. Lápiz de **Transferencia bancaria**.
2. **Descuento %**: ej. 10. En **Instrucciones**, CBU, alias, titular y CUIT (es lo que ve el comprador).
3. **"Guardar"**.

Para un recargo, poné el número en negativo (ej. -10 = 10 % más caro).

## Criterios y reglas

### Tienda web

- **Una tienda = un canal tipo Web minorista** (no archivado). "Crear la tienda web" no crea una segunda si ya hay una. Si ya existe un canal llamado "Tienda web" de otro tipo, avisa que le cambies el tipo en Canales.
- **Toma pedidos sólo si el canal está Activo.** Nace pausada.
- **Precios**: salen de la lista de precios del canal; un producto sin precio en esa lista no se vende en la tienda.
- **Stock**: el disponible del canal (la suma de sus depósitos activos).
- **Slug**: único entre todas las tiendas del sistema (de cualquier organización), porque las direcciones son de todos. Se guarda en minúsculas. Si no tiene slug, se usa el nombre del canal en minúsculas y con guiones.
- **Dominios propios**: laucen.com y laucen.com.ar abren la tienda de slug **"tienda"**. Ahí todo abre la tienda (incluso /login), salvo lo que es de la API. El panel se usa desde laucen.vercel.app. Si cambiás el slug "tienda" por otro, los dominios dejan de abrir esa tienda.
- **Logo**: si la tienda no tiene logo propio, usa el de [Empresa](/config/empresa).
- **Colores**: sólo se aceptan colores válidos (formato #RRGGBB); vacío = el de siempre.
- **Devoluciones y garantía**: hasta 1000 caracteres cada uno; si están cargados, se muestran en la ficha del producto y en la Ayuda de la tienda.
- **Imágenes**: sólo imágenes subidas; cualquier otra dirección queda vacía.
- **Grabar no toca** la llave API, los interruptores ni otros datos internos del canal: sólo lo de esta ficha. Un campo que dejás vacío se borra.
- **Feed para Meta**: una entrada por variación activa con precio en la lista de la tienda y con foto.
- **Copia del catálogo**: la tienda guarda su catálogo calculado hasta 60 segundos; un cambio de precio puede tardar hasta un minuto en verse en los listados. La ficha del producto, el carrito y el checkout calculan en vivo.

### Métodos de envío

- **Valen para todas las tiendas** de la organización.
- **Nacen apagados**; sólo los activos se ofrecen en el checkout, en el orden de la columna **Orden** (de menor a mayor).
- **Costo según el tipo**:
  - **Retiro en el local**: sin cargo.
  - **Tarifa fija**: el **Costo $**.
  - **Por provincia**: la tarifa de la provincia que eligió el comprador; si esa provincia no tiene tarifa, la de "Resto del país"; si tampoco hay, el **Costo $**.
  - **A convenir**: $ 0 en el pedido; se muestra "A convenir".
- **Gratis desde $**: si el total de los productos (después de descuentos de reglas y del medio de pago) llega a ese importe, el envío es gratis. Vacío = nunca. Una regla comercial de "envío bonificado" también lo deja gratis.
- **Retiro y A convenir no piden dirección** en el checkout; los demás exigen calle, localidad y provincia.
- **OCA y Andreani**: "próximamente": no se pueden elegir ni prender.
- Los importes son en pesos y no pueden ser negativos.
- La tienda anuncia "Envío gratis desde $ …" con el menor "Gratis desde" de los métodos de tarifa fija o por provincia activos (o "Envío gratis" si una tarifa fija cuesta 0). Sólo si la tienda vende en pesos.

### Medios de pago

- **Valen para todas las tiendas.** Los cinco existen siempre: si falta alguno, se crea apagado al abrir la pantalla.
- **Descuento**: entre -100 % y 100 %; negativo = recargo. Se aplica sobre el total de los productos después de las reglas comerciales (no sobre el envío) y se muestra como "Descuento por pagar con …" o "Recargo por pagar con …".
- **Para prender Mercado Pago** hace falta el access token; **para prender Payway**, la llave pública y la privada.
- **Credenciales**: nunca se muestran, ni en parte; sólo "cargada" o "sin cargar". Un campo vacío al grabar deja la que estaba. Se les sacan los espacios.
- **Qué pasa con el pedido según el medio**:
  - **Mercado Pago**: el comprador va a pagar a Mercado Pago (tarjeta, dinero en cuenta o efectivo). Cuando Mercado Pago avisa que el pago se aprobó, el pedido pasa solo a pagado. Las cuotas máximas que ofrece salen de los planes de cuotas que comparten todos los productos del carrito.
  - **Payway**: paga con tarjeta en la página del pedido; si se aprueba, el pedido queda pagado.
  - **Transferencia**: el pedido queda pendiente de pago hasta que alguien confirma el pago a mano en el pedido.
  - **Efectivo**: el pedido queda «A cobrar»: reserva el stock ya y entra en picking sin esperar el pago; el cobro se confirma al entregarlo.
  - **Cuenta corriente / a convenir**: sólo lo ven y usan los clientes con cuenta en la tienda marcados con cuenta corriente en su ficha. El pedido queda "a convenir" y también reserva el stock y entra en picking enseguida.

## Preguntas frecuentes

**¿Dónde activo o pauso la tienda?**
En [Canales](/config/canales), cambiando el Estado del canal de la tienda.

**¿Dónde cambio con qué precios vende la tienda?**
En [Canales](/config/canales): la lista de precios del canal de la tienda.

**Creé un método de envío y no aparece en la tienda. ¿Por qué?**
Porque nace apagado: prendé su interruptor Activo.

**No me deja prender Mercado Pago.**
Falta cargar el access token en Credenciales.

**¿Cómo hago un recargo por pagar con tarjeta?**
Poné un descuento negativo en ese medio (ej. -10 = 10 % más caro).

**¿Puedo ver la llave de Mercado Pago que está cargada?**
No, nunca se muestra. Si dudás, cargala de nuevo.

**¿Por qué la tienda muestra otro logo que el de la empresa?**
Porque la tienda tiene logo propio; si lo borrás, usa el de [Empresa](/config/empresa).

**¿OCA y Andreani funcionan?**
Todavía no: figuran como "próximamente".

**Cambié un precio y la tienda sigue mostrando el viejo en el listado.**
El listado se actualiza cada minuto; en la ficha del producto ya se ve el nuevo.

## Relacionado

- [Canales](/config/canales)
- [Empresa](/config/empresa)
- [Reglas comerciales](/config/reglas)
- [Cuotas](/config/cuotas)
- [Listas de precios](/catalogo/precios)
- [Pedidos](/ventas/pedidos)
- [Clientes](/ventas/clientes)
