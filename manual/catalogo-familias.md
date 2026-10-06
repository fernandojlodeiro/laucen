---
titulo: Familias
menu: Catálogo › Familias
ruta: /catalogo/familias
rutas: /catalogo/familias
permiso: familias_ver
resumen: El árbol de categorías de los productos (las de Mercado Libre y las propias) y lo que heredan sus productos: descuento, cucardas y costo de importación.
---

## Para qué sirve

Las familias agrupan productos en un árbol (una familia puede tener una familia padre). Hay dos clases:

- **Mercado Libre**: son las categorías de Mercado Libre. Las crea sola la importación cuando un producto tiene publicación en ML (por ejemplo "Computación › Notebooks"), con el árbol de categorías completo. Son miles.
- **Propias**: las que crea la empresa a mano, o las que trajo la importación de Virtual Seller para productos sin publicación (quedan arriba de todo, con el nombre de la familia de Virtual Seller).

Lo que se carga en una familia lo **heredan** sus productos y sus subfamilias si no lo cambian: el descuento sobre el precio de lista, las cucardas y el costo de importación (NCM, flete, alícuotas).

## Cómo se llega

- Menú **Catálogo › Familias**.
- Desde la ficha de un producto, el dato Familia muestra su camino; la pestaña Costo dice de qué categoría hereda cada valor.

## Qué hay en la pantalla

Arriba a la derecha:
- **Descargar Excel** con sus configuraciones. Trae además columnas que no están en pantalla: camino completo, nivel, familia padre, categoría de ML, descuento propio, productos con las subfamilias, descripción.
- **+ Nueva familia**: abre el formulario de alta.

Buscador **"Buscar familia"** (por nombre, descripción, categoría de Mercado Libre o número, con la caja **"Comienza por"**; filtra mientras tipeás).

Tabla (de a 50 filas, con paginador abajo):
- **Familia**: sin elegir orden se ve como árbol, cada una con sangría debajo de su padre (└). El nombre lleva a [Productos](/catalogo/productos) filtrado por esa familia.
- **Origen**: "Mercado Libre" (amarillo) o "Propia" (azul).
- **Descuento**: el propio; si no tiene, en gris el que hereda de arriba.
- **Cucardas**: las cucardas cargadas en la familia, con su vigencia si tienen fechas (ej. "Oferta (01/10–31/10)").
- **Costo de importación**: un resumen de lo propio (ej. "Flete 30,0 % · Barco · NCM 8516.79.90 · 2 alícuotas"); si no tiene nada propio, "hereda" (y el flete que heredaría). Al lado, un lápiz **"Editar el costo de importación"**.
- **Productos**: el total de productos de la familia **contando sus subfamilias** (lleva a la lista filtrada). Si es distinto de los que están directamente en ella, agrega "(N propios)".
- A la derecha: en las propias, **lápiz** y **tacho**; en las de Mercado Libre, el texto "De ML" (no se cambian ni se borran).

Las columnas Familia, Origen, Descuento y Productos se ordenan tocando el título; ordenada por una columna, la lista deja de verse como árbol y queda plana.

Al pie, la caja **Valores generales de importación** con su lápiz: Flete (sobre FOB), Vía, Seguro (sobre FOB), Despachante (sobre CIF) y Depósito fiscal y otros (sobre CIF).

## Cómo se hace

### Crear una familia propia

1. Apretá **+ Nueva familia**.
2. Escribí el nombre (ej. "Cocina").
3. Si va dentro de otra, buscá la familia padre en "Dentro de… (buscá la familia padre)"; si no, dejá "Sin padre (arriba de todo)". Sólo se ofrecen familias propias.
4. Si querés, cargá el **Desc. %**.
5. Apretá **Crear**.

### Editar una familia propia (nombre, padre, descuento, cucardas)

1. Apretá el **lápiz** de su fila. La fila se convierte en sus campos.
2. Cambiá **Nombre**, **Familia padre** ("Ninguna (arriba de todo)" para dejarla en la raíz) y **Descuento %** (vacío = hereda; la ayuda muestra cuánto).
3. En **Cucardas de la familia** tildá las que correspondan y, si querés, ponele **desde** / **hasta**.
4. Apretá **Guardar** (o **Cancelar**).

### Cargar el costo de importación de una familia

Sirve para propias y para categorías de Mercado Libre.
1. Apretá el lápiz **"Editar el costo de importación"** de la fila.
2. Completá lo que sea común a todos sus productos: NCM, Vía, Flete y Seguro (sobre FOB), Derecho de importación, Tasa de estadística, Arancel / otros, Despachante, Depósito fiscal y otros, y los de crédito fiscal (IVA, IVA adicional, Percepción de ganancias, Ingresos brutos). Cada campo vacío muestra lo que heredaría.
3. Apretá **Guardar**. Avisa "Costos de la familia guardados."

### Cambiar los valores generales de importación

1. En la caja **Valores generales de importación** (al pie), apretá el lápiz.
2. Cambiá flete, vía, seguro, despachante o depósito.
3. Apretá **Grabar** (en el título de la caja).

### Borrar una familia propia

Tacho de su fila → "¿Borrar?" (si tiene productos: "¿Borrar? (N quedan sin familia)") → **Sí**.

## Criterios y reglas

**Árbol**
- Una familia propia sólo puede colgar de otra propia, o quedar arriba de todo. Nunca de una categoría de Mercado Libre: "Las categorías de Mercado Libre no se tocan: una familia propia va arriba de todo o dentro de otra propia."
- Una familia no puede ser su propio padre ni colgar de una de sus hijas: "Esa familia padre está adentro de ésta: quedaría en círculo."
- Las categorías de Mercado Libre no se renombran, no se mueven ni se borran ("Es una categoría de Mercado Libre: no se cambia ni se borra."). Sí se les puede cargar costo de importación.
- Una familia es "Propia" si ni ella ni ninguna de arriba vino de Mercado Libre.

**Al borrar una familia** sus productos quedan **sin familia** y sus subfamilias pasan a estar **arriba de todo**. Sus cucardas y costos se borran con ella.

**Descuento heredado**: el descuento de una variación sale de la variación → el producto → su familia → la primera familia de más arriba que tenga descuento → 0 %. Una familia con el descuento vacío hereda el de la primera de arriba que tenga uno. Va de 0 a 100 %.

**Cucardas heredadas**: un producto muestra sus cucardas propias más las de su familia y todas las de más arriba. Con fechas, sólo rigen entre "desde" y "hasta"; sin fechas, siempre. Sólo se muestran las cucardas activas.

**Costo de importación heredado**: cada valor se resuelve por separado: el del producto → el de su familia → el de la familia padre → … → el general de la empresa. Lo que no está en ningún nivel vale 0. Si en una familia dejás todos los campos vacíos y guardás, la familia queda sin costos propios y hereda todo. Los valores generales sólo cubren flete, vía, seguro, despachante y depósito; de entrada: seguro 1 %, despachante 1 %, depósito fiscal y otros 2 % (un campo general vacío vuelve a su valor de entrada). La cuenta del costo está explicada en [Productos](/catalogo/productos).

**Topes**: flete hasta 500 %; los demás porcentajes de 0 a 100 %. NCM sin espacios, en mayúsculas, hasta 20 caracteres.

**Filtro de productos por familia**: en [Productos](/catalogo/productos) y en el número de la columna Productos, una familia incluye todas sus subfamilias.

## Preguntas frecuentes

**¿Por qué no puedo editar el nombre de una familia?**
Porque es una categoría de Mercado Libre ("De ML"): esas no se cambian ni se borran. Sólo se les puede cargar el costo de importación.

**¿Puedo poner una familia propia dentro de una categoría de Mercado Libre?**
No. Una propia va arriba de todo o dentro de otra propia.

**Le cambié el descuento a una familia, ¿cambian los precios?**
Cambia el precio de venta de todos sus productos (y de sus subfamilias) que no tengan descuento propio. El precio de lista no cambia.

**¿Qué pasa con los productos si borro la familia?**
Quedan sin familia. No se borra ningún producto.

**¿Por qué el número de productos no coincide con los que veo dentro de la familia?**
Porque cuenta también los de sus subfamilias. Entre paréntesis dice cuántos están directamente en ella.

**¿Dónde cargo un derecho de importación que vale para toda una categoría?**
En el lápiz "Editar el costo de importación" de esa familia. Todos sus productos lo heredan si no tienen uno propio.

**¿Para qué sirven los valores generales?**
Para lo que vale igual para casi todo (seguro, despachante, depósito, flete típico). Rigen para cualquier producto que no tenga el valor propio ni lo herede de su familia.

## Relacionado

- [Productos](/catalogo/productos)
- [Cucardas](/catalogo/cucardas)
- [Listas de precios](/catalogo/precios)
