---
titulo: Facturación electrónica (ARCA)
menu: Configuración › Facturación (ARCA)
ruta: /config/arca
rutas: /config/arca
permiso: facturacion_ver
resumen: Conectar Laucen con ARCA (permiso o certificado, CUIT, punto de venta, facturación real o de prueba) y configurar la facturación automática.
---

## Para qué sirve

Para que Laucen pueda emitir facturas electrónicas a nombre de la empresa. Acá se hace, una sola vez, el trámite del "permiso" de ARCA (el certificado digital), se elige el punto de venta, se prueba la conexión y se prende o apaga la facturación automática de los pedidos.

En pantalla no se habla de "homologación" ni de "producción": la producción se llama **"Facturación real"** y la homologación **"Prueba contra ARCA"**.

Los datos fiscales que van impresos en la factura (condición frente al IVA, domicilio, Ingresos Brutos, inicio de actividades y logo) **no** se cargan acá sino en [Empresa](/config/empresa).

## Cómo se llega

- Menú **Configuración › Facturación (ARCA)**.
- Desde [Facturación](/administracion/facturacion), con el botón **"Configuración"** o el enlace **"Ir a Configuración"** del aviso.
- La dirección vieja /administracion/facturacion/config lleva sola acá.

## Qué hay en la pantalla

Título "Facturación electrónica (ARCA)" y, debajo, el enlace **"Ver facturas"** a [Facturación](/administracion/facturacion).

### Si todavía no está conectado

Un recuadro **"Conectar con ARCA"** con el formulario para empezar el trámite:
- **Razón social, como figura en ARCA**
- **CUIT con el que facturás** (con o sin guiones, ej. 30-71234567-8)
- **Punto de venta** (número entero)
- Botón **"Preparar el trámite en ARCA"** (facturación real).
- Desplegable **"Sólo para pruebas"** con el botón **"Preparar trámite de prueba contra ARCA"**.

Una vez empezado el trámite, se ve un cartel amarillo ("El trámite está empezado, a nombre de … (CUIT …). Faltan estos tres pasos…") y los tres pasos (ver "Cómo se hace"), más el desplegable **"Empezar el trámite de nuevo"** con el botón **"Generar otro"**.

### Si ya está conectado

- Un cartel verde "Conectado como <razón social>." (o rojo "El permiso de ARCA venció: hay que hacer el trámite de nuevo."). En modo prueba agrega "Estás probando contra ARCA: los comprobantes salen pero no valen."
- Datos: **CUIT**, **Punto de venta**, **Modo** (Facturación real / Prueba contra ARCA), **El permiso vence** (fecha, con la marca "Por vencer" si faltan menos de 30 días o "Vencido").
- Botón **"Probar conexión con ARCA"**.
- Interruptor **"Facturar automáticamente"**, con la ayuda "Factura sola cada pedido que llega a "…". Al prenderla, los pedidos que ya habían pasado no se facturan: sólo los que lleguen de ahora en adelante."
- **"Facturar al llegar el pedido a"**: se ve en modo vista; el **lápiz** lo vuelve editable (desplegable Pagado / Preparado / Despachado) y en su lugar quedan **"Grabar"** y **"Cancelar"**.
- Desplegable **"Cambiar o desconectar"**: el formulario para **"Hacer el trámite de nuevo"** (o los pasos, si hay uno empezado) y el botón **"Desconectar ARCA"**, que pregunta ahí mismo "¿Desconectar? Hasta hacer el trámite de nuevo no se puede facturar."

Al pie: "La condición frente al IVA, el domicilio, Ingresos Brutos y el logo de las facturas se cargan en [Empresa](/config/empresa)."

## Cómo se hace

### Conectar Laucen con ARCA (facturación real)

1. Completá **Razón social, como figura en ARCA**, **CUIT con el que facturás** y **Punto de venta**, y apretá **"Preparar el trámite en ARCA"**. Aviso: "Listo, ya tenés el archivo del trámite. Seguí los pasos."
2. **Paso 1 – "Bajá el archivo del trámite"**: apretá **"Bajar el archivo"**. Baja un archivo "laucen-produccion.csr". Es el pedido que ARCA necesita; no tiene nada secreto.
3. **Paso 2 – "Llevalo a ARCA y traé el permiso"** (lo hace quien tiene la clave fiscal, en el sitio de ARCA):
   - Entrá con la clave fiscal a **Administración de Certificados Digitales**.
   - Agregá un alias (ej. laucen), subí el archivo que bajaste y guardá el certificado que te devuelven.
   - En **Administrador de Relaciones de Clave Fiscal** → Nueva relación, autorizá ese alias para **Facturación electrónica** (wsfe) y **Consulta de constancia de inscripción** (ws_sr_constancia_inscripcion). Sin eso el permiso existe pero no puede facturar.
   - El punto de venta tiene que estar dado de alta en **Administración de puntos de venta** como "Factura electrónica – Web services".
4. **Paso 3 – "Subí acá lo que te dio ARCA"**: apretá **"Elegir el archivo que te dio ARCA"** (.crt, .pem, .cer o .txt) o abrí **"…o pegá su contenido"** y pegá el texto (empieza con -----BEGIN CERTIFICATE-----). Apretá **"Conectar"**.
5. Si está bien: "Listo, quedó conectado. El permiso vale hasta el dd/mm/aaaa."
6. Apretá **"Probar conexión con ARCA"** para confirmar.

Errores típicos del paso 3:
- "Eso no parece un certificado (.crt / .pem): tiene que empezar con -----BEGIN CERTIFICATE-----."
- "Ese certificado no es del último pedido (CSR) generado en Laucen." → el certificado se sacó con un archivo viejo; hay que llevar a ARCA el último archivo bajado.
- "Falta el permiso de ARCA: elegí el archivo que te devolvieron o pegá su contenido."

Errores típicos del paso 1:
- "Falta la razón social, como figura en ARCA."
- "El punto de venta es un número entre 1 y 99998, el que te asignó ARCA."
- Un CUIT que no tiene 11 dígitos se rechaza.

### Hacer el trámite de prueba contra ARCA

Es para probar el circuito sin que las facturas valgan. Es otro trámite, en otro sitio de ARCA, y su permiso no sirve para facturar de verdad.

1. En el formulario, abrí **"Sólo para pruebas"** y apretá **"Preparar trámite de prueba contra ARCA"**.
2. Bajá el archivo ("laucen-homologacion.csr").
3. En ARCA, con clave fiscal, abrí **WSASS – Autogestión Certificados Homologación** (si no aparece, adherilo en el Administrador de Relaciones). Nuevo certificado: un nombre, pegá el contenido del archivo y guardá el certificado. Después "Crear autorización a servicio" para **wsfe** y **ws_sr_constancia_inscripcion**.
4. Subilo en el paso 3 y apretá **"Conectar"**.

### Probar la conexión

Apretá **"Probar conexión con ARCA"**. Laucen le pregunta a ARCA el último número autorizado del punto de venta. Si contesta ("ARCA contesta: el último número de factura B del punto de venta 3 es 41."), el certificado, los servicios y el punto de venta están bien. Pregunta por la factura B si la empresa es Responsable Inscripto, o por la C si es monotributo o exento.

### Prender la facturación automática

1. Con ARCA conectado, elegí en qué estado se factura: tocá el **lápiz** al lado de **"Facturar al llegar el pedido a"**, elegí **Pagado**, **Preparado** o **Despachado** y apretá **"Grabar"**.
2. Prendé el interruptor **"Facturar automáticamente"**.
3. El aviso confirma: "Facturación automática prendida: se facturan los pedidos que lleguen a "…" de ahora en adelante." y, si había, cuántos cambios de estado anteriores quedaron como vistos.

### Renovar el permiso o cambiar CUIT o punto de venta

1. Abrí **"Cambiar o desconectar"**.
2. Completá el formulario de **"Hacer el trámite de nuevo"** y apretá **"Preparar el trámite en ARCA"**.
3. Seguí los tres pasos. Mientras tanto, el permiso actual sigue andando hasta que conectes el nuevo (salvo lo que se explica en "Criterios y reglas").

### Desconectar

Abrí **"Cambiar o desconectar"**, apretá **"Desconectar ARCA"** y confirmá. Aviso: "Listo, se desconectó. Los comprobantes que ya emitiste siguen donde estaban."

## Criterios y reglas

- **La clave privada nunca sale del servidor.** Laucen la genera (RSA de 2048 bits) junto con el pedido de certificado; lo único que se baja es el pedido (el archivo .csr), que no es secreto.
- **Un trámite por modo.** Hay un juego clave/certificado para "Facturación real" y otro para "Prueba contra ARCA". Generar un archivo nuevo de un modo **descarta el anterior de ese modo**: el certificado que ARCA haya dado con el archivo viejo deja de servir. Si el trámite nuevo es del mismo modo en el que estás conectado, **la conexión actual se corta** hasta que conectes el nuevo.
- **Al preparar el trámite** se guardan (o corrigen) la razón social, el CUIT y el punto de venta. Si es la primera vez, la empresa queda en el modo del trámite. Si ya había conexión, el modo **no cambia hasta que conectes** el certificado nuevo: lo que ya factura sigue facturando.
- **Al conectar**, Laucen verifica que el certificado corresponda a la última clave generada y guarda su fecha de vencimiento. La empresa pasa a facturar en el modo de ese certificado.
- **Vencimiento**: la pantalla marca "Por vencer" cuando faltan menos de 30 días y "Vencido" cuando ya pasó. Con el permiso vencido no se puede facturar: hay que hacer el trámite de nuevo.
- **Acceso a ARCA**: Laucen pide a ARCA un "ticket" de acceso que dura 12 horas y lo reusa mientras sirve. Al conectar o generar un archivo nuevo se descarta el ticket guardado.
- **Desconectar** borra la clave y el certificado del modo en uso y **apaga la facturación automática**. Los comprobantes ya emitidos quedan.
- **Facturación automática**:
  - Se puede facturar al llegar a **Pagado**, **Preparado** o **Despachado** (no otros estados).
  - Al prenderla, todos los cambios de estado de pedidos que estaban sin procesar se marcan como vistos: **no salen de golpe facturas de pedidos viejos**.
  - Corre en la revisión periódica de Laucen (cada 2 minutos, si hay algo pendiente). El detalle de qué pedidos se facturan y cuáles se saltean está en [Facturación](/administracion/facturacion).
  - Apagarla no afecta lo ya facturado.
- **Datos fiscales**: si todavía no hay datos de la empresa, las acciones que los necesitan avisan "Primero cargá los datos fiscales (CUIT y razón social) en Configuración → Empresa." En la práctica, el CUIT y la razón social se cargan también con el formulario del trámite.

## Preguntas frecuentes

**¿Quién tiene que hacer el trámite en ARCA?**
Alguien con la clave fiscal de la empresa. Laucen sólo prepara el archivo y recibe el certificado.

**Perdí el archivo del trámite, ¿qué hago?**
Lo podés volver a bajar con "Bajar el archivo" mientras el trámite esté empezado. Si querés empezar de cero, "Empezar el trámite de nuevo" → "Generar otro".

**Dice "Ese certificado no es del último pedido (CSR) generado en Laucen".**
Generaste otro archivo después de hacer el trámite en ARCA. Hay que llevar a ARCA el último archivo y subir el certificado nuevo.

**La conexión está bien pero ARCA no deja facturar.**
Revisá que el certificado esté autorizado para Facturación electrónica (wsfe) en el Administrador de Relaciones, y que el punto de venta sea de tipo "Factura electrónica – Web services". Usá "Probar conexión con ARCA".

**¿Cuánto dura el permiso?**
Lo que ARCA haya puesto en el certificado; la fecha se ve en "El permiso vence".

**Prendí la facturación automática, ¿se van a facturar los pedidos de ayer?**
No. Sólo los que lleguen al estado elegido de ahí en adelante. Los anteriores se facturan a mano desde cada pedido.

**¿Dónde cargo el domicilio y la condición de IVA que salen en la factura?**
En [Empresa](/config/empresa).

**¿Para qué sirve la prueba contra ARCA?**
Para probar el circuito: las facturas salen pero no tienen validez fiscal.

## Relacionado

- [Facturación](/administracion/facturacion)
- [Empresa](/config/empresa)
- [Pedidos](/ventas/pedidos)
- [Canales](/config/canales)
