---
titulo: Espacio personal
menu: Botón «Personal» de la barra de arriba
ruta: /personal
rutas: /personal, /personal/gastos, /personal/gastos/revisar, /personal/gastos/destinatarios, /personal/gastos/proveedores
permiso: fer
resumen: Un lugar aparte de la empresa para conectar cuentas personales de Mercado Pago y bajar su información (reportes y pagos), que sólo ve quien creó la organización y las personas que él autoriza.
---

## Para qué sirve

Sirve para conectar **cuentas personales de Mercado Pago** y sacar su información (movimientos, pagos hechos y recibidos, reportes de Mercado Pago) **sin mezclarla con los datos de la empresa**. Lo que se conecta y se baja acá no aparece en ninguna pantalla, informe, búsqueda ni consulta del asistente de la empresa, y lo de la empresa tampoco aparece acá. **Sólo lee** de Mercado Pago y le pide reportes: nunca mueve plata, paga, transfiere ni cambia permisos.

## Cómo se llega

Con el botón **«Personal»** de la barra de arriba, al lado de «Salir» (en el celular, el candado 🔒 de la franja de arriba), o en [Espacio personal](/personal). El botón aparece sólo a quien puede entrar.

## Quién puede entrar

- **El dueño**: la persona que creó la organización (su superadministrador de nacimiento). Su espacio se crea solo la primera vez que entra.
- **Quien el dueño autorice**: en la sección «Quién más puede entrar», con el botón «Autorizar a alguien» y el mail de la persona (tiene que ser un usuario del sistema). El tacho de su fila le saca el acceso.
- Nadie más, aunque sea superadministrador o tenga todos los permisos de la empresa. Las personas autorizadas pueden ver, conectar cuentas y bajar información, pero no autorizar a otras ni desconectar cuentas.

## Qué hay en la pantalla

- **Cuentas de Mercado Pago**: cada cuenta conectada, su número en Mercado Pago, si está conectada, cuándo se conectó y los botones para sacar información.
- **Qué se puede sacar de cada cuenta**: después del inventario, el titular, la fecha de alta y desde cuándo hay datos en cada fuente (todos los pagos de la cuenta, los que hizo la cuenta y los reportes que Mercado Pago ya tiene armados).
- **Exportación del año**: por cada cuenta, mes por mes, cómo va cada fuente: «En cola», «Armándose» (Mercado Pago lo está preparando), «Bajado», «Sin movimientos» (Mercado Pago lo entregó vacío) o «Falló» (con el motivo). Arriba de cada tabla, cómo quedó la configuración de los reportes y los reportes viejos que ya estaban armados.
- **Lo último que se hizo**: lo que se pidió y cómo terminó.
- **Archivos bajados**: los archivos tal cual los entregó Mercado Pago, con su tamaño, cuándo se bajaron y una comprobación (para saber si dos archivos son idénticos). Tocando el nombre se baja.
- **Qué contestó Mercado Pago**: cada pedido y su respuesta, para revisar si algo falló.

## Cómo se hace

### Conectar una cuenta personal

1. Si el navegador tiene abierta la cuenta de Mercado Pago de la empresa, cerrá esa sesión en Mercado Pago.
2. Apretá «Conectar cuenta de Mercado Pago» (arriba a la derecha).
3. Entrá a Mercado Pago con la cuenta personal y aprobá la aplicación.
4. Volvés solo al espacio personal, con la cuenta en la lista.

### Saber qué se puede sacar

Apretá «Hacer inventario» en la fila de la cuenta. Trabaja de fondo (podés ir a otra pantalla) y la pantalla se actualiza sola al terminar.

### Bajar un mes

1. En la columna «Un mes», elegí el mes y apretá «Pedir reportes y pagos»: le pide a Mercado Pago el reporte de todas las transacciones y el de liquidaciones de ese mes, baja todos los pagos de la cuenta y, aparte, los que hizo la cuenta, y espera unos minutos a que Mercado Pago arme los reportes para bajarlos también. Trabaja de fondo: podés ir a otra pantalla.
2. Si al terminar dice que algún reporte todavía no estaba, esperá unos minutos y, con el mismo mes elegido, apretá «Bajar reportes del mes».

### Exportar el año entero

1. En la fila de la cuenta, apretá «Exportar … – hoy» (columna «El año»): pone en cola los doce meses cerrados hasta el mes pasado y el mes en curso hasta este momento.
2. No hace falta quedarse mirando: el sistema pide y baja todo de a poco, de fondo, y la sección «Exportación del año» muestra cómo va.
3. A la derecha del título «Exportación del año» se baja, en cualquier momento, lo que haya hasta ahí:
   - «Movimientos (.zip)»: los movimientos de todas las cuentas juntos (consolidado, sin duplicados) y uno por cuenta, en CSV, cada fila con el titular, su CUIT o DNI y el número de cuenta de Mercado Pago; más la cobertura por cuenta y mes (qué quedó completo y qué no), los controles de saldo, el diccionario de campos y el manifiesto. Quien creó la organización ve también, en el mismo consolidado, las cuentas de Mercado Pago de la empresa.
   - «Excel (.zip)»: lo mismo en un Excel con hojas Movimientos, Cuentas, Cobertura, Controles y Diccionario.
   - Debajo del título, «Originales»: un archivo por cuenta con los reportes tal cual los entregó Mercado Pago y las respuestas de su API, con la lista de archivos y su comprobación.
4. También baja, tal cual, todos los reportes que Mercado Pago ya tenía armados de esa cuenta (aunque sean de años anteriores), y ajusta el reporte de todas las transacciones para que incluya los retiros a banco y la hora argentina.

### Ver mis gastos

1. Apretá «Mis gastos» (arriba a la derecha del espacio personal).
2. Arriba están los números grandes: el gasto de los últimos 12 meses cerrados, el promedio por mes, cuánto es fijo (recurrente) y cuánto eventual, y cuánto queda sin clasificar.
3. Debajo: el gasto por mes (la última barra, más clara, es el mes en curso), por tipo de gasto, una tabla de tipo de gasto por mes, a quién se le pagó más y, aparte, lo que no es gasto.
4. Si sos quien creó la organización, también suma los pagos hechos con cuentas de la empresa que se marcaron como personales, y los muestra en su propia sección.

Mis gastos tiene cuatro pestañas: «Tablero», «Sin clasificar», «Destinatarios» y «Proveedores».

### Clasificar un gasto

1. En «Mis gastos», pestaña «Sin clasificar».
2. Elegí qué ver (de entrada, los gastos sin clasificar), el mes, o buscá por descripción o destinatario.
3. Apretá el lápiz de la fila: elegí el tipo de gasto, a quién corresponde (personal, empresa, mixto) y si es recurrente o eventual.
4. Si tildás «Aplicar a todo lo de este destinatario» (o «a todo lo que diga…»), queda como regla: de ahí en adelante esos pagos se clasifican solos.
5. «Grabar». Para que algo deje de contar como gasto, elegí como tipo, por ejemplo, «Transferencia entre cuentas propias».

### Ponerle proveedor y tipo de gasto a una cuenta destino

1. En «Mis gastos», pestaña «Destinatarios». Cada fila es una cuenta a la que salió plata: el CBU o CVU (sale del mail de Mercado Pago «Tu transferencia fue enviada») o, para una cuenta de Mercado Pago, el número de usuario; con el titular y el banco que trae el mail, cuántas veces, cuánto en 12 meses y la última vez. De entrada se ven las que no tienen proveedor, de mayor a menor plata.
2. Apretá el lápiz de la fila. En «Proveedor» buscá el proveedor o escribí uno nuevo y apretá «+ Crear «…»».
3. Elegí el tipo de gasto, a quién corresponde y si es recurrente o eventual, y apretá «Grabar».
4. Si el mismo comercio te pide la plata a otra cuenta, a esa fila le elegís el mismo proveedor: un proveedor puede tener todas las cuentas que haga falta.
5. Para que lo que va a una cuenta no cuente como gasto (por ejemplo, una cuenta tuya en otro banco), elegí como tipo «Transferencia entre cuentas propias».

### Proveedores

1. En «Mis gastos», pestaña «Proveedores»: cada proveedor con su tipo de gasto, cuántas cuentas tiene (tocá el número para verlas), cuántos pagos y cuánto en 12 meses.
2. El lápiz cambia el nombre y el tipo de gasto, que vale para todas sus cuentas. El tacho lo borra (pregunta «Sí / No» ahí mismo) y sus cuentas quedan sin proveedor.

## Criterios y reglas

- Los meses van de 00:00 del día 1 a las 23:59:59 del último día, en hora argentina.
- La consulta de pagos de Mercado Pago llega sólo hasta alrededor de un año atrás; lo anterior se saca de los reportes.
- «Todos los pagos de la cuenta» trae lo que la cuenta cobró y también lo que pagó; «Pagos hechos» trae sólo lo que pagó. Para no contar dos veces, el sentido de cada pago se mira en el detalle, no por el archivo en que vino.
- Un archivo se guarda tal cual vino. Si se baja dos veces sin cambios, no se repite; si Mercado Pago lo rearmó distinto, queda la versión nueva al lado.
- Desconectar una cuenta borra su llave y todo lo que se bajó de ella.
- Gasto es la plata que salió y no es: una transferencia entre cuentas propias (de la persona o de sus empresas), un retiro a un banco propio, ni un movimiento sin efecto en el saldo. Los ingresos, las devoluciones recibidas y los rendimientos se muestran aparte y nunca se suman.
- Una transferencia a un CBU o CVU desde la cuenta personal (Mercado Pago la llama «retiro») es un gasto, salvo que el titular de la cuenta destino sea el dueño (por su nombre, en el mail). Mercado Pago no informa a qué cuenta fue: eso sale del mail «Tu transferencia fue enviada», que se busca en el correo del dueño y se empareja con el movimiento por importe y hora (salen con segundos de diferencia; hasta 30 minutos). Una transferencia sin su mail queda como «Transferencias a terceros» y se clasifica de a una.
- Cada gasto se clasifica así, en este orden: lo marcado a mano; el proveedor de la cuenta destino; una regla guardada; y si no, reglas fijas por el tipo de movimiento y por palabras de la descripción (impuestos, telefonía, servicios, expensas, suscripciones, transporte, supermercado, salud, viajes, educación). Lo que no encaja queda «Sin clasificar». Una transferencia a otra persona queda como «Transferencias a terceros» hasta que se la clasifique.
- El total de 12 meses son los doce meses cerrados hasta el mes pasado; el mes en curso se muestra pero no se suma.
- Un retiro a banco que el reporte de todas las transacciones no trae (por ejemplo, de un mes pedido antes de que el reporte incluyera los retiros) se toma de su fila original del reporte de liquidaciones, con su fecha, su número y su importe; esas filas dicen «Liquidaciones» en la columna fuente. Los reportes de Mercado Pago no informan la cuenta de destino de los retiros.
- En la exportación, cada movimiento aparece una sola vez aunque venga en varios reportes que se pisan. El importe neto es el efecto en el saldo y ya descuenta comisiones e impuestos. Las monedas no se convierten. La clasificación es sólo una propuesta y queda aparte de los datos de Mercado Pago.
- Mientras algo corre, los demás botones esperan: se hace una cosa por vez.
- En la exportación del año, cada mes se pide por separado (Mercado Pago no arma más de 60 días por reporte). Si Mercado Pago no contesta o no arma un reporte, se vuelve a pedir con espera; después de varios intentos queda «Falló» con el motivo. Nunca se da un mes por bajado si Mercado Pago no lo entregó. Volver a apretar el botón no repite los meses que ya están en la cola.

## Relacionado

- [Mercado Pago de la empresa](/administracion/mercadopago): los saldos de las cuentas de la empresa, que se conectan desde cada canal.
