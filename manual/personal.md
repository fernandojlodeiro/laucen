---
titulo: Espacio personal
menu: Botón «Personal» de la barra de arriba
ruta: /personal
rutas: /personal
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
3. También baja, tal cual, todos los reportes que Mercado Pago ya tenía armados de esa cuenta (aunque sean de años anteriores), y ajusta el reporte de todas las transacciones para que incluya los retiros a banco y la hora argentina.

## Criterios y reglas

- Los meses van de 00:00 del día 1 a las 23:59:59 del último día, en hora argentina.
- La consulta de pagos de Mercado Pago llega sólo hasta alrededor de un año atrás; lo anterior se saca de los reportes.
- «Todos los pagos de la cuenta» trae lo que la cuenta cobró y también lo que pagó; «Pagos hechos» trae sólo lo que pagó. Para no contar dos veces, el sentido de cada pago se mira en el detalle, no por el archivo en que vino.
- Un archivo se guarda tal cual vino. Si se baja dos veces sin cambios, no se repite; si Mercado Pago lo rearmó distinto, queda la versión nueva al lado.
- Desconectar una cuenta borra su llave y todo lo que se bajó de ella.
- Mientras algo corre, los demás botones esperan: se hace una cosa por vez.
- En la exportación del año, cada mes se pide por separado (Mercado Pago no arma más de 60 días por reporte). Si Mercado Pago no contesta o no arma un reporte, se vuelve a pedir con espera; después de varios intentos queda «Falló» con el motivo. Nunca se da un mes por bajado si Mercado Pago no lo entregó. Volver a apretar el botón no repite los meses que ya están en la cola.

## Relacionado

- [Mercado Pago de la empresa](/administracion/mercadopago): los saldos de las cuentas de la empresa, que se conectan desde cada canal.
