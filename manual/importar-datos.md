---
titulo: Importar datos
menu: Configuración › Importar datos
ruta: /importar
rutas: /importar, /importar/[id], /importar/virtualseller, /importar/virtualseller/[id]
permiso: importar_ver
resumen: Cargar desde un Excel o CSV productos, clientes y proveedores, ventas históricas y stock inicial (mapeando columnas), y la importación especial de productos desde Virtual Seller cruzada con Mercado Libre.
---

## Para qué sirve

Para traer datos masivos desde una planilla en vez de cargarlos uno por uno. Hay dos caminos:

1. **Importación general desde Excel** ([/importar](/importar)): subís un archivo, elegís qué es (Productos, Clientes y proveedores, Ventas históricas o Stock inicial), le decís qué columna va a cada campo, mirás una vista previa y lo ejecutás. Queda un informe con las filas importadas y las rechazadas con su motivo.
2. **Productos desde Virtual Seller + Mercado Libre** ([/importar/virtualseller](/importar/virtualseller)): subís tres archivos de Virtual Seller (stock, maestro y lista de precios) y el sistema los cruza con las publicaciones de la cuenta de Mercado Libre para armar el catálogo completo: productos, kits, stock por ubicación, precios, IVA y vinculación con las publicaciones.

## Cómo se llega

- Menú **Configuración › Importar datos**.
- Desde ahí, el recuadro azul **"Productos desde Virtual Seller + Mercado Libre"** lleva a la importación de Virtual Seller.
- Pide el permiso «Importar datos».

## Qué hay en la pantalla

### Importar datos (/importar)

- Arriba, el recuadro azul que lleva a la importación de Virtual Seller.
- El formulario de subida:
  - **Qué es**: Productos, Clientes y proveedores, Ventas históricas, Stock inicial.
  - **Archivo Excel (.xlsx / .xls) o .csv**.
  - Botón **"Subir y leer"** (mientras trabaja dice "Subiendo…" y "Leyendo las filas…").
  - Si el libro tiene varias hojas, pregunta **"El archivo tiene varias hojas: ¿cuál?"**, con el botón **"Leer esa hoja"** y **"Otro archivo"** para empezar de nuevo.
- Ayuda: la primera fila del Excel tiene que tener los nombres de las columnas.
- **Importaciones anteriores**: Fecha, Archivo (y hoja), Qué, Estado, Filas, Importadas, Rechazadas, y el tacho (pregunta "¿Borrar el registro? (lo importado queda)"). Se ordena tocando los títulos y va de a 50.

Estados de una importación: **Para mapear** (azul), **A medias** (amarillo), **Terminada** (verde), **Con rechazos** (rojo).

### Una importación (/importar/N)

El título dice "Importar productos", "Importar clientes y proveedores", etc.; arriba a la derecha, el estado. Debajo, la ayuda del tipo elegido.

**Antes de ejecutar** (pantalla de mapeo):
- **Mapeos guardados** (si hay): un botón **"Cargar "…""** por cada mapeo guardado de ese tipo, con su tacho.
- La tabla de mapeo: **Campo del sistema** (los obligatorios con un asterisco rojo, y su ayuda), **Columna del archivo** (un desplegable con las columnas del archivo, o "— no viene —") y **Ejemplo (primera fila con dato)**.
- Botones: **"Aplicar y previsualizar"**; y, para la próxima vez, el campo **Nombre** con **"Guardar con nombre"**.
- **Vista previa**: las primeras 20 filas con el mapeo aplicado.
- Si falta algún obligatorio: "Para ejecutar falta mapear: …". Si no, el botón **"Ejecutar la importación"** ("Usa el mapeo aplicado (si cambiaste algo arriba, primero "Aplicar")").

**Después de ejecutar** (informe):
- Tres cajas: **Importadas**, **Rechazadas**, **Pendientes**.
- Si quedan pendientes y está andando: "Importando sola en segundo plano. Podés cerrar la pestaña: sigue igual. Esta pantalla se actualiza cada 15 segundos." con el botón **"Pausar"**. Si está pausada: el botón **"Seguir"** ("Está pausada: sigue desde donde quedó, sola, hasta terminar.").
- Si terminó: "Terminó el …".
- **Filas rechazadas**: Fila, Motivo y los valores de las columnas mapeadas, de a 50 por página ("← Anterior" / "Siguiente →").

### Virtual Seller (/importar/virtualseller)

- Tres campos de archivo: **"1. Stock por ubicación (las dos empresas)"**, **"2. Maestro de productos"**, **"3. Lista de precios Lista_000"**, y el botón **"Subir y analizar"**. Mientras trabaja muestra en qué paso va ("Leyendo los archivos y trayendo las publicaciones de Mercado Libre… (puede tardar un minuto)").
- Las reglas resumidas en una lista (ver Criterios).
- **Corridas**: Fecha, Maestro (el nombre del archivo, enlace a la corrida), SKU, Estado. Estados: **Analizando**, **Listo para importar**, **Importando**, **Terminada**, **Con error**.

### Una corrida de Virtual Seller (/importar/virtualseller/N)

- Mientras analiza: "Trayendo las publicaciones de Mercado Libre (N leídas…)… Sigue sola en segundo plano; esta pantalla se actualiza cada 10 segundos."
- Ya analizada: tarjetas con **Con stock (activos)**, **· publicados en ML**, **· sin publicar**, **Sin stock (inactivos)**, **Notebooks sin stock (no entran)**, **Kits (armados con su -U)**, **Publicaciones de la cuenta** y **· sin SKU / sin producto en VS**.
- Avisos amarillos: SKU con stock que no están en el maestro (no se importan); kits que no se pueden armar solos (entran marcados "Kit VS" para armarlos a mano).
- **IVA distinto entre Virtual Seller y Mercado Libre**: tabla SKU, Publicación, IVA VS, IVA ML, Publicaciones (con ✓ las ya corregidas), y el botón **"Corregir el IVA en Mercado Libre"**.
- **SKU distinto en Mercado Libre**: tabla Publicación, SKU en ML, SKU en Laucen, y el botón **"Corregir el SKU en Mercado Libre"**.
- Con estado "Listo para importar": el botón **"Importar"** ("Se puede volver a correr: actualiza lo que ya está y el stock queda igual al del archivo.").
- Importando o terminada: cajas **Importados**, **Con error**, **Pendientes**; terminada, **"Ver los productos"** y, si hubo errores, **"Reintentar los que dieron error"**, con la tabla SKU / Motivo.
- Si hubo un problema general, un cartel rojo con el error y "Se reintenta sola en la próxima vuelta."

## Cómo se hace

### Importar un Excel (cualquier tipo)

1. En [Importar datos](/importar), elegí **Qué es**.
2. Elegí el archivo (.xlsx, el .xls que exporta Virtual Seller, o .csv) y apretá **"Subir y leer"**.
3. Si tiene varias hojas, elegí cuál y apretá **"Leer esa hoja"**.
4. Se abre la pantalla de mapeo con varias columnas ya asignadas solas (las que se reconocen por el nombre). Revisá y completá: para cada **Campo del sistema**, elegí la **Columna del archivo** o "— no viene —".
5. Apretá **"Aplicar y previsualizar"** y mirá la **Vista previa**.
6. Si vas a importar archivos iguales otras veces, escribí un **Nombre** y apretá **"Guardar con nombre"**.
7. Apretá **"Ejecutar la importación"**. Procesa un primer tramo ahí mismo y sigue sola en segundo plano: podés cerrar la pestaña.
8. Al terminar, revisá **Filas rechazadas**: cada una dice su motivo. Corregí esas filas en el Excel y subilo de nuevo (sólo con esas filas, o entero: ver Criterios para saber qué se duplica y qué no).

### Usar un mapeo guardado

En la pantalla de mapeo, apretá **"Cargar "nombre""**. Si alguna columna del mapeo no está en este archivo, avisa cuántas faltan.

### Pausar o seguir una importación

En el informe, **"Pausar"** la frena (lo importado queda). **"Seguir"** la retoma desde donde quedó.

### Importar el catálogo desde Virtual Seller

1. Exportá de Virtual Seller los tres archivos: stock por ubicación (de las dos empresas), maestro de productos y lista de precios Lista_000.
2. En [Virtual Seller](/importar/virtualseller), elegí los tres archivos y apretá **"Subir y analizar"**.
3. El sistema trae las publicaciones activas y pausadas de la cuenta de Mercado Libre y arma el resumen (puede tardar; sigue solo y la pantalla se refresca).
4. Revisá el resumen: cuántos entran activos, inactivos, notebooks descartadas, kits, SKU con stock que no están en el maestro.
5. Revisá **IVA distinto**. Si querés que ML quede con el IVA de Virtual Seller, apretá **"Corregir el IVA en Mercado Libre"** (pregunta cuántas publicaciones cambia). En Laucen queda el de Virtual Seller igual, lo corrijas o no en ML.
6. Apretá **"Importar"** (pregunta cuántos productos). Sigue sola en segundo plano.
7. Al terminar, si hubo errores, corregí la causa y apretá **"Reintentar los que dieron error"**.
8. Después de importar, si hay publicaciones con **SKU distinto en Mercado Libre**, apretá **"Corregir el SKU en Mercado Libre"** (conviene hacerlo después de importar: la importación las vincula igual por el SKU viejo).

## Criterios y reglas

### Lectura del archivo

- Formatos: .xlsx, el .xls que exporta Virtual Seller (que en realidad es una tabla de página web) y .csv. Un .xls viejo de otro programa no se lee: abrilo y guardalo como .xlsx.
- La **primera fila** son los nombres de las columnas. Las filas vacías se saltean.
- El archivo sube directo del navegador al almacenamiento (así se pueden subir archivos grandes) y después el servidor lo lee.
- **Mapeo automático**: al leer, cada campo se asigna solo a la columna cuyo nombre coincide (sin importar acentos ni mayúsculas) con el nombre del campo o con alguno de sus sinónimos (ej. "Código", "Cod" o "Artículo" para SKU; "EAN" para código de barras; "Rubro" o "Categoría" para familia).
- **Una vez que se empezó a ejecutar, el mapeo ya no se puede cambiar**: "Ya se empezó a ejecutar: el mapeo no se puede cambiar. Subí el archivo de nuevo si hace falta."
- **Ejecución**: de a tandas de 200 filas con tope de tiempo; sigue sola en segundo plano con las tareas del servidor (cada 2 minutos), aunque se cierre la pestaña. Dos pestañas no pueden ejecutar la misma importación a la vez ("Esta importación ya se está ejecutando (¿en otra pestaña?). Esperá que termine.").
- Cada fila (o cada venta, que pueden ser varias filas) se importa entera o no se importa: nunca queda a medias.
- **Borrar una importación** de la lista borra sólo el registro: lo que se importó queda.

### Productos

- Obligatorios: **SKU base** y **Título**.
- **No duplica**: busca el producto por su SKU base. Si existe, lo **actualiza**; si no, lo **crea**. El título siempre se reemplaza; los demás datos (marca, descripción, familia, código de barras, peso, medidas) sólo se reemplazan si la celda trae algo: una celda vacía no borra lo que había.
- **Variaciones**: si la fila trae un **SKU de la variación** distinto del SKU base, el producto queda "con variaciones" y se crea o actualiza esa variación. Vacío o igual al SKU base = producto simple. Un kit no puede tener variaciones. Si el SKU de la variación ya es de otro producto, la fila se rechaza.
- **Atributos de la variación** (hasta 3): el nombre del atributo es el **nombre de la columna** (ej. "Color") y el valor, la celda.
- **Familia**: por nombre (sin distinguir mayúsculas); si no existe, se crea.
- **Precio**: va a la **Lista de precios** que diga la fila, por nombre; si no existe, se crea en esa moneda; vacío = la primera lista. La **Moneda** acepta ARS o USD (también $, pesos, US$, dólares); vacía = la de la lista. Para un producto con variaciones, el precio necesita el SKU de la variación.
- Peso, medidas y precio no pueden ser negativos. El peso se redondea a gramos enteros.

### Clientes y proveedores

- Obligatorio: **Nombre (de la cuenta)** (si falta, usa la razón social). "Apellido, Nombre" se separa en apellido y nombre.
- La columna **Tipo**: si dice "Proveedor", la fila va a [Proveedores](/compras/proveedores) (se busca por CUIT y, si no, por nombre exacto; completa sin pisar). Si dice "mayorista", queda como cliente mayorista. El resto, clientes comunes.
- **No duplica**: un cliente se busca, en este orden, por **CUIT**, **DNI**, **apodo de Mercado Libre** o **mail**. Si existe, lo completa; si no, lo crea. **Nunca borra un dato que ya estaba.**
- **CUIT**: con o sin guiones, queda como 20-12345678-9. Si no tiene 11 dígitos, no se carga (y se avisa). Si no hay CUIT pero el documento tiene 11 dígitos, se toma como CUIT.
- **Documento**: los números de relleno (1111111, 0) se ignoran. Si el número vino en la columna "Tipo de documento", se corrige solo. El tipo vacío se deduce del número.
- **Condición IVA**: acepta CF, RI, M (monotributo), E (exento), NR o el texto completo; si no la reconoce, avisa.
- **Direcciones**: la principal (fiscal) y, si es distinta, la de envío como segunda dirección. No repite una que ya tiene (misma calle, número y localidad).
- Toda la fila original queda guardada en la ficha del cliente (datos de Virtual Seller), aunque una columna no tenga campo propio.

### Ventas históricas

- Obligatorios: **Nº de venta**, **Fecha**, **SKU**, **Cantidad**, **Precio unitario**.
- Cada Nº de venta es **un pedido**; varias filas con el mismo número son varias líneas de ese pedido.
- Entran en el canal **"Histórico Virtual Seller"** (se crea solo, tipo Histórico), como **entregadas** y **pagadas**, **sin tocar el stock**, con la nota "Venta histórica importada".
- Se convierten a la otra moneda con el **tipo de cambio de la fecha de cada venta** (por eso conviene cargar la historia en [Tipo de cambio](/config/tipo-cambio)). Moneda vacía = pesos. Una venta no puede mezclar filas en pesos y en dólares.
- Si la fecha no trae hora, se toma el mediodía argentino (para que no caiga el día anterior).
- Si **una fila** de la venta tiene error (SKU que no existe, cantidad no entera, fecha que no se entiende), **la venta entera** se rechaza: las demás filas dicen "La venta N no se importó: la fila M de la misma venta tiene un error."
- **No duplica**: si esa venta ya se había importado, la fila queda "Ya estaba importada (pedido N)".
- La cantidad tiene que ser un entero mayor que cero.

### Stock inicial

- Obligatorio: **Cantidad**, y además **SKU o código de barras** (con uno alcanza). Si el código de barras lo tienen varias variaciones, hay que usar el SKU.
- Cada fila es un **ingreso** de stock que **se suma** a lo que haya (no reemplaza). Si subís el mismo archivo dos veces, el stock se suma dos veces.
- Va a la **ubicación general del primer depósito propio**, salvo que la fila diga otro **Depósito** (por nombre) o **Ubicación** (por código en ese depósito).
- La cantidad tiene que ser un entero no negativo; una fila con cantidad 0 no mueve nada.

### Virtual Seller + Mercado Libre

- **Cuenta base de ML**: la primera cuenta de ML conectada y asociada a un canal. Sin ninguna: "No hay una cuenta de Mercado Libre conectada y asociada a un canal." Se leen sus publicaciones **activas y pausadas** (las cerradas no).
- **Stock**: los SKU de la empresa DE (que vienen con "DE-" adelante) se suman a los de TV. Va al depósito **CORDOBA CENTRAL**, cada uno en su ubicación (las ubicaciones que no existen se crean). Tiene que existir ese depósito y la lista de precios **"Clásicas"**; si no, la importación da error.
- **Activo o inactivo**: con stock → activo. Sin stock → inactivo, salvo las **notebooks** (familia que empieza con NOTEBOOK), que no entran. Un componente de un kit entra aunque sea notebook sin stock.
- **SKU con stock que no está en el maestro**: no se importa (se lista en el aviso).
- **Datos del producto**: si está publicado en ML, título, fotos, categoría (como familia), atributos, código de barras, medidas y garantía salen de ML; el **IVA, de Virtual Seller**; la descripción, de ML (o de VS si ML no tiene). Sin publicación, todo de Virtual Seller. La publicación principal es la Clásica activa más barata; si no hay, la primera activa.
- **Precio de la lista "Clásicas"**: el de la publicación Clásica (con su precio tachado si está en campaña); si no hay Clásica, el de Lista_000.
- **Costo**: el costo del maestro se toma como **costo FOB en dólares**.
- **Kits** (tipo o subtipo "Kit" en VS): entran siempre y se arman como kit del sistema con su componente "-U": la cantidad sale del título ("Pack X5" = 5 × SKU-U) o, si no lo dice, del número del SKU (SKU-X5, SKU-30). Su costo FOB = costo del componente × cantidad. Un kit está activo si su componente tiene stock. Si no se puede armar (no está el -U o no se sabe cuántas unidades), entra inactivo y marcado "Kit VS" para armarlo a mano.
- **Packs renombrados**: un kit armado se renombra a la convención **BASE-Xn** (la unidad sigue siendo BASE-U). Las equivalencias (SKU viejo → nuevo, y las cargadas a mano) quedan guardadas para reconocer también las cuentas de ML que se conecten después.
- **Se puede correr más de una vez**: actualiza lo que ya está y el stock de cada ubicación se **lleva al valor del archivo** (no se suma dos veces).
- **Corregir el IVA / el SKU en Mercado Libre**: cambian esos datos en las publicaciones de la cuenta base. El IVA corre de a tandas y sigue solo en segundo plano; las ya corregidas se saltean.

## Preguntas frecuentes

**¿Si importo dos veces el mismo Excel de productos, se duplican?**
No: se buscan por SKU base y se actualizan.

**¿Y el stock inicial?**
Sí se suma dos veces: cada fila es un ingreso. Para el stock de Virtual Seller, en cambio, se lleva al valor del archivo.

**Una venta histórica no entró y dice que otra fila tiene error. ¿Por qué?**
Porque una venta entra completa o no entra: si una de sus líneas falla, se rechaza toda.

**¿Puedo cerrar la pestaña mientras importa?**
Sí, sigue sola en segundo plano.

**Me equivoqué en el mapeo y ya ejecuté. ¿Lo cambio?**
No se puede: subí el archivo de nuevo y mapealo bien.

**Borré una importación de la lista. ¿Se borró lo importado?**
No, sólo el registro.

**¿Qué formato tiene que tener el archivo?**
Excel .xlsx, el .xls de Virtual Seller o .csv, con los nombres de las columnas en la primera fila.

**¿Por qué no entraron las notebooks sin stock?**
Es una regla de la importación de Virtual Seller: las notebooks sin stock se descartan.

**¿Con qué dólar se convierten las ventas históricas?**
Con el oficial venta de la fecha de cada venta.

## Relacionado

- [Productos](/catalogo/productos)
- [Clientes](/ventas/clientes)
- [Proveedores](/compras/proveedores)
- [Pedidos](/ventas/pedidos)
- [Consulta de stock](/stock/consulta)
- [Depósitos y ubicaciones](/stock/depositos)
- [Listas de precios](/catalogo/precios)
- [Tipo de cambio](/config/tipo-cambio)
- [Canales](/config/canales)
