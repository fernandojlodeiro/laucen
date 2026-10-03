---
titulo: Depósitos y ubicaciones
menu: Tablas generales › Depósitos y ubicaciones
ruta: /stock/depositos
rutas: /stock/depositos
permiso: depositos_ver
resumen: Alta y edición de los depósitos (propio, Full, tercerizado, caja abierta) y de sus ubicaciones (estantes), con el orden de recorrido del picking.
---

## Para qué sirve

Acá se cargan los **depósitos** (los lugares donde hay mercadería) y, dentro de cada uno, sus **ubicaciones** (estantes, posiciones, como "A-03-2"). Todo el stock vive en una ubicación de un depósito. También se define el **orden de recorrido** de las ubicaciones, que es el orden en que el picking y las hojas de preparación listan lo que hay que juntar.

Se ve también cuántas unidades hay en cada depósito y en cada ubicación, y qué productos hay adentro de una ubicación.

## Cómo se llega

- Menú **Tablas generales › Depósitos y ubicaciones**.
- Desde otras pantallas que piden un depósito cuando no hay ninguno (Picking, Etiquetas, Ajustes de stock, Canales), con el enlace para crearlo.

## Qué hay en la pantalla

### Arriba a la derecha

- **"Descargar Excel"** de la lista de depósitos (con configuraciones de columnas; el Excel puede traer además la columna "Canales que venden desde acá").
- **"Nuevo depósito"**: abre el formulario de alta debajo del título, con **Nombre** ("ej. Depósito Once"), **Tipo**, el interruptor **"Usa ubicaciones"**, **Dirección (opcional)** y el botón **"Crear"**.

### La lista de depósitos

- Buscador **"Buscar depósito por nombre"** (busca mientras escribís, con "Comienza por").
- Columnas (se ordenan tocando el título): **Depósito** (enlace que abre sus ubicaciones), **Tipo**, **Usa ubicaciones** (un interruptor que se prende o apaga ahí mismo, "Sí"/"No"), **Dirección**, **Estado** (Activo / Archivado), **Ubicaciones** (botón "Ubicaciones (N)" que abre la lista de ubicaciones), **Unidades** (enlace a la [Consulta de stock](/stock/consulta) filtrada por ese depósito).
- En cada fila, el lápiz (convierte la fila en sus campos editables: nombre, tipo, "Usa ubicaciones", dirección y estado Activo/Archivado, con **"Guardar"** y **"Cancelar"**) y el tacho (pregunta "¿Borrar el depósito?" con Sí / No ahí mismo).

### Las ubicaciones de un depósito

Al tocar un depósito (o si hay uno solo activo, de entrada) se abre la caja **Ubicaciones de "<depósito>"**:

- Arriba a la derecha de la caja: **"Descargar Excel"** de sus ubicaciones (puede traer "Es la general" y "Productos distintos") y **"Nueva ubicación"** (sólo si el depósito usa ubicaciones). El alta pide **Código** ("ej. A-03-2"), **Descripción (opcional)**, **Orden** y **"Crear"**.
- Si el depósito no usa ubicaciones, aparece la explicación de que todo va a la general, y un aviso si quedaron ubicaciones viejas con stock.
- Buscador **"Buscar ubicación por código o descripción"**.
- Columnas (ordenables): **Código** (la general lleva la marca "General"), **Descripción**, **Orden de recorrido**, **Estado** (Activa / Archivada) y **Unidades**.
- Tocando el código o las unidades se despliega debajo lo que tiene adentro: SKU, Producto, Cantidad y Reservado (o "No tiene nada adentro.").
- Lápiz (código, descripción, orden y estado Activa/Archivada, con "Guardar"/"Cancelar") y tacho ("¿Borrar?") en cada ubicación, salvo en la general, que dice "la crea el sistema".
- Paginado abajo (de a 50) y la nota "El orden de recorrido es el que va a seguir el picking: de menor a mayor."

## Cómo se hace

### Crear un depósito

1. Apretá **"Nuevo depósito"**.
2. Poné el nombre y elegí el **Tipo**: **"Propio"**, **"Full de Mercado Libre"**, **"Tercerizado"** o **"Caja abierta"**.
3. Prendé **"Usa ubicaciones"** si vas a ordenarlo por estantes; si no, dejalo apagado.
4. Si querés, la dirección.
5. Apretá **"Crear"**. El sistema crea solo su ubicación **GENERAL** y lo deja abierto para cargar ubicaciones.

Para que un canal (Mercado Libre, tienda) venda desde ese depósito, hay que asignárselo en [Canales](/config/canales).

### Cargar las ubicaciones de un depósito

1. Abrí el depósito (tocando su nombre). Tiene que tener **"Usa ubicaciones"** prendido.
2. Apretá **"Nueva ubicación"**.
3. Poné el **Código** (se guarda en mayúsculas), una descripción si querés y el **Orden** de recorrido (un número: el picking va de menor a mayor).
4. Apretá **"Crear"**.

Después, imprimí las etiquetas de los estantes en [Etiquetas › Ubicaciones](/deposito/etiquetas/ubicaciones).

### Cambiar el orden en que se recorre el depósito

Editá cada ubicación con el lápiz y cambiá **Orden de recorrido**. El picking y las hojas de preparación ordenan por ese número y, a igual número, por código.

### Ver qué hay en un estante

Abrí el depósito, buscá la ubicación y tocá su código o sus unidades: se despliega la lista de productos con cantidad y reservado.

### Dejar de usar un depósito

- Si no tiene stock ni movimientos, borralo con el tacho.
- Si tiene stock o movimientos guardados, no se puede borrar: el sistema muestra el motivo y ofrece **"Archivarlo"** (o **"No"**). También se puede archivar con el lápiz, eligiendo "Archivado".

### Dejar de usar una ubicación

- Sin stock ni movimientos: tacho.
- Con stock: primero pasá el stock a otra con una [transferencia](/stock/ajustes), o archivala con el lápiz.
- Con movimientos guardados: no se borra; archivala con el lápiz.

## Criterios y reglas

- **Ubicación General**: todo depósito tiene una, creada sola al crear el depósito (código GENERAL, orden 0). No se borra, no se renombra ni se archiva. Si el depósito no usa ubicaciones, es la única y todo el stock va ahí; si las usa, es donde queda lo que todavía no se ubicó (por ejemplo, lo que entra por una factura de compra o un despacho, o lo que se recibe sin elegir ubicación).
- **"Usa ubicaciones"**: sólo con el interruptor prendido se pueden crear ubicaciones y aparecen para elegir en ajustes, recepción e informes. Apagarlo no borra las ubicaciones ni su stock: el stock que tengan se sigue viendo en la consulta y la pantalla avisa cuántas quedaron con stock.
- **Tipos de depósito**:
  - **Propio**: el depósito de la empresa. Es el que se toma por defecto para un pedido cuando el canal no tiene depósito asignado.
  - **Full de Mercado Libre**: la mercadería que está en Full. No aparece en Picking, Recepción ni Etiquetas, y las publicaciones de Full no reciben stock de Laucen (lo maneja Mercado Libre).
  - **Tercerizado**: un depósito de terceros.
  - **Caja abierta**: donde va lo devuelto con la caja abierta en la [Recepción](/deposito/recepcion) (se usa el primero activo de este tipo).
- **Archivado**: un depósito archivado deja de contar para el stock disponible de los canales (no se informa a Mercado Libre ni a la tienda), no suma en la consulta ni en los informes, y no se ofrece en las pantallas de trabajo. Guarda su historia y se puede volver a activar con el lápiz. Una ubicación archivada no se ofrece para recibir, reservar ni ajustar.
- **Borrar**: sólo un depósito o una ubicación sin stock (ni cantidad ni reservado) y sin movimientos guardados.
- **Orden de recorrido**: también decide de qué ubicación se reserva primero un pedido (las de menor orden, entre las que tienen disponible).
- **Códigos**: se guardan en mayúsculas y no se pueden repetir dentro de un mismo depósito. Dos depósitos no pueden tener el mismo nombre.
- **Unidades**: la suma de la cantidad física (sin descontar lo reservado).

## Preguntas frecuentes

**¿Qué es la ubicación "General"?**
La que crea el sistema en cada depósito. Ahí va todo si el depósito no usa ubicaciones, y lo que todavía no se ubicó si las usa.

**No me aparece "Nueva ubicación".**
El depósito tiene que tener prendido "Usa ubicaciones".

**¿Por qué no puedo borrar un depósito?**
Tiene stock o movimientos guardados. Archivalo: queda la historia y deja de contar para los canales.

**¿Cómo hago que Mercado Libre venda desde un depósito nuevo?**
Asignalo al canal en [Canales](/config/canales).

**¿Para qué sirve el orden de recorrido?**
Para que el picking y las hojas de preparación listen las cosas en el orden en que se camina el depósito, y para elegir de qué estante se reserva primero.

**¿Dónde imprimo las etiquetas de los estantes?**
En [Etiquetas › Ubicaciones](/deposito/etiquetas/ubicaciones).

**¿Puedo cambiar el código de una ubicación que tiene stock?**
Sí, con el lápiz; el stock queda en la misma ubicación con el código nuevo. Acordate de reimprimir su etiqueta.

## Relacionado

- [Consulta de stock](/stock/consulta)
- [Ajustes de stock](/stock/ajustes) (transferencias)
- [Etiquetas](/deposito/etiquetas)
- [Canales](/config/canales)
- [Picking](/deposito/picking) y [Recepción](/deposito/recepcion)
- [Stock por ubicación](/informes/stock-por-ubicacion)
