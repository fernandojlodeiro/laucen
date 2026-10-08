---
titulo: Producto nuevo de punta a punta (paso a paso)
menu: Catálogo › Productos (guía: de cero a todas las publicaciones)
ruta: /catalogo/productos
rutas: /catalogo/productos, /catalogo/productos/[id], /catalogo/productos/[id]/publicar-ml
permiso: productos_ver
resumen: Guía paso a paso para dar de alta un producto desde cero y dejarlo publicado con la variedad completa: todas las cuentas de Mercado Libre con la Clásica y sus planes de cuotas, catálogo, campañas y tienda web. Dice qué hay que decidir en cada paso.
---

## Para qué sirve

Es el recorrido completo, en orden, para que un producto que recién llega quede bien cargado y publicado en todos lados: las 5 cuentas de Mercado Libre (cada una con su Clásica y los planes de cuotas que le tocan por su categoría y su precio), el catálogo de Mercado Libre, las campañas y la tienda web. En cada paso dice **qué hay que decidir** y qué hace el sistema solo. El detalle de cada pantalla está en su propia página del manual (enlazada en cada paso).

La idea de fondo: **vos cargás un solo precio** (el de la lista Clásicas) y unas pocas decisiones; todo lo demás (el precio de cada cuenta, cada plan de cuotas, la web, el local) sale solo de las reglas. Ver [Cómo funcionan los precios](/catalogo/precios-ml).

## Cómo se llega

Se arranca en [Catálogo › Productos](/catalogo/productos) y se sigue en la ficha del producto. Las publicaciones se arman desde la pestaña **Publicaciones** de la ficha.

## Cómo se hace

### Antes de empezar (una sola vez, ya debería estar)

1. Las cuentas de Mercado Libre conectadas, cada una con su lista de precios y sus depósitos: [Configuración › Canales](/config/canales).
2. En [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas), para todas las cuentas a la vez y por grupo de categorías (por ejemplo «Notebooks» y «Resto»): qué planes de cuotas van (tildar **Usar**), cuántas cuotas ve el comprador en cada uno y el **% extra sobre la Clásica** de cada plan. Esto decide qué publicaciones de cuotas se crean. Los planes van sólo en los productos con una Clásica de **$ 33.000 o más**; debajo, o si el grupo no usa ningún plan, el producto sale sólo con la Clásica.
3. La categoría de Mercado Libre cargada en la [familia](/catalogo/familias) del producto (de ahí salen la categoría de la publicación y las comisiones que usa el cálculo).

### Paso 1 · Dar de alta el producto

1. En [Productos](/catalogo/productos), botón **+ Nuevo producto** (arriba a la derecha).
2. **SKU base** y **Título** (obligatorios), **Tipo** y **Familia**. Apretá **Crear**: se abre la ficha.

**Decidir:**
- **Tipo**: **Simple** (un solo producto), **Con variaciones** (colores, talles: cada una con su SKU, stock y precio) o **Kit** (se arma con otros productos: por ejemplo la notebook con más memoria = equipo + memoria).
- **Familia**: es la categoría. Define la categoría de Mercado Libre, el descuento heredado, el costo de importación heredado y en qué categoría aparece en la tienda web.

### Paso 2 · Completar los datos (pestaña Datos)

Lápiz arriba a la derecha → completar → **Grabar**.

**Decidir:**
- **Marca** (sin marca va **Daitom**, la propia), **Modelo** y **Línea**: Mercado Libre los pide y con ellos busca el producto en su catálogo.
- **Código de barras** (el de la caja): en muchas categorías Mercado Libre lo **exige** (en notebooks, sí) y con él se encuentra el producto de catálogo. Si el producto no tiene, se publica con el motivo "no tiene código registrado" donde ML lo acepta.
- **Garantía** y **Condición** (Nuevo, Usado, Reacondicionado).
- **Peso** y **medidas** (van como medidas del paquete a Mercado Libre y sirven para el envío).
- **IVA** (21 %, 10,5 %…), **Umbral de pausa** (con cuánto stock se pausa en ML; vacío = el del canal) y **Stock mínimo** (debajo avisa el panel).
- **Precio en dólares**: tildalo si el precio se piensa en dólares; los pesos siguen solos al tipo de cambio de cada día.
- **Descripción larga**: es la que va a Mercado Libre y a la web.

### Paso 3 · Variaciones o componentes (si corresponde)

- **Con variaciones**: pestaña **Variaciones**, una por color/talle, cada una con su SKU y su código de barras. Ver [Productos](/catalogo/productos).
- **Kit**: pestaña **Componentes del kit**, **+ Nuevo componente** con el SKU y la cantidad de cada pieza. Si al armarlo **sobra** una pieza (la memoria de 4 GB que se le saca a la notebook), agregala tildando **"Sobra al armarlo"**: entra sola al stock cuando se vende el kit.

### Paso 4 · Fotos

Pestaña **Fotos** → **📷 Subir fotos**. La primera es la principal (se mueven con ◀ ▶). **Sin fotos no se puede armar una publicación nueva.**

### Paso 5 · Costo

En **Datos**, el **Costo FOB**; en la pestaña **Costo**, lo propio de importación (lo que no cargues lo hereda de la familia). Sirve para la rentabilidad; el precio no se calcula del costo.

### Paso 6 · Stock

El stock entra por la compra (factura y recepción) o, si ya está en el depósito, con un ajuste en [Stock › Ajustes](/stock/ajustes). Mercado Libre recibe solo lo disponible de los depósitos de cada cuenta. Sin stock la publicación sale con 1 y se pausa sola si está prendido el envío de stock.

### Paso 7 · El precio (uno solo)

1. Pestaña **Precios** de la ficha, lista **Clásicas**: lápiz de la variación → **Precio de lista nuevo** → **Guardar**.
2. Listo: la **Web minorista** y el **Local** salen de Clásicas solas (Clásicas × 1).

**Decidir: ¿con tachado o sin tachado?**
El precio que cargás es siempre la **Clásica**: lo que paga el comprador en Mercado Libre en la cuenta que gana.
- **Sin tachado** (lo normal): la publicación sale a ese precio.
- **Con tachado** (para que en Mercado Libre se vea "X % OFF"): en [Precios en ML](/catalogo/precios-ml), pestaña «Excepciones», se pone una excepción del producto con su **Descuento que ve el comprador %** y el sistema calcula el tachado = Clásica ÷ (1 − Descuento %). Ejemplo de las notebooks: Clásica $ 1.181.240 y descuento **45 %** → tachado $ 2.147.709. La publicación sale al tachado y una campaña la baja a la Clásica.
- **Descuento %** del producto o la familia: sólo se aplica en las listas con «Aplica descuentos» (la Web minorista). **Nunca en Mercado Libre.**

### Paso 8 · Revisar las reglas de Mercado Libre del producto (si hace falta)

En [Precios en ML](/catalogo/precios-ml), pestaña «Excepciones», **Nueva excepción** para el producto (por SKU) sólo si tiene que ser distinto de lo general de la cuenta: otro descuento que ve el comprador u otro «¿gana?» para la Clásica o un plan. Lo que quede vacío hereda. Qué planes lleva no se cambia por producto: sale del grupo de su categoría en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas). Para ver los números antes de publicar: [Vista previa](/catalogo/precios-ml/vista-previa) buscando el SKU.

### Paso 9 · La primera publicación

Hace falta **una** publicación común en una cuenta; las demás se copian de ésa.

1. Ficha → pestaña **Publicaciones** → **Nueva desde Laucen con IA** (arriba a la derecha de la tabla de publicaciones).
2. Tildá sólo **ML .BAIRES**, tipo **Clásica**. Revisá el título (hasta 60 letras), las características marcadas **IA** (fondo amarillo) y la descripción.
3. **Preparar publicación** (arriba a la derecha) → en la [Cola de Mercado Libre](/config/canales/cola), pestaña «Lotes preparados», **Mandar a Mercado Libre**.

Si el producto ya existe en el **catálogo de Mercado Libre** con una marca que se puede usar, la publicación de catálogo se pide en el paso 10 (sale sola para cada alta).

### Paso 10 · Todas las cuentas y todos los planes

1. Ficha → pestaña **Publicaciones** → **Publicar en todas las cuentas**.
2. Revisá la tabla: por cuenta, la **Clásica** y cada **plan de cuotas** que le toca (los que usa el grupo de su categoría en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas), si la Clásica es de $ 33.000 o más), a qué precio se publica, cuánto paga el comprador y **quién gana**:
   - **.BAIRES** gana la Clásica y el plan del grupo que el comprador ve con **más cuotas**.
   - Cada uno de los otros planes del grupo va a la cuenta que menos veces lo ganó.
   - Las que no ganan van **3 % más caras** (para no competir entre tus cuentas).
3. **Preparar N publicaciones** (arriba a la derecha). Corre de fondo; al terminar, el cartel de abajo a la derecha dice qué lotes quedaron (uno por cuenta). Lo que ML rechace no entra y dice por qué.
4. En la [Cola de Mercado Libre](/config/canales/cola), pestaña «Lotes preparados», cada lote → **Mandar a Mercado Libre**.

Cada alta, si se conoce el producto de catálogo, pide además **entrar al catálogo**. Quién gana queda grabado en las excepciones del producto en [Precios en ML](/catalogo/precios-ml) (se cambia ahí con el lápiz).

### Paso 11 · Campañas y control

- Con **tachado** y «Sincronizar precios» prendido en la cuenta, Laucen mete cada publicación en las campañas que Mercado Libre le ofrece (las lee cada hora) **al precio del esquema**, nunca más abajo. Sin tachado no hace falta campaña.
- Una publicación con tachado que pierde su campaña **sigue al precio tachado**: nunca se baja a la Clásica (después de una venta a ese precio Mercado Libre puede no dejar volver a subirlo).
- Mirá [Precios en ML › Alertas](/catalogo/precios-ml): **Campañas debajo del piso** (una campaña, propia o de ML, que la deja más barata de lo que corresponde; botón **Sacar de la campaña**), **Sin campaña hace más de 24 horas** (publicaciones con tachado que no están en ninguna campaña) y **destacados que dejaron de ganar**.

### Paso 12 · Tienda web

1. Ficha → **Publicaciones** → interruptor **"Publicado en Web minorista"**.
2. Opcional: **Cucardas** (pestaña de la ficha) y cuotas de la web en [Tienda web › Cuotas](/config/cuotas).

## Criterios y reglas

**Lo que hay que decidir, en resumen:** tipo, familia, marca/modelo/código de barras, fotos, el precio de la Clásicas (y si va con tachado), las excepciones de Mercado Libre del producto si hace falta, y apretar los botones. Qué planes de cuotas lleva lo decide el grupo de su categoría en Planes de cuotas (paso "Antes de empezar"); quién gana lo reparte el botón.

**Qué sale solo y qué espera tu clic:**
- Toda publicación nueva y todo cambio a Mercado Libre armado por un botón queda en un **lote** que espera **Mandar a Mercado Libre**.
- Sale solo, sólo en las cuentas con el interruptor prendido: el stock (y la pausa al llegar al umbral) y los precios y campañas («Sincronizar precios»). Nunca publicaciones nuevas.

**No se duplica:** ni el botón de todas las cuentas ni las otras pestañas crean lo que la cuenta ya tiene activo o lo que ya está en la cola.

## Preguntas frecuentes

**¿Por qué un producto sale sólo con la Clásica?** Porque su Clásica está debajo de $ 33.000, o porque el grupo de su categoría no usa ningún plan. Se revisa en [Precios en ML › Planes de cuotas](/catalogo/precios-ml/planes-cuotas).

**¿Puedo cambiar después quién gana?** Sí: [Precios en ML](/catalogo/precios-ml), pestaña «Excepciones», lápiz del producto, campos «¿Gana? (si no, +%)» (0 = gana; 3 = no gana).

**¿El botón de todas las cuentas sirve para un producto que no tiene ninguna publicación?** No: primero hacé una (paso 9) y después volvé.

## Relacionado

- [Productos](/catalogo/productos)
- [Listas de precios](/catalogo/precios)
- [Precios en Mercado Libre](/catalogo/precios-ml)
- [Planes de cuotas](/catalogo/precios-ml/planes-cuotas)
- [Cola de Mercado Libre](/config/canales/cola)
