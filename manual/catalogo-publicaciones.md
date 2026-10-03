---
titulo: Publicaciones y vincular con Mercado Libre
menu: Catálogo › Publicaciones
ruta: /catalogo/publicaciones
rutas: /catalogo/publicaciones, /catalogo/publicaciones/ml
permiso: publicaciones_ver
resumen: Cada variación publicada en cada canal (espejo de Mercado Libre) y la pantalla para vincular cada publicación de ML con su variación de Laucen.
---

## Para qué sirve

Hay dos pantallas, las dos del menú **Catálogo**:

- **Publicaciones**: la lista de cada variación publicada en cada canal, con su id externo (el MLA…), categoría, tipo, estado, disponible, stock en ML y umbral de pausa. Es un **espejo** de lo que está publicado en Mercado Libre: lo escribe la sincronización y acá no se crea, no se borra ni se cambia nada de lo publicado. Sólo se edita lo propio de Laucen: el umbral de pausa y, en canales que no son de Mercado Libre, a qué variación corresponde.
- **Vincular con Mercado Libre**: trae todas las publicaciones de una cuenta de ML y deja decir a qué variación de Laucen corresponde cada una. Una publicación vinculada es lo que usan el stock, la pausa automática y los pedidos: si una publicación no está vinculada, sus ventas no saben qué producto descontar.

## Cómo se llega

- Menú **Catálogo › Publicaciones** y **Catálogo › Vincular con Mercado Libre**.
- En Publicaciones, botón **Vincular con Mercado Libre** arriba a la derecha.
- Desde la ficha de un producto, pestaña **Publicaciones** → **Ir a Publicaciones**.

## Qué hay en la pantalla

### Publicaciones

Arriba a la derecha: **Descargar Excel** (trae además título en el canal, enlace, umbral propio, código de barras, estado del producto, última sincronización y atributos externos) y **Vincular con Mercado Libre**.

Filtros: buscador **"Buscar por SKU o id externo"** (con "Comienza por"; el código de barras se busca exacto) y **Mostrar inactivos**, **Canal** (Todos los canales o uno) y **Estado** (Activa / Pausada / Cerrada).

Columnas (todas se ordenan tocando el título; sin elegir, por canal):
- **SKU** (lleva a la ficha del producto, con el 📷 de fotos) y **Título** (el de la publicación; en gris, el de la variación si la publicación no tiene título).
- **Canal**: filtra por ese canal.
- **Id externo**: si es un MLA, enlace a la publicación en Mercado Libre.
- **Categoría · tipo**.
- **Estado**: Activa / Pausada / Cerrada; debajo, "En ML: …" (lo que dice ML: Activa, Pausada, Cerrada, En revisión, Inactiva, Pago pendiente) y "sinc. dd/mm hh:mm".
- **Disponible**: lo que hay para vender en los depósitos del canal. En rojo cuando está en el umbral o por debajo. Lleva a [Consulta de stock](/stock/consulta).
- **Stock en ML**: lo que la publicación tiene cargado en Mercado Libre (también si está pausada).
- **Umbral**: el que rige; "(hereda)" si no tiene uno propio.
- A la derecha: **Re-vincular** (sólo publicaciones de ML: lleva a Vincular con Mercado Libre filtrado por ese MLA) y el **lápiz** ("Editar el umbral de pausa", y en canales que no son de ML también la variación).

De a 50 filas. Al pie, una nota explica Disponible, Stock en ML y Umbral.

### Vincular con Mercado Libre

Si no hay ninguna cuenta de ML conectada a un canal, avisa que primero hay que conectarla en [Canales](/config/canales).

Si hay:
- **Canal de Mercado Libre** (si hay más de una cuenta) y el botón **Traer publicaciones de ML** (mientras trabaja: "Trayendo… (puede tardar unos minutos)").
- Tres recuadros: **Publicaciones**, **Vinculadas**, **Sin vincular**.
- Pestañas **Sin vincular (n)**, **Vinculadas (n)**, **Todas (n)**.
- Buscador **"Buscar por título, SKU o MLA…"**.
- **Descargar Excel** arriba a la derecha (con la misma pestaña y búsqueda).
- Tabla: foto, **Publicación** (título, atributos de la variación de ML, el MLA con enlace ↗ y la marca "Full" si va por Full), **SKU en ML**, **Precio** (ML da pesos; si mirás en dólares, se pasa al tipo de cambio del día), **Stock ML**, **Vendidos**, **Estado**, **Tipo** (Clásica / Premium / Gratuita), **Vinculación**.
- En **Vinculación**:
  - Si está vinculada: el SKU de Laucen (lleva a la ficha), "Inactivo" si el producto está inactivo, el título de la variación, "Disponible en Laucen para este canal: N", y un tacho para **desvincular** ("¿Desvincular?").
  - Si no: un cuadro **"SKU o código de barras de Laucen"** con el botón **Vincular**, y en la primera fila sin vincular de cada publicación, **Crear producto** (o "Crear producto con sus N variaciones").

## Cómo se hace

### Traer las publicaciones de Mercado Libre

1. Entrá a [Vincular con Mercado Libre](/catalogo/publicaciones/ml) y elegí el canal.
2. Apretá **Traer publicaciones de ML**.
3. Al terminar avisa "Leídas N, vinculadas solas M." Si eran muchas y no llegó: "No llegó a traer todas: apretá "Traer publicaciones de ML" de nuevo para seguir."

### Vincular una publicación con su variación

1. En la pestaña **Sin vincular**, buscá la publicación.
2. En **Vinculación** escribí el SKU (o el código de barras) de la variación de Laucen.
3. Apretá **Vincular**. Avisa "Vinculada a SKU…".

Error típico: "No hay ninguna variación con SKU o código de barras "…"." Una publicación con variaciones tiene una fila por variación, y cada una se vincula por separado.

### Crear el producto en Laucen a partir de una publicación

1. En la fila de la publicación sin vincular, apretá **Crear producto** (o "Crear producto con sus N variaciones").
2. Se crea el producto, queda vinculado y se abre su ficha ("Producto creado y vinculado con la publicación.").
3. Completá en la ficha lo que falte (familia, costo, precios…).

Si ya existe un producto con ese SKU: "Ya hay un producto con el SKU …: vinculá la publicación a ese."

### Cambiar a qué variación corresponde una publicación de ML

1. En [Publicaciones](/catalogo/publicaciones), apretá **Re-vincular** en su fila (o buscala en Vincular con Mercado Libre, pestaña Vinculadas).
2. Tacho de la vinculación → **Sí** ("Desvinculada.").
3. Vinculala de nuevo con el SKU correcto.

### Cambiar el umbral de pausa de una publicación

1. En [Publicaciones](/catalogo/publicaciones), lápiz de la fila.
2. Escribí el umbral (vacío = hereda; el cuadro muestra cuánto heredaría).
3. **Guardar**.

### Cambiar la variación de una publicación de otro canal (no ML)

Lápiz de la fila → en la columna SKU escribí el SKU o código de barras de Laucen → **Guardar**.

## Criterios y reglas

**Espejo de Mercado Libre**: el título, la categoría, el tipo, el precio, la cantidad publicada y el estado de cada publicación los escribe el sistema con lo que dice ML. Se actualizan:
- cada vez que ML avisa un cambio (notificaciones);
- en la barrida nocturna (de 2 a 5, hora argentina) de los canales con la sincronización de stock prendida, que además compara con lo que debería ser y encola las diferencias;
- al apretar **Traer publicaciones de ML**.
El estado se traduce así: activa en ML → Activa; pausada → Pausada; cualquier otro → Cerrada. Una variación que Laucen pausó por falta de stock sigue activa en ML con 0 unidades, y acá se ve como Pausada.

**Vinculación automática por SKU**: al traer (o al llegar un aviso de ML), cada publicación (o cada variación de una publicación) que todavía no está vinculada se vincula sola si su **SKU en ML** coincide con el SKU de una variación de Laucen, sin importar mayúsculas. El "SKU en ML" es el atributo SKU del vendedor de la publicación (o de su variación); si no lo tiene, el campo de código propio del vendedor. También vincula por una **equivalencia** de SKU (un SKU viejo u otro código en ML que la importación de Virtual Seller dejó apuntando a un SKU de Laucen). Lo que ya estaba vinculado no se toca: si querés cambiarlo, desvinculá y volvé a vincular.

**Vinculación a mano**: busca primero una variación con ese SKU exacto (sin importar mayúsculas) y, si no hay, una con ese código de barras.

**Crear producto desde una publicación**: crea el producto con el título, la descripción, la marca y la foto principal de ML. Si la publicación no tiene variaciones, queda **Simple** con SKU = el SKU en ML (o el número MLA si no tiene). Si tiene variaciones, queda **Con variaciones**, con SKU base = el MLA y una variación por cada variación de ML (SKU = el de ML, o "MLA…-número de variación"), con sus atributos (color, talle…). Después lo vincula. No le pone familia, costo ni precios.

**Desvincular** borra la vinculación (la publicación sigue en ML y en la lista de traídas, ahora "Sin vincular").

**Disponible de una publicación** = el disponible de la variación sumando sólo los depósitos asignados al canal (los activos). Un kit, desde sus componentes.

**Umbral de pausa** (con ese disponible o menos, el canal pausa la publicación): el de la publicación → el del producto → el del canal → el general de la empresa → 1. No puede ser negativo. La pausa y reactivación automáticas sólo corren en un canal si su interruptor está prendido en [Canales](/config/canales), y salen por la [cola de Mercado Libre](/config/canales/cola).

**Nada se cambia en Mercado Libre desde estas pantallas**: sólo se lee de ML y se guarda el vínculo y el umbral en Laucen.

**Traer publicaciones** lee todas las de la cuenta (activas, pausadas y cerradas recientes), de a 100. Cada apretada trabaja hasta unos 4 minutos; si no terminó, se aprieta de nuevo.

## Preguntas frecuentes

**¿Puedo crear o borrar una publicación desde acá?**
No. Publicaciones es un espejo de Mercado Libre: se crean y se cierran en ML.

**Una venta de ML no descontó stock, ¿por qué?**
Probablemente la publicación (o esa variación de la publicación) no está vinculada. Fijate en Vincular con Mercado Libre, pestaña Sin vincular.

**¿Por qué una publicación no se vinculó sola?**
Porque su SKU en ML está vacío o no coincide con ningún SKU de Laucen. Vinculala a mano con el SKU o el código de barras, o corregí el SKU en ML.

**Vinculé mal una publicación, ¿cómo lo arreglo?**
Tacho en la vinculación (desvincular) y vinculala de nuevo con el SKU correcto.

**¿Qué diferencia hay entre "Disponible" y "Stock en ML"?**
Disponible es lo que Laucen tiene para vender en los depósitos del canal. Stock en ML es lo que la publicación tiene cargado en Mercado Libre.

**¿Qué significa "(hereda)" en el umbral?**
Que la publicación no tiene umbral propio y usa el del producto, el del canal o el general.

**¿Por qué una publicación con variaciones aparece en varias filas?**
Porque cada variación de ML (cada color, cada talle) se vincula por separado con su variación de Laucen.

## Relacionado

- [Productos](/catalogo/productos)
- [Canales](/config/canales)
- [Cola de Mercado Libre](/config/canales/cola)
- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Consulta de stock](/stock/consulta)
- [Cambios en publicaciones](/informes/cambios-publicaciones)
