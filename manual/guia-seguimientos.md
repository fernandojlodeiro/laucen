---
titulo: Revisar los seguimientos antes de prender las reglas (guía)
menu: Catálogo › Seguimientos (guía de revisión)
ruta: /catalogo/seguimientos
rutas: /catalogo/seguimientos, /catalogo/productos/[id]
permiso: productos_ver
resumen: Paso a paso para revisar, producto por producto, las publicaciones de la competencia que se siguen (revisarlas, excluir las que no sirven, borrar las que no son el mismo producto) y recién después prender la regla de precio.
---

## Para qué sirve

El sistema sigue publicaciones de la competencia y, con la **regla de precio** prendida, puede bajar (o subir) la Clásica sola mirando a la más barata. Antes de prender reglas en muchos productos hace falta **el visto bueno de una persona**: que lo que se sigue sea de verdad el mismo producto y que el precio de referencia sea uno con el que valga la pena competir. Esta guía es ese recorrido.

## Cómo se llega

1. Menú **Catálogo › Seguimientos** ([abrir](/catalogo/seguimientos)).
2. De entrada la lista viene **ordenada por la plata en stock** (columna **Stock $**: stock disponible × Clásica), de más a menos, y **sin notebooks** (caja **Excluir notebooks**, tildada). Conviene revisar en ese orden: primero donde hay más plata parada.
3. Con **Ver** se elige qué productos mostrar: **Con publicaciones sin revisar**, **Precio de mercado confirmado**, **Sin seguimiento** o **Todos los que siguen algo**.
4. Tocá el **SKU**: abre la pestaña **Seguimiento** de la ficha del producto.

## Cómo se hace

### 1. Mirar cada publicación seguida

En la pestaña **Seguimiento**, la tabla de arriba tiene las publicaciones que están a la venta, de la más barata a la más cara. Para cada una:

1. Tocá el título (con la ↗): abre la publicación en Mercado Libre, en otra pestaña.
2. Fijate que sea **el mismo producto, una unidad**: mismo modelo y mismas características. Si es otra cosa (otro modelo, un pack, un repuesto), **el tacho** de la derecha la deja de seguir (pregunta «Sí» / «No» ahí mismo).
3. Debajo del vendedor dice **cuántas unidades tiene a la venta y cuántas vendió** («3 disp. · 120 vend.»), según la última lectura; en ámbar si tiene 5 o menos. Si son muchas, Mercado Libre muestra un aproximado («más de 25»).
4. Si es el mismo producto, tildá **Revisada**. Recién así cuenta para la regla de precio.

### 2. Decidir si su precio tiene que mandar

Que sea el mismo producto no quiere decir que convenga seguirle el precio. Tildá **Fuera de la regla — Excluir** (la seguís viendo, pero la regla no la mira) cuando, por ejemplo:

- **Tiene muy pocas unidades** y el precio es bajo: conviene dejar que las venda y no bajar el nuestro por pocas unidades. Depende del producto: en uno caro, pocas unidades pueden igual importar.
- Pone **precios puntuales muy bajos** de vez en cuando.
- **Tarda mucho en llegar** (el plazo en rojo en **Entrega**) o vende **desde afuera** (🌐 Internacional; ésas ya no cuentan solas).

Al tildar o destildar, la regla se vuelve a calcular enseguida (tarda unos segundos) y el cuadro de la regla muestra la nueva referencia.

### 3. Las MLAU que no se pueden leer

Algunas filas tienen un número **MLAU…** y un cartel rojo que dice que Mercado Libre no deja leerlas. Mercado Libre no informa el precio de esas publicaciones, así que **nunca se actualizan**:

- Si en la misma lista hay una **MLA…** del mismo vendedor (normalmente al mismo precio), la MLAU sobra: **borrala con el tacho**.
- Si no hay, abrí la MLAU con su ↗ en Mercado Libre, buscá el número **MLA…** de esa misma publicación (aparece en la dirección de la página al elegir a ese vendedor) y pegalo en **+ Agregar por número**, arriba a la derecha de la caja. Después borrá la MLAU con el tacho.

### 4. Las pausadas

Debajo de la tabla, **▸ Pausadas (N)** abre las publicaciones de la competencia que están pausadas o que ya no figuran en el catálogo. No cuentan para la regla. Se releen de vez en cuando por si vuelven; si pasan muchos meses pausadas dejan de leerse solas y tienen el botón **Reanudar**. No hace falta revisarlas una por una.

### 5. Prender la regla de precio

Cuando las publicaciones que mandan están revisadas:

1. En la caja **Regla de precio**, más abajo en la misma pestaña, apretá el **lápiz** del título de la caja.
2. **Qué hace**: para empezar, **Proponer el cambio y esperar mi clic** (el cambio queda esperando **Aplicar**). Cuando haya confianza, **Automático**.
3. **Contra quién**: **el más barato de los que sigo**, o una publicación puntual.
4. **Cómo**: igualar, quedar X pesos abajo o X % abajo.
5. **Piso** (obligatorio): la Clásica nunca baja de ahí. Ponelo pensando en el margen mínimo aceptable.
6. Si querés que también suba cuando la competencia sube: tildá **También subir** y cargá el **Techo**.
7. Mientras editás, al lado se ve qué haría con cada Clásica. Apretá **Grabar**.

## Criterios y reglas

- **La referencia** es la más barata de las seguidas que están **activas**, **revisadas**, con precio leído, en pesos, sin las **excluidas** ni las **internacionales**. Si la elegida deja de estar activa, la regla sigue sola contra la más barata que quede.
- El cuadro grande de la regla dice, con la regla apagada, cuántos pesos (y qué porcentaje) está tu Clásica más arriba o más abajo que la referencia; «igual que la referencia» sólo si es el mismo precio.
- Las que siguió sola la búsqueda de precio de mercado llevan **🤖 Automática · sin revisar** y no cuentan hasta tildar **Revisada**. Las importadas de otro sistema o agregadas a mano ya vienen revisadas, pero conviene mirarlas igual antes de prender la regla.
- Las publicaciones terminadas se dejan de seguir solas.
- Las comunes se releen solas sólo en productos a la venta (con publicación activa y stock); las de un producto pausado quedan con su último precio hasta que se toca **Leer ahora**.

## Relacionado

- [Seguimientos](/catalogo/seguimientos)
- [Productos](/catalogo/productos) (pestaña Seguimiento y regla de precio, con todo el detalle)
- [Seguimiento de publicaciones](/config/seguimiento) (cada cuánto se leen, tope de gasto, pausadas)
