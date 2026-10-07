---
titulo: Cambios en publicaciones
menu: Informes › Cambios en publicaciones
ruta: /informes/cambios-publicaciones
rutas: /informes/cambios-publicaciones, /informes/cambios-publicaciones/[item]
permiso: informes_publicaciones_ver
resumen: Qué publicaciones de Mercado Libre cambiaron de estado, precio o stock, cuándo, y si el cambio lo mandó Laucen o alguien fuera de Laucen.
---

## Para qué sirve

Es la historia de los cambios de las publicaciones de Mercado Libre: cuándo una publicación pasó de activa a pausada (o cerrada, en revisión…), cuándo cambió su precio y cuándo su stock. Para cada cambio dice si lo mandó **Laucen** (por su cola de envíos a Mercado Libre) o si lo hizo **alguien fuera de Laucen** (alguien en Mercado Libre, o Mercado Libre mismo).

Sirve para responder preguntas como "¿quién pausó esta publicación?", "¿cuándo le subieron el precio?" o "¿qué cambió hoy en Mercado Libre que no hicimos nosotros?".

**La historia arranca el 3/10/2026**: de antes no hay nada.

## Cómo se llega

- Menú **Informes › Cambios en publicaciones**.

## Qué hay en la pantalla

### Arriba a la derecha

**"Descargar Excel"** con sus configuraciones ("Como en pantalla" o una guardada) y **"Configurar…"**: baja lo que se ve (filtros, búsqueda, agrupado y orden), todas las filas.

### Filtros (cambian la pantalla al momento)

- Buscador **"Publicación (MLA…), SKU o título"**, con la caja **"Comienza por"** y la X para borrar. Busca en todos los datos del cambio (publicación, variación, qué cambió, antes, después, origen, la cuenta, el SKU y el título).
- **Fechas** desde/hasta con atajos. Si no se elige, **los últimos 7 días**.
- **Cuenta**: "Todas las cuentas" o una cuenta de Mercado Libre.
- **"Qué cambió:"** cajas para tildar **Estado**, **Precio** y **Stock**. De entrada están tildados Estado y Precio (el stock cambia con cada venta y llenaría la lista).
- **"Estado: pasó a"** (aparece cuando Estado está tildado): cajas para elegir a qué estado pasó la publicación: **Activa**, **Pausada**, **En revisión**, **Inactiva**, **Cerrada** y **Pago pendiente**. De entrada, todas. Por ejemplo, tildando sólo Pausada ves las que se pausaron; sólo Activa, las que se activaron. Filtra sólo los cambios de estado: los de precio y stock se siguen viendo si están tildados.
- **"Sólo si sigue en ese estado"** (aparece cuando Estado está tildado; **tildada de entrada**): un cambio de estado se muestra sólo si la publicación **hoy** está en el estado al que pasó. Por ejemplo, con "pasó a Pausada", salen las que se pausaron y siguen pausadas; una que se pausó y ya volvió a estar activa no sale. Destildándola se ven todos los cambios, sigan o no. No toca los cambios de precio ni de stock.
- **"Sólo los que hizo alguien fuera de Laucen"**: caja para tildar.
- **Ver**: **Cada cambio** (una fila por cambio) o **Una fila por publicación**.

### Columnas (modo "Cada cambio")

- **Fecha y hora** del cambio.
- **Cuenta** de Mercado Libre.
- **Publicación**: el número (MLA…), con enlace a la publicación en Mercado Libre; si es una variación, debajo "var. …".
- **SKU**: enlace a la ficha del producto, con su foto (al tocarla se abren todas).
- **Título**.
- **Qué cambió**: Estado, Precio o Stock.
- **Cambio**: "antes → después". Los estados en criollo (Activa, Pausada, Cerrada, En revisión, Inactiva, Pago pendiente), los precios con punto de miles y, en un cambio de precio, el porcentaje (verde si subió, rojo si bajó).
- **Origen**: **Laucen** (enlace a lo que mandó la cola a esa publicación) o **Fuera de Laucen**.

### Columnas (modo "Una fila por publicación")

Las mismas, más **Primer cambio**, **Último cambio** (en lugar de "Fecha y hora") y **Cambios** (cuántas veces cambió en el rango). El **Origen** puede ser también **Laucen y fuera** si hubo de los dos.

Otras columnas para una vista o el Excel: Variación, Enlace en ML, Antes, Después, Variación %.

Se ordena tocando el título de la columna (de entrada, lo más reciente primero) y se ve de a 50 filas con el paginador.

Al pie, una aclaración según el modo y: "«Laucen» = hace menos de 15 minutos la cola le había mandado a ML un cambio de ese tipo a esa publicación; si no, «Fuera de Laucen»."

## Cómo se hace

### Ver qué se pausó hoy y quién lo hizo

1. En fechas elegí **"Hoy"**.
2. En **"Qué cambió:"** dejá tildado sólo **Estado**.
3. Mirá la columna **Origen**.

### Ver los cambios que no hizo Laucen

Tildá **"Sólo los que hizo alguien fuera de Laucen"**.

### Ver la historia de una publicación

Escribí su número (MLA…), su SKU o parte del título en el buscador. Para ver desde el principio, ampliá las fechas.

### Resumir por publicación

En **Ver** elegí **"Una fila por publicación"**: cada publicación (y variación) y tipo de cambio en una fila, con el valor al empezar el rango → el valor al terminar y cuántas veces cambió.

### Ver qué mandó Laucen

En un cambio con origen **Laucen**, tocá "Laucen": abre la [Cola de Mercado Libre](/config/canales/cola) con lo enviado a esa publicación.

## Criterios y reglas

- **Los títulos de las columnas quedan fijos**: la tabla baja dentro de su caja (del alto de la ventana) y la fila de títulos queda siempre a la vista; los filtros de arriba se van al bajar la página.
- **Posible causa (campañas de ML)**: en los cambios de **precio**, esta columna muestra las campañas que, según [Promociones de ML](/informes/promociones), empezaron, terminaron o cambiaron el precio de esa publicación en las 1,5 horas anteriores. Es una pista, no una prueba; vacía quiere decir que no coincide con ninguna campaña anotada.

### Cómo se anota la historia

- Laucen tiene una copia de cada publicación (y variación) de Mercado Libre, que se mantiene al día con los avisos que manda Mercado Libre en el momento, con un barrido cada 30 minutos y con una barrida nocturna. **Cada vez que esa copia cambia de estado, de precio o de stock**, se anota el valor de antes y el de después, con fecha y hora.
- Por eso un cambio se ve recién cuando Laucen se entera (normalmente en el momento; en el peor caso, en el barrido siguiente).
- Las **altas** de publicaciones nuevas no se anotan (no hay "antes").
- El **estado** de una publicación con variaciones se anota en cada variación.
- Se guarda también el SKU y el título de ese momento, por si después cambian.

### Laucen o fuera de Laucen

Un cambio es de **Laucen** si en los **15 minutos anteriores** la cola de Laucen le mandó (o estaba mandando) a esa publicación un cambio del mismo tipo:
- para un cambio de **estado**: un envío de estado o de stock (Laucen pausa y reactiva por stock);
- para un cambio de **precio**: un envío de precio, descuento o campaña;
- para un cambio de **stock**: un envío de stock.

Si no, es **Fuera de Laucen** (lo cambió alguien en Mercado Libre, o Mercado Libre mismo, por ejemplo al vender o al pausar por un problema).

### Modo "Una fila por publicación"

Agrupa por publicación, variación y tipo de cambio dentro del rango: "antes" es el valor antes del **primer** cambio del rango y "después" el valor después del **último**. Si volvió a como estaba, se ve igual a los dos lados. **Cambios** cuenta cuántos hubo. **Origen**: Laucen si todos fueron de Laucen, Fuera de Laucen si todos fueron de afuera, Laucen y fuera si hubo de los dos.

### Variación %

Para precio y stock: (después ÷ antes − 1) × 100, con un decimal. No se calcula si el valor de antes es cero.

### Fechas

Los días se toman en hora argentina, con el día "hasta" incluido. Si sacás una de las dos fechas, el filtro queda abierto de ese lado.

### Lo que no hace

Es sólo lectura: no modifica nada en Mercado Libre.

## Preguntas frecuentes

**¿Por qué no veo cambios de stock?**
Porque de entrada sólo están tildados Estado y Precio. Tildá **Stock** en "Qué cambió:".

**¿Por qué no aparece un cambio de la semana pasada?**
Porque el período de entrada son los últimos 7 días. Ampliá las fechas. Y recordá que la historia arranca el 3/10/2026.

**Dice "Fuera de Laucen" pero yo lo cambié desde Laucen.**
Si el cambio llegó a Mercado Libre más de 15 minutos después de que la cola lo mandó, o si lo hiciste directo en Mercado Libre, se marca como fuera de Laucen.

**¿Qué es "Laucen y fuera"?**
En el modo "Una fila por publicación", que en el rango hubo cambios de los dos orígenes.

**¿Puedo ver quién de afuera lo cambió?**
No: Mercado Libre no lo informa. Sólo se sabe que no lo mandó Laucen.

**Una publicación aparece varias veces con el mismo estado.**
Si tiene variaciones, el estado se anota en cada variación.

## Relacionado

- [Publicaciones](/catalogo/publicaciones)
- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Cola de Mercado Libre](/config/canales/cola)
- [Canales](/config/canales)

## Historial de una publicación

Tocando el **número de publicación** (MLA…) se abre su historial: todo lo que le cambió, lo más nuevo arriba. Se llega desde este informe, desde Promociones de ML, desde [Publicaciones](/catalogo/publicaciones) y desde la pestaña de publicaciones de la ficha de un producto. Al lado del número, la flechita **↗** abre la publicación en Mercado Libre en otra pestaña.

Arriba muestra la publicación como está hoy: título, cuenta, SKU (con enlace al producto), estado, precio y stock. Arriba a la derecha, **"Ver en Mercado Libre ↗"** la abre en Mercado Libre, en otra pestaña.

La tabla junta, en orden de fecha:
- **Estado, Precio y Stock**: cada cambio que tuvo (antes → después) y si lo hizo Laucen o alguien fuera de Laucen. «Fuera de Laucen» quiere decir que Laucen no le mandó nada en los 15 minutos anteriores: pudo ser alguien en Mercado Libre, Mercado Libre mismo u otro programa conectado a la cuenta. Se anotan desde el 3/10/2026.
- **"Laucen mandó: …"**: cada cosa que le mandó Laucen por la cola (estado, precio, stock, atributos, campañas…), con cómo salió: enviado bien, con error (y el motivo), esperando tu clic, en la cola o descartado; y si fue por tu clic, automático o una barrida.
- **"Venta"**: cada venta de esta publicación, con el enlace al pedido.
- **"Campaña: …"**: lo que pasó con ella en las campañas de Mercado Libre (entró, salió, cambió el precio o el estado).

La columna **"Por qué"** explica, con el enlace al pedido y en el mismo renglón del cambio (también en lo que mandó Laucen):
- una baja de stock o una pausa que llegó hasta 30 minutos después de una venta del mismo producto (en esta publicación o en otra, de cualquier cuenta o canal): "Venta del pedido N" o "Sin stock por la venta del pedido N". Aunque esa venta después se haya cancelado, en su momento fue lo que bajó el stock;
- una suba de stock o una reactivación hasta 30 minutos después de que se canceló o devolvió un pedido del mismo producto: "Cancelación del pedido N" o "Devolución del pedido N".

Si tiene variaciones, una columna dice de cuál variación es cada cambio. Va de a 50 renglones, con el paginador abajo.
