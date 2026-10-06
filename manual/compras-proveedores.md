---
titulo: Proveedores
menu: Compras › Proveedores
ruta: /compras/proveedores
rutas: /compras/proveedores
permiso: proveedores_ver
resumen: La lista de a quién le comprás: alta, edición en la fila, archivar, borrar, buscar y bajar a Excel.
---

## Para qué sirve

Es el maestro de proveedores: las empresas o personas a las que les comprás (mercadería, servicios, el proveedor del exterior, el despachante, Mercado Libre por sus cargos, etc.). Cada factura de compra y cada despacho de importación se cuelga de un proveedor.

Los proveedores son una lista aparte de los clientes: si alguien es cliente y proveedor a la vez, está dos veces, una en cada lista.

Se cargan de tres maneras:
- a mano, en esta pantalla;
- desde el archivo "Clientes y proveedores" de Virtual Seller, en [Importar datos](/importar) (las filas cuyo Tipo dice "Proveedor" vienen acá);
- solos, al importar las facturas de ARCA en [Facturas de compra](/compras/facturas): si llega una factura de un CUIT que no está, el proveedor se crea al importar.

## Cómo se llega

- Menú: **Compras › Proveedores**.
- Desde otras pantallas, el nombre del proveedor es un enlace que trae esta misma lista filtrada a ese único proveedor: desde [Facturas de compra](/compras/facturas), desde el detalle de una factura, desde [Despachos de importación](/compras/despachos) y desde la vista previa de la importación de ARCA.
- Si no hay proveedores, la pantalla "Nueva factura de compra" muestra el aviso "Todavía no hay proveedores. Cargá uno" con el enlace acá.

## Qué hay en la pantalla

Arriba a la derecha:
- **Descargar Excel** (con su desplegable de configuraciones y "Configurar…"): baja la lista con la búsqueda y el orden que tenés en pantalla, pero todas las filas (no sólo la página). Además de las columnas de pantalla, el Excel puede traer razón social, país, dirección, localidad, provincia, condiciones de pago, **Total facturado $** (suma de las facturas registradas, las notas de crédito restan), **Última factura** (fecha) y notas.
- **Nuevo proveedor**: abre el formulario de alta debajo del título.

Debajo:
- Un buscador ("Buscar en todos los datos del proveedor": N.º, nombre, razón social, CUIT, país, mail, teléfonos y sus internos / aclaraciones, contacto, dirección, localidad, provincia, código postal, condiciones de pago y notas) que busca mientras escribís, desde la segunda letra, con la caja **Comienza por** (tildada: el texto tiene que estar al principio; destildada: en cualquier parte). El CUIT y los teléfonos se encuentran escritos con o sin guiones o espacios. La X adentro del cuadro borra lo escrito.
- Si estás viendo un solo proveedor (llegaste por un enlace), aparece **Ver todos los proveedores** para volver a la lista completa.

La tabla, de a 50 filas con paginador abajo ("1–50 de …", Anterior / Siguiente). Se ordena tocando el título de cada columna:
- **N.º**: el número interno del proveedor. Tocarlo muestra sólo ese proveedor.
- **Proveedor**: el nombre (y abajo, en gris, la razón social si es distinta). También es enlace al proveedor solo.
- **CUIT**: si el país no es Argentina, se agrega el código de país (ej. "· CN").
- **IVA**: condición frente al IVA.
- **Contacto**: contacto, teléfono y celular (con su interno / aclaración) y mail (el mail se puede tocar para escribirle).
- **Moneda**: Pesos o Dólares (la moneda habitual).
- **Facturas**: cuántas facturas de compra tiene (de cualquier estado). El número lleva a [Facturas de compra](/compras/facturas) filtrada por ese proveedor.
- **Estado**: Activo o Archivado.
- Al final de cada fila, el **lápiz** (editar) y el **tacho** (borrar).

Sin orden elegido, la lista sale primero los activos y después los archivados, cada grupo por nombre.

## Cómo se hace

### Dar de alta un proveedor
1. Apretá **Nuevo proveedor** (arriba a la derecha).
2. Completá los campos: **Nombre**, **Razón social**, **CUIT**, **Condición IVA** (Sin cargar, Consumidor final, Responsable inscripto, Monotributo, Exento, No responsable), **Contacto**, **Mail**, **Teléfono** y **Celular** (cada uno con su **Interno / aclaración**; se escriben como quieras, se guardan sólo con números y se muestran ordenados con el interno entre paréntesis), **País (AR, CN…)**, **Dirección**, **Localidad**, **Provincia**, **Moneda habitual** (Pesos / Dólares), **Condiciones de pago** (texto libre, ej. "30 % anticipo, saldo contra embarque") y **Notas**.
3. Apretá **Crear**. Aparece "Proveedor creado.".

Errores típicos:
- "El proveedor necesita un nombre.": falta el nombre (si dejás el nombre vacío pero ponés razón social, se usa la razón social como nombre).
- "El CUIT tiene que tener 11 dígitos.": para proveedores de Argentina (país AR o vacío) el CUIT, si se carga, tiene que tener 11 números. Para un proveedor del exterior se acepta cualquier identificación.

### Modificar un proveedor
1. Tocá el **lápiz** de la fila. La fila se convierte en sus campos editables ahí mismo.
2. Cambiá lo que haga falta. Ahí también está el **Estado** (Activo / Archivado).
3. Apretá **Guardar** (o **Cancelar** para dejarlo como estaba).

### Archivar un proveedor
Editalo con el lápiz, poné el estado en **Archivado** y **Guardar**. Un proveedor archivado:
- sigue en la lista (al final, con la etiqueta gris "Archivado") y sus facturas no se tocan;
- ya no aparece para elegir en una factura nueva ni en un despacho nuevo; si una factura en borrador ya lo tenía elegido, aparece como "(proveedor archivado)".

### Borrar un proveedor
1. Tocá el **tacho** de la fila. En el mismo lugar pregunta "¿Borrar?" con **Sí** / **No**.
2. Apretá **Sí**.

Si el proveedor tiene facturas de compra o despachos, no se puede borrar: sale "Está en uso en otro lado (pedidos, stock o precios): no se puede borrar. Archivalo.". En ese caso archivalo. (Si sólo tenía recepciones de depósito, se borra y esas recepciones quedan sin proveedor.)

### Ver las facturas de un proveedor
Tocá el número de la columna **Facturas**: abre [Facturas de compra](/compras/facturas) filtrada por ese proveedor. Para ver lo que se le debe, abrí una factura registrada suya y tocá **Estado de cuenta del proveedor**, o andá a [Cuentas corrientes](/administracion/cuentas-corrientes).

## Criterios y reglas

- **CUIT**: se guarda normalizado (sólo los 11 números) si es válido. En Argentina es obligatorio que tenga 11 dígitos si se carga; vacío está permitido.
- **País**: se guarda con dos letras en mayúscula (lo que escribas se recorta a dos letras). Vacío = AR.
- **Moneda habitual**: es informativa (se muestra en la lista); cada factura elige su propia moneda.
- **Cuenta de gasto recordada**: cuando importás facturas de ARCA y elegís la cuenta de gasto de un proveedor, esa cuenta queda guardada en el proveedor y se propone la próxima vez. No se edita desde esta pantalla: se cambia en la vista previa de la próxima importación.
- **Proveedores creados por la importación de ARCA**: se crean con el nombre que trae ARCA (como nombre y razón social), el CUIT, la nota "Creado al importar Mis Comprobantes de ARCA" y una condición de IVA deducida por la letra: si factura A o M, Responsable inscripto; si factura C, Monotributo; si factura B, queda sin cargar.
- **Búsqueda del proveedor por CUIT** (en la importación de ARCA y en la facturación de Mercado Libre): se comparan sólo los dígitos del CUIT. Si hay dos proveedores con el mismo CUIT, se usa el activo (y entre ellos, el más viejo). Por eso conviene que cada proveedor argentino tenga bien cargado su CUIT.
- **Libro de IVA**: en el Libro IVA Compras sale la razón social del proveedor (si está vacía, el nombre) y su CUIT; si el CUIT no tiene 11 dígitos, el comprobante sale "sin identificar" y aparece un aviso.
- **Borrar** sólo funciona si no tiene facturas ni despachos. Lo normal es archivar.
- El "Total facturado $" del Excel suma sólo facturas **registradas**, en pesos, con las notas de crédito restando.

## Preguntas frecuentes

**¿Por qué no puedo borrar un proveedor?**
Porque tiene facturas de compra o despachos cargados. Archivalo: deja de aparecer para elegir, pero su historia queda.

**Importé facturas de ARCA y me aparecieron proveedores nuevos, ¿está bien?**
Sí. Si llega una factura de un CUIT que no está cargado, el proveedor se crea solo al importar. Después podés completarle el nombre comercial, contacto, etc. con el lápiz.

**Tengo un proveedor cargado dos veces, ¿qué hago?**
Archivá el que sobra (o borralo si no tiene facturas). Para que la importación de ARCA lo reconozca, el que queda activo tiene que tener el CUIT bien cargado.

**¿Dónde veo cuánto le debo a un proveedor?**
En [Cuentas corrientes](/administracion/cuentas-corrientes), pestaña de proveedores. Desde una factura registrada, el botón **Estado de cuenta del proveedor** lleva directo.

**¿Cómo cargo un proveedor de China sin CUIT?**
Poné el país (ej. "CN") y dejá el CUIT vacío o con su identificación local: para países distintos de AR no se exige el formato de 11 dígitos.

**¿Cómo cambio la cuenta contable a la que van las facturas de un proveedor?**
En la vista previa de la próxima importación de ARCA, en "Cuenta de gasto de cada proveedor". Para una factura cargada a mano, se elige en su campo "Cuenta de gasto (si no es mercadería)".

**¿Puedo traer los proveedores de Virtual Seller?**
Sí, desde [Importar datos](/importar), con el archivo "Clientes y proveedores": las filas de tipo "Proveedor" vienen acá.

## Relacionado

- [Facturas de compra](/compras/facturas)
- [Despachos de importación](/compras/despachos)
- [Cuentas corrientes](/administracion/cuentas-corrientes)
- [Importar datos](/importar)
- [Libros de IVA](/administracion/libros-iva)
