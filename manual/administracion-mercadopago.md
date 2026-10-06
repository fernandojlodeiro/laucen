---
titulo: Mercado Pago
menu: Administración › Mercado Pago
ruta: /administracion/mercadopago
rutas: /administracion/mercadopago
permiso: mercadopago_ver
resumen: Los números de cada cuenta de Mercado Pago conectada, leídos en el momento: saldo total, disponible, a liberar, próxima liberación y lo cobrado en los últimos 30 días, con un total. Sólo lectura.
---

## Para qué sirve

Muestra **cuánta plata hay en cada cuenta de Mercado Pago** conectada a Laucen y cuánta está por liberarse, y lo cobrado en los últimos 30 días. **Sólo lee**: no mueve plata ni cambia nada en Mercado Pago.

## Dónde está

Menú **Administración › Mercado Pago**. Las cuentas se conectan desde [Canales](/config/canales) (caja "Cuenta de Mercado Pago" de cada canal, botón **"Conectar Mercado Pago"**).

## Qué se ve

- **Resumen**: una columna por cuenta de Mercado Pago (con los canales en que está debajo del nombre) y una de **Total**. Renglones:
  - **Saldo total** = disponible + a liberar.
  - **Disponible**: la plata liberada, según el último Reporte de Liquidaciones de Mercado Pago.
  - Si el reporte de una cuenta no trae la columna de saldo, Laucen se la agrega a la configuración del Reporte de Liquidaciones de esa cuenta en Mercado Pago (sólo suma esa columna; lo demás queda igual) y pide uno nuevo.
- **A liberar**: los cobros aprobados que todavía no se liberaron (lo neto, ya descontadas las comisiones), con cuántos pagos son, cuánto se libera en los próximos 7 días y la próxima liberación (monto y día).
  - **Cobrado en los últimos 30 días**: el bruto, cuántos pagos, las comisiones y cargos (lo que se quedan Mercado Pago y Mercado Libre: bruto menos neto recibido menos devuelto), lo neto recibido y lo devuelto.
  - **Leído**: cuándo se leyó cada cuenta y a qué fecha es el disponible.
- **Qué contestó Mercado Pago**: por cada cuenta, "Todo leído" en verde, "Con problemas" en amarillo o "Desconectada" en rojo, y el resultado de cada consulta.
- Abajo, los **canales sin cuenta de Mercado Pago**, con su enlace para conectarla.

Una misma cuenta de Mercado Pago puede estar en varios canales (por ejemplo, la de la tienda web y la de una cuenta de Mercado Libre): es **una sola columna** y cuenta una sola vez en el total.

## Cómo se hace

### Ver los números de ahora

Abrí la pantalla: muestra lo último leído al instante y, si esa lectura tiene más de 10 minutos, lee de nuevo sola, de fondo. Para leer en el momento, **"↻ Actualizar"** (arriba a la derecha): el botón dice **"Trabajando…"**, podés seguir usando Laucen y, cuando termina, aparece un cartel verde ("Se leyeron N de N cuentas correctamente") y la pantalla se actualiza sola.

### Conectar una cuenta de Mercado Pago

En [Canales](/config/canales), elegí el canal y en la caja **"Cuenta de Mercado Pago"** apretá **"Conectar Mercado Pago"**: Mercado Pago pide entrar con la cuenta que querés conectar y aprobar a Laucen; al volver, queda conectada. Si la cuenta ya está conectada en otro canal, aparece **"Usar la ya conectada: …"**.

## Criterios

- **Disponible**: Mercado Pago no tiene una consulta directa del saldo; sale de su **Reporte de Liquidaciones**, que Laucen le pide (los últimos 7 días) y Mercado Pago arma en unos minutos. Se pide uno nuevo si el último tiene más de una hora; mientras tanto vale el último que llegó (dice "disponible al …"). La primera vez dice "pedido a MP, actualizá en unos minutos".
- **A liberar**: los pagos aprobados con fecha de liberación de hoy en adelante que todavía no figuran liberados, sumando lo neto que recibís.
- **Cobrado en los últimos 30 días**: los pagos aprobados de los últimos 30 días.
- Cada lectura queda guardada para poder ver cómo fue cambiando y hacer análisis.
