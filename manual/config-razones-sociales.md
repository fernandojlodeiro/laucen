---
titulo: Razones sociales
menu: Configuración › Razones sociales
ruta: /config/razones-sociales
rutas: /config/razones-sociales
permiso: empresa_config
resumen: Los CUIT con los que opera la organización (cada uno con su ARCA, su facturación, su libro de IVA, sus cuentas corrientes y sus fondos) y cuál es la principal.
---

## Para qué sirve

Una misma organización puede trabajar con **más de una razón social** (más de un CUIT). El stock, el catálogo, los clientes y los proveedores son **uno solo**, de toda la organización. Lo que se separa por razón social es lo fiscal y lo contable:

- la conexión con **ARCA** y los comprobantes que se emiten (cada una con su punto de venta y su numeración);
- los **libros de IVA** (cada CUIT presenta el suyo);
- las **cuentas corrientes** de clientes y proveedores, los **recibos y órdenes de pago**;
- las **cuentas de fondos** (cajas, bancos, Mercado Pago) y los **asientos** de la contabilidad;
- las **facturas de compra** y los **despachos** (a nombre de quién vinieron).

Lo que no se separa: cuando entra mercadería —por una factura de compra, un despacho o una recepción— va al **stock general**, no importa a nombre de cuál razón social venga facturada.

## Cómo se llega

Menú **Configuración › Razones sociales**. Sólo la ve quien tiene el permiso «Empresa». Los datos fiscales que antes se cargaban en [Empresa](/config/empresa) están ahora acá.

## Qué hay en la pantalla

Una lista con: **N.º**, **Razón social** (con su nombre corto y la marca "Principal"), **CUIT**, **Condición IVA**, **Pto. de venta**, **Cuentas de ML y canales** (los canales que facturan con ella) y **ARCA** ("Conectada" o "Sin conectar"; tocarlo lleva a la conexión de esa razón social). Tiene buscador (en todos sus datos: N.º, nombre, razón social, CUIT con o sin guiones, condición IVA, domicilio, ingresos brutos), orden por columna, "Descargar Excel" y el botón **"+ Nueva razón social"** arriba a la derecha.

En cada fila: **"Hacer principal"** (si no lo es), el **lápiz** (la fila se vuelve editable ahí mismo) y el **tacho** (pregunta "¿Borrar?" Sí / No).

Campos de una razón social: **Nombre corto** (para reconocerla en los selectores), **Razón social** (como figura en ARCA), **CUIT**, **Condición IVA**, **Domicilio comercial**, **Punto de venta**, **Ingresos Brutos** e **Inicio de actividades**.

## Cómo se hace

### Cargar una razón social

1. Apretá **"+ Nueva razón social"**, completá los campos y apretá **"Crear"**. La primera que se carga queda como principal.
2. Para que pueda facturar, conectala con ARCA en [Facturación (ARCA)](/config/arca): arriba de esa pantalla elegís la razón social y hacés el trámite del permiso.

### Cambiar cuál es la principal

Apretá **"Hacer principal"** en la fila de la razón social. Desde ese momento, lo que se facture por canales sin razón social propia sale con ella.

### Decidir con cuál se factura cada cuenta de Mercado Libre

En [Canales](/config/canales), con el lápiz del canal, elegís **"Factura con"**. Por ejemplo: tres cuentas de ML con una razón social y dos con la otra.

## Criterios y reglas

- **Con cuál se factura un pedido**: si el canal tiene una razón social elegida ("Factura con"), esa; si no —tienda web, local, mayorista, cualquier canal sin elegir— la **principal**. Una factura ya emitida no se mueve.
- **Cada razón social lleva su numeración de ARCA** (punto de venta, tipo de comprobante y número). Dos razones sociales pueden usar el mismo punto de venta.
- **Facturación automática**: se prende y se configura por razón social, en [Facturación (ARCA)](/config/arca). Cada una factura los pedidos de sus canales.
- **Cuenta de Mercado Pago**: la cuenta de fondos de cada cuenta de ML pertenece a la razón social del canal; si cambiás la razón social del canal, la cuenta de fondos la sigue.
- **La principal no se borra**: primero se elige otra como principal. Tampoco se borra una razón social que ya tiene facturas, compras, cuentas o asientos a su nombre.
- **Cambiar el CUIT** de una razón social conectada con ARCA avisa que el permiso es del CUIT anterior y hay que hacer el trámite de nuevo.
- Lo que ya existía antes de cargar la primera razón social queda a su nombre.
- **Con una sola razón social el sistema se ve igual que siempre**: los selectores de razón social sólo aparecen cuando hay más de una.

## Preguntas frecuentes

**¿Se separa el stock entre razones sociales?**
No. El stock, el catálogo, los precios, los clientes y los proveedores son compartidos.

**Cargo una factura de compra a nombre de la segunda razón social, ¿dónde entra la mercadería?**
Al stock general, igual que si fuera de la primera.

**¿Puedo transferir plata entre cuentas de dos razones sociales?**
No desde Caja y bancos: sería un préstamo entre las empresas y se asienta aparte en [Contabilidad](/administracion/contabilidad).

**¿El plan de cuentas es uno por razón social?**
No: el plan de cuentas es uno solo y compartido; lo que se separa son los asientos (cada asiento pertenece a una razón social) y por eso los libros diario, mayor, sumas y saldos y resultados se miran de una o de todas.

## Relacionado

- [Facturación (ARCA)](/config/arca)
- [Canales](/config/canales)
- [Empresa](/config/empresa)
- [Libros de IVA](/administracion/libros-iva)
- [Contabilidad](/administracion/contabilidad)
- [Cuentas corrientes](/administracion/cuentas-corrientes)
- [Caja y bancos](/administracion/tesoreria)
