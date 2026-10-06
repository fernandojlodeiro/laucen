---
titulo: La tienda que ve el cliente
menu: Tienda web › Tienda web
ruta: /tienda/[slug]
rutas: /tienda/[slug], /tienda/[slug]/ayuda, /tienda/[slug]/nosotros, /tienda/[slug]/terminos, /tienda/[slug]/privacidad, /tienda/[slug]/arrepentimiento, /tienda/[slug]/buscar, /tienda/[slug]/carrito, /tienda/[slug]/checkout, /tienda/[slug]/cuenta, /tienda/[slug]/familia/[id], /tienda/[slug]/pedido/[codigo], /tienda/[slug]/producto/[id]
permiso: todos
resumen: Cómo es la tienda web pública (en su dominio propio, ej. daitom.com.ar) que ve el comprador, cómo compra paso a paso y cómo llegan esos pedidos y pagos al sistema.
---

## Para qué sirve

Es la tienda online que ve el cliente final, armada como los grandes marketplaces: buscador, categorías, ofertas, ficha de producto, carrito, compra en un paso, página del pedido y "Mis compras". No pide usuario del sistema: la puede abrir cualquiera.

Todo lo que muestra sale del sistema: los productos y fotos del [catálogo](/catalogo/productos), los precios de la lista de precios del canal de la tienda, el stock de los depósitos de ese canal, las promociones de [Reglas comerciales](/config/reglas), las cuotas de [Cuotas](/config/cuotas), y los envíos, medios de pago, colores y textos de [Tienda web](/config/tienda), [Métodos de envío](/config/envios) y [Medios de pago](/config/medios-pago).

Cada compra crea un **pedido** en [Pedidos](/ventas/pedidos), en el canal de la tienda.

## Cómo se llega

- Por su **dominio propio** (ej. daitom.com.ar), si la tienda tiene uno cargado en [Tienda web](/config/tienda) › Dominios: abre directamente la tienda (sin "/tienda" en la dirección). Los dominios que "redirigen" (ej. www.daitom.com.ar, tiendavirtual.com) llevan solos al principal.
- Desde el panel: la dirección figura en [Tienda web](/config/tienda) ("Dirección de la tienda"). Sin dominio propio, la tienda abre en laucen.com/tienda/<slug>.
- En el dominio de una tienda todo abre la tienda, también /login: el panel se usa desde laucen.com.

## Qué hay en la pantalla

### Encabezado (en todas las páginas)

- La franja con el **logo** (o el nombre de la tienda), el **buscador** grande con sugerencias mientras se escribe, y la **bajada** a la derecha.
- **"Enviar a …"**: muestra la localidad del comprador con cuenta, o el código postal que cargó; si no, "Ingresá tu código postal".
- El menú de **categorías** (hasta tres niveles), y los atajos **Ofertas**, **Más vendidos** y **Ayuda**.
- **"Ingresá"** (o "Hola, <nombre>" si tiene cuenta), **"Mis compras"** y el **carrito** con la cantidad de unidades.
- En el celular, un menú con Inicio, Ofertas, Más vendidos, Mis compras, Carrito y Ayuda.
- Si la tienda está pausada, un cartel arriba: "La tienda no está tomando pedidos en este momento."
- Si hay WhatsApp cargado, un botón verde flotante abajo a la derecha.

### Pie

Columnas **Ayuda** (Cómo comprar, Envíos y retiros, Medios de pago, Devoluciones y garantía), **Sobre <tienda>** (Sobre nosotros, Términos y condiciones, Política de privacidad, Botón de arrepentimiento), **Mi cuenta** y **Contacto** (mail, WhatsApp, dirección, horario). Abajo, el copyright con la razón social, el CUIT, la condición frente al IVA y el domicilio (de la razón social principal, en [Razones sociales](/config/razones-sociales)), y los enlaces a Defensa del Consumidor, Botón de arrepentimiento y Términos y condiciones.

### Portada

- Los **banners** que pasan solos (si no hay ninguno, una franja con el nombre, la bajada y "Ver todos los productos").
- Cinco **atajos**: Ingresá a tu cuenta / Mis compras, Medios de pago, Envíos (o "Envío gratis desde $ …"), Más vendidos y Ayuda.
- Carruseles: **Destacados** (primero; los elegís vos en [Portada de la tienda](/config/tienda/portada)), **Ofertas**, **Más vendidos** (ventas de todos los canales), **Novedades** (los últimos cargados, o los que elijas), la grilla de **Categorías** con foto y **Destacados en …** de las tres categorías con más productos.

### Listados (buscar, categoría, ofertas, más vendidos)

- Título, migas ("Inicio › Categoría › Subcategoría") y la cantidad de resultados.
- A la izquierda, los filtros: **Filtros aplicados** (cada uno con su X), **Envío gratis**, **Categorías**, **Descuentos** ("Con descuento"), **Marca**, **Precio** (tres rangos armados solos y "Mínimo"/"Máximo").
- **"Ordenar por"**: Más relevantes, Menor precio, Mayor precio, Más vendidos. Vista en lista o grilla.
- Cada tarjeta: foto, cucardas, "Más vendido", precio (con el precio de lista tachado y "% OFF" si hay descuento; "Desde" si las variaciones tienen distinto precio), cuotas ("Mismo precio en N cuotas de $ …" si son sin interés), "Envío gratis", "Sin stock", "¡Última disponible!" o "Últimas N disponibles".
- De a 24 productos por página, con "Anterior" / "Siguiente".
- Sin resultados: "No hay publicaciones que coincidan con "…"." con consejos.

### Ficha de producto

- Galería de fotos (las de la variación elegida primero).
- "Nuevo | +N vendidos", cucardas, "Ver más productos de <marca>", el título, el precio y las cuotas, los botones de cada variación (color, talle…), y "Lo que tenés que saber de este producto".
- La caja de compra: envío ("Envío gratis a domicilio", "Envío a domicilio por $ …" o "Calculamos el costo al finalizar la compra"; "Retirá gratis" si hay retiro), el stock ("Stock disponible", "¡Última disponible!", "Sin stock"), **Cantidad** (hasta 30 o el stock), **"Comprar ahora"** y **"Agregar al carrito"**; devolución y garantía si están cargadas.
- "Información del vendedor" (con "Hace factura A." si la empresa es Responsable inscripto) y "Medios de pago" con las cuotas y los descuentos por medio.
- Abajo: **Productos relacionados** (de la misma categoría, con stock), **Características del producto** y **Descripción**.

### Carrito

Las líneas con foto, título, **"Eliminar"**, cantidad con **−** y **+** (el + se apaga cuando no hay más stock), "N disponibles" y el precio. Una barra de "Sumá $ … más para tener envío gratis" o "¡Tu compra tiene envío gratis!". A la derecha, **"Resumen de compra"**: productos, descuentos que ya aplican, envío ("Se calcula en el paso siguiente"), total y **"Continuar compra"**. Avisa si no alcanza el stock o si algún producto ya no está disponible.

### Finalizar compra (checkout)

Una sola página con tres bloques y el resumen al costado:

1. **Tus datos**: Nombre y apellido, Mail, Teléfono, DNI o CUIT; si es un CUIT, Razón social y Condición frente al IVA (para factura A).
2. **Entrega**: los métodos de envío activos, cada uno con su costo ("Gratis", "A convenir", "Según provincia"…); los que piden dirección muestran Calle, Número, Piso / depto, Localidad, Provincia, Código postal y Referencia para el envío. Los de OCA se cotizan con el código postal ("Según código postal" mientras no esté) y muestran en cuántos días hábiles llega; con **OCA a sucursal** aparece **"Sucursal de OCA donde lo retirás"** con las sucursales de ese código postal. Andreani aparece como "Próximamente".
3. **Medio de pago**: los medios activos, con su descuento y su explicación.
4. **Notas** (opcional).

El resumen se recalcula solo al cambiar envío, medio o provincia. Botón **"Confirmar compra"** ("Al confirmar se crea tu pedido y te mostramos cómo seguir."). Arriba, "¿Ya tenés cuenta? Ingresá".

### Página del pedido

La abre el link del pedido (por su código, sin necesidad de cuenta):
- "¡Gracias por tu compra!" o "¡Recibimos tu pedido!", el número de pedido, la fecha y el estado en criollo.
- Según el medio: cómo transferir (total e instrucciones, y "Avisanos por WhatsApp cuando transfieras"), cómo pagar en efectivo, el formulario de tarjeta de Payway, o "Reintentar con Mercado Pago" / "¿No llegaste a pagar? Pagá ahora".
- **Seguimiento del envío** (transportista, estado, número de seguimiento, fecha estimada), cuando hay.
- **Detalle**: productos, ahorro ("Ahorraste $ … : ya está aplicado en los precios"), envío, total, medio de pago y dirección de entrega.
- **"Creá tu cuenta en un clic"**: una contraseña de 8 caracteres o más y **"Crear mi cuenta"**.

### Mi cuenta

Sin sesión: **"Ingresá tu mail y contraseña"** con **"Ingresar"** (y "Seguir sin cuenta" si venía del checkout). Con sesión: "Hola, <nombre>", **"Salir"** y **Mis pedidos** (número, fecha, unidades, total y estado; cada uno lleva a su página).

### Ayuda

"¿Con qué podemos ayudarte?": **Cómo comprar**, **Envíos y retiros**, **Medios de pago**, **Devoluciones y garantía** (si están cargadas) y **Contacto**.

### Páginas institucionales y legales

Se llega desde el pie de la tienda (columna **"Sobre <tienda>"** y la línea de abajo):

- **Sobre nosotros**: el texto que la tienda carga en [Tienda web](/config/tienda) (campo "Sobre nosotros"); sin texto, una presentación general. Siempre muestra los datos de quién vende (razón social, CUIT, domicilio, mail) y el horario.
- **Términos y condiciones**: quién vende, precios y stock, cómo se compra, medios de pago, facturación, envíos, **derecho de arrepentimiento (10 días corridos)**, devoluciones y garantía (con lo cargado en Tienda web, o la garantía legal si no hay), propiedad intelectual, responsabilidad, ley aplicable y defensa del consumidor.
- **Política de privacidad**: datos que se recolectan, para qué, con quién se comparten, derechos del titular (Ley 25.326) y cookies.
- **Botón de arrepentimiento**: el comprador pide revocar la compra; se abre un mail (o un WhatsApp) a la tienda con el asunto y los datos a completar.
- El pie también lleva el cartel **"Defensa de las y los Consumidores. Para reclamos ingresá acá"** (enlace al organismo oficial), obligatorio para los comercios.

Los datos del vendedor salen de la **razón social principal** (ver [Razones sociales](/config/razones-sociales)). Los textos legales son un modelo general para comercio electrónico en Argentina: conviene que los revise quien asesora legalmente a la empresa.

## Cómo se hace

### Cómo compra un cliente (para explicárselo)

1. Busca el producto con el buscador o por categorías.
2. En la ficha elige la variante y la cantidad y toca **"Comprar ahora"** (va directo a finalizar) o **"Agregar al carrito"**.
3. En el carrito toca **"Continuar compra"**.
4. Completa sus datos, cómo lo recibe y cómo paga, y toca **"Confirmar compra"**. No hace falta tener cuenta.
5. Según el medio: Mercado Pago lo lleva a pagar ahí; Payway le pide la tarjeta en la página del pedido; transferencia y efectivo le muestran las instrucciones.
6. Queda en la página de su pedido, con el número y el estado. Ahí puede crear su cuenta en un clic.

### Seguir un pedido de la tienda desde el panel

1. Abrí [Pedidos](/ventas/pedidos) y filtrá por el canal de la tienda.
2. El pedido aparece con el número que vio el cliente (#N), sus líneas, el envío y el medio de pago.
3. Si pagó por **transferencia**, cuando la veas acreditada apretá en el pedido **"Confirmar pago de $ …"**: pasa a pagado.
4. Si es **efectivo al retirar**, ya entró en picking; al entregarlo se usa **"Entregado y cobrado"**.

### El cliente dice que pagó con Mercado Pago pero el pedido sigue pendiente

Mercado Pago avisa solo cuando aprueba el pago; puede tardar unos minutos. Si el pago no se completó, el cliente ve "El pago no se completó" y puede usar **"Reintentar con Mercado Pago"** en la página de su pedido.

## Criterios y reglas

### Qué productos se muestran

- **La web es un canal más**: un producto se ve en la tienda sólo si está **publicado en ese canal web** (el interruptor "Publicado en Web minorista" de la pestaña Publicaciones de su ficha en [Productos](/catalogo/productos)). Además tiene que estar **activo**, tener alguna **variación activa** y esa variación tiene que tener **precio en la lista de precios del canal**. Sin precio en esa lista, no aparece aunque esté publicado.
- Al arrancar (4/10) quedaron publicados en las dos webs los productos que tenían alguna publicación activa en Mercado Libre; los demás, no.
- El precio que se muestra en los listados es el **más bajo** de sus variaciones ("Desde" si varían).
- **Productos sin stock**: se muestran como "Sin stock" o se ocultan, según lo que diga [Tienda web](/config/tienda).
- **Stock** = el disponible del canal de la tienda (la suma de sus depósitos activos).
- **"Ofertas"** = productos cuyo precio de venta es menor que el de lista.
- **"Más vendidos"**: por unidades vendidas en todos los pedidos (salvo cancelados y devueltos). La etiqueta "Más vendido" la llevan los 10 que más vendieron, con un mínimo de 3 unidades.
- **"Novedades"**: los productos más nuevos con stock.
- **Categorías**: sólo las que tienen productos en la tienda (contando sus subcategorías). Elegir una categoría incluye sus subcategorías.
- **Buscador**: busca todas las palabras en el título, la marca o los SKU, sin importar acentos ni mayúsculas. Ordenando por "Más relevantes", primero los títulos que empiezan con lo buscado, después los que lo contienen, y con stock antes que sin stock.
- **Cucardas**: las vigentes hoy del producto y las de su categoría (y categorías de más arriba).
- **Cuotas**: las del producto; si no tiene, las de su categoría más cercana. Se muestra el mejor plan sin interés; si no hay, el de más cuotas.
- **Copia del catálogo**: los listados, la portada y el buscador usan una copia que se renueva cada 60 segundos. La ficha, el carrito y el checkout calculan **en vivo**.

### Carrito y precios

- El carrito vive en el navegador del comprador (dura 30 días; hasta 60 productos distintos y 999 unidades de cada uno). Los precios no se guardan: se recalculan cada vez.
- **No se puede agregar más de lo disponible**: "Ese producto está sin stock.", "Queda 1 sola unidad." o "Quedan N unidades y ya tenés N en el carrito".
- Con la tienda pausada no se puede agregar al carrito ni comprar.
- **Cómo se calcula el total** (la misma cuenta en el carrito, el checkout y el pedido):
  1. Cada línea a su **precio de venta** de la lista del canal (con el descuento propio del producto, si tiene).
  2. Las **reglas comerciales** activas y vigentes (por cantidad mínima, monto mínimo o medio de pago), en orden de prioridad. Una regla no acumulable no se suma a otras.
  3. El **descuento o recargo del medio de pago**, sobre lo que quedó.
  4. El **envío**, según el método y la provincia; gratis si los productos llegan al "Gratis desde" del método o si una regla bonifica el envío.
- Los descuentos quedan **ya aplicados en el precio de cada línea** del pedido (por eso en la página del pedido dice "ya está aplicado en los precios").

### Al confirmar la compra

- Se vuelve a calcular todo con los precios y el stock **del momento**. Si no alcanza el stock: "No alcanza el stock: … Ajustá las cantidades."
- Hace falta nombre y un mail válido; con un método que no es retiro ni a convenir, calle, localidad y provincia.
- Un **DNI o CUIT de 11 dígitos** se toma como CUIT (y permite cargar razón social y condición frente al IVA para factura A).
- Se crea el **pedido** en el canal de la tienda, en estado **nuevo**, con un **código** de seguimiento secreto (el de la dirección de la página del pedido). Si el comprador tiene cuenta, el pedido queda en su cliente; si no, se crea o se reconoce el cliente con sus datos.
- Se vacía el carrito.
- **Según el medio de pago**:
  - **Mercado Pago**: pago pendiente; se lo manda a Mercado Pago. Cuando Mercado Pago avisa que lo aprobó, el pago queda aprobado y el pedido pasa a **pagado** (y ahí reserva el stock). Si se rechaza, el pedido sigue nuevo y puede reintentar.
  - **Payway**: pago pendiente; paga con la tarjeta en la página del pedido. Las cuotas permitidas son las que comparten todos los productos del pedido. Aprobado → **pagado**.
  - **Transferencia**: pago **pendiente** hasta que alguien lo confirma a mano en el pedido.
  - **Efectivo**: pago **«A cobrar»**: el pedido reserva el stock al crearse y entra en picking sin esperar el pago; el cobro se confirma al entregarlo, y recién ahí se factura.
  - **Cuenta corriente / a convenir**: sólo para clientes con cuenta en la tienda marcados con cuenta corriente. Pago "a convenir": también reserva y entra en picking enseguida; se factura como siempre.
- Cuando un pedido reserva o vende stock, se le avisa a Mercado Libre el stock nuevo de esos productos (si el canal de ML tiene prendido "Laucen manda el stock").

### Estados que ve el comprador

Cancelado, Devuelto, Entregado, **En camino** (despachado), **Listo para retirar** / **Listo para enviar** (preparado), **En preparación**, **Pagado**, **Recibido** (a convenir), **Recibido · lo pagás al retirar** (efectivo) y **Pendiente de pago**.

### Cuentas de los compradores

- Son cuentas de la tienda, **no usuarios del sistema**: no entran al panel.
- Se crean "en un clic" desde la página del pedido, poniendo una contraseña de 8 caracteres o más; el mail y los datos salen del pedido. No puede haber dos cuentas con el mismo mail.
- La sesión dura 60 días en ese navegador.
- Con cuenta, el checkout viene precargado con sus datos y su dirección principal, y en "Mis pedidos" ve los pedidos de esa tienda.
- No hay hoy un "olvidé mi contraseña" en la tienda.

### Otros

- El código postal de "Enviar a …" se guarda en el navegador un año y precarga el del checkout.
- La página del pedido no aparece en buscadores.
- Feed para Meta (Facebook/Instagram): la tienda publica su catálogo en …/feed.xml (ver [Tienda web](/config/tienda)).

## Preguntas frecuentes

**¿El cliente necesita cuenta para comprar?**
No. Puede crearla después, en un clic, desde la página de su pedido.

**¿Dónde veo los pedidos de la tienda?**
En [Pedidos](/ventas/pedidos), en el canal de la tienda.

**Un cliente pagó por transferencia. ¿Qué hago?**
Cuando la veas acreditada, abrí el pedido y apretá "Confirmar pago de $ …".

**¿Por qué un producto no aparece en la tienda?**
Puede estar inactivo, no tener precio en la lista de precios del canal de la tienda, o estar sin stock con la tienda configurada para ocultar los sin stock.

**¿Por qué el precio de la tienda es distinto al de Mercado Libre?**
Porque la tienda usa la lista de precios de su propio canal (ver [Canales](/config/canales)).

**¿La compra en efectivo reserva el stock?**
Sí: el pedido «A cobrar» reserva al crearse y entra en picking sin esperar el pago.

**¿Cada cuánto se actualizan precios y stock en la tienda?**
En la ficha, el carrito y el checkout, en vivo; en los listados y la portada, hasta un minuto de demora.

**El cliente olvidó su contraseña de la tienda.**
Hoy no hay recuperación en la tienda: puede comprar sin cuenta igual.

**¿Puedo entrar al panel desde el dominio de la tienda?**
No: en el dominio de la tienda todo abre la tienda. El panel se usa desde laucen.com.

**Entro por un dominio y dice "Este dominio todavía no está configurado".**
El dominio apunta a Laucen, pero ninguna tienda lo tiene cargado. Cargalo en [Tienda web](/config/tienda) › Dominios.

## Relacionado

- [Tienda web](/config/tienda)
- [Métodos de envío](/config/envios)
- [Medios de pago](/config/medios-pago)
- [Reglas comerciales](/config/reglas)
- [Cuotas](/config/cuotas)
- [Pedidos](/ventas/pedidos)
- [Picking](/deposito/picking)
- [Canales](/config/canales)
- [Productos](/catalogo/productos)
