---
titulo: Publicar en Mercado Libre
menu: Catálogo › Productos › un producto › Publicar en ML copiando otra
ruta: /catalogo/productos/[id]/publicar-ml
rutas: /catalogo/productos/[id]/publicar-ml
permiso: publicaciones_ver
resumen: Publicar en una cuenta de Mercado Libre un producto que no está publicado: en el producto del catálogo de ML que es el mismo (cuidando la marca), copiando una publicación tuya o desde cero con los datos de Laucen y la ayuda de la IA.
---

## Para qué sirve

Para los productos que tienen stock y no están publicados en ninguna cuenta de Mercado Libre. En vez de armar la publicación de cero hay dos caminos:

- **Catálogo de Mercado Libre** (lo primero que se ve): buscar el producto del catálogo de ML que es el mismo y publicar ahí. ML pone el título, las fotos y las características; vos ponés la cuenta, el precio, la cantidad, el tipo y la garantía.
- **Tus publicaciones**: copiar una publicación de tus cuentas (también las cerradas o pausadas) con todos sus datos, y cambiar lo que haga falta.
- **Nueva desde Laucen**: para un producto nuevo que no está en el catálogo de ML (o sólo con la marca de otro) ni lo publicaste nunca. Se arma desde cero con los datos del producto en Laucen, y lo que falta lo propone la IA para que lo revises.

## Cómo se llega

- Desde [Productos](/catalogo/productos), tildando **Con stock y sin publicación activa en ML**: cada fila tiene el botón **Buscar en ML**. También desde el [Tablero de Mercado Libre](/mercadolibre), tocando el número de "Productos con stock sin publicar".
- Desde la ficha de un producto, pestaña **Publicaciones**, botón **Publicar en ML copiando otra**.

## Qué hay en la pantalla

Tres pestañas. Las dos primeras tienen un buscador (si está vacío, busca por el título del producto; escribí otras palabras si no aparece) y muestran cuántos encontraron:

- **Catálogo de Mercado Libre**: los productos del catálogo que pueden ser el mismo, con su foto, nombre (se abre en ML), modelo, **marca** y si se puede usar, **¿Es el mismo?**, el **precio que gana** hoy y cuántos **vendedores** tiene. Botón **Publicar en éste**.
- **Tus publicaciones**: tus publicaciones que pueden ser el mismo producto, con cuenta, estado, SKU, precio, vendidos y **¿Es el mismo?**. Botón **Copiar ésta**.

- **Nueva desde Laucen**: el formulario de la publicación nueva, ya lleno:
  - **Categoría de Mercado Libre**: la del producto (o la de su familia). Si no tiene, o no es la última de la rama, la que sugiere Mercado Libre por el título. Al lado, un desplegable para cambiarla por otra de las que sugiere ML (al cambiarla cambian las características que pide).
  - **Cuenta**, **variación**, **tipo de publicación**, **título** (con la cuenta de letras, hasta 60), **precio** (la Clásica de Laucen para esa cuenta, con "usar"), **cantidad** (lo disponible), **condición** y **garantía**.
  - **Fotos**: las del producto en Laucen (y de sus variaciones), todas tildadas; se destildan y se mueven con las flechas.
  - **Características**: las que pide Mercado Libre para esa categoría, primero las obligatorias (con **\***) y las que tienen valor; las demás, desplegando "Más características". Cada valor dice de dónde salió: **Laucen** (datos del producto) o **IA** (propuesto, con fondo amarillo: revisalo). Donde ML tiene opciones, al escribir se despliegan.
  - **Descripción**: la del producto; si no tiene, la propone la IA (marcada **IA**).

**¿Es el mismo?** lo decide una IA comparando tu producto (título, marca, modelo y características) con cada candidata: **El mismo**, **Parecido** (mismo tipo con alguna diferencia, como el pack o el color) o distinto. Los distintos no se muestran. Debajo va el motivo en una frase. Una publicación tuya con el mismo SKU es siempre "El mismo".

## Cómo se hace

### Publicar en el catálogo de Mercado Libre

1. Abrí **Buscar en ML** al lado del producto.
2. En la pestaña **Catálogo de Mercado Libre**, mirá que sea realmente el mismo (abrilo en ML si hace falta) y que la marca diga **Marca nuestra** o **Genérica**. Apretá **Publicar en éste**.
3. Revisá el producto de catálogo (fotos, título, marca, modelo y, desplegando, sus características). Elegí la cuenta, el precio (abajo tenés la Clásica de Laucen y el que gana hoy, con "usar" para ponerlos), la cantidad, el tipo y la garantía.
4. Apretá **Preparar publicación** (arriba a la derecha). Se comprueba con Mercado Libre sin publicar nada; si lo rechaza, el motivo aparece arriba y lo escrito queda.
5. Se abre el lote en la [Cola de Mercado Libre](/config/canales/cola), **"Preparado, falta tu clic"**. Revisalo y apretá **Mandar a Mercado Libre**.

### Publicar un producto nuevo desde cero

1. Abrí **Buscar en ML** al lado del producto y andá a la pestaña **Nueva desde Laucen**.
2. Revisá la categoría; si no es la correcta, elegí otra en el desplegable.
3. Revisá el título y todo lo marcado **IA** (sobre todo las obligatorias). Completá lo que quedó vacío y borrá lo que no corresponde.
4. Elegí la cuenta, el precio, la cantidad, las fotos, la garantía y revisá la descripción.
5. Apretá **Preparar publicación** (arriba a la derecha) y después **Mandar a Mercado Libre** en la cola, como siempre.

### Copiar una publicación tuya

1. En la pestaña **Tus publicaciones**, apretá **Copiar ésta** en la que te sirve.
2. Cambiá lo que quieras: cuenta, variación, título (hasta 60 letras), precio, cantidad, tipo, condición, fotos (destildar, mover con las flechas; la primera es la principal; al final están las del producto en Laucen), características, garantía y descripción.
3. **Preparar publicación** y después **Mandar a Mercado Libre** en la cola, como arriba.

## Criterios y reglas

- **Nada sale a Mercado Libre sin tu clic** en el lote de la cola.
- **La marca en el catálogo**: el que creó un producto de catálogo a veces tiene una marca propia, y publicar con su marca trae denuncias. Por eso sólo se puede publicar en uno cuya marca sea **nuestra** (una de las marcas cargadas en los productos de Laucen) o **genérica** ("Genérica", "Sin marca"). **Daitom** cuenta siempre como nuestra. Con **marca de otro** dice "No se puede" y el sistema no lo deja preparar. Sin marca cargada en ML se puede, pero revisala.
- **El catálogo se busca** por las palabras del título (o lo escrito) y, si el producto tiene código de barras, también por ese código. Un producto de catálogo con variantes (color, etc.) se reemplaza por sus variantes. Lo leído de ML se guarda una hora.
- **La publicación de catálogo** lleva el título, las fotos y las características del catálogo; de Laucen van el SKU de la variación, el precio, la cantidad, el tipo (Clásica o Premium), la garantía, condición nuevo y Mercado Envíos 2.
- **Tus publicaciones** se buscan entre todas las que Laucen guardó de tus cuentas, en cualquier estado. No sirven de modelo las de catálogo, las que tienen variaciones (todavía no), las que no tienen fotos o las incompletas.
- **Publicaciones de otros vendedores**: no se pueden leer (Mercado Libre no lo permite por su API). Queda pendiente verlo de otra forma.
- **No se duplica en una cuenta**: si la cuenta ya tiene una publicación (activa, pausada o en revisión) con el SKU del producto, o ya está en ese producto de catálogo, no se prepara: conviene reactivar ésa.
- **Cuenta propuesta**: la primera que no tiene el producto (copiando, la de la publicación elegida si no lo tiene).
- **Precio propuesto**: el de la Clásica de Laucen para esa cuenta (la lista de precios del canal). Copiando, si no hay, el de la publicación elegida.
- **Cantidad propuesta**: el stock disponible del producto en Laucen (como mínimo 1).
- **Al copiar una publicación tuya**: un valor de característica que no se toca se manda tal cual; uno cambiado se manda como texto; uno borrado no se manda. Si falta el Modelo, se usa el del producto de Laucen. Sólo se pueden usar las fotos de la publicación y las del producto en Laucen.
- **Nueva desde Laucen, de dónde sale cada dato**: primero lo del producto en Laucen (las características que trajo de Mercado Libre o Virtual Seller, la marca, el modelo, la línea, el código de barras y el peso y las medidas como medidas del paquete). Si no tiene código de barras, se pone el motivo "no tiene código registrado". Lo que sigue faltando, el título y (si no hay) la descripción los propone la IA. Lo propuesto se guarda un día: volver a entrar no lo vuelve a pedir.
- **La marca, en una nueva**: la del producto en Laucen; si no tiene, **Daitom** (la marca propia). La IA nunca propone marca ni inventa un código de barras. Al preparar, la marca tiene que ser la del producto, Daitom o "Genérica"; si no, no deja.
- **Obligatorias**: si falta alguna característica obligatoria para la categoría, no se prepara y se avisa cuáles faltan.
- **Título**: hasta 60 letras. La IA lo arma como lo buscaría un comprador (qué es, marca, modelo y un par de datos clave), sin palabras de promoción.
- **Fotos de una publicación nueva**: sólo las del producto en Laucen. Si no tiene, subilas primero en su ficha.
- **No publicables**: un producto marcado No publicable no se puede publicar desde acá (apagá la marca en su ficha si sí se vende solo).
- Si la IA no contesta, se avisa y las candidatas se muestran por parecido de palabras.

## Preguntas frecuentes

**¿Por qué dice "No se puede" en un producto de catálogo?** Porque es de una marca que no es nuestra ni genérica: publicar ahí trae denuncias.

**¿Por qué no aparece una publicación que sé que existe?** Porque es de otro vendedor (no se pueden leer), porque la IA vio que es otro producto, o porque Laucen todavía no la trajo: traé las publicaciones de la cuenta desde [Vincular con Mercado Libre](/catalogo/publicaciones/ml).

**La publicación mía que encontré está cerrada, ¿la puedo usar?** Sí: se copia con todos sus datos y sale como una publicación nueva.

## Relacionado

- [Productos](/catalogo/productos)
- [Copiar entre cuentas](/catalogo/publicaciones/copiar)
- [Cola de Mercado Libre](/config/canales/cola)
