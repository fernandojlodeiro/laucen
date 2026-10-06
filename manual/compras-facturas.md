---
titulo: Facturas de compra
menu: Compras › Facturas de compra
ruta: /compras/facturas
rutas: /compras/facturas, /compras/facturas/[id], /compras/facturas/nueva, /compras/facturas/arca/[id]
permiso: compras_ver
resumen: Cargar, importar de ARCA y registrar las facturas de los proveedores (ingresan stock y costo).
---

## Para qué sirve

Acá van todos los comprobantes que te emiten los proveedores: facturas de mercadería, de servicios y gastos, la del proveedor del exterior, las del despachante, las de Mercado Libre y Mercado Pago, y sus notas de crédito y de débito.

Cada comprobante se arma en **borrador** y después se **registra**. Registrar es lo que tiene efecto:
- si tiene líneas con producto, **entra el stock** al depósito (salvo que ya haya entrado por una recepción) y **se actualiza el costo** de cada producto;
- deja la **deuda en la cuenta corriente** del proveedor;
- queda para el **asiento contable** y para el **Libro IVA Compras**.

Hay dos maneras de cargarlas: **a mano** (con "+ Nueva factura") o **importando el archivo "Mis Comprobantes – Recibidos" de ARCA** (con "Importar de ARCA (Mis Comprobantes)"), que crea y registra todas las del mes de una vez.

## Cómo se llega

- Menú: **Compras › Facturas de compra**.
- Desde [Proveedores](/compras/proveedores): el número de la columna "Facturas" abre esta lista filtrada por ese proveedor.
- Desde [Cuentas corrientes](/administracion/cuentas-corrientes): cada movimiento de una factura de compra lleva a su detalle.
- Desde [Libros de IVA](/administracion/libros-iva) (pestaña IVA Compras y Avisos) y desde [Facturación de Mercado Libre](/administracion/facturacion-ml) (pestaña Control con ARCA): cada comprobante es un enlace a su detalle.
- Desde el detalle de un despacho: el texto del pie lleva acá para cargar la factura del exterior y las del despachante.

## Qué hay en la pantalla

### La lista (Facturas de compra)

Arriba a la derecha:
- **Descargar Excel** (con desplegable de configuraciones y "Configurar…"): baja la lista con los filtros y la vista de la pantalla, todas las filas.
- **Importar de ARCA (Mis Comprobantes)**: abre, debajo del título, el formulario para subir el archivo de ARCA.
- **+ Nueva factura**: lleva a la pantalla de alta a mano.

Filtros: **Proveedor** (Todos o uno), **Estado** (Todos, Borrador, Registrada, Anulada), botón **Filtrar** y, si hay filtro, **Limpiar**.

Encima de la tabla, a la derecha, el selector **Vista** (qué columnas se ven y en qué orden; "Estándar" es la de siempre y la última elegida queda recordada).

Columnas de la vista Estándar: **Fecha**, **Proveedor**, **Comprobante** (ej. "A 00003-00001234"; "NC A …" si es nota de crédito, "ND A …" si es nota de débito, "s/n" si no tiene número), **Líneas**, **Total** (en su moneda) y **Estado**. Se pueden sumar en una vista: CUIT del proveedor, Letra, Nota de crédito, Nota de débito, **Origen** ("ARCA (Mis Comprobantes)" o "A mano"), CAE, Punto de venta, Número, Vencimiento, Moneda, Cotización, Neto, IVA, Percepción IVA, Percepción IIBB, Otros impuestos, No gravado, Total $, Total US$, Depósito y Notas. Los importes de las notas de crédito se muestran en negativo.

La fecha, el comprobante y la cantidad de líneas llevan al detalle; el proveedor lleva a su fila en Proveedores. Lista de a 50 filas, con paginador; se ordena tocando el título de la columna. Sin orden elegido: de la más nueva a la más vieja.

### Nueva factura de compra (/compras/facturas/nueva)

Sólo la cabecera (ver los campos más abajo) y el botón **Crear y cargar las líneas**. La factura queda en borrador y te lleva a su detalle.

### El detalle de una factura (/compras/facturas/[id])

Título: "Factura de compra", "Nota de crédito de compra" o "Nota de débito de compra" con su número. Debajo, el proveedor (enlace) y la fecha.

**En borrador:**
- Arriba a la derecha: **Registrar** (verde) y el **tacho** para borrar el borrador.
- Caja **Cabecera** con su estado y el botón **Grabar cabecera**. Campos: **Proveedor**, **Letra** (A, B, C, M, E (exterior), X (otro, sin IVA)), **Es nota de crédito** (caja para tildar), **Punto de venta**, **Número**, **Fecha**, **Vencimiento**, **Moneda** (Pesos / Dólares), **Cotización (si es en dólares)** (de entrada, la cotización del día), **Depósito donde entra**, **O la recepción por la que ya entró** (las últimas 100 recepciones de compra), **Cuenta de gasto (si no es mercadería)** ("— Es mercadería —" o una cuenta del plan), **Percepción IVA**, **Percepción IIBB**, **Otros impuestos**, **No gravado** y **Notas**.
- **Líneas**: Descripción, Cantidad, Costo unit. (neto), IVA, Neto, IVA $. Las líneas sin producto dicen "(sin producto)". Cada una tiene lápiz (se edita en la fila: descripción, cantidad, costo unitario, IVA, con **Guardar** / **Cancelar**) y tacho.
- Caja **Agregar línea**: un buscador "Buscar producto por SKU, código o título" (busca en todos los datos de la variación y de su producto) con **Mostrar inactivos** y **Buscar**; después el desplegable **Producto** ("— Línea libre (sin producto: no mueve stock) —" o los productos encontrados, hasta 30), **Descripción (si es libre)**, **Cantidad** (de entrada 1), **Costo unit. neto ($ o US$)**, **IVA** y **Agregar**.
- **IVA por alícuota** (neto gravado e IVA de cada alícuota) y la caja de totales: Neto, IVA, percepciones, otros impuestos, no gravado (si tienen importe), **Total** y, si es en dólares, **En pesos**.

**Registrada (o anulada):** todo en sólo lectura: Estado (con fecha y hora de registro), Proveedor (enlace a su cuenta corriente), Fecha y vencimiento, Moneda y cotización, Depósito (o "Recepción #N" con enlace), Cuenta de gasto ("Mercadería" si no tiene), Notas, las líneas y los totales. Arriba a la derecha, **Estado de cuenta del proveedor**.

Si la factura está vinculada a una recepción y lo recibido no dio igual a lo facturado, aparece además la tabla **Diferencia con la recepción (N)** (N = productos con diferencia): **Producto** (SKU con enlace a su ficha, su foto si tiene, y el título), **Facturado**, **Recibido**, **Diferencia** ("faltan 2" o "sobran 2"), **Costo unit. ($)** e **Importe ($)**, y al pie **Egreso por diferencias** (o **Recupero por diferencias** si sobró más de lo que faltó) con el total.

### Vista previa de la importación de ARCA (/compras/facturas/arca/[id])

Título "Importar de ARCA (Mis Comprobantes)". Debajo, el nombre del archivo, cuántos comprobantes tiene y qué versión de columnas trae ("con IVA por alícuota" o "con el IVA en un solo número (se deduce la alícuota)").

- Arriba a la derecha, si hay algo nuevo: **Importar N comprobantes nuevos**.
- Si el archivo ya se importó: "Última importación de este archivo: X cargadas · Y ya estaban · …" y la lista de errores, si hubo.
- Si hubo renglones que no se pudieron leer: "Renglones que no se pudieron leer (N):" con el motivo de cada uno (muestra hasta 30).
- Si no hay nada nuevo: "No hay nada nuevo para importar: todo lo del archivo ya está cargado."
- **Cuenta de gasto de cada proveedor**: una fila por proveedor del archivo con Proveedor (los que no existen dicen "Nuevo: se crea al importar"; los de Mercado Libre llevan la etiqueta "Mercado Libre"), CUIT, cuántas **Nuevas** tiene y el desplegable **Cuenta de gasto** (primero las cuentas de egreso, después el resto).
- A la derecha del título "Cuenta de gasto de cada proveedor", si tenés también el permiso de **Contabilidad**: **+ Nueva cuenta**. Abre debajo un formulario chico con **Código** (ya sugerido), **Nombre**, **Queda elegida para** ("— Ningún proveedor —" o uno de los proveedores del archivo), el botón **Crear** y la aclaración "Se crea como cuenta de egreso imputable, bajo … (la cuenta madre sale del código)"; **Cancelar** lo cierra.
- Pestañas para filtrar los comprobantes por estado, cada una con su cantidad: **Todos**, **Nuevas**, **Ya cargadas**, **Cargadas a mano distintas**, **Con error**, **Repetidas** (las que tienen cero no se muestran, salvo Todos y Nuevas).
- La tabla: Fecha, Proveedor (con CUIT; "(nuevo)" si se va a crear), Comprobante (tipo y número; si ya está cargado, enlace a la factura), Neto gravado (y el desglose si tiene varias alícuotas), IVA (y la alícuota), No gravado / exento, Percepciones / otros, Total (y "TC" si es en dólares) y Estado (con el motivo o el aviso). En las facturas B y C, neto, IVA y percepciones se muestran "—": el total entero es gasto.

## Cómo se hace

### Importar las facturas de ARCA (Mis Comprobantes – Recibidos)

Es la forma recomendada para cargar todo lo del mes (incluye las facturas de Mercado Libre y Mercado Pago).

1. En ARCA, entrá a **Mis Comprobantes → Recibidos**, elegí el período (un mes por vez) y bajá el archivo en **.csv** o en **Excel (.xlsx)**.
2. En Laucen, andá a [Facturas de compra](/compras/facturas) y apretá **Importar de ARCA (Mis Comprobantes)**.
3. En "Archivo de ARCA → Mis Comprobantes → Recibidos (.csv o .xlsx)" elegí el archivo y apretá **Subir y ver**. Todavía no se registra nada.
4. Se abre la **vista previa**. Revisá:
   - la tabla **Cuenta de gasto de cada proveedor**: elegí a qué cuenta contable va el neto de las facturas de cada proveedor (viene propuesta: la que tenía recordada el proveedor; si no tiene, "Gastos varios", y para Mercado Libre, "Comisiones de canales");
   - si falta la cuenta adecuada, creala ahí mismo (ver "Crear una cuenta de gasto desde la vista previa", abajo);
   - las pestañas **Cargadas a mano distintas** y **Con error**, que son las que no se van a importar y conviene arreglar a mano.
5. Apretá **Importar N comprobantes nuevos** (arriba a la derecha).
6. Sale el resumen: "Listo: X cargadas, Y ya estaban, Z cargadas a mano distintas (no se tocaron), N con error." Las nuevas quedan **registradas** (no en borrador).

El libro queda armado en [Libros de IVA](/administracion/libros-iva), pestaña **IVA Compras**, eligiendo ese mes.

Errores típicos al subir:
- "Elegí el archivo que bajaste de ARCA.": no se eligió archivo.
- "El archivo es muy grande. Bajá un mes por vez.": más de unos 4,5 MB.
- "Tiene que ser el .csv (o el .xlsx) de "Mis Comprobantes – Recibidos".": otra extensión.
- "No se pudo leer el Excel…": el .xlsx está dañado o no es de ARCA.
- "No es el archivo de "Mis Comprobantes" de ARCA: no encuentro la columna "Punto de Venta".": se subió otro archivo.
- "Este archivo es de comprobantes EMITIDOS. Hay que bajar "Mis Comprobantes – Recibidos".": bajaste los emitidos (tus ventas) en vez de los recibidos.
- "Al archivo le faltan columnas: …": le faltan columnas obligatorias (Fecha, Tipo, Punto de Venta, Número Desde, Nro. Doc. Emisor, Imp. Total).
- "El archivo no tiene comprobantes.": no hay renglones válidos.

### Crear una cuenta de gasto desde la vista previa

Sirve cuando un proveedor necesita una cuenta que todavía no está en el plan (por ejemplo "Publicidad"), sin ir a Contabilidad. Hace falta el permiso de **Contabilidad** además del de Facturas de compra; sin él, el botón no aparece.

1. En la vista previa, apretá **+ Nueva cuenta** (a la derecha del título "Cuenta de gasto de cada proveedor").
2. El **Código** ya viene sugerido: el próximo libre de egreso (en el plan por defecto, después de 5.2.05 "Gastos varios", el 5.2.06). Se puede cambiar.
3. Escribí el **Nombre**.
4. Si es para un proveedor en particular, elegilo en **Queda elegida para**.
5. Apretá **Crear** (o Enter). Vuelve a la misma vista previa con "Cuenta 5.2.06 — Publicidad creada y elegida para su proveedor." (o "…creada: ya está en los desplegables."). La cuenta nueva aparece en todos los desplegables; **lo que ya habías elegido en los otros proveedores se mantiene**.

La cuenta se crea siempre como **egreso** e **imputable**, y queda en el [plan de cuentas](/administracion/contabilidad) como cualquier otra (ahí se puede renombrar, recodificar o desactivar). El código se valida igual que en Contabilidad. Errores típicos: "La cuenta necesita un nombre.", "El código va con números separados por puntos (ej. 5.2.06).", "Ya hay una cuenta con el código 5.2.06 (…).": el formulario sigue abierto con el error.

### Cargar una factura a mano

1. En [Facturas de compra](/compras/facturas), apretá **+ Nueva factura**.
2. Completá la cabecera: **Proveedor** (obligatorio), **Letra**, si **Es nota de crédito**, **Punto de venta**, **Número**, **Fecha** (obligatoria; de entrada, hoy), **Vencimiento**, **Moneda** y, si es en dólares, **Cotización**.
3. Si es mercadería: elegí **Depósito donde entra** o, si la mercadería ya entró por una recepción del depósito, **O la recepción por la que ya entró**. Si es un gasto o servicio, elegí la **Cuenta de gasto (si no es mercadería)**.
4. Apretá **Crear y cargar las líneas**. Te lleva al detalle con "Factura creada: cargale las líneas.".
5. En **Agregar línea**:
   - para mercadería: escribí SKU, código de barras o título, apretá **Buscar**, elegí el **Producto**, poné **Cantidad**, **Costo unit. neto** (sin IVA) y el **IVA**, y **Agregar**;
   - para un concepto sin producto (un servicio, un flete): dejá "— Línea libre (sin producto: no mueve stock) —", escribí la **Descripción (si es libre)**, cantidad, costo e IVA, y **Agregar**.
6. Si la factura tiene percepciones, impuestos internos o conceptos no gravados, cargalos en la cabecera (**Percepción IVA**, **Percepción IIBB**, **Otros impuestos**, **No gravado**) y apretá **Grabar cabecera**.
7. Controlá que el **Total** coincida con el papel.
8. Apretá **Registrar** (arriba a la derecha). Pregunta ahí mismo "¿Registrar? Ingresa el stock, actualiza el costo y deja la deuda al proveedor. Después no se puede cambiar." Apretá **Sí**.
9. Sale "Factura registrada: entró el stock, se actualizó el costo y quedó la deuda en la cuenta corriente.".

Errores típicos:
- "Elegí el proveedor." / "Poné la fecha de la factura." / "Elegí la letra de la factura.".
- "Si la factura es en dólares, poné la cotización.".
- "Ese comprobante de ese proveedor ya está cargado (factura #N).": mismo proveedor, letra, tipo, punto de venta y número que otra que no está anulada.
- "El punto de venta y el número no pueden ser negativos." / "Las percepciones e impuestos no pueden ser negativos.".
- En las líneas: "Poné una cantidad mayor a cero.", "Poné el costo unitario (neto, sin IVA).", "Elegí la alícuota de IVA.", "Una línea sin producto necesita una descripción.".
- Al registrar: "La factura tiene total cero: cargale líneas o importes.", "Falta la cotización del dólar de la factura.", "No hay tipo de cambio para el dd/mm/aaaa." (factura en pesos y no hay cotización cargada en [Tipo de cambio](/config/tipo-cambio) para esa fecha o antes), "Elegí a qué depósito entra la mercadería (o vinculá la recepción por la que ya entró).", "El depósito elegido no tiene ubicación general, así que la mercadería no tiene dónde entrar: elegí otro depósito.", "Las cantidades de mercadería tienen que ser enteras.".
- "La factura ya está registrada: no se cambia.": se intentó modificar una registrada.

### Cargar una nota de crédito de un proveedor

1. **+ Nueva factura**, con el mismo proveedor y letra, y tildá **Es nota de crédito**.
2. Cargá las líneas con los importes en positivo (el sistema ya sabe que resta).
3. **Registrar**.

La nota de crédito resta en la cuenta corriente del proveedor (se imputa sola contra su deuda más vieja) y en el Libro IVA Compras. **No saca stock ni cambia el costo**: si devolviste mercadería, el stock se ajusta aparte en [Ajustes](/stock/ajustes).

### Cargar una nota de débito
A mano no hay casilla de "nota de débito": las notas de débito entran por la **importación de ARCA**, que las reconoce por su tipo de comprobante. Suman como una factura (en la cuenta corriente y en el libro) pero tienen su propia numeración.

### Cargar la factura del proveedor del exterior o del despachante
Cargala a mano **sin productos** (líneas libres). La del exterior va con letra **E (exterior)**; si no elegís cuenta de gasto, en la contabilidad va contra "Importaciones en curso". La mercadería y su costo entran por el [despacho de importación](/compras/despachos), no por esta factura. Las facturas E no entran al Libro de IVA (sale un aviso).

### Corregir un borrador
Cambiá la cabecera y apretá **Grabar cabecera**; las líneas se editan con el lápiz de cada fila (**Guardar**) o se borran con el tacho. Cada cambio recalcula los totales.

### Borrar un borrador
Tacho de arriba a la derecha → "¿Borrar el borrador?" → **Sí**. Sólo se pueden borrar borradores.

### Qué hacer con una "Cargada a mano distinta" de la importación
Es un comprobante que ya estaba cargado a mano con el mismo número pero:
- sigue en **borrador** ("Está cargada a mano y sigue en borrador: registrala o borrala."), o
- tiene **otro total** u otra moneda ("Está cargada con otro total (…): revisala.").

La importación no la toca. Abrí la factura (el comprobante de la vista previa es un enlace), corregila o borrala si era un borrador, y volvé a subir el archivo: la que borraste entra como nueva.

## Criterios y reglas

### Totales de una factura
- Cada línea: **Neto = cantidad × costo unitario**, redondeado a centavos; **IVA = neto × alícuota / 100**, redondeado a centavos.
- Alícuotas que se eligen a mano: 21 %, 10,5 %, 27 % y 0 %. De entrada se propone 21 % si la letra es A o M, y 0 % en el resto. (Las importadas de ARCA pueden traer también 5 % y 2,5 %.)
- **Total = neto + IVA + percepción IVA + percepción IIBB + otros impuestos + no gravado.**
- El "IVA por alícuota" se arma solo agrupando las líneas.
- Los totales se recalculan con cada cambio de cabecera o de líneas, mientras es borrador.

### Monedas
- Una factura es en **Pesos** o en **Dólares**. En dólares, la **Cotización** es obligatoria (se propone la del día de [Tipo de cambio](/config/tipo-cambio), el dólar oficial vendedor); en pesos, la cotización es 1.
- Al registrar se guardan el **total en pesos** (total × cotización) y el **total en dólares**: si es en dólares, el total tal cual; si es en pesos, total en pesos dividido el dólar oficial de la fecha de la factura (si no hay cotización ese día, la última anterior). Si no hay ninguna cotización cargada, no deja registrar.
- La deuda en la cuenta corriente queda en la moneda de la factura, con sus equivalentes en pesos y en dólares.

### Qué pasa al registrar
1. Controles: tiene que ser borrador, con total mayor a cero, y si tiene líneas con producto (y no es nota de crédito), un depósito o una recepción elegidos.
2. **Costo** (sólo facturas y notas de débito, no notas de crédito): por cada línea con producto, costo unitario en pesos = costo unitario × cotización (a centavos); en dólares = el costo tal cual (factura en dólares) o el costo en pesos dividido el dólar del día (a 4 decimales). Con eso se actualiza:
   - el **último costo** del producto (en pesos y en dólares);
   - el **costo promedio ponderado**: (stock que había × promedio anterior + cantidad comprada × costo nuevo) / (stock que había + cantidad comprada). Si el stock que había era cero o negativo, o no había promedio, el promedio pasa a ser el costo nuevo.
   - **"Stock que había"** es el stock de antes de esta compra. Si la factura está vinculada a una **recepción**, esas unidades ya están en el stock (entraron al recibir), así que se descuentan: no cuentan como "stock que había" a precio viejo, ni se cuentan dos veces. Ejemplo: había 10 a $100, la recepción entró 10 (stock 20) y la factura las cobra a $200 → promedio (10 × 100 + 10 × 200) / 20 = **$150**.
   - **Recepción parcial**: se descuenta lo que efectivamente se recibió de ese producto. Si llegaron 8 de 10 facturadas, se descuentan 8 y el promedio se calcula igual con las 10 facturadas (es lo que se pagó). Si llegaron de más (12 de 10), se descuentan las 12: las 2 de más no tienen costo hasta que se registre su factura (vinculada a la misma recepción); esa segunda factura ya toma como "stock que había" las 10 que costeó la primera.
   - Si un producto de la factura no vino en esa recepción, no se descuenta nada.
   - **Diferencia con la recepción**: el costo se calcula con lo facturado (es lo que se pagó), pero si lo recibido no da igual a lo facturado, la diferencia de unidades se guarda con la factura y se asienta aparte (ver "Diferencia entre lo facturado y lo recibido", abajo).
3. **Stock**: si se eligió **depósito** (y no recepción), cada línea con producto ingresa su cantidad a la ubicación general de ese depósito. Si el depósito no tiene ubicación general, no deja registrar y lo avisa. Si se eligió **recepción**, el stock no se mueve nunca (ya entró por la recepción, aunque haya llegado menos o más de lo facturado): sólo se actualiza el costo. Lo que faltó entra cuando se recibe, con otra recepción. Las líneas libres nunca mueven stock. Las notas de crédito no mueven stock. Las cantidades de mercadería tienen que ser enteras.
4. **Cuenta corriente**: deja el comprobante en la cuenta del proveedor (factura y nota de débito suman deuda; nota de crédito resta), con vencimiento = el de la factura o, si no tiene, la fecha. Enseguida imputa solo los créditos contra las deudas del proveedor, de la más vieja a la más nueva.
5. Queda **Registrada** con fecha y hora. Ya no se puede modificar ni borrar.
6. Si entró stock, se avisa a Mercado Libre el stock nuevo de esos productos (si el canal tiene prendida la sincronización de stock).

### Asiento contable
No se hace a mano: lo genera el sistema solo (las tareas periódicas, enseguida de importar de ARCA, o el botón de [Contabilidad](/administracion/contabilidad)). Para cada factura registrada, en pesos:
- **Debe**: Mercaderías (el neto de las líneas con producto); la cuenta de gasto elegida (el neto de las líneas libres + no gravado; si no se eligió cuenta, "Gastos varios", o "Importaciones en curso" si la letra es E); IVA crédito fiscal (el IVA); Percepciones de IVA; Percepciones de IIBB; Impuestos (otros impuestos).
- **Haber**: Proveedores (el total en pesos).
- Las notas de crédito, al revés.

### Diferencia entre lo facturado y lo recibido
Cuando la factura está vinculada a una recepción, el asiento de la compra pone en Mercaderías **todo lo facturado**, pero al stock entró **lo recibido**. Si no dan igual, se genera solo un asiento más ("Diferencia de recepción", uno por factura), con la fecha de la factura:
- **Se facturó de más** (faltan unidades): las que faltan, al costo unitario de la factura en pesos, salen de Mercaderías y van a **Diferencias en recepciones de stock** (egreso). Ejemplo: facturan 10 a $100 y se recibieron 8 → faltan 2 → **Debe** Diferencias en recepciones de stock $200 / **Haber** Mercaderías $200. Así Mercaderías queda con las 8 que de verdad están.
- **Se recibió de más** (sobran unidades): al revés. Las de más están en el stock pero no pasaron por Mercaderías: entran al costo de la factura → **Debe** Mercaderías / **Haber** Diferencias en recepciones de stock (achica el egreso). Ejemplo: facturan 10 a $100 y llegaron 12 → **Debe** Mercaderías $200 / **Haber** Diferencias en recepciones de stock $200.
- Cada producto va en su renglón, con el SKU como detalle. Un producto que está en la factura pero no vino en esa recepción cuenta como que faltó entero. Los productos de la recepción que la factura no nombra no cuentan (pueden venir en otra factura).
- **Una recepción facturada en dos o más facturas**: cada factura mira lo que quedó recibido sin cubrir por las anteriores. Si la primera factura cobra 5 de las 10 recibidas, asienta 5 de sobrante; cuando llega la segunda con las otras 5, ya no queda nada recibido sin cubrir y asienta 5 de faltante: las dos se compensan y queda en cero.
- La diferencia se calcula y se guarda al registrar la factura (las registradas antes de esto no la tienen). Las notas de crédito no la generan.
- Si las unidades que faltaron llegan después con otra recepción, entran al stock sin asiento (la recepción no contabiliza): el contador las vuelve a pasar a Mercaderías con un asiento manual (Debe Mercaderías / Haber Diferencias en recepciones de stock).

### Duplicados
- No se puede cargar dos veces el mismo comprobante del mismo proveedor: se compara proveedor + letra + si es nota de crédito + si es nota de débito + punto de venta + número, entre las no anuladas.
- Sin número ("s/n") no se controla.

### Importación de ARCA: qué archivo acepta
- El de **Mis Comprobantes – Recibidos**, en **.csv** (separado por punto y coma, coma o tabulación; con coma decimal o punto; en UTF-8 o en la codificación vieja de Windows; puede traer una fila de título arriba) o en **.xlsx** (se lee la primera hoja). También se acepta .txt con formato CSV. Hasta unos 4,5 MB (un mes).
- Las columnas se reconocen **por su encabezado, no por su posición**. Acepta las dos versiones de ARCA:
  - la **vieja**, con el neto gravado y el IVA en un solo número;
  - la **nueva**, con neto e IVA por alícuota (0, 2,5, 5, 10,5, 21 y 27 %), y a veces percepciones aparte (de IVA, de Ingresos Brutos, impuestos internos, otros tributos).
- Obligatorias: Fecha, Tipo, Punto de Venta, Número Desde, Nro. Doc. Emisor (CUIT del emisor) e Imp. Total.
- Tipos de comprobante que reconoce: facturas, notas de débito, notas de crédito, recibos, notas de venta al contado y tiques de letras A, B, C y M, y las Facturas de Crédito Electrónicas MiPyME (con sus notas). Recibos, tiques y notas de venta cuentan como factura de su letra. Otro tipo: ese renglón no se importa ("el tipo de comprobante … no lo conozco").
- Renglones que no se leen (y se listan en "Renglones que no se pudieron leer"): fecha que no se entiende, tipo desconocido, emisor sin CUIT de 11 dígitos, sin número, moneda que no es pesos ni dólares.
- Si el renglón tiene "Número Hasta" mayor que el "Número Desde", se importa como un solo comprobante con el primer número y en las notas queda "Números X a Y".

### Importación de ARCA: cómo arma cada factura
- **Proveedor**: por CUIT (sólo dígitos). Si no existe, se crea al importar (ver [Proveedores](/compras/proveedores)).
- **Facturas A y M**: una línea por alícuota ("Neto gravado 21 %", etc.) con su neto y su IVA; no gravado + exento van a "No gravado"; percepciones de IVA, de IIBB y otros tributos a sus campos.
  - En la versión vieja de columnas la alícuota **se deduce**: se prueba 21, 10,5, 27, 5 y 2,5 % (con tolerancia de 5 centavos); si ninguna cierra, se reparte el neto entre 21 % y 10,5 %; si tampoco, una sola línea con el porcentaje que dé. Si hay IVA pero no neto, se toma 21 %.
  - Si los importes separados suman **menos** que el total, la diferencia va a "Otros impuestos" (y la factura lleva el aviso). Si suman **más** que el total, es **error** y no se importa ("Los importes no cierran…"). Diferencias de centavos se ajustan en la línea más grande.
- **Facturas B y C**: una sola línea "(sin IVA discriminado)" por el **total entero**, sin IVA: no dan crédito fiscal y todo es gasto.
- Las líneas importadas son siempre **sin producto**: no mueven stock ni costo. Van a la cuenta de gasto elegida para ese proveedor.
- Moneda: pesos o dólares. En dólares, la cotización es la que trae el archivo; si no la trae, es error.
- Vencimiento = fecha del comprobante. Se guarda el CAE y el origen "ARCA (Mis Comprobantes)". Notas: "Importada de ARCA (Mis Comprobantes)." más el aviso si hubo.
- Antes de registrar, se controla que el total armado coincida con el de ARCA (tolerancia 2 centavos); si no, ese comprobante queda con error.
- Cada comprobante nuevo se **registra enseguida** (cuenta corriente) y se genera su asiento.

### Importación de ARCA: estados contra lo ya cargado
Cada comprobante se compara con las facturas no anuladas del mismo CUIT, letra, tipo (factura, NC o ND), punto de venta y número:
- **Nueva**: no está. Se importa.
- **Ya cargada**: está registrada, en la misma moneda y con un total que difiere en $ 1 o menos. No se toca.
- **Cargada a mano distinta**: está, pero en borrador, o con otro total o moneda. No se toca; hay que revisarla.
- **Repetida en el archivo**: el mismo comprobante aparece dos veces en el archivo; se toma una sola.
- **Con error**: los importes no cierran, el total es cero o está en dólares sin tipo de cambio. No se importa.

Por eso **subir dos veces el mismo mes no duplica**: lo que ya entró aparece como "Ya cargada".

### Cuenta de gasto en la importación
- Se propone la cuenta recordada en el proveedor; si no tiene, **Gastos varios**; si el proveedor es Mercado Libre / Mercado Pago (por su CUIT o porque el nombre dice Mercado Libre o Mercado Pago), **Comisiones de canales**.
- La cuenta elegida queda **recordada en el proveedor** para la próxima importación (también en los proveedores existentes que no tenían nada nuevo).
- **Código sugerido para una cuenta nueva** ("+ Nueva cuenta"): como las facturas de compra casi siempre son gastos, es el próximo código libre de egreso: el de la cuenta imputable de egreso con el código más alto, más uno en la última parte y con sus ceros (después de 5.2.05, 5.2.06; después de 5.2.09, 5.2.10). Si ese código ya está usado, sigue con el próximo. Si cambiaste el código, tiene que ir con números separados por puntos y no existir. La cuenta cuelga de la madre que le corresponde por el código (el código más cercano que existe acortándolo de a una parte). El detalle, en [Contabilidad](/administracion/contabilidad).
- Crear una cuenta desde la vista previa **no importa nada** y no borra lo elegido en los desplegables: vuelve a la misma vista previa con todo como estaba, más la cuenta nueva.

## Con más de una razón social

La mercadería es de toda la organización, pero **cada factura de compra viene a nombre de una razón social**. Con más de una, el formulario de la factura tiene **"A nombre de (razón social)"** (sin elegir, la principal).

- **El stock entra igual al stock general**, venga a nombre de quien venga: no hay stock separado por razón social.
- La factura define de qué razón social es el **crédito fiscal** (libro de IVA Compras), la **cuenta corriente con el proveedor** y el **asiento**.
- **Importar de ARCA (Mis Comprobantes)**: el archivo se baja de ARCA con el CUIT de cada empresa, así que al subirlo se elige **"De la razón social"**. Los comprobantes importados quedan a su nombre, y un comprobante ya cargado a nombre de la otra razón social **no** cuenta como "ya cargado".
- En la lista hay un selector **"Razón social"** y se puede sumar la columna **"Razón social"** en la vista.

## Preguntas frecuentes

**¿Cómo importo el archivo de ARCA del libro de IVA compras?**
Bajá de ARCA "Mis Comprobantes – Recibidos" del mes (.csv o .xlsx). En Compras › Facturas de compra apretá **Importar de ARCA (Mis Comprobantes)**, subilo con **Subir y ver**, revisá la vista previa y la cuenta de gasto de cada proveedor, y apretá **Importar**. El libro se ve en [Libros de IVA](/administracion/libros-iva), pestaña IVA Compras.

**Si subo dos veces el mismo archivo, ¿se duplican las facturas?**
No. Lo que ya está cargado aparece como "Ya cargada" y no se toca.

**¿Las facturas importadas de ARCA mueven stock?**
No. Entran sin productos (por alícuota) y van a gasto. La mercadería con stock y costo se carga a mano con productos, o entra por recepción o por despacho.

**Cargué a mano una factura que después vino en el archivo de ARCA, ¿qué pasa?**
Si está registrada y el total coincide (±$ 1), aparece "Ya cargada" y no se duplica. Si está en borrador o con otro total, aparece "Cargada a mano distinta" y no se toca: revisala.

**¿Puedo modificar una factura registrada?**
No. Registrar es definitivo. Si estaba mal, cargá una nota de crédito del proveedor (o la nota que corresponda).

**¿Qué diferencia hay entre elegir "Depósito donde entra" y "O la recepción por la que ya entró"?**
Con depósito, al registrar entra el stock a la ubicación general de ese depósito. Con recepción, el stock ya había entrado por la recepción del depósito: la factura sólo pone el costo y la deuda.

**¿Cómo se calcula el costo del producto?**
Último costo = el costo unitario de esta factura (pasado a pesos con su cotización). Costo promedio = promedio ponderado entre el stock que había con su promedio y lo que entra con su costo. Si la factura está vinculada a una recepción, lo que entró por esa recepción no cuenta como "stock que había" (ya está adentro): así no se cuenta dos veces.

**¿Por qué las facturas B y C no tienen IVA?**
Porque no discriminan IVA y no dan crédito fiscal: el total entero va a gasto.

**Me dice "No hay tipo de cambio para el …"**
Falta la cotización del dólar en [Tipo de cambio](/config/tipo-cambio) para esa fecha o antes. Se usa para guardar el equivalente en dólares.

**¿Dónde veo lo que le debo al proveedor?**
En el detalle de una factura registrada, **Estado de cuenta del proveedor**, o en [Cuentas corrientes](/administracion/cuentas-corrientes).

## Relacionado

- [Proveedores](/compras/proveedores)
- [Despachos de importación](/compras/despachos)
- [Libros de IVA](/administracion/libros-iva)
- [Facturación de Mercado Libre](/administracion/facturacion-ml)
- [Cuentas corrientes](/administracion/cuentas-corrientes)
- [Contabilidad](/administracion/contabilidad)
- [Recepción](/deposito/recepcion)
- [Tipo de cambio](/config/tipo-cambio)
- [Ajustes de stock](/stock/ajustes)
- [Razones sociales](/config/razones-sociales)
