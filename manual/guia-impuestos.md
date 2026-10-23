---
titulo: Compras, libros de IVA e impuestos (guía resumida)
menu: Compras › Facturas de compra · Administración › Libros de IVA · Administración › Impuestos (guía resumida)
ruta: /administracion/impuestos
rutas: /compras/facturas, /administracion/libros-iva, /administracion/impuestos
permiso: impuestos_ver
resumen: El circuito del mes en pocas páginas: cargar los comprobantes de compra, controlarlos con ARCA, armar y mandar los libros de IVA, y leer las declaraciones de IVA, Ingresos Brutos y la municipal en la pantalla Impuestos.
---

## El mes en cinco pasos

Las facturas de compra se cargan a medida que llegan, ARCA las controla a fin de mes y con eso salen los libros de IVA y la posición de impuestos.

1. **Durante el mes**: cada factura de gasto se sube en PDF o foto ([Facturas de compra](/compras/facturas) › «Subir factura»). Mercadería e importaciones se cargan con sus productos o su despacho.
2. **Fin de mes**: se baja «Mis Comprobantes – Recibidos» de ARCA y se importa. El sistema valida lo cargado, marca las diferencias y agrega lo que faltaba.
3. **Libros de IVA**: se revisan los avisos y se mandan los TXT al Drive del contador con un botón.
4. **Declaraciones**: el contador deja las declaraciones en el Drive y el sistema las lee solo cada noche.
5. **Impuestos**: la pantalla compara cada declaración con lo cargado y muestra cómo viene el mes en curso.

## Carga de comprobantes de compra

La forma normal es subir el PDF: la IA lee la factura, la arma y, si el proveedor ya tiene cuenta de gasto, la deja registrada.

| Qué es | Dónde | Cómo |
| --- | --- | --- |
| Gastos y servicios | Compras › Facturas de compra | «Subir factura» (PDF o foto). El archivo queda guardado: «Ver» o «Bajar la factura». |
| Mercadería | Compras › Facturas de compra | «+ Nueva factura» y las líneas con sus productos: entra el stock y se actualiza el costo. |
| Importación | Compras › Despachos de importación | «Subir despacho (PDF)»: la IA lee el despacho, gastos e impuestos. La factura del exterior va aparte, letra E. |

- **Cuenta de gasto**: cada proveedor tiene la suya y queda recordada. Si no tiene, la factura queda en borrador hasta que se elija o se cree en la cabecera.
- **Percepción de IIBB**: va a la provincia que dice la factura. Si no lo dice, a la del proveedor, y si tampoco, a Córdoba. Se cambia en «Provincia de la percepción IIBB» de la cabecera.
- **Corregir una registrada**: «Volver a borrador», corregir y «Registrar». Con productos no se puede: va una nota de crédito o de débito.

## Control con ARCA a fin de mes

El archivo de Mis Comprobantes no carga todo de nuevo: controla lo que ya está cargado y agrega solamente lo que falta.

1. En ARCA: Mis Comprobantes › Recibidos, el mes, bajar el Excel o el CSV.
2. En [Facturas de compra](/compras/facturas): «Importar de ARCA (Mis Comprobantes)» › elegir el archivo › «Subir y ver».
3. Revisar la vista previa: a cada proveedor nuevo hay que elegirle la cuenta de gasto.
4. Botón verde «Importar … y validar …».

| Resultado | Qué significa | Qué hacer |
| --- | --- | --- |
| Validada (✓✓) | Estaba cargada con su comprobante e igual en ARCA | Nada |
| Diferencias | Cargada con otro total, fecha o moneda, o todavía en borrador | Corregir la factura y volver a subir el archivo |
| Nueva | No estaba cargada | Se carga y queda «De ARCA», sin comprobante |
| Con error | Los importes no cierran | Cargarla a mano |

Subir dos veces el mismo mes no duplica nada.

## Libros de IVA

[Libros de IVA](/administracion/libros-iva) arma el libro de ventas y el de compras de cada razón social, mes por mes, y los archivos para ARCA.

- **Arriba**: el resumen del mes por alícuota. Débito menos crédito da el saldo técnico.
- **Pestañas**: «IVA Ventas» (las facturas emitidas), «IVA Compras» (facturas de compra y despachos) y «Avisos» (lo que conviene revisar antes de presentar).
- **Al pie, Libro de IVA Digital**: «Bajar los 5 archivos (.zip)» o «Mandar al Drive». El segundo deja los TXT en la carpeta del mes del Drive (año › mes › IVA DIGITAL) y crea las carpetas si faltan.
- Las facturas del exterior (letra E) no entran: el IVA de la importación va por el despacho.
- La ruta de las carpetas del Drive de cada razón social se carga una sola vez, en [Configuración › Google Drive](/config/google-drive).

## Impuestos y declaraciones juradas

[Impuestos](/administracion/impuestos) junta IVA, Ingresos Brutos por Convenio Multilateral y la municipal de Córdoba de cada razón social.

- **De dónde salen las declaraciones**: el contador las deja en las subcarpetas IVA, IIBB y Comercio e Industria de cada mes del Drive. El sistema las lee solo cada noche, o con «Buscar en el Drive». Los cedulones y pagos los saltea. También se puede «Subir declaración» a mano.
- **Revisar cada una**: abrirla, comparar los importes con el PDF («Ver el PDF») y corregir con el lápiz si algo está mal leído.
- **Ingresos Brutos se lleva provincia por provincia**: cada una tiene su coeficiente unificado (sale del CM05 anual), su alícuota, sus percepciones y su saldo. Una puede dar a pagar y otra a favor.
- **Las percepciones de IIBB** de las facturas de compra van a su provincia. Las de la aduana y lo que retiene Mercado Pago se reparten por coeficiente.
- **Contabilidad**: cada provincia tiene su cuenta «IIBB — provincia» y ahí van sus percepciones.
- **Una vez por año**: con el CM05 nuevo, actualizar los coeficientes en la pestaña «Provincias».

## Cómo leer las pestañas de Impuestos

**Posición del mes** es el termómetro: con lo facturado y lo cargado hasta hoy, más el saldo a favor que dejó la declaración del mes anterior, muestra cuánto va dando cada impuesto (en rojo, a pagar; en verde, a favor). En IIBB lo muestra provincia por provincia y se mueve todos los días. Los carteles amarillos de arriba dicen qué le falta para calcular bien. **Declaraciones** es el archivo: lo que presentó el contador, mes por mes, con lo que dio a pagar o a favor y si coincide con lo cargado («✓ Coincide» o «N diferencias»). **Diferencias** es la lista de tareas: cada renglón es algo en que la declaración y el sistema no coinciden por más de $ 1. Puede ser una factura que falta cargar, un importe distinto o un dato mal leído, y se corrige en la factura o en la declaración. **Provincias** es la configuración: el coeficiente y la alícuota de cada jurisdicción, y si la empresa paga la municipal; si ahí falta un número, la posición de esa provincia da cero.
