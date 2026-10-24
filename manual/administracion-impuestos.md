---
titulo: Impuestos
menu: Administración › Impuestos
ruta: /administracion/impuestos
rutas: /administracion/impuestos, /administracion/impuestos/[id]
permiso: impuestos_ver
resumen: Las declaraciones juradas de IVA, Ingresos Brutos (Convenio Multilateral) y la municipal de Córdoba; el control contra lo cargado y la posición del mes en curso, provincia por provincia.
---

## Para qué sirve

Junta en un lugar los tres impuestos que se liquidan todos los meses:
- **IVA** (formulario F.2002 de ARCA);
- **Ingresos Brutos por Convenio Multilateral** (SIFERE, CM03), que se liquida **provincia por provincia**: cada una tiene su coeficiente unificado, su alícuota, sus percepciones y retenciones y su propio saldo (una puede dar a pagar y otra a favor);
- la **Contribución sobre el comercio y la industria de la Municipalidad de Córdoba**.

Sirve para tres cosas:
1. **Guardar las declaraciones del contador**: se sube el PDF de cada una, la IA lee los importes y el PDF queda guardado para verlo o bajarlo.
2. **Controlarlas**: cada declaración se compara con lo cargado en el sistema ese mes (ventas, compras, despachos, percepciones, lo que descontó Mercado Pago) y con el saldo que dejó la declaración del mes anterior. Lo que no coincide va a la pestaña **Diferencias**.
3. **Ver cómo viene el mes en curso**: con las facturas que se emiten y se cargan día a día, y el saldo a favor de la última declaración, cuánto va dando cada impuesto.

Todo es de una razón social a la vez: cada una presenta sus propias declaraciones.

## Cómo se llega

- Menú: **Administración › Impuestos**.
- Desde la posición del mes, el enlace "ver los libros de IVA" abre [Libros de IVA](/administracion/libros-iva) en ese mes.

## Qué hay en la pantalla

Arriba a la derecha:
- **Buscar en el Drive** (sólo si Google Drive está conectado y tiene la ruta de las carpetas): busca de fondo las declaraciones que dejó el contador en las carpetas de los últimos tres meses. Para levantar meses más viejos, elegí antes el mes en **Leer desde** (al lado del botón): lee de ese mes hasta hoy. Si son muchos, corta a los pocos minutos y avisa; apretá de nuevo y sigue donde quedó (lo ya leído no se vuelve a leer); ver "Declaraciones que el contador deja en el Drive".
- **Nueva declaración a mano**: abre debajo del título un formulario chico con **Impuesto** (IVA, Ingresos Brutos o Municipalidad de Córdoba), **Mes declarado**, **Rectificativa (0 si es la original)** y el botón **Crear y cargar los importes**. Es para cuando no se tiene el PDF.
- **Subir declaración**: elegís el PDF (o una foto) de la declaración; ver "Subir una declaración".

Debajo, si hay más de una razón social, el selector **Razón social**; en la pestaña de la posición, el desplegable **Mes** (de entrada, el mes en curso).

Pestañas: **Posición del mes**, **Declaraciones (N)**, **Diferencias (N)** (N = declaraciones con alguna diferencia) y **Provincias (N)** (N = provincias de Ingresos Brutos cargadas).

### Posición del mes

Arriba, el mes, cuántos comprobantes de venta y de compra tiene y el enlace a los libros de IVA. Si falta algo para calcular bien (la declaración del mes anterior, las provincias, la alícuota municipal), un cartel amarillo lo dice.

- **IVA**: Débito fiscal (ventas) − Crédito fiscal (compras y despachos) − Saldo técnico a favor del mes anterior = **Impuesto del mes** (o **Saldo técnico a favor**, si da negativo). Después − Percepciones de IVA (pagos a cuenta) − Saldo de libre disponibilidad del mes anterior = **A pagar** (en rojo) o **Saldo de libre disponibilidad a favor** (en verde).
- **Municipalidad de Córdoba**: Base imponible (ventas sin IVA), la contribución con su alícuota (y el mínimo), **Determinado** (el mayor de los dos), − Saldo a favor del mes anterior = **A pagar** o **A favor**. Si la razón social no paga la municipal, lo dice.
- **Ingresos Brutos (Convenio Multilateral)**, con la base del mes en el título: una fila por provincia con **Saldo** (a pagar en rojo o a favor en verde), **Coef.**, **Alíc.**, **Base** (base del mes × coeficiente), **Determ.** (base × alícuota), **Percep.** (percepciones de las facturas de compra), **Aduana** (percepciones de los despachos), **Ret. MP** (lo que descontó Mercado Pago en los cobros) y **Saldo ant.** (el saldo a favor que dejó la declaración del mes anterior en esa provincia). Al pie, el total con lo que da a pagar y lo que da a favor, por separado.

### Declaraciones

Arriba, si Google Drive está conectado, el recuadro **Del Drive del contador**: cuándo se buscó por última vez y qué encontró (declaraciones nuevas, las que ya estaban, papeles que no son declaraciones y errores), y desplegable **Archivos que no se cargaron (N)** con cada uno y el motivo.

Una fila por declaración, de la más nueva a la más vieja: **Mes** (lleva a su ficha), **Impuesto**, **Rectif.**, **A pagar**, **A favor**, **Control** ("✓ Coincide", "N diferencias" o "— (reemplazada)" si hay una rectificativa más nueva del mismo mes), **Presentada**, **PDF** (Ver) y **Origen** (Drive, Subida o A mano). De a 50 filas.

### Diferencias

Las declaraciones (de los últimos meses) que no coinciden con lo cargado, cada una con su título (enlace a la ficha) y la tabla **Concepto**, **Declaración**, **Laucen** y **Diferencia**. Si todo coincide, un cartel verde lo dice.

### Provincias

- **Provincias de Ingresos Brutos (Convenio Multilateral)**: Provincia, Coeficiente y Alícuota, con lápiz (se edita en la fila: **Guardar** / **Cancelar**) y tacho (pregunta "¿Quitarla?"). A la derecha del título, **Nueva provincia**: Provincia (con buscador), Coeficiente unificado, Alícuota % y **Agregar**.
- **Municipalidad de Córdoba**: **Paga la contribución** (caja para tildar), **Alícuota %** y **Mínimo mensual $**. Se edita con el lápiz de la derecha del título (**Grabar** / **Cancelar**).

### La ficha de una declaración (/administracion/impuestos/[id])

Título: el impuesto, el mes y, si es rectificativa, su número; debajo, la razón social. Arriba a la derecha: **Ver el PDF**, **Bajar el PDF** (si se subió), el **lápiz** (pasa a edición: **Grabar** / **Cancelar**) y el **tacho** ("¿Borrar la declaración?").

- **Presentada el** y **Notas**.
- IVA: Débito fiscal, Crédito fiscal, Saldo técnico a favor del mes anterior, Saldo técnico a favor que queda, Retenciones, percepciones y pagos a cuenta, Libre disponibilidad a favor del mes anterior, Libre disponibilidad a favor que queda y A pagar.
- Ingresos Brutos: **Base imponible total** y la tabla de provincias con Coef., Alíc., Base, Determ., Ret., Percep., Aduana, Recaud. (bancarias y SIRTAC), Restan (los valores que restan del resumen del CM03), Saldo ant., A pagar y A favor. En edición, cada número es un campo y abajo está **Agregar una provincia (se agrega al grabar)**.
- Municipal: Base imponible, Alícuota %, Contribución determinada, Mínimo, Retenciones y percepciones, Saldo a favor anterior, A pagar y A favor.
- Abajo, **Diferencias con lo cargado en Laucen (N)** con la tabla, o "Coincide con lo cargado en Laucen ese mes y con la declaración del mes anterior."

## Cómo se hace

### Subir una declaración

1. En [Impuestos](/administracion/impuestos), arriba a la derecha, apretá **Subir declaración** y elegí el PDF que te mandó el contador (el F.2002 de IVA, el CM03 de Ingresos Brutos o la declaración municipal).
2. El botón pasa a "Subiendo…" y después a "Leyendo con la IA…" (menos de un minuto). La IA reconoce de qué impuesto es, el mes, si es rectificativa y la razón social (por el CUIT).
3. Se abre su ficha con "Leída: … Revisá los importes contra el PDF." Compará con el PDF (**Ver el PDF**) y, si algo está mal leído, corregilo con el lápiz y **Grabar**.

Si ya había una declaración del mismo impuesto, mes y número de rectificativa, la reemplaza (lo dice el mensaje). Una rectificativa es otra declaración del mismo mes: vale la de número más alto.

Errores típicos: "No se reconoce de qué impuesto es la declaración…", "No se leyó el período de la declaración.", "No se leyó ninguna jurisdicción de la declaración de Ingresos Brutos.", "La declaración es del CUIT …, que no es de ninguna de tus razones sociales.".

### Declaraciones que el contador deja en el Drive

Si el contador sube las declaraciones a las carpetas de cada mes del Drive, el sistema las carga solo:
- Mira la carpeta de cada mes según la ruta de cada razón social de [Configuración › Google Drive](/config/google-drive) (los últimos tres meses) y, adentro, las subcarpetas cuyo nombre dice **IVA** (no "IVA digital"), **IIBB** o **Ingresos Brutos**, y **Comercio** o **Industria**, y también los archivos sueltos en la carpeta del mes.
- Lee con la IA cada PDF o foto nuevo o cambiado. Si es una declaración, la carga a la razón social de su CUIT (aunque esté en la carpeta de la otra). Si es un cedulón, un VEP o un comprobante de pago, lo saltea (queda anotado como "no es una declaración").
- Una declaración que ya estaba cargada (mismo impuesto, mes y rectificativa) **no se pisa**: puede tener correcciones a mano. Para que se vuelva a leer del Drive, borrala con el tacho de su ficha y apretá **Buscar en el Drive**.
- Cada archivo se lee una sola vez; si se cambia en el Drive, se vuelve a leer. Uno que dio error se vuelve a probar en la próxima búsqueda.
- Busca solo **una vez por noche**, y cuando se aprieta **Buscar en el Drive** (corre de fondo; al terminar aparece el cartel con el resultado).
- **Ver el PDF** / **Bajar el PDF** de una declaración leída del Drive lo trae del Drive (si lo movieron o borraron, avisa).

### Cargar una declaración a mano

**Nueva declaración a mano** → elegí Impuesto, Mes declarado y Rectificativa → **Crear y cargar los importes**. Se abre la ficha en edición con todo en cero: cargá los importes y **Grabar**. En Ingresos Brutos, agregá cada provincia con "Agregar una provincia" y **Grabar** (vuelve a la edición para cargarle los importes).

### Ver la posición del mes en curso

Entrá a la pestaña **Posición del mes**: viene elegido el mes en curso. Para otro mes, elegilo en **Mes**. Los números se recalculan cada vez que se abre la pantalla.

### Corregir una diferencia

En **Diferencias**, cada renglón dice qué no coincide. Puede ser que falte cargar algo en el sistema (una factura de compra, un despacho), que esté cargado con otro importe o en otra provincia, o que la declaración esté mal leída. Corregí lo que corresponda (la factura, o la declaración con el lápiz) y volvé a la pestaña: se recalcula sola.

## Criterios y reglas

### De dónde sale cada número de la posición

- **Débito y crédito de IVA**: los de los [libros de IVA](/administracion/libros-iva) de ese mes y esa razón social (los mismos que se presentan). Las notas de crédito restan.
- **Percepciones de IVA**: las de las facturas de compra registradas y el IVA adicional de los despachos.
- **Base de Ingresos Brutos y de la municipal**: las ventas del mes sin IVA (neto gravado + no gravado + exento de los comprobantes autorizados, en pesos; las notas de crédito restan).
- **Coeficiente y alícuota de cada provincia**: los de la pestaña Provincias. Se cargan solos de la **última declaración de Ingresos Brutos** que se sube si la declaración los trae; el **resumen mensual del CM03** (el que trae sólo impuesto determinado, valores que restan, valores que suman y saldo por provincia) no los trae: la lista de provincias queda cargada y el coeficiente y la alícuota se cargan con el lápiz. Una provincia sin coeficiente da impuesto determinado cero (sale un aviso). Sin provincias cargadas, se usan las de la última declaración.
- **Percepciones de IIBB de las compras**: cada factura de compra registrada, en la provincia que dice la factura (se lee de la factura subida, o se elige en su cabecera en "Provincia de la percepción IIBB"). Si la factura no lo dice, la provincia del proveedor (queda recordada la primera vez que se elige) y si tampoco, la sede (Córdoba).
- **Percepciones aduaneras**: el IIBB de los despachos registrados del mes. **Lo que descuenta Mercado Pago**: los impuestos que Mercado Pago descontó en los cobros del mes, de las cuentas de los canales de esa razón social (las devoluciones restan). Estos dos no dicen la provincia: se **reparten por el coeficiente unificado**. La declaración del contador trae el reparto real, así que en esos renglones puede haber diferencias chicas.
- **Saldos anteriores**: los que dejó la declaración del **mes anterior** (en IIBB, el saldo a favor de cada provincia). Si no está cargada, se usa la última que haya y sale un aviso; si no hay ninguna, cero.

### Cuentas de IVA (F.2002)

- Saldo técnico = débito − crédito − saldo técnico a favor anterior. Si es negativo, queda como **saldo técnico a favor** para el mes siguiente y el impuesto es cero.
- Al impuesto se le restan los pagos a cuenta (percepciones) y el saldo de libre disponibilidad anterior. Lo que sobra queda como **saldo de libre disponibilidad a favor**.

### Ingresos Brutos por provincia

- Base de la provincia = base del mes × coeficiente. Determinado = base de la provincia × alícuota.
- Saldo de la provincia = determinado − percepciones − percepciones aduaneras − retenciones − saldo a favor anterior. Positivo, a pagar; negativo, a favor (queda para esa provincia el mes siguiente).
- Una percepción de una provincia que no está en la lista suma una fila con coeficiente 0: sólo da saldo a favor.

### Municipal de Córdoba

- Determinado = base × alícuota, o el mínimo si es mayor. Saldo = determinado − saldo a favor anterior.
- Sólo para las razones sociales que la pagan (Provincias › Municipalidad de Córdoba › Paga la contribución). Subir una declaración municipal la marca sola.

### Qué se controla en cada declaración

Con más de $ 1 de diferencia:
- **IVA**: débito, crédito y pagos a cuenta contra lo cargado ese mes; saldo técnico y de libre disponibilidad anteriores contra lo que dejó la declaración del mes anterior.
- **Ingresos Brutos**: con el resumen mensual del CM03, en cada provincia los **valores que restan** contra lo que suma Laucen (saldo a favor del mes anterior + percepciones + aduana + Mercado Pago). Con la declaración completa: la base total; en cada provincia, las percepciones, las percepciones aduaneras, retenciones + recaudaciones (contra lo de Mercado Pago) y el saldo a favor anterior contra la declaración del mes anterior.
- **Municipal**: la base y el saldo a favor anterior.

Un mes de antes de empezar a facturar con el sistema da diferencias en las ventas: es normal.

### Cuentas contables de Ingresos Brutos por provincia

Por cada provincia cargada en cualquier razón social se crea sola una cuenta **"IIBB — provincia"** bajo el título **"Ingresos Brutos por provincia"** del activo, en el [plan de cuentas](/administracion/contabilidad). En los asientos de las facturas de compra, cada percepción de IIBB va a la cuenta de su provincia; en los despachos, la percepción aduanera se reparte entre las provincias por coeficiente. Una percepción de una provincia sin cuenta va a la general "Percepciones de IIBB".

## Relacionado

- [Libros de IVA](/administracion/libros-iva)
- [Facturas de compra](/compras/facturas)
- [Despachos de importación](/compras/despachos)
- [Contabilidad](/administracion/contabilidad)
