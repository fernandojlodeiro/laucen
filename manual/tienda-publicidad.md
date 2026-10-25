---
titulo: Publicidad
menu: Configuración › Tienda web › Publicidad
ruta: /config/tienda/publicidad
rutas: /config/tienda/publicidad
permiso: tienda_config
resumen: Google Ads, Meta (Facebook e Instagram) y TikTok en la tienda web. Por dominio, las etiquetas que miden las ventas; por tienda, los catálogos de productos para los anuncios.
---

## Para qué sirve

Para hacer publicidad de la tienda en **Google** (Búsqueda y Shopping), **Meta** (Facebook e Instagram) y **TikTok**, cada plataforma necesita dos cosas:

- **Saber qué anuncio terminó en una venta.** La tienda le avisa cuando alguien mira un producto, lo agrega al carrito, empieza a pagar y compra, con el valor y el SKU de cada producto. Así la plataforma aprende a quién mostrarle los anuncios y te dice cuánto vendió cada campaña.
- **El catálogo de productos**, para los anuncios que muestran el producto con su foto y su precio (Shopping en Google, catálogo en Meta y TikTok).

## Cómo se llega

Menú **Configuración › Tienda web › Publicidad**. Si hay más de una tienda web, arriba elegís cuál.

## Qué hay en la pantalla

- **Medición de ventas, por dominio**: una ficha por cada dominio que abre la tienda (el principal y los de otra marca; los que sólo redirigen no miden nada). En cada una:
  - **Google**, con su interruptor: **ID de la etiqueta de Google** (empieza con AW-), **Etiqueta de conversión (compra)** (lo que va después de la barra en «AW-…/…») e **ID de Google Analytics** (empieza con G-; opcional).
  - **Meta**, con su interruptor: **ID del píxel de Meta** (sólo números).
  - **TikTok**, con su interruptor: **ID del píxel de TikTok** (letras y números).
  - **Con transferencia o efectivo, la venta cuenta al hacer el pedido** (tildado de entrada).
  - **Mandar el mail y el teléfono del comprador con la compra**.
- **Catálogos de productos**: la dirección del catálogo de cada plataforma en cada dominio, **cuántos productos salen** y cuántos quedan afuera y por qué (sin stock, sin foto, excluidos), y las **bandas de precio**. Los productos sin stock nunca van.
- **Grupos de campaña por categoría**: el grupo de cada categoría (por ejemplo «notebooks», «impresoras_3d», «componentes»).
- **No van al catálogo**: las categorías y los productos que no se anuncian.

Cada ficha abre en vista; se cambia con el **lápiz** y **"Grabar"**. Los interruptores prenden y apagan cada plataforma al momento.

## Cómo se hace

### Prender la medición de una plataforma
1. Creá la cuenta en la plataforma (Google Ads, Administrador de eventos de Meta, TikTok Ads Manager) y copiá el ID de la etiqueta o del píxel. En Google, además, creá la conversión «Compra» y copiá su etiqueta de conversión.
2. En la ficha del dominio, apretá el **lápiz**, pegá los IDs y **"Grabar"**. Si un ID no tiene el formato de la plataforma, la pantalla avisa y no lo graba.
3. Prendé el **interruptor** de la plataforma. En un minuto la tienda ya manda los eventos.
4. Probalo con la herramienta de cada plataforma (Tag Assistant en Google, el Asistente de píxeles de Meta, el TikTok Pixel Helper): abrí un producto, agregalo al carrito y mirá que aparezcan los eventos.

### Cargar el catálogo en una plataforma
Copiá la dirección de esa plataforma (por ejemplo `https://daitom.com.ar/feeds/google.xml`) y cargala una vez como fuente programada o feed por URL: en Google Merchant Center (Productos › Fuentes de datos), en el Administrador de ventas de Meta (Catálogo › Fuentes de datos) o en el Catálogo de TikTok. La plataforma la vuelve a leer sola (programala todos los días).

### Separar campañas por tipo de producto
En **Grupos de campaña por categoría**, **"+ Agregar categoría"**: elegí la categoría y escribí el grupo. En la plataforma, armá una campaña por grupo con la «etiqueta personalizada 0». La «etiqueta personalizada 1» es la banda de precio.

### Sacar algo del catálogo
En **No van al catálogo**, **"+ Agregar"**: una categoría (con sus subcategorías) o un producto por su SKU. Para que vuelva, el tacho.

## Criterios y reglas

- **Los eventos**, con sus nombres en cada plataforma:

  | Qué pasó | Google | Meta | TikTok |
  |---|---|---|---|
  | Miró un producto (la ficha) | view_item | ViewContent | ViewContent |
  | Lo agregó al carrito | add_to_cart | AddToCart | AddToCart |
  | Empezó a pagar (la página de pago) | begin_checkout | InitiateCheckout | InitiateCheckout |
  | Compró | purchase y la conversión de Google Ads | Purchase | CompletePayment |

  Cada uno va con la moneda, el valor y los productos (SKU, nombre, precio y cantidad). El SKU es el mismo que va en el catálogo: así la plataforma cruza la venta con el anuncio del producto.
- **Cuándo cuenta una compra**: en la página del pedido que ve el comprador. Con tarjeta y Mercado Pago, cuando el pago queda aprobado (si vuelve de Mercado Pago antes de que llegue el aviso del pago, la página se actualiza sola un par de minutos). Con transferencia y efectivo, al hacer el pedido si está tildado «la venta cuenta al hacer el pedido»; si no, cuando el pedido se marca pagado y el comprador vuelve a abrir su pedido.
- **Una sola vez por pedido**: el número de pedido viaja con la compra y la plataforma no la cuenta dos veces aunque el comprador recargue la página.
- **El valor de la compra** es lo que se cobró de productos (con los descuentos), sin el envío; el envío va aparte.
- **Mail y teléfono del comprador** (si está tildado): Google y TikTok los usan cifrados para reconocer ventas que si no se pierden.
- **Cada dominio mide lo suyo**: las etiquetas de un dominio sólo están en las páginas de ese dominio.
- **Qué entra al catálogo**: una fila por variación publicada en la tienda, activa y con precio; sin foto no va; sin stock nunca va. Lo excluido no va.
- **El precio en el catálogo**:
  - **Google**: sólo el precio que paga el comprador en la ficha (el precio grande), sin el tachado. Google controla que un precio tachado se haya cobrado de verdad y si no lo puede comprobar desaprueba el producto. El mismo precio va en los datos de la ficha que lee Google.
  - **Meta y TikTok**: el tachado como precio y el precio grande como precio con descuento, así el anuncio muestra la rebaja.
- **Los datos de cada producto**: título (hasta 150 letras), descripción, link a la ficha en ese dominio, hasta 10 fotos, disponibilidad, condición (nuevo, usado o reacondicionado), marca, código de barras (sólo si es un código válido), modelo, el camino de la categoría («Computación > Notebooks…»), el peso si está cargado, el grupo de campaña y la banda de precio.
- **Los datos de la ficha para Google** (schema.org): nombre, fotos, descripción, SKU, marca, código de barras si es válido y la oferta (precio grande, moneda, disponibilidad y link), en todas las fichas, aunque no haya ninguna plataforma prendida.
- **La dirección vieja del catálogo de Meta** (`/tienda/<tienda>/feed.xml`) sigue andando y da lo mismo que `/feeds/meta.xml`.

## Preguntas frecuentes

**¿Por qué Google desaprueba un producto por el precio?** Porque el precio de la ficha no coincide con el del catálogo. Los dos salen del mismo lugar; si cambiaste un precio, Google lo ve en la próxima lectura del catálogo.

**¿Por qué un producto no está en el catálogo?** Mirá el resumen de **Catálogos de productos**: sin stock, sin foto o excluido (por su categoría, por una categoría de arriba, o por SKU).

**¿Se mide algo en tiendavirtual.com o deirolab.com?** Sólo si cargás las etiquetas en la ficha de ese dominio.
