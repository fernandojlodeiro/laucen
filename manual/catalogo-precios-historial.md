---
titulo: Historial de precios de lista
menu: Catálogo › Historial de precios de lista
ruta: /catalogo/precios/historial
rutas: /catalogo/precios/historial
permiso: precios_ver
resumen: Todos los cambios de precio en las listas (Clásicas y las demás), con cuánto subieron o bajaron, cuándo y quién los hizo: una persona o la regla de precio del seguimiento.
---

## Para qué sirve

Para ver **qué precios de lista cambiaron, cuánto y quién los cambió**: los que cambió una persona a mano, los que cambió sola la regla de precio del seguimiento de la competencia y los que se aplicaron desde una propuesta de esa regla. Son los precios de las listas (por ejemplo, la Clásica), no los de cada publicación de Mercado Libre: de la lista, el esquema de precios los lleva solo a cada cuenta y plan.

## Cómo se llega

Menú **Catálogo › Historial de precios de lista**.

## Qué hay en la pantalla

Arriba a la derecha, **Descargar Excel** (con los mismos filtros, todas las filas).

Los filtros:
- **Buscar SKU o producto** (con la caja «Comienza por»), también busca en el motivo.
- **Fechas**: con atajos (Hoy, Últimos 7 días, Este mes…) o **Todas las fechas**. Cuenta el momento en que se cargó el cambio.
- **Qué cambios**: **Subieron o bajaron** (de entrada), **Sólo los que subieron**, **Sólo los que bajaron**, **Precios cargados por primera vez** o **Todos**.
- **Lista**: todas o una.
- **Quién**: todos, **Regla de seguimiento (automática)** o una persona.

La tabla, de lo más nuevo a lo más viejo (se ordena tocando el título de cada columna), de a 50 por página:
- **Cuándo** se cargó y desde qué día rige.
- **SKU** con su foto (lleva a la pestaña Precios del producto) y **Producto**.
- **Lista**.
- **Antes** y **Después**, en pesos. Si el precio está cargado en dólares, lo dice debajo.
- **Cambio**: ▲ en verde si subió, ▼ en rojo si bajó, en %; **Nuevo** si es el primer precio de esa variación en esa lista.
- **Quién**: la persona; **Regla de seguimiento (automática)** si lo cambió la regla sola; «… (aplicó la regla de seguimiento)» si una persona tocó **Aplicar** en una propuesta de la regla; «… (carga masiva)» si salió de una carga por porcentaje.
- **Motivo**: en los de la regla, contra qué publicación comparó y a qué precio estaba.

## Criterios y reglas

- Cada fila compara el precio con **el anterior de la misma variación en la misma lista**. El % se calcula en la moneda en que está cargado el precio (en dólares, si es un producto con precio en dólares).
- La historia es **por día**: si un precio se cambia dos veces el mismo día, queda el último.
- Los cambios de antes de que existiera esta pantalla no tienen motivo, y si no tienen persona dicen «Sistema».

## Relacionado

- [Listas de precios](/catalogo/precios)
- [Productos](/catalogo/productos) (pestaña Seguimiento: la regla de precio)
- [Cómo funcionan los precios](/catalogo/precios-ml)
