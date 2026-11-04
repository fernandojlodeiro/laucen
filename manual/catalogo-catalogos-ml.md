---
titulo: Catálogos que armó ML
menu: Catálogo › Catálogos que armó ML
ruta: /catalogo/catalogos-ml
rutas: /catalogo/catalogos-ml
permiso: precios_ml_ver
resumen: Los catálogos de Mercado Libre donde gana otro vendedor, con el botón «Ganar» para ponerse al precio para ganar en el momento, y las publicaciones de catálogo que Mercado Libre creó solo en tus cuentas (si el catálogo es el mismo producto, su marca y cómo les va).
---

## Para qué sirve

Dos cosas: ver **en qué catálogos gana otro vendedor** y ganarlos con un botón (pestaña «Perdemos»), y revisar las publicaciones de catálogo que **Mercado Libre creó solo** en tus cuentas.

Mercado Libre a veces pone por su cuenta una publicación tuya a competir en un catálogo (el aviso «ahora competís para ser la primera opción de compra»): crea una publicación de catálogo nueva en tu cuenta, vinculada al mismo producto. Esta pantalla las junta para revisar tres cosas:

- **Si el catálogo es el mismo producto** que el tuyo y si su marca sirve.
- **Cómo le va**: si gana el botón de compra, lo comparte o lo pierde, y si el que gana es otra de tus cuentas o un vendedor de afuera.
- **Qué conviene hacer**, en una frase.

Desde acá no se cambia nada en Mercado Libre: los precios se cambian en [Precios en Mercado Libre](/catalogo/precios-ml) con «Preparar cambios».

## Cómo se llega

- Menú **Catálogo › Catálogos que armó ML**.
- El superadministrador ve en la barra de estado de abajo el aviso **«Catálogos ML (N)»** cuando hay alguno para revisar; al tocarlo abre esta pantalla.
- Hace falta el permiso «Precios en Mercado Libre».

## Qué hay en la pantalla

- Pestaña **«Perdemos»** (la primera): los catálogos donde el botón de compra lo tiene un vendedor que no es ninguna de tus cuentas. Por cada catálogo, el producto (foto, SKU, título, enlace al catálogo y su precio de lista Clásicas), **Gana** (a cuánto vende el ganador y su publicación) y **una fila por cada publicación tuya en ese catálogo**, de todas las cuentas:
  - **Cuenta** y **Publicación** (con su plan).
  - **Hoy**: a cuánto se vende hoy, con la campaña en curso (debajo, tachado, el precio publicado).
  - **Objetivo**: el precio para ganar que da Mercado Libre para esa publicación. Es lo mínimo que hay que bajar para ganar.
  - **Bajar**: cuánto hay que bajar desde hoy para llegar al objetivo, en pesos y en %. «Ya alcanza» quiere decir que el precio de hoy alcanza y pierde por otra cosa (envío, cuotas, reputación).
  - Si la publicación **no compite** en el catálogo, en lugar del objetivo dice por qué (por ejemplo, «no tiene Mercado Envíos»): bajar el precio no sirve y no tiene botón «Ganar».
  - **Neto hoy** y **Neto ganando**: lo que queda después de la comisión de Mercado Libre y el envío (con «*» si el envío todavía no se conoce).
  - El botón **«Ganar»**, o **«Fijada a $ …»** con el botón **«Soltar»** si ya se ganó con el botón.
- Pestaña **«Páginas armadas por ML»**: lo mismo que «Perdemos», pero de las páginas que arma Mercado Libre juntando publicaciones parecidas (no son una ficha de catálogo de la marca o de Mercado Libre). En ellas la información de Mercado Libre sobre quién gana no coincide con lo que ve el comprador (el orden de vendedores va por precio y el precio para ganar puede ser absurdo), así que hay que mirar la página: no tienen botón «Ganar» y no cuentan en los avisos.
- Pestañas **«Armados por ML: para revisar»** y **«Armados por ML: todos»**: las publicaciones de catálogo que Mercado Libre creó solo en tus cuentas. Una fila por publicación: **Producto**, **Cuenta**, **Situación**, **Precio** (el publicado), **P/ganar**, **Ganador**, **% Clás.** (cuánto abajo de la Clásica queda el precio para ganar), **Qué hacer**, **Catálogo** (el producto de catálogo, su marca y si es el mismo producto) y **Visto**.
- Buscador por SKU, título, publicación, cuenta o catálogo.

## Cómo se hace

### Ganar un catálogo

1. En la pestaña «Perdemos», buscá el producto.
2. Mirá las publicaciones tuyas de ese catálogo: el precio para ganar cambia según el plan (Mercado Libre le da ventaja a la Premium, por las cuotas) y el neto ganando dice cuánto te queda en cada una.
3. Apretá **«Ganar»** en la que prefieras.
4. En el momento se le pide a Mercado Libre el precio para ganar de esa publicación, se la saca de las campañas en curso y se le pone ese precio. Arriba aparece el precio que se mandó; en la fila, «Mandando $ …» mientras sale y «Fijada a $ …» cuando Mercado Libre lo aceptó. Si no lo aceptó, la fila lo dice en rojo con el motivo.

### Soltar una publicación

- **«Soltar»** en la fila: la publicación vuelve al cálculo de [Precios en Mercado Libre](/catalogo/precios-ml) y, si la cuenta tiene los precios automáticos prendidos, se recalcula en el acto (vuelve a su tachado y sus campañas).

## Criterios y reglas

### Catálogo de verdad y página armada por ML

- Mercado Libre tiene dos clases de catálogo: la **ficha de catálogo**, con los datos del producto de la marca o de Mercado Libre (por ejemplo, una cámara Raspberry Pi), y la **página armada por Mercado Libre**, que se arma con los datos de la publicación de un vendedor y junta las parecidas (por eso puede llevar la marca propia de ese vendedor).
- En los dos se compite por el botón de compra, que no lo gana sólo el precio: también cuentan la reputación, el envío y la demora.
- «Perdemos» muestra sólo las fichas de catálogo; las páginas armadas por Mercado Libre van en su pestaña aparte.

### Cuáles aparecen en «Perdemos»

- Todos los catálogos donde tenés al menos una publicación de catálogo activa y no gana ni comparte el primer lugar ninguna tuya, y el primero de la lista de vendedores del catálogo no es ninguna de tus cuentas. Quién gana se lee de Mercado Libre cada 6 horas.
- Si gana o comparte cualquiera de tus publicaciones (de cualquier cuenta), el catálogo no aparece.
- **Una sola cuenta por producto**: de cada catálogo se muestran sólo las publicaciones de la primera cuenta, en el orden de las cuentas (la principal primero), que tenga alguna publicación que compite. Las de las otras cuentas no se muestran (salvo las ya fijadas con «Ganar», para poder soltarlas). Si ninguna compite, se muestran todas con el motivo.
- Una publicación fijada con «Ganar» sigue apareciendo para poder soltarla.

### Qué hace «Ganar»

- Usa el **precio para ganar que da Mercado Libre en ese momento** para esa publicación (redondeado para abajo). Es lo mínimo que hay que bajar.
- Saca la publicación de las campañas en curso (así el comprador paga exactamente ese precio) y le cambia el precio. Sale por la cola de Mercado Libre, sin lote: el botón es el clic.
- La publicación queda **fijada**: el cálculo de precios no la toca (ni tachado ni campañas) hasta que se la suelta.
- Si la publicación ya está ganando, no compite (Mercado Libre no la pone en el catálogo, por ejemplo por no tener Mercado Envíos), el precio de hoy ya alcanza o Mercado Libre no da un precio para ganar, no se cambia nada y la pantalla lo avisa.
- **Gana**: la publicación que tiene el botón de compra según Mercado Libre y su precio.

### Cuáles aparecen en «Armados por ML»

- Las publicaciones de catálogo de los últimos 15 días que **no creó el sistema** (no salieron de la cola de Mercado Libre del sistema). Se revisan solas con cada lectura de Mercado Libre.

### La situación

- **Gana**: tiene el botón de compra.
- **Comparte el 1.er lugar**: lo comparte con otros vendedores.
- **Gana otra nuestra**: el botón de compra lo tiene otra publicación de cualquiera de tus cuentas de Mercado Libre (se ve cuál en «Qué hacer»). No hace falta nada: el comprador igual te compra a vos.
- **Pierde contra otro vendedor**: gana un vendedor que no es ninguna de tus cuentas. «Qué hacer» dice a cuánto hay que bajar.
- **En revisión de ML**: Mercado Libre la está revisando y todavía no la pone a competir.
- **Todavía no compite**: Mercado Libre todavía no la puso en el catálogo, o no hay precio para ganar leído.
- Quién gana se lee de Mercado Libre cada 6 horas: el primero de la lista de vendedores del catálogo.

### La campaña

- Las publicaciones de catálogo que crea Mercado Libre entran solas a la campaña, como cualquier publicación nueva, en las cuentas que tienen prendidos los precios automáticos (Configuración › Canales). No hace falta nada desde esta pantalla.

### Cuánto se puede bajar

- En las publicaciones Clásicas se compara el precio para ganar con la lista Clásicas: si queda **hasta un 3 %** abajo, se puede bajar; si queda más abajo, no conviene.
- En los otros planes (Premium, cuotas) el precio no se compara con la Clásica: «Qué hacer» sólo dice a cuánto habría que bajar.

### El control del catálogo

- **Marca**: un catálogo con una marca nuestra o de fábrica sirve. Una página que armó Mercado Libre con la marca de otro vendedor, o una marca de las que no se tocan, trae denuncias: se marca «de otro vendedor».
- **Producto**: la IA compara el producto de catálogo (nombre y características) con el tuyo y dice **Mismo producto**, **Parecido** u **Otro producto**, con el motivo al pasar el mouse. «Otro producto» pide atención.

### Qué pide atención

Una fila va a «Para revisar» si pierde contra otro vendedor, el catálogo es otro producto o tiene la marca de otro vendedor. Que gane otra publicación nuestra no pide atención.

### Los avisos

- **Barra de estado**: el superadministrador ve «Catálogos ML (N)» con las fichas de catálogo que perdemos (sin fijar; las páginas armadas por Mercado Libre no cuentan) más los armados por ML con la marca de otro vendedor o con otro producto.
- **Mail**: al superadministrador, con los catálogos que perdemos nuevos o que cambiaron de ganador o de precio (con la publicación nuestra que gana dejando más neto y a cuánto), y con los catálogos armados por ML nuevos o que cambiaron. Un mismo estado no se avisa dos veces.

## Relacionado

- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Publicaciones](/catalogo/publicaciones)
- [Marcas](/catalogo/marcas)
