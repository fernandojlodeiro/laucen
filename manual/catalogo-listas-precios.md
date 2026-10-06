---
titulo: Listas de precios
menu: Catálogo › Listas de precios
ruta: /catalogo/precios
rutas: /catalogo/precios
permiso: precios_ver
resumen: Las listas de precios (Clásicas, Web, Mayorista…), el precio de lista de cada variación en cada una, listas que se calculan desde otra y la carga masiva por porcentaje.
---

## Para qué sirve

Cada lista de precios tiene un **precio de lista** por variación (el que se muestra tachado cuando hay descuento). El **precio de venta** se calcula solo: el de lista menos el descuento que rige para esa variación (de la variación, del producto o de la familia).

Cada canal de venta y cada cliente puede tener asignada una lista. La lista base de la empresa es **"Clásicas"**: la que crea y llena la importación de Virtual Seller con el precio de las publicaciones Clásicas de Mercado Libre (o, si el producto no tiene Clásica, con la Lista_000 de Virtual Seller). Es el precio que pone la empresa para Mercado Libre; de ahí salen los demás precios de ML (ver [Precios en Mercado Libre](/catalogo/precios-ml)). Otras listas pueden **calcularse desde Clásicas** con un coeficiente (ej. "Web = Clásicas × 0,90").

## Cómo se llega

- Menú **Catálogo › Listas de precios**.
- Desde la ficha de un producto, pestaña **Precios**, cuando no hay listas: enlace a esta pantalla.

## Qué hay en la pantalla

Arriba a la derecha: **Descargar Excel** (de las listas) y **+ Nueva lista**.

### Las listas (arriba)

Buscador **"Buscar lista"**. Tabla con:
- **Lista**: tocándola, abajo se ve su grilla de precios (la fila elegida se pinta y dice "(viendo abajo)").
- **Moneda base**: Pesos o Dólares.
- **Se calcula desde**: "= Clásicas × 0,9" si es una lista derivada; "—" si tiene precios propios.
- **Orden**, **Estado** (Activa / Archivada), **Variaciones con precio** (cuántas variaciones tienen precio cargado a mano en esa lista).
- **Lápiz** (la fila se convierte en sus campos) y **tacho** ("¿Borrar la lista y sus precios?").

Al editar una lista: nombre, moneda base, **Se calcula desde** ("Ninguna (precios propios)" o una lista), **×** coeficiente (ej. 0,90), orden, estado, **Guardar** / **Cancelar**.

### La grilla de precios de la lista elegida (abajo)

Título "Precios de "…" · se ven en pesos/dólares" (según el interruptor $ / US$ de arriba). Si es derivada, explica: "Esta lista se calcula: … Un precio cargado a mano acá gana sobre el calculado (los calculados dicen "calculado")."

- Buscador **"Buscar SKU, título o código de barras"** con "Comienza por" y **Mostrar inactivos**, y su propio **Descargar Excel** (trae también precios en dólares, código de barras y si el precio es propio de la lista).
- Una fila por **variación activa**: **SKU** (lleva a la ficha, con su foto), **Variación**, **Precio de lista** (tachado si hay descuento; "sin precio" si no tiene), **Descuento**, **Precio de venta**, **Vigente desde**, **Cargado en** (Pesos / Dólares, y la marca "calculado" si sale de la lista base), y el lápiz **Editar precio**.
- Al editar: el importe (si el precio es calculado, el campo viene vacío y dice "Calculado: …"), la moneda en que se carga, **Guardar** / **Cancelar**.
- De a 50 filas; todas las columnas con ▲/▼ se ordenan tocando el título.

### Carga masiva por porcentaje (al pie)

Aparece si hay más de una lista. "Carga desde hoy, en la lista destino, el precio de la lista origen más o menos un porcentaje (ej. "Mayorista = Web − 25 %"). Pisa los precios que la lista destino tenga cargados hoy."

Campos: **Lista destino** = **Lista origen**, **Más o menos** (− o +), **Porcentaje**, **Redondeo** (Sin redondeo / A 1 / A 10 / A 100), botón **Seguir**. Después muestra el resumen ("Mayorista = Web − 25,0 %, redondeado a 10 · va a cargar N precios.") con **Cargar precios** (pregunta "¿Cargar N precios en …?" Sí / No) y **Cancelar**.

## Cómo se hace

### Crear una lista

1. **+ Nueva lista**.
2. Nombre (ej. "Mayorista"), moneda base (Pesos o Dólares) y, si querés, el orden.
3. **Crear**. Queda elegida abajo, vacía.

El nombre no se puede repetir.

### Hacer que una lista se calcule desde otra (ej. Web = Clásicas × 0,90)

1. Lápiz de la lista (ej. Web).
2. En **Se calcula desde** elegí la base (ej. Clásicas) y en **×** el coeficiente (0,90 = 10 % menos; 1,15 = 15 % más).
3. **Guardar**.

Errores: "Falta el coeficiente (ej. 0,90).", "El coeficiente tiene que ser mayor que cero (ej. 0,90 o 1,15).", "Esa lista ya se calcula desde otra: elegí una con precios propios.", "Esta lista es base de otra: no puede calcularse a su vez desde una tercera.", "Una lista no puede calcularse desde sí misma." En el desplegable, las listas que no pueden ser base aparecen deshabilitadas.

### Cargar o cambiar el precio de una variación

1. Elegí la lista en la tabla de arriba.
2. Buscá la variación y apretá su lápiz.
3. Escribí el precio de lista, elegí si lo cargás en pesos o en dólares y apretá **Guardar**. Avisa "Precio guardado (rige desde hoy)."

También se puede desde la ficha del producto, pestaña **Precios**.

### Cargar una lista entera a partir de otra con un porcentaje

1. En **Carga masiva por porcentaje**, elegí **Lista destino** y **Lista origen**.
2. Elegí − o +, el **Porcentaje** y el **Redondeo**.
3. **Seguir**, revisá el resumen y apretá **Cargar precios** → **Sí**.
4. Avisa "Listo: se cargaron N precios." (o "La lista de origen no tiene precios: no se cargó nada.").

### Archivar o borrar una lista

- Archivar: lápiz → Estado **Archivada** → Guardar. Deja de aparecer en la pestaña Precios de las fichas.
- Borrar: tacho → **Sí**. Se borran todos sus precios; los canales y clientes que la usaban quedan sin lista.

## Criterios y reglas

**Cómo se calcula cada precio** (lo resuelve una sola cuenta, la misma en todo el sistema: pantallas, pedidos, tienda, Mercado Libre). Para una variación, una lista y un día:

1. **Precio de lista**:
   - Si la lista tiene un precio **propio** cargado para esa variación con fecha de vigencia hasta ese día, se toma el más reciente.
   - Si no tiene propio y la lista **se calcula desde otra**, se toma el precio vigente de la lista base × el coeficiente, redondeado a 2 decimales (en pesos y en dólares). Se marca "calculado".
   - Un precio propio **siempre gana** sobre el calculado, aunque el de la base sea más nuevo.
   - Si no hay ninguno: "sin precio".
2. **Descuento que rige**: el de la variación → el del producto → el de su familia → el de la primera familia de más arriba que tenga uno → 0 %.
3. **Precio de venta** = precio de lista × (1 − descuento ÷ 100), redondeado a 2 decimales.

**Dos monedas**: cada precio se guarda en pesos y en dólares. Al cargarlo en una moneda, la otra se calcula con el tipo de cambio oficial del día y **queda fija** (no se recalcula sola después). Si no hay tipo de cambio cargado, no deja guardar y pide cargarlo en [Tipo de cambio](/config/tipo-cambio). La pantalla muestra la moneda que eligió cada usuario con el interruptor $ / US$; "Cargado en" dice en cuál se cargó. La **moneda base** de la lista sólo decide en qué moneda se propone cargar.

**Precio en dólares** (casilla de la ficha del producto, pestaña Datos): para esos productos el precio vale en dólares y los **pesos se recalculan todos los días** con el tipo de cambio de ese día (precio en dólares × tipo de cambio), sin cargar precios nuevos; "Cargado en" pasa a decir Dólares. Si no hay tipo de cambio, quedan los pesos calculados al cargar. El precio de venta en pesos sale de esos pesos del día.

**Historia**: un precio nuevo rige desde hoy y queda guardado con su fecha; los anteriores se conservan. Si ya había uno cargado **hoy** en esa lista para esa variación, se pisa (la historia es por día).

**Listas derivadas**
- Un solo nivel: la base tiene que tener precios propios (no puede ser a su vez derivada), y una lista que ya es base de otra no puede calcularse desde una tercera. Así no hay círculos.
- El coeficiente tiene que ser mayor que cero.
- Si se borra la lista base, la derivada queda sin base (con sus precios propios, si tenía).
- Los redondeos "A 1 / A 10 / A 100" **no** se aplican a las listas derivadas: sólo a la carga masiva. Una derivada redondea a centavos.

**Carga masiva por porcentaje**
- Toma, de cada variación, el precio de lista **propio** vigente hoy en la lista origen (no los calculados ni el descuento) y lo multiplica por (1 + porcentaje ÷ 100); con "−" el porcentaje resta.
- Redondeo: al múltiplo de 1, 10 o 100 más cercano; sin redondeo, a centavos. El redondeo se hace en la moneda en que estaba cargado el precio de origen (un precio cargado en dólares se redondea en dólares).
- Lo carga como precio propio de la lista destino, desde hoy y en la misma moneda que en la origen; pisa lo que el destino tuviera cargado hoy. Queda fijo: si después cambia la lista origen, el destino no cambia (para que siga sola, usá "Se calcula desde").
- Origen y destino tienen que ser distintas.

**Qué variaciones aparecen en la grilla**: sólo las variaciones **activas**; las de productos inactivos sólo con "Mostrar inactivos". El buscador busca lo escrito tal cual (entero, con espacios) en el SKU, el título o el código de barras (al principio o en cualquier parte, según "Comienza por"; con "?" separás condiciones que tienen que estar todas en el mismo dato). Con algo escrito, si ningún producto activo coincide pero sí uno inactivo, se muestra igual.

**Precio negativo**: no se acepta ("El precio tiene que ser un número mayor o igual a cero.").

## Preguntas frecuentes

**¿Cuál es la diferencia entre precio de lista y precio de venta?**
El de lista es el que se carga (y se muestra tachado). El de venta es el de lista menos el descuento de la variación, el producto o la familia.

**Cargué un precio en pesos, ¿el de dólares se actualiza si sube el dólar?**
No, queda fijo al tipo de cambio del día en que lo cargaste. Salvo que el producto tenga tildado "Precio en dólares": ahí los pesos siguen al dólar todos los días.

**¿Qué quiere decir "calculado"?**
Que ese precio no está cargado en esta lista: sale de la lista base por el coeficiente. Si le cargás uno a mano, gana el tuyo.

**Cambié un precio en Clásicas, ¿se actualiza Web?**
Sí, si Web "se calcula desde" Clásicas y esa variación no tiene precio propio en Web. Si Web se cargó con la carga masiva, no: hay que volver a correrla.

**¿Puedo cargar un precio para mañana?**
No desde esta pantalla: todo precio rige desde hoy.

**Me dice que falta el tipo de cambio, ¿qué hago?**
Cargalo en [Tipo de cambio](/config/tipo-cambio) y volvé a guardar.

**¿Por qué una variación no aparece en la grilla?**
Porque está pausada o inactiva, o su producto está inactivo (tildá "Mostrar inactivos").

**¿Borrar una lista borra los productos?**
No: borra la lista y sus precios. Los canales y clientes que la usaban quedan sin lista.

## Relacionado

- [Productos](/catalogo/productos) (pestaña Precios y casilla "Precio en dólares")
- [Familias](/catalogo/familias) (descuento heredado)
- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Tipo de cambio](/config/tipo-cambio)
- [Canales](/config/canales)
- [Clientes](/ventas/clientes)
