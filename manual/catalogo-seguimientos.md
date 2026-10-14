---
titulo: Seguimientos
menu: Catálogo › Seguimientos
ruta: /catalogo/seguimientos
rutas: /catalogo/seguimientos, /catalogo/seguimientos/importar
permiso: productos_ver
resumen: El estado del precio de mercado de cada producto (confirmado, monitoreado sin confirmar o sin seguimiento) y los que tienen publicaciones seguidas solas por revisar.
---

## Para qué sirve

Muestra, producto por producto, **qué tan controlado está su precio contra la competencia**, según las publicaciones de otros vendedores que sigue (pestaña **Seguimiento** de la ficha). Sobre todo sirve para **revisar lo que siguió sola la búsqueda de precio de mercado**: hasta que una persona lo confirma, ese seguimiento no cuenta para la regla de precio.

## Cómo se llega

Menú **Catálogo › Seguimientos**.

## Qué hay en la pantalla

- Buscador **"Buscar SKU o título"** con "Comienza por".
- **Ver**: de entrada **Con publicaciones sin revisar (N)**; también **Precio de mercado confirmado (N)**, **Sin seguimiento** (los productos activos que no siguen nada) y **Todos los que siguen algo**.
- Una fila por producto: foto y **SKU** (lleva a la pestaña Seguimiento de su ficha) con el título; **Clásica** de hoy con la marca del precio de mercado (✓ verde confirmado, ? ámbar monitoreado sin confirmar, ○ gris sin seguimiento); **Sigue** (cuántas publicaciones sigue, sin las excluidas de la regla); **Sin revisar** (las seguidas solas que nadie confirmó); **Más barata seguida** (precio y vendedor; «sin revisar» si es una de ésas); **Mercado** (el precio de la última búsqueda de precio de mercado y cuántas publicaciones iguales encontró) y **Dif.** (el mercado contra la Clásica, en verde si está más arriba).
- Se ordena tocando el título de cada columna; de a 50 filas.

Arriba a la derecha, **Importar de Virtual Seller** lleva a la pantalla para subir el informe de seguimientos de Virtual Seller (ver abajo).

## Cómo se hace

### Revisar lo que se siguió solo

1. Elegí **Ver: Con publicaciones sin revisar**.
2. Tocá el SKU: abre la pestaña **Seguimiento** del producto.
3. Mirá cada publicación marcada **🤖 Automática · sin revisar** (al pasar el mouse sobre la marca, el motivo de la IA; la ↗ abre la publicación en Mercado Libre).
4. Si es el mismo producto, tildá **Revisada** en su fila; si no, el tacho la deja de seguir. **✓ Confirmar todas (N)**, arriba a la derecha de la caja, confirma todas juntas.

### Importar los seguimientos de Virtual Seller

Virtual Seller exporta un informe con todos los seguimientos de precios que tenía programados («Seguimientos totales»). Para pasarlos a Laucen:

1. En **Catálogo › Seguimientos**, botón **Importar de Virtual Seller**, arriba a la derecha ([abrir](/catalogo/seguimientos/importar)).
2. Elegí el archivo tal como lo bajaste de Virtual Seller (.xls) y apretá **Importar**.
3. Se importa de fondo: el botón dice «Trabajando…», podés ir a otra pantalla y al terminar aparece un cartel abajo a la derecha con lo que entró. La tabla **Importaciones (N)** de esa pantalla guarda cada importación: filas, nuevas, puestas al día o que ya estaban, productos, activas y pausadas, las que eran nuestras, y los **SKU que no están** en el catálogo (tocándolo, la lista con el ID del seguimiento y cuántas filas).

Cómo se lee el informe:
- **El producto sale del ID del seguimiento**: el SKU nuestro antes del año y el número («SKU00680-U-2026-1» es el SKU00680-U; los viejos traen «SEG-» adelante, que se saca). La columna SKU del informe no se usa: es el código del vendedor de enfrente.
- **Las publicaciones de nuestras cuentas no entran.**
- Cada publicación entra **revisada** (la eligió una persona en Virtual Seller), con su vendedor, título, último precio (y el tachado), tipo de publicación, cuotas y estado; ese precio queda como la primera lectura del historial.
- **Las pausadas o terminadas entran igual**: se ven aparte, en **Pausadas o terminadas** de la pestaña Seguimiento, y la regla de precio no las usa.
- Los vendedores chinos de Mercado Libre (apodo «CN…ARR») quedan marcados **🌐 Internacional**: no cuentan para la regla.
- Si una ya se seguía, queda como estaba (no cambia de dónde salió); el precio y el estado se ponen al día si lo que había era más viejo. Importar el mismo archivo dos veces no duplica nada.
- Después se leen como todas las demás, cada tantos días ([Seguimiento de publicaciones](/config/seguimiento)), dentro del tope de gasto del mes.

## Criterios y reglas

- **Precio de mercado confirmado**: sigue al menos una publicación que una persona agregó (con **+ Seguir** o por número) o revisó.
- **Monitoreado sin confirmar**: sólo sigue publicaciones que eligió sola la búsqueda de precio de mercado y nadie revisó.
- **Sin seguimiento**: no sigue ninguna (no cuentan las excluidas de la regla).
- Las seguidas solas se leen igual que las demás, pero **la regla de precio no las usa** hasta que se confirman.
- **Mercado** = el cuarto más barato de las publicaciones que la IA juzgó iguales en la última búsqueda de precio de mercado ([Sugerencia de compra](/compras/sugerencia)).
- Aparecen también los productos inactivos que siguen algo.

## Relacionado

- [Productos](/catalogo/productos) (pestaña Seguimiento, la marca del precio de mercado)
- [Sugerencia de compra](/compras/sugerencia) (búsqueda de precio de mercado)
- [Seguimiento de publicaciones](/config/seguimiento) (cuántas seguir solas por producto)
- [Listas de precios](/catalogo/precios) (filtro por precio de mercado)
