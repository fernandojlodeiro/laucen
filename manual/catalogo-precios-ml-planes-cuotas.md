---
titulo: Planes de cuotas
menu: Catálogo › Precios en Mercado Libre, pestaña «Planes de cuotas»
ruta: /catalogo/precios-ml/planes-cuotas
rutas: /catalogo/precios-ml/planes-cuotas, /config/planes-cuotas
permiso: precios_ml_ver
resumen: Qué publicaciones de cuotas de Mercado Libre se crean además de la Clásica, por grupo de categorías y para todas las cuentas, con cuántas cuotas ve el comprador, cuánto más tiene que dejar cada plan y qué cuenta gana la Clásica y cada plan.
---

## Para qué sirve

Decide, **para todas las cuentas de Mercado Libre a la vez**, qué publicaciones de cuotas («publicaciones de cuotas» o planes) se crean además de la Clásica, a qué precio van y **quién gana** cada una entre tus cuentas.

Se configura **por grupo de categorías**. Hay dos grupos:
- **Notebooks**: la categoría Notebooks y todas sus subcategorías.
- **Resto**: todas las categorías que no están en otro grupo.

Un producto pertenece al grupo de su categoría (o de una categoría de más arriba). Así, todas las notebooks llevan los mismos planes, y el resto de los productos, los suyos.

Lo que no está acá: el **descuento que ve el comprador** se decide por cuenta en [Precios en Mercado Libre](/catalogo/precios-ml). Ahí también se puede forzar quién gana para una cuenta, una categoría o un producto puntual, por encima de lo que diga el grupo.

## Cómo se llega

- Menú **Catálogo › Precios en Mercado Libre**, última pestaña: **«Planes de cuotas»**.
- Desde la pestaña «Descuento y quién gana», con el enlace del texto de abajo.
- Lo que se ve acá vale para todas las cuentas: el selector «Cuenta» de arriba sólo sirve para pasar a las otras pestañas.
- Hace falta el permiso «Precios en Mercado Libre».

## Qué hay en la pantalla

Arriba, un aviso con **la barrera de precio**: los planes van sólo en los productos con una Clásica de **$ 33.000 o más** (ver «Criterios y reglas»).

Después, **una caja por grupo** («Notebooks», «Resto»), con el nombre del grupo y cuántos planes usa además de la Clásica. Debajo del título, qué categorías abarca y de qué categoría salen las comisiones de referencia.

Cada caja tiene una tabla. La primera fila es la **Clásica** (se usa siempre; sólo se elige quién la gana). Después, una fila por plan con su nombre en Mercado Libre: **Premium común**, **Premium 3x**, **Premium 9x** y **Premium 12x**. Columnas:
- **Usar**: caja para tildar. Tildada, ese plan se crea y se mantiene en los productos del grupo; sin tildar, no.
- **Quién gana**: qué cuenta de Mercado Libre tiene el precio más bajo en esa publicación. Es un desplegable con las cuentas, o **«Rota»** (ver «Criterios y reglas»).
- **Comisión extra sobre la Clásica**: cuántos puntos más que la Clásica cobra Mercado Libre por ese plan. Se lee sola de Mercado Libre, de la categoría con más productos publicados del grupo. Es sólo de referencia: el precio de cada producto usa siempre la comisión real de su propia categoría.
- **Cuotas que ve el comprador (a chequear)**: cuántas cuotas sin interés le muestra Mercado Libre al comprador con ese plan. Se carga **a mano**, porque Mercado Libre no lo informa, y cambia según la categoría y en fechas especiales (por ejemplo, el Día de la Madre). Es lo que se ve debajo de cada plan, como «el comprador ve N cuotas», en la ficha del producto y en las listas de publicaciones.
- **% extra sobre la Clásica**: cuánto más tiene que dejarte ese plan, después de pagar su comisión, que lo que te deja la Clásica.
- **Con una Clásica de $ 100.000**: ejemplo del precio que daría el plan con esa Clásica y las comisiones de referencia.

Debajo de la tabla de cada grupo: **«Las cuentas que no ganan van X % más caras»** (un % por grupo; por ejemplo, 3 %).

Abajo de todo, un texto que repasa qué es cada columna y la fórmula.

## Cómo se hace

### Cambiar los planes de un grupo
1. Apretá el **lápiz** arriba a la derecha de la caja del grupo.
2. Tildá o destildá **Usar** en cada plan; cargá las **Cuotas que ve el comprador** y el **% extra sobre la Clásica**; en **Quién gana**, elegí una cuenta o «Rota» para la Clásica y para cada plan; y poné cuánto más caras van las cuentas que no ganan.
3. Apretá **«Grabar»** (en el mismo lugar que el lápiz). «Cancelar» vuelve a la vista sin grabar.
4. Mirá cómo quedan los precios en la [Vista previa](/catalogo/precios-ml/vista-previa) de Precios en Mercado Libre.

Errores típicos: «Un plan tildado necesita su % extra sobre la Clásica (0 si no querés extra).», «El % extra tiene que estar entre -50 % y 300 %.», «Las cuotas que ve el comprador van de 1 a 36.».

### Cambiar quién gana
1. Apretá el **lápiz** arriba a la derecha de la caja del grupo.
2. En la columna **Quién gana** de la Clásica o del plan, elegí la cuenta que tiene que ganar, o «Rota» para repartir los productos entre las cuentas.
3. Si hace falta, cambiá el % de «Las cuentas que no ganan van X % más caras».
4. **«Grabar»** (o «Cancelar»). Vale para todos los productos del grupo, en todas las cuentas.

Para un producto o una categoría que tenga que ir distinto, se carga una excepción en [Precios en Mercado Libre](/catalogo/precios-ml), pestaña «Excepciones».

### Chequear las cuotas que ve el comprador
1. Abrí en Mercado Libre una publicación de ese plan de un producto del grupo.
2. Fijate cuántas cuotas sin interés le muestra al comprador.
3. Si no coincide con la columna, lápiz, corregilo y «Grabar».

Conviene repasarlo antes y después de las fechas especiales.

## Criterios y reglas

### Qué grupo le toca a un producto
El de su categoría; si su categoría no está en ningún grupo, el de la categoría de más arriba que sí esté; si ninguna, **Resto**.

### La barrera de $ 33.000
Los planes se crean y se usan sólo en los productos cuya Clásica es de **$ 33.000 o más**: desde ese precio Mercado Libre da envío gratis (el vendedor paga parte del envío). Abajo de ese precio, el producto va sólo con la Clásica. El sistema lee ese umbral solo de los costos de Mercado Libre: si Mercado Libre lo cambia, la barrera se ajusta sola.

### El precio de cada plan
Cada plan tiene que dejar, después de su comisión, lo mismo que deja la Clásica más su % extra:

**Precio del plan = Clásica × (1 − comisión de la Clásica) ÷ (1 − comisión del plan) × (1 + % extra)**, redondeado a pesos.

La comisión es la real de la categoría de cada producto. Ejemplo: Clásica $ 100.000, comisión de la Clásica 14 %, comisión del plan 19 %, % extra 8 % → 100.000 × 0,86 ÷ 0,81 × 1,08 = **$ 114.667**.

### Quién gana entre tus cuentas
Tus cuentas de Mercado Libre venden los mismos productos. Si todas tuvieran el mismo precio, competirían entre ellas. Por eso, **en cada tipo de publicación (la Clásica y cada plan de cuotas) una sola cuenta tiene el precio más bajo: ésa «gana»**. Las demás van el % del grupo más caras (por ejemplo, 3 %): su Clásica = Clásica de la lista × 1,03; su plan = el precio del plan × 1,03.

En la columna **Quién gana** se elige, para la Clásica y para cada plan:
- **Una cuenta fija**: esa cuenta gana esa publicación en todos los productos del grupo.
- **«Rota»**: los productos se reparten parejo entre las cuentas que **no ganan nada fijo** en ese grupo. Cada producto cae siempre en la misma cuenta: lo decide el producto, no cambia de un día para otro.

No se carga nada producto por producto. Si un producto o una categoría tiene que ir distinto, se pone una excepción en [Precios en Mercado Libre](/catalogo/precios-ml) (pestaña «Excepciones»), que manda por encima de lo que diga el grupo.

### Qué pasa al grabar
- **Nada sale solo a Mercado Libre**, salvo en las cuentas que tienen prendido «Sincronizar precios» (en [Precios en Mercado Libre](/catalogo/precios-ml)): en ésas, los cambios de precio van solos a la [Cola de Mercado Libre](/config/canales/cola).
- En las demás cuentas, se revisan los cambios en la [Vista previa](/catalogo/precios-ml/vista-previa), se prepara un lote y el lote espera el clic en **«Mandar a Mercado Libre»** de la [Cola de Mercado Libre](/config/canales/cola).
- Las publicaciones de un plan que falta crear se crean con «Publicar en todas las cuentas» de la ficha del producto (pestaña Publicaciones); también esperan el clic.

### Subir o bajar el % en publicaciones que están en campaña
Mercado Libre no deja cambiar el precio de una publicación mientras está adentro de una campaña. Por eso, al **subir o bajar** el %, el sistema la saca de la campaña y la vuelve a meter enseguida al precio nuevo (la vista previa lo avisa). Si la campaña no acepta el precio nuevo, la publicación queda afuera, al precio tachado, hasta que entre en otra; pasadas 24 horas aparece en [Precios en ML › Alertas](/catalogo/precios-ml).

### Una regla práctica para elegir planes
Para cada cantidad de cuotas que ve el comprador, usá **el plan más barato que la muestra en esa categoría**. Si dos planes tildados muestran las mismas cuotas, sobra uno: la vista previa lo avisa.

### Ejemplo de configuración
- **Notebooks**: Premium común (el comprador ve 9 cuotas) con +3 %, Premium 3x (ve 6 cuotas) con +2 % y Premium 12x (ve 18 cuotas) con +4 %; Premium 9x sin usar. Quién gana: Clásica → ML .BAIRES, Premium común → Rota, Premium 3x → Rota, Premium 12x → ML .BAIRES. Las que no ganan, +3 %.
- **Resto**: Premium común (ve 6 cuotas) con +8 % y Premium 9x (ve 12 cuotas) con +12 %; Premium 3x y Premium 12x sin usar. Quién gana: Clásica → ML .BAIRES, Premium común → Rota, Premium 9x → ML .BAIRES. Las que no ganan, +3 %.

## Preguntas frecuentes

**¿Por qué un producto tiene sólo la Clásica?**
Porque su Clásica está debajo de la barrera de $ 33.000, o porque en su grupo no hay ningún plan con «Usar» tildado.

**¿Por qué las cuotas que se muestran no coinciden con las de Mercado Libre?**
Porque se cargan a mano: Mercado Libre no las informa y cambian según la categoría y las fechas especiales. Mirá una publicación del plan en Mercado Libre y corregí la columna «Cuotas que ve el comprador».

**¿Puedo tener planes distintos en cada cuenta?**
No: los planes valen para todas las cuentas. Lo que cambia por cuenta es el precio: la que gana cada publicación va al precio del esquema y las demás, el % del grupo más caras. El descuento que ve el comprador se decide por cuenta, en [Precios en Mercado Libre](/catalogo/precios-ml).

**¿Qué quiere decir «Rota»?**
Que esa publicación la gana una cuenta distinta según el producto: los productos del grupo se reparten parejo entre las cuentas que no ganan nada fijo en el grupo. Un mismo producto cae siempre en la misma cuenta.

**¿Cómo hago para que un producto lo gane otra cuenta?**
Con una excepción del producto (o de su categoría) en [Precios en Mercado Libre](/catalogo/precios-ml), pestaña «Excepciones»: manda por encima de «Quién gana» del grupo.

**¿La comisión de la tabla es la que se usa para cada producto?**
No: es de referencia. Cada producto usa la comisión real de su propia categoría.

**¿Estas cuotas son las de la tienda web?**
No. Las cuotas de la tienda web se configuran en [Cuotas](/config/cuotas).

## Relacionado

- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Vista previa de precios en Mercado Libre](/catalogo/precios-ml/vista-previa)
- [Cola de Mercado Libre](/config/canales/cola)
- [Productos](/catalogo/productos)
- [Publicaciones](/catalogo/publicaciones)
