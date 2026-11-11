---
titulo: Costos de importación
menu: Configuración › Costos de importación
ruta: /config/importacion
rutas: /config/importacion
permiso: market_pro_config
resumen: Los costos para calcular cuánto sale una notebook puesta en el depósito (flete aéreo, aranceles, despachante, gastos y la tabla TCA). Los usa el costeo de Market Pro › Importar.
---

## Para qué sirve

Guarda los datos con los que se calcula el **costo nacionalizado** de una importación de notebooks (por ejemplo, Miami → Córdoba por avión). Con ellos, la pestaña **Importar** de Market Pro ([/market-pro/importar](/market-pro/importar)) calcula cuánto sale cada modelo de una lista de precios y cuánto se gana vendiéndolo.

## Cómo se llega

Menú **Configuración › Costos de importación** ([/config/importacion](/config/importacion)). También desde el botón **Costos de importación** arriba a la derecha de Market Pro › Importar. Para cambiarlos hace falta el permiso «Configurar Market Pro».

## Cómo se hace

1. Tocá el lápiz arriba a la derecha.
2. Cambiá los valores. La tabla TCA va un tramo por renglón: «hasta kg; US$» (por ejemplo «50; 149,93») y el último «más; US$».
3. Tocá **Grabar**. Los costeos nuevos usan los valores nuevos; uno ya hecho se actualiza con **Recalcular**.

Abajo se ve un ejemplo: una caja de 30 notebooks a US$ 400 FOB, con todos los pasos del cálculo.

## Criterios y reglas

- **Peso cobrable** = el mayor entre el peso real (notebooks × peso por notebook) y el volumétrico (cajas × largo × ancho × alto ÷ divisor). Las cajas se cuentan enteras.
- **Flete** = peso cobrable × US$ por kg.
- **Seguro** = % del FOB. Sólo se declara: suma al CIF pero no se paga, así que no es costo.
- **CIF** = FOB + flete + seguro. El packing y los demás gastos no suman al CIF.
- **Aranceles** y **tasa de estadística** = % del CIF.
- **IVA de importación** = % de (CIF + aranceles + estadística). Se paga, pero es crédito fiscal: no suma al costo. El IVA de los gastos (destino, despachante) tampoco.
- **TCA**: el valor del tramo que corresponde al peso cobrable de todo el envío.
- **Honorarios del despachante** = % del CIF, con un mínimo.
- **Costo nacionalizado sin IVA** = FOB + flete + aranceles + estadística + packing (por caja) + AWB + THC + TCA + gastos en destino + honorarios y gastos del despachante.
- **Reparto entre modelos**: todo en proporción al valor FOB. Cada modelo cuesta su FOB × (costo del envío ÷ FOB del envío).
- **Venta**: el IVA del precio de venta (notebooks 10,5 %). El **envío** por unidad sale solo de tus ventas: lo que te cobró Mercado Libre de envío (con IVA) en las ventas de los últimos 90 días de los productos de la familia elegida (y sus subfamilias), dividido por las unidades vendidas; se resta sin su IVA. Si se carga, un gasto más por unidad vendida (sin IVA).
- **Tope de la propuesta**: cuántos meses de lo que vende el que más vende cada producto se proponen como máximo.
