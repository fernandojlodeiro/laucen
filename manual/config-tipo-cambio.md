---
titulo: Tipo de cambio
menu: Configuración › Tipo de cambio
ruta: /config/tipo-cambio
rutas: /config/tipo-cambio
permiso: tipo_cambio_ver
resumen: El dólar oficial (venta) con que el sistema convierte pesos y dólares: el de hoy, de dónde se levanta, su historia desde 2011 y la carga a mano.
---

## Para qué sirve

Laucen guarda los importes en las dos monedas (pesos y dólares). Cuando cargás un precio o un pedido en una moneda, calcula la otra con el **dólar oficial, valor venta**, de la fecha que corresponda. Esta pantalla muestra cuál rige hoy, de qué fuente se toma, la historia cargada, y permite cargar uno a mano.

## Cómo se llega

- Menú **Configuración › Tipo de cambio**.
- Cuando alguna operación falla por falta de tipo de cambio, el mensaje termina en "Cargalo en Configuración → Tipo de cambio."
- Pide el permiso «Tipo de cambio».

## Qué hay en la pantalla

Arriba, tres cajas:

1. **Hoy rige**: el dólar de venta que se está usando, con su fecha y su origen (ej. "del 03/10/2026 · dolarapi"). Si no hay ninguno: "Todavía no hay ninguno cargado." Botón **"Levantar ahora"**.
2. **Fuente**: un desplegable con las dos fuentes, **"dolarapi.com (oficial BNA)"** y **"argentinadatos.com (oficial)"**, y el botón **"Usar ésta"**. Ayuda: "El cron la consulta todos los días a las 16:15. Si falla, prueba con la otra y, si fallan las dos, lo anota en la bitácora."
3. **Historia**: desde qué fecha hay datos y cuántos días ("Desde el … · N días"), o "Sin historia cargada." Botón **"Cargar historia (desde 2011)"**. Ayuda: hace falta para convertir las ventas viejas de Virtual Seller con el dólar de su fecha.

Debajo, la caja **Cargar a mano**: **Fecha** (propone hoy), **Compra**, **Venta** y el botón **"Guardar"**. Ayuda: "Vale sólo para tu organización y ese día gana al que levanta el cron."

Al pie, la tabla de los últimos 40 días cargados: **Fecha**, **Compra**, **Venta** (en negrita), **Origen** (la fuente, o la marca amarilla "A mano (tu organización)") y, en las cargadas a mano, el **tacho** para borrarlas.

## Cómo se hace

### Ver con qué dólar se está convirtiendo hoy

Mirá la caja **Hoy rige**.

### Traer el dólar de hoy sin esperar al proceso automático

1. Apretá **"Levantar ahora"**.
2. Aparece "Listo: $ … del dd/mm/aaaa (fuente)."
3. Si no responde ninguna fuente: "No respondió ninguna de las fuentes. Probá en un rato o cargalo a mano."

### Cargar un tipo de cambio a mano

1. En **Cargar a mano**, elegí la **Fecha**.
2. Escribí la **Venta** (obligatoria, mayor que cero) y, si querés, la **Compra**.
3. **"Guardar"**. Queda en la tabla con la marca "A mano (tu organización)".

Errores: "Falta la fecha." / "El dólar de venta tiene que ser mayor que cero."

### Borrar uno cargado a mano

Tacho de la fila → "Sí". Vuelve a regir el que levantó el proceso automático para esa fecha (si hay).

### Cambiar la fuente

Elegí la fuente en el desplegable y apretá **"Usar ésta"**. Aparece "Fuente: …".

### Completar la historia

Apretá **"Cargar historia (desde 2011)"**. Avisa "Se agregaron N días de historia." o "La historia ya estaba completa."

## Criterios y reglas

- **Qué dólar se usa**: el **oficial, valor venta**.
- **Qué fecha**: para convertir un importe se usa el tipo de cambio de su fecha; si ese día no hay (fin de semana, feriado), el **último anterior** que haya. Por eso "Hoy rige" puede mostrar la fecha del último día hábil.
- **El cargado a mano gana**: si para una misma fecha hay uno a mano (de tu organización) y uno levantado de la fuente, se usa el tuyo. El cargado a mano vale sólo para tu organización; el de las fuentes es común a todas.
- **Volver a cargar a mano la misma fecha** reemplaza el valor anterior de esa fecha.
- **Proceso automático (cron)**: todos los días a las **16:15** (hora argentina). Primero completa los días que falten de la historia y después levanta el oficial del día con la fuente elegida. Si la elegida falla, prueba con la otra, hasta 3 vueltas. Si fallan las dos, deja anotado el problema en la bitácora (una vez por día) y, mientras tanto, se sigue usando el último cargado.
- **"Levantar ahora"** hace lo mismo que el proceso automático para el día (sin completar la historia).
- **Fuentes**: dolarapi.com da el oficial del día del Banco Nación (compra y venta); argentinadatos.com tiene la serie completa desde 2011. Ninguna pide llave.
- **La fuente elegida es una sola para todo el sistema**, no por organización. Por defecto, dolarapi.com.
- **"Cargar historia"** sólo agrega las fechas que faltan: nunca pisa las que ya están.
- **Sin tipo de cambio cargado** no se puede convertir: las operaciones que lo necesitan fallan con un aviso que manda a esta pantalla.

## Preguntas frecuentes

**¿Qué dólar usa el sistema?**
El oficial, valor venta, de la fecha de la operación (o del último día anterior que haya).

**Hoy es sábado y "Hoy rige" muestra el viernes. ¿Está mal?**
No: los fines de semana y feriados se usa el último día hábil cargado.

**¿A qué hora se actualiza solo?**
Todos los días a las 16:15.

**¿Puedo poner otro valor para un día?**
Sí, en "Cargar a mano". Ese día gana al automático, y sólo para tu organización.

**¿Por qué hace falta la historia desde 2011?**
Para convertir las ventas viejas importadas de Virtual Seller con el dólar de su fecha.

**Falló el automático. ¿Qué hago?**
Apretá "Levantar ahora" un rato después; si sigue fallando, cargalo a mano.

**¿Cambiar la fuente afecta a otras empresas?**
Sí: la fuente es una sola para todo el sistema.

## Relacionado

- [Listas de precios](/catalogo/precios)
- [Pedidos](/ventas/pedidos)
- [Importar datos](/importar)
