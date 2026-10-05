---
titulo: Publicar en Mercado Libre copiando otra
menu: Catálogo › Productos › un producto › Publicar en ML copiando otra
ruta: /catalogo/productos/[id]/publicar-ml
rutas: /catalogo/productos/[id]/publicar-ml
permiso: publicaciones_ver
resumen: Publicar en una cuenta de Mercado Libre un producto que no está publicado, copiando una publicación parecida de tus cuentas y cambiando lo que haga falta.
---

## Para qué sirve

Para los productos que tienen stock y no están publicados en ninguna cuenta de Mercado Libre. En vez de armar la publicación de cero, se busca una parecida entre todas las publicaciones de tus cuentas (también las cerradas, pausadas o inactivas), se copia con todos sus datos y se cambia lo que haga falta antes de mandarla.

## Cómo se llega

- Desde [Productos](/catalogo/productos), tildando **Con stock y sin publicación activa en ML**: cada fila tiene el botón **Buscar en ML**. También desde el [Tablero de Mercado Libre](/mercadolibre), tocando el número de "Productos con stock sin publicar".
- Desde la ficha de un producto, pestaña **Publicaciones**, botón **Publicar en ML copiando otra**.

## Qué hay en la pantalla

**Primero, las parecidas**: una fila por publicación, con su foto, título, número de publicación (se abre en Mercado Libre), cuenta, estado, SKU, precio, vendidos y qué tan parecida es. Arriba de todo van las que tienen **el mismo SKU** que el producto, después las de **SKU parecido** (el pack de la unidad, o al revés), y después las que comparten más palabras del título. Hay un buscador para probar con otras palabras (si está vacío, busca por el título del producto).

**Después de elegir una ("Copiar ésta")**, el borrador con todos sus datos para cambiar:

- **Cuenta donde se publica** y, si el producto tiene varias, **la variación** (su SKU es el que va en la publicación).
- **Título** (con la cuenta de letras: Mercado Libre acepta hasta 60), **Precio**, **Cantidad**, **Tipo de publicación** (Clásica o Premium) y **Condición**.
- **Fotos**: las de la publicación elegida, tildadas, y al final las del producto en Laucen que no están, sin tildar. Se destildan las que no van y se mueven con las flechas; la primera tildada es la principal.
- **Características** y **Garantía y facturación**: las de la publicación elegida, cada una en su cuadro para cambiarla.
- **Descripción**: la de la publicación elegida, leída de Mercado Libre.
- La **categoría** es la de la publicación elegida y no se cambia.

## Cómo se hace

### Publicar un producto copiando otra publicación

1. Abrí **Buscar en ML** al lado del producto (o **Publicar en ML copiando otra** en su ficha).
2. Mirá las parecidas y apretá **Copiar ésta** en la que te sirve. Si no aparece ninguna buena, probá otras palabras en el buscador.
3. Elegí la cuenta y revisá todo: título, precio, cantidad, fotos, características, garantía y descripción. Cambiá lo que quieras.
4. Apretá **Preparar publicación** (arriba a la derecha). El sistema la comprueba con Mercado Libre, sin publicar nada. Si Mercado Libre la rechaza, el motivo aparece arriba y lo que escribiste queda como estaba: corregilo y volvé a apretar.
5. Se abre el lote en la [Cola de Mercado Libre](/config/canales/cola), **"Preparado, falta tu clic"**. Revisalo y apretá **Mandar a Mercado Libre**.
6. Al salir, la publicación nueva se trae a Laucen y se vincula sola con el producto por el SKU.

## Criterios y reglas

- **Nada sale a Mercado Libre sin tu clic** en el lote de la cola.
- **Dónde busca**: sólo en las publicaciones de tus cuentas que Laucen tiene guardadas (todas las que trae al leer cada cuenta, en cualquier estado). Las publicaciones de otros vendedores no se pueden leer: Mercado Libre no lo permite.
- **Qué tan parecida**: "Mismo SKU" si la publicación tiene el SKU del producto o de una de sus variaciones (sin el "DE-" de adelante). "SKU parecido" si cambia sólo el final de pack o unidad (por ejemplo, la publicación del pack SKU00715 para el producto por unidad SKU00715-U): ojo que el título y la cantidad de esa publicación son los del pack, cambialos. Si no, el porcentaje de las palabras buscadas que aparecen en su título (sin tildes ni palabras como "de" o "para"; "resistencia" y "resistencias" cuentan como la misma). Se muestran hasta 40, las que sirven primero, y entre iguales las más vendidas.
- **Cuáles no sirven de modelo** (se ven pero no se pueden copiar): las de catálogo, las que tienen variaciones (todavía no), las que no tienen fotos y las que Laucen no tiene completas.
- **Cuenta propuesta**: la de la publicación elegida, salvo que ya tenga el producto; si no, la primera que no lo tenga.
- **No se duplica en una cuenta**: si la cuenta ya tiene una publicación (activa, pausada o en revisión) con el SKU del producto, no se prepara: conviene reactivar ésa.
- **Precio propuesto**: el de la Clásica de Laucen para esa cuenta (la lista de precios del canal). Si no hay, el de la publicación elegida. Abajo del precio se ven los dos, y "usar" pone el de Laucen.
- **Cantidad propuesta**: el stock disponible del producto en Laucen (como mínimo 1).
- **SKU**: el de la variación de Laucen, sin prefijos.
- **Características**: un valor que no se toca se manda tal cual; uno cambiado se manda como texto; uno borrado no se manda. Si falta el Modelo, se usa el del producto de Laucen. Lo que Mercado Libre calcula solo no se manda.
- **Envío**: Mercado Envíos 2, como en [Copiar entre cuentas](/catalogo/publicaciones/copiar): el envío gratis, su costo y el resto los decide Mercado Libre para esa cuenta.
- **Fotos**: sólo se pueden usar las de la publicación elegida y las del producto en Laucen.

## Preguntas frecuentes

**¿Por qué no aparece una publicación que sé que existe?** Porque es de otro vendedor (no se pueden leer) o porque Laucen todavía no la trajo: traé las publicaciones de la cuenta de nuevo desde [Vincular con Mercado Libre](/catalogo/publicaciones/ml).

**La publicación que encontré está cerrada, ¿la puedo usar?** Sí: se copia con todos sus datos y sale como una publicación nueva.

## Relacionado

- [Productos](/catalogo/productos)
- [Copiar entre cuentas](/catalogo/publicaciones/copiar)
- [Cola de Mercado Libre](/config/canales/cola)
