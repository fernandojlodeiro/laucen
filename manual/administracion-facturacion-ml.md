---
titulo: Facturación de Mercado Libre
menu: Administración › Facturación de Mercado Libre
ruta: /administracion/facturacion-ml
rutas: /administracion/facturacion-ml
permiso: facturacion_ml_ver
resumen: Lo que cobran Mercado Libre y Mercado Pago por período, leído de su API, de una cuenta o de todas: cargos por tipo, retenciones y percepciones (con Excel) y el control contra las facturas importadas de ARCA.
---

## Para qué sirve

Muestra lo que **Mercado Libre y Mercado Pago le facturan** a cada cuenta, leído directamente de la API de Mercado Libre, por período de facturación:
- **Resumen**: los cargos por tipo (comisión, envíos, cargo fijo, publicidad, impuestos, bonificaciones…) y cuántos quedaron unidos a una venta.
- **Retenciones y percepciones**: el detalle y los totales por impuesto, para el contador (con Excel).
- **Control con ARCA**: cada factura o nota de crédito que Mercado Libre dice haber emitido, contra las facturas de compra importadas de ARCA: cuáles están y cuáles faltan.

Se puede ver **una cuenta de Mercado Libre sola o todas juntas** con el filtro **Cuenta**.

Es **sólo lectura**: no cambia nada en Mercado Libre y **no registra facturas**. Las facturas de Mercado Libre y Mercado Pago entran al sistema únicamente por la importación de ARCA en [Facturas de compra](/compras/facturas).

Además, cada cargo unido a una venta alimenta el costo de esa venta: se ve en la ficha del pedido ("Cargos de Mercado Libre"), en la lista de pedidos ("Neto ML") y en el informe de [Rentabilidad por venta](/informes/rentabilidad).

## Cómo se llega

- Menú: **Administración › Facturación de Mercado Libre**.

## Qué hay en la pantalla

Arriba a la derecha:
- **Descargar Excel**: sólo en la pestaña Retenciones y percepciones.
- **Traer facturación de ML**: lee ya de Mercado Libre (mientras lee dice "Leyendo de Mercado Libre…"). Lee la cuenta elegida en el filtro, o todas si está en "Todas las cuentas".

Debajo del título:
- **Cuenta**: desplegable con las cuentas de Mercado Libre de la organización (cada una es un canal de Mercado Libre, con el nombre del canal) y **Todas las cuentas**, que es lo que aparece de entrada. Al elegir una, la pantalla cambia al momento. Se ve aunque haya una sola cuenta. Al lado, un recordatorio de qué va a leer el botón: "«Traer facturación de ML» lee todas las cuentas" o "lee sólo …".
- "Última lectura:" con cada cuenta (las de la cuenta elegida, o todas), el día y la hora, "(quedó a medias)" si no terminó, y el primer aviso si hubo. "Se lee sola cada noche."

Si todavía no se leyó nada: "Todavía no se leyó la facturación. Apretá «Traer facturación de ML»."

Con datos:
- **Período**: desplegable con los períodos leídos (mes y año, con sus fechas desde/hasta), del más nuevo al más viejo. De entrada, el más nuevo. Con una cuenta elegida, sólo los períodos de esa cuenta.
- "Total facturado por ML en el período": la suma de lo que informa Mercado Libre para ese período (de la cuenta elegida o de todas).
- Pestañas: **Resumen**, **Retenciones y percepciones (N)**, **Control con ARCA (N)**.

**Resumen**: por cada tipo de cargo, columnas **Mercado Libre**, **Mercado Pago**, **Total** y **Unidos a una venta** ("X de Y"), y la fila Total. Tipos: Comisión por venta, Envíos, Cargo fijo, Publicidad, Impuestos (percepciones y retenciones), Bonificaciones, Otros cargos. Nota al pie: importes tal como los factura Mercado Libre (con IVA); las bonificaciones restan. Con "Todas las cuentas" los importes son la suma de todas; si hay más de una cuenta, abajo sale otra tabla con el total de **cada cuenta** (columnas Cuenta, Mercado Libre, Mercado Pago, Total y Unidos a una venta).

**Retenciones y percepciones**:
- Totales por impuesto (IVA, Ingresos Brutos, Ganancias, Otros) en Mercado Libre, Mercado Pago y Total.
- Detalle (de a 50, con paginador): Fecha, **Cuenta** (sólo con "Todas las cuentas" y más de una cuenta), **Cobra** (Mercado Libre o Mercado Pago), Impuesto, Concepto, **Venta** (número de orden; enlace al pedido si está unido), **Comprobante de ML** e Importe.

**Control con ARCA**:
- Un cartel: si faltan, "X de N comprobantes de Mercado Libre no están en las facturas de compra: importá "Mis Comprobantes" de ARCA de ese mes (Compras → Facturas de compra)."; si están todos, "Los N comprobantes de Mercado Libre están en las facturas de compra importadas de ARCA."; si no hay, "Mercado Libre no informó facturas en este período."
- Tabla: Fecha, **Cuenta** (sólo con "Todas las cuentas" y más de una cuenta), Cobra, Comprobante ("Factura" o "Nota de crédito" y número), **Importe según ML** (las notas de crédito en negativo) y **En las facturas de compra (ARCA)**: **Está** (verde, enlace a la factura; si el total difiere en más de $ 1, "con otro total ($ …)") o **Falta en la importación de ARCA** (amarillo).
- Si hay: **En ARCA y no en la API (N)**: facturas de compra de Mercado Libre de esas fechas que no coinciden con ningún comprobante de la API (pueden ser de otro período o de una cuenta que no está conectada), con fecha, comprobante (enlace) y total.

## Cómo se hace

### Ver una cuenta sola o todas juntas
1. En **Cuenta**, elegí la cuenta de Mercado Libre. La pantalla se actualiza al momento: períodos, pestañas, Excel y el botón **Traer facturación de ML** pasan a ser de esa cuenta.
2. Para volver a ver todo junto, elegí **Todas las cuentas**.

### Traer la facturación ahora
1. Si querés leer una sola cuenta, elegila en **Cuenta**; con **Todas las cuentas** se leen todas.
2. Apretá **Traer facturación de ML**.
3. Espera a que termine. Sale "Leídos N períodos: X facturas y notas de crédito, Y cargos." (con "de [cuenta]" o "de N cuentas" cuando corresponde). Si no alcanzó el tiempo: "No alcanzó el tiempo para todo: apretá de nuevo para seguir." Con muchas cuentas conviene leerlas de a una si no alcanza el tiempo.

Errores:
- "No hay ninguna cuenta de Mercado Libre conectada con un canal.": falta conectar la cuenta de Mercado Libre a un canal en [Canales](/config/canales).
- "La cuenta «…» no está conectada a Mercado Libre o la conexión no está activa: revisala en Canales.": elegiste una cuenta cuyo canal no tiene la conexión con Mercado Libre activa.
- "Mercado Libre no dio la facturación (…)": Mercado Libre contestó con error.

### Pasarle al contador las retenciones y percepciones del mes
1. Elegí la **Cuenta** (o todas) y el **Período**.
2. Pestaña **Retenciones y percepciones**.
3. **Descargar Excel**: trae cada renglón de la cuenta elegida o de todas (fecha, cuenta —sólo con todas y más de una—, quién cobra, impuesto, concepto, orden de ML, pedido de Laucen, comprobante de ML, importe) y al pie el total de cada impuesto. Con una cuenta elegida, el nombre del archivo lleva el de la cuenta.

### Controlar que estén todas las facturas de Mercado Libre
1. Elegí el **Período** y la pestaña **Control con ARCA**.
2. Si hay comprobantes en **Falta en la importación de ARCA**, bajá "Mis Comprobantes – Recibidos" de ARCA de ese mes e importalo en [Facturas de compra](/compras/facturas) (**Importar de ARCA (Mis Comprobantes)**).
3. Volvé a esta pestaña: deberían pasar a **Está**.

## Criterios y reglas

### Lectura de Mercado Libre
- Se leen las cuentas de Mercado Libre **activas y conectadas a un canal**. Para cada una, los dos grupos: **Mercado Libre** y **Mercado Pago**.
- **Sola, cada noche**, entre las 2 y las 5 (hora argentina), si una cuenta no se leyó en las últimas 20 horas: los **últimos 2 períodos**, de todas las cuentas.
- Con el botón **Traer facturación de ML**: los **últimos 3 períodos**, de la cuenta elegida en **Cuenta**, o de todas las cuentas de tu organización si está en "Todas las cuentas".
- De cada período se leen: el período (fechas, monto, vencimiento, impago), los **documentos** (facturas y notas de crédito que emitió Mercado Libre) y el **detalle de cargos**.
- Leer dos veces no duplica: cada documento y cada cargo se guarda una sola vez (se actualiza si cambió).
- Hay un tiempo máximo por lectura; lo que no entra queda "a medias" y se completa en la próxima.
- Es todo lectura (Mercado Libre permite leer sin restricciones; nada se modifica allá).

### Clasificación de cada cargo
Por la descripción del cargo (sin importar mayúsculas ni acentos), en este orden:
1. **Bonificación**: si es un crédito o bonus, o dice bonificación, reintegro, devolución de cargo o anulación de cargo. Resta.
2. **Impuesto**: si dice percepción, retención, impuesto, tributo, SIRTAC, ingresos brutos, IIBB, ganancias o IVA. Y dentro de impuestos: **Ingresos Brutos** (ingresos brutos, IIBB, SIRTAC), **Ganancias**, **IVA** u **Otros**.
3. **Envíos**: envío, shipping, flete, Mercado Envíos, logística.
4. **Publicidad**: publicidad, product ads, ads, anuncio, campaña, brand.
5. **Cargo fijo**: cargo fijo, costo fijo, "fijo por".
6. **Comisión por venta**: venta, vender, comisión, sale fee, "cargo por".
7. Si no, **Otros cargos**.

Los cargos que vienen del detalle de las notas de crédito restan. Los importes son tal como los factura Mercado Libre (con IVA).

### Filtro por cuenta
- Cada cuenta de Mercado Libre es un canal de Mercado Libre ([Canales](/config/canales)); el desplegable muestra los canales de Mercado Libre de la organización, con su nombre.
- Todo lo que se lee (períodos, facturas y notas de crédito, cargos) queda guardado con la cuenta de la que vino, y el filtro aplica a toda la pantalla: períodos, resumen, retenciones y percepciones, control con ARCA, el Excel y el botón de leer.
- La columna **Cuenta** aparece sólo con "Todas las cuentas" y más de una cuenta.
- **Control con ARCA con una cuenta elegida**: se controlan sólo los comprobantes de esa cuenta. Las facturas de ARCA no dicen de qué cuenta son (todas vienen con el CUIT de Mercado Libre), así que "En ARCA y no en la API" descarta las que coinciden con un comprobante de **cualquier** cuenta conectada: así no aparecen como sobrantes las facturas de las otras cuentas.

### Costo de la venta
- Cada cargo con número de orden se **une al pedido** de Laucen: por el número de orden o del carrito (pack) del pedido, o por la línea del carrito que vino de esa orden, siempre del mismo canal.
- Para el costo de la venta cuentan comisión, envíos, cargo fijo, publicidad, bonificaciones y otros. **Los impuestos no** son costo: son percepciones y retenciones que se toman a cuenta.

### Control con ARCA
- Se buscan las facturas de compra **no anuladas** de los proveedores con el **CUIT de MercadoLibre S.R.L.** (30-70308853-4), que factura tanto los cargos de Mercado Libre como los de Mercado Pago.
- Un comprobante de la API **"Está"** si hay una factura de compra con el mismo **número** y, si la API trae punto de venta, el mismo **punto de venta**, y del mismo tipo (factura con factura, nota de crédito con nota de crédito).
- "con otro total" si el total de la factura de compra difiere en más de $ 1 del importe de Mercado Libre.
- **En ARCA y no en la API**: facturas de compra de ese CUIT con fecha entre el inicio del período y 10 días después de su fin, que no se usaron en ninguna coincidencia.
- Para que el control funcione, el proveedor Mercado Libre tiene que tener bien cargado su CUIT (si se creó por la importación de ARCA, ya lo tiene).

## Preguntas frecuentes

**¿Desde acá se cargan las facturas de Mercado Libre?**
No. Acá sólo se leen y se controlan. Las facturas entran por [Facturas de compra](/compras/facturas) → **Importar de ARCA (Mis Comprobantes)**.

**¿Cada cuánto se actualiza?**
Sola cada noche (los últimos 2 períodos). Si necesitás ya, apretá **Traer facturación de ML** (lee los últimos 3).

**Dice "Falta en la importación de ARCA", ¿qué hago?**
Importá en Facturas de compra el archivo "Mis Comprobantes – Recibidos" de ARCA del mes de ese comprobante.

**¿Por qué los impuestos no cuentan en la rentabilidad?**
Porque son percepciones y retenciones: se toman a cuenta de impuestos, no son un costo de la venta.

**¿Los importes tienen IVA?**
Sí, son tal como los factura Mercado Libre.

**¿Qué es "Unidos a una venta"?**
Cuántos de esos cargos se pudieron asociar a un pedido de Laucen. Los unidos se ven en la ficha del pedido y en la rentabilidad.

**¿Esto cambia algo en Mercado Libre?**
No, es sólo lectura.

**Tengo varias cuentas de Mercado Libre, ¿cómo veo una sola?**
Elegila en el desplegable **Cuenta**, arriba. Con **Todas las cuentas** se ve todo junto y cada renglón dice de qué cuenta es.

**¿El botón lee todas las cuentas?**
Lee la que tengas elegida en **Cuenta**; si está en "Todas las cuentas", lee todas. Al lado del desplegable dice qué va a leer.

**Me dice que no hay ninguna cuenta conectada**
La cuenta de Mercado Libre tiene que estar activa y vinculada a un canal en [Canales](/config/canales).

## Relacionado

- [Facturas de compra](/compras/facturas)
- [Libros de IVA](/administracion/libros-iva)
- [Pedidos](/ventas/pedidos)
- [Rentabilidad por venta](/informes/rentabilidad)
- [Canales](/config/canales)
- [Proveedores](/compras/proveedores)
