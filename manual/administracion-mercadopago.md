---
titulo: Mercado Pago
menu: Administración › Mercado Pago
ruta: /administracion/mercadopago
rutas: /administracion/mercadopago
permiso: mercadopago_ver
resumen: El saldo de Mercado Pago de cada cuenta de Mercado Libre, leído en el momento: total, disponible, a liberar y todos sus desgloses, con un total de todas las cuentas. Sólo lectura.
---

## Para qué sirve

Muestra **cuánta plata hay en el Mercado Pago de cada cuenta de Mercado Libre** en este momento: el saldo total, lo **disponible** y lo **no disponible** (cobrado pero todavía no liberado), y todos los desgloses que manda Mercado Pago (por ejemplo, lo no disponible por motivo: plazo de liberación, reclamos, revisión). **Sólo lee**: no mueve plata ni cambia nada en Mercado Pago.

## Dónde está

Menú **Administración › Mercado Pago**.

## Qué se ve

- **Saldos**: una columna por cuenta de Mercado Libre y una de **Total**. Cada renglón es un número que manda Mercado Pago, con su nombre en castellano cuando se conoce (si no, el nombre original). Los renglones principales van en negrita; los desgloses, corridos a la derecha. Abajo, **"Leído"**: la fecha y hora de la lectura de cada cuenta. Si una cuenta no contestó en ese momento, se ve su última lectura guardada, marcada "(lectura anterior)".
- **Conexión**: por cada cuenta, "Leído" en verde y de dónde salió el saldo, o "Sin saldo" en rojo y qué contestó Mercado Pago en cada intento (por ejemplo "sin permiso con esta llave").
- **Llave de Mercado Pago de cada cuenta (opcional)**: si está "Cargada" o "Sin cargar", con el lápiz para cargarla o cambiarla y el tacho para borrarla.

## Cómo se hace

### Ver los saldos de ahora

Abrí la pantalla: lee el saldo de todas las cuentas en ese momento. Para volver a leer, **"↻ Actualizar"** (arriba a la derecha).

### Cargar la llave de Mercado Pago de una cuenta

Sólo hace falta si en "Conexión" esa cuenta dice "Sin saldo" por falta de permiso.

1. En developers de Mercado Pago, entrando **con esa cuenta**, abrí tu aplicación → **Credenciales productivas** y copiá el **Access Token** (empieza con `APP_USR-`).
2. En la caja "Llave de Mercado Pago de cada cuenta", tocá el **lápiz** de esa cuenta, pegala y apretá **"Grabar"**.
3. Apretá **"↻ Actualizar"**.

La llave nunca se vuelve a mostrar: sólo dice si está cargada.

## Criterios

- **De dónde lee**: primero con la conexión de Mercado Libre de la cuenta (la cuenta de Mercado Pago es el mismo usuario); si no alcanza, con la llave de Mercado Pago cargada para esa cuenta. Se prueban las dos direcciones del saldo que da Mercado Pago y se usa la primera que contesta con números.
- **Total**: la suma de las cuentas (en pesos).
- Cada lectura queda guardada, para poder ver más adelante cómo fue cambiando el saldo y hacer análisis.
