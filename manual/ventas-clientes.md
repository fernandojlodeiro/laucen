---
titulo: Clientes
menu: Ventas › Clientes
ruta: /ventas/clientes
rutas: /ventas/clientes, /ventas/clientes/[id]
permiso: clientes_ver
resumen: Los clientes de todos los canales (los crean los pedidos): lista con buscador, ficha con datos fiscales, lista de precios propia, cuenta corriente, direcciones, identidades por canal y sus pedidos.
---

## Para qué sirve

Es el registro de **clientes** de todos los canales. En la operación normal **los clientes los crean los pedidos**: cuando entra una venta de Mercado Libre, de la tienda web o un pedido cargado a mano, Laucen encuentra al cliente o lo crea solo. Esta pantalla sirve sobre todo para **mirar y corregir** sus datos —en especial los fiscales, que son los que usa la factura— y para darle a un cliente una **lista de precios propia** (mayoristas) o habilitarle la **cuenta corriente**.

## Cómo se llega

- Menú **Ventas › Clientes**.
- Desde la ficha de un pedido, tocando el nombre del cliente (y, si una factura falla por un dato del cliente, con el enlace **"Corregir en la ficha del cliente"**).
- Desde las listas de [Pedidos](/ventas/pedidos), [Envíos](/ventas/envios) y [Reclamos](/ventas/reclamos): el nombre del cliente es un enlace a su ficha.
- El [buscador global](/buscar): por nombre, mail, documento o N.º de cliente.

## Qué hay en la pantalla

### La lista ([Clientes](/ventas/clientes))

Subtítulo: "Los crean los pedidos; acá se miran y se corrigen sus datos".

**Arriba a la derecha**: el desplegable de columnas del Excel, **"⬇ Descargar Excel"**, **"⚙ Configurar…"** y **"+ Nuevo cliente"**.

**Filtros**:
- Buscador **"Buscar por nombre, mail, documento o teléfono"**, con la caja **"Comienza por"** (tildada de entrada). Busca también en razón social, CUIT, celular y apodo de Mercado Libre; si escribís sólo números (4 o más, sin letras), también compara el CUIT, el documento y los teléfonos sin puntos, guiones ni espacios, y un número solo busca además el N.º de cliente.
- Desplegable **"Todos los tipos"** / **"Consumidor final"** / **"Mayorista"**.

**"Vista"** (arriba de la tabla): elegí qué columnas ver o armá otras con **"⚙ Configurar vistas…"**.

**Columnas de la vista "Estándar"**: **N.º** (el número interno del cliente), **Nombre** (enlace a la ficha), **Tipo** (tocándolo filtra por ese tipo), **Documento**, **Condición IVA**, **Mail** (abre el correo), **Teléfono**, **Pedidos** (cantidad; tocándolo abre [Pedidos](/ventas/pedidos) filtrado por ese cliente) y **Último pedido**.

**Otras columnas** disponibles para vistas y Excel: Razón social, Nombre de pila, Apellido, Número de documento, CUIT, Celular, Apodo en Mercado Libre, Lista de precios, Cuenta corriente (Sí/No), Dirección, Localidad, Provincia, Código postal, **Total comprado**, Alta y Notas.

**Orden** de entrada: por nombre. Se ordena tocando el título de la columna.

### El alta "Nuevo cliente"

Se abre con **"+ Nuevo cliente"**: un renglón con **"Nombre o razón social"**, el tipo (Consumidor final / Mayorista), el tipo de documento (DNI, CUIT, CUIL, PASAPORTE, OTRO), **"Número"**, **"Mail"**, **"Teléfono"** y el botón **"Crear"**. Al crear, vas directo a la ficha del cliente nuevo para completar el resto.

### La ficha del cliente

Título: el nombre del cliente; debajo "Cliente N.º … · cliente desde el …". En el camino: "Ventas › Clientes › N.º …".

**Arriba a la derecha**: el **lápiz** (editar) y el **tacho** (borrar, con "¿Borrar el cliente?" **"Sí"** / **"No"**). Si el cliente tiene pedidos, en lugar del tacho dice "No se puede borrar: tiene N pedidos."

**Datos** (en modo vista; con el lápiz pasan a editables):
- **"Nombre (como se lo conoce)"** y **"Tipo"** (Consumidor final / Mayorista).
- **"Razón social (para facturar)"** y **"CUIT"**. Debajo del CUIT, si se puede consultar ARCA, el botón **"Validar en el padrón de ARCA"**.
- **"Apellido"**, **"Nombre de pila"**, **"Apodo en Mercado Libre"**.
- **"Mail"**, **"Teléfono"**, **"Celular"**.
- **"Documento"** (tipo y número) y **"Condición IVA"** (Consumidor final, Responsable inscripto, Monotributo, Exento, No responsable, o "Sin cargar").
- **"Lista de precios propia"** ("Para mayoristas. Vacío = la del canal.").
- **"Notas"**.
- **"Cuenta corriente"**: en edición, la caja **"Puede comprar en cuenta corriente / a convenir"**.

**"Datos originales (tal como llegaron)"**: un desplegable con lo que mandó cada origen (por ejemplo, Mercado Libre o Virtual Seller), tal cual vino. Sólo para consulta.

**"Direcciones"**: tabla con Etiqueta, Dirección (con "Recibe: …" y "Referencia: …" si las tiene), la marca **"Principal"** o el botón **"Hacer principal"**, y el lápiz y el tacho de cada fila. Al lado del título, **"+ Nueva dirección"** (Etiqueta, Calle, Nº, Piso/depto, Localidad, Provincia, CP, País → **"Crear"**).

**"Identidades por canal"**: el id del cliente en cada canal (por ejemplo, su usuario de Mercado Libre), con un tacho para quitarla ("¿Quitar?"). "Las crean los pedidos."

**"Pedidos"**: todos sus pedidos, del más nuevo al más viejo: Nº, Fecha, Canal, Id externo, Estado y Total (cada número lleva a la ficha del pedido).

## Cómo se hace

### Buscar un cliente

1. Escribí en el buscador parte del nombre, el mail, el documento o el teléfono (desde la segunda letra busca solo).
2. Si no aparece, destildá **"Comienza por"** para buscar en cualquier parte del texto.

### Corregir los datos fiscales de un cliente

1. Abrí la ficha del cliente.
2. Tocá el **lápiz** arriba a la derecha.
3. Corregí **"Razón social (para facturar)"**, **"CUIT"**, **"Condición IVA"** y lo que haga falta.
4. Apretá **"Grabar"**. Vuelve a la vista con el aviso "Guardado.". Con **"Cancelar"** volvés sin guardar.

Errores típicos: "El cliente necesita un nombre." y "El CUIT tiene que tener 11 dígitos." (el CUIT se guarda con guiones, 20-12345678-9, se escriba como se escriba).

### Traer los datos del padrón de ARCA

1. Con el CUIT ya guardado, en la ficha (modo vista) apretá **"Validar en el padrón de ARCA"**.
2. Laucen consulta ARCA y **pisa** en el cliente la razón social, la condición de IVA y el CUIT, y deja el domicilio fiscal en una dirección con etiqueta **"Fiscal"** (la actualiza si ya había una, o la agrega).
3. El aviso dice qué cambió ("Validado en ARCA. Cambió: …") o "Validado en ARCA: los datos ya coincidían.". Si en ARCA el CUIT no está activo, lo avisa ("Ojo: en ARCA figura …").

El botón sólo aparece si el cliente tiene CUIT y la empresa ya tiene cargados sus datos de facturación y el certificado de ARCA.

### Darle una lista de precios propia (mayorista)

1. Lápiz → **"Lista de precios propia"** → elegí la lista → **"Grabar"**.
2. Desde ahí, los pedidos de ese cliente usan esa lista en vez de la del canal (también en "Nuevo pedido" al elegirlo).

### Habilitar la cuenta corriente

1. Lápiz → tildá **"Puede comprar en cuenta corriente / a convenir"** → **"Grabar"**.
2. En la tienda web le aparece el medio "Cuenta corriente" (si ese medio está prendido en [Medios de pago](/config/medios-pago)). En "Nuevo pedido", al elegirlo se ve "con cuenta corriente".

### Agregar, corregir o borrar una dirección

1. **Agregar**: **"+ Nueva dirección"**, completá (al menos calle o localidad) y **"Crear"**. La primera dirección del cliente queda como principal.
2. **Corregir**: el lápiz de la fila convierte esa fila en sus campos; **"Guardar"** o **"Cancelar"**.
3. **Principal**: **"Hacer principal"** en la fila que quieras (la otra deja de serlo).
4. **Borrar**: el tacho de la fila, **"Sí"**.

### Dar de alta un cliente a mano

1. **"+ Nuevo cliente"**.
2. Completá al menos el **"Nombre o razón social"** (lo demás es opcional) y apretá **"Crear"**.
3. Vas a la ficha nueva para completar el resto con el lápiz.

Normalmente no hace falta: los pedidos crean los clientes solos.

### Borrar un cliente

Sólo se puede si **no tiene ningún pedido**. Tacho arriba a la derecha → **"Sí"**. Vuelve a la lista con "Cliente borrado.".

## Criterios y reglas

- **Quién crea los clientes**: los pedidos. Al entrar un pedido, Laucen busca al cliente en este orden: el id del comprador en ese canal (identidad) → el CUIT → el número de documento → el apodo de Mercado Libre → el mail. Si lo encuentra, **completa sólo los datos que le faltan** (nunca pisa uno que ya estaba cargado) y suma los datos originales. Si no, lo crea. Si vino el id del canal, deja la identidad guardada para encontrarlo la próxima vez.
- **Nombre** de un cliente que llega de Mercado Libre: la razón social si es empresa; si no, "Apellido, Nombre"; si no, quien recibe el envío o el apodo.
- **Documentos de relleno** (1111111, 00000000, menos de 6 dígitos) no se toman como documento.
- **Direcciones** que llegan con los pedidos: se suman sin repetir (no se agrega una con la misma calle, número y localidad, o el mismo id del canal). La primera queda principal.
- **Condición de IVA**: decide el tipo de factura. Si la empresa es Responsable Inscripta: cliente Responsable Inscripto o Monotributo → factura **A** (y necesita **CUIT**); el resto → factura **B**. Sin condición cargada se toma como consumidor final. Para la factura, el documento es el CUIT (11 dígitos) o, si no, el DNI.
- **Lista de precios propia**: si tiene, manda sobre la del canal en todos sus pedidos.
- **Cuenta corriente**: habilita el medio "Cuenta corriente / a convenir" en la tienda y la opción "Cuenta corriente" al cargar un pedido a mano (que exige un cliente).
- **Padrón de ARCA**: pisa razón social, condición de IVA y CUIT con lo que dice ARCA; el domicilio fiscal de ARCA viene en un solo texto (calle y número juntos).
- **Borrar**: no se puede borrar un cliente con pedidos. Quitar una identidad sólo hace que el próximo pedido de ese comprador no lo encuentre por ese camino.
- **"Total comprado"**: suma de los totales en pesos de sus pedidos, sin los cancelados ni los devueltos.
- **"Pedidos"**: cuenta todos sus pedidos, de cualquier estado.

## Preguntas frecuentes

**¿Tengo que dar de alta a los clientes de Mercado Libre?**
No: se crean solos con cada venta.

**La factura salió con error "Para una factura A el cliente necesita CUIT".**
Abrí la ficha del cliente, cargá el CUIT (lápiz → "CUIT" → "Grabar") y volvé a facturar.

**¿Cómo hago que un mayorista pague sus precios?**
En su ficha, "Lista de precios propia" → la lista mayorista.

**No puedo borrar un cliente.**
Tiene pedidos. Un cliente con pedidos no se borra.

**Aparecen dos clientes que son la misma persona.**
Pasa si entraron con datos distintos (sin documento ni mail en común). Hoy no hay un botón para unirlos; se puede corregir uno de los dos.

**¿Qué hace "Validar en el padrón de ARCA"?**
Trae de ARCA la razón social, la condición de IVA y el domicilio fiscal del CUIT y los pisa en el cliente.

**¿Para qué sirven las "Identidades por canal"?**
Son el usuario del cliente en cada canal (por ejemplo, su id de comprador de Mercado Libre): así su próxima compra se asigna a este mismo cliente.

## Relacionado

- [Pedidos](/ventas/pedidos)
- [Cuentas corrientes](/administracion/cuentas-corrientes)
- [Listas de precios](/catalogo/precios)
- [Medios de pago](/config/medios-pago)
- [Facturación](/administracion/facturacion)
- [Facturación (ARCA)](/config/arca)
