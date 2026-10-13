---
titulo: Precios según seguimiento
menu: Informes › Precios según seguimiento
ruta: /informes/precios-seguimiento
rutas: /informes/precios-seguimiento
permiso: precios_ver
resumen: Qué precio de la Clásica subiría o bajaría con la regla de seguimiento de cada producto, mirando el último precio leído del competidor.
---

## Para qué sirve

Para ver de un vistazo, en todos los productos que tienen **regla de precio** en su pestaña Seguimiento, qué pasaría con la Clásica si se aplicara la regla hoy: cuáles suben, cuáles bajan y cuáles quedan igual. **No cambia nada**: cada cambio se aplica desde la pestaña Seguimiento del producto, con «Aplicar».

## Cómo se llega

Menú **Informes › Precios según seguimiento**. Pide el permiso «Listas de precios».

## Qué hay en la pantalla

- Arriba, **Ver**: todos, o sólo los que suben, bajan, quedan igual o no tienen dato, con cuántos hay de cada uno.
- La tabla, un renglón por producto:
  - **Producto** (con su foto): tocando el SKU se abre su pestaña Seguimiento, donde está «Aplicar».
  - **Costo hoy**: el último costo en dólares, al dólar de hoy.
  - **Piso**: el precio más bajo al que puede llegar la Clásica según la regla.
  - **Clásica hoy**.
  - **Competidor**: la publicación de referencia, con ↗ para abrirla en Mercado Libre, y cuándo se leyó su precio.
  - **Su precio**, el **Objetivo** de la regla y lo que **quedaría** la Clásica.
  - **Cambio** en % y **Qué pasa**: Sube (verde), Baja (rojo), Queda igual o Sin dato, con el motivo (por ejemplo «queda en el piso»).

## Criterios y reglas

- Sólo cuentan las publicaciones **revisadas por una persona**: las que siguió sola la búsqueda de precio de mercado y nadie confirmó no son referencia.
- Usa la regla de cada producto tal cual está cargada: contra qué publicación se compara (una elegida o la más barata de las seguidas), cuánto abajo queda (igual, X pesos o X %), el **piso** y, si tiene «También subir», el **techo**.
- **Objetivo** = precio del competidor menos la diferencia de la regla, en pesos enteros hacia abajo.
- Si el objetivo cae debajo del piso, la Clásica queda en el piso; si ya está en el piso, no baja. Con «También subir», sube hasta el objetivo sin pasar el techo; sin esa opción, nunca sube.
- **Sin dato**: el competidor todavía no tiene un precio leído, no está activo, o el producto no tiene precio en la Clásica. Los precios de las seguidas se leen solos según la frecuencia de [Seguimiento de publicaciones](/config/seguimiento).
- Desde la lista de precios, el esquema de precios lleva el cambio a las cuentas de Mercado Libre.

## Relacionado

- [Seguimiento de publicaciones](/config/seguimiento)
- [Productos](/catalogo/productos)
