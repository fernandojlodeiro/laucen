---
titulo: Asistente
menu: Configuración › Asistente
ruta: /config/asistente
rutas: /config/asistente, /config/asistente/historial
permiso: asistente_config
resumen: El asistente del sistema (la carita de abajo a la derecha): cómo usarlo, su nombre, la carita, las preguntas fuera del sistema, el tope de gasto y el historial de preguntas.
---

## Para qué sirve

El asistente es la carita que aparece abajo a la derecha en todas las pantallas. Se le pregunta en lenguaje común cómo se hace algo, dónde está una opción, con qué criterio calcula algo el sistema o un dato ("¿cuántos pedidos entraron hoy?"), y contesta ahí mismo.

En esta pantalla se configura (nombre, carita, preguntas fuera del sistema, tope de gasto) y, en la pestaña Historial, se ven las preguntas que le hizo cada persona.

## Cómo se llega

- Para usarlo: tocá la carita (o el signo de pregunta) de abajo a la derecha, en cualquier pantalla.
- Para configurarlo: menú **Configuración › Asistente** ([Asistente](/config/asistente)). Pide el permiso «Configurar el asistente».
- El historial: pestaña **Historial** ([Historial del asistente](/config/asistente/historial)). Pide el permiso «Ver el historial del asistente».

## Qué hay en la pantalla

**El chat** (al tocar la carita):
- Arriba: el nombre del asistente, **"Nueva"** (empieza otra conversación) y **✕** (cierra; la conversación sigue si lo volvés a abrir).
- Las preguntas y respuestas. Debajo de cada respuesta, **👍** (me sirvió) y **👎** (no me sirvió).
- Abajo: el cuadro para escribir, el **🎤** para dictar la pregunta (si el navegador lo permite; anda en Chrome y Edge) y **"Enviar"**. Enter envía; Mayúscula+Enter hace un renglón nuevo.

**Configuración**: Nombre, Cómo se ve (carita o signo de pregunta), Tope de gasto por mes (US$) con lo gastado en el mes, y Preguntas fuera del sistema. Se edita con el lápiz de arriba a la derecha y se graba con **"Grabar"**.

**Historial**: buscador (por pregunta, respuesta o persona), rango de fechas, **"Sólo con 👎"**, y la lista de conversaciones con Última pregunta, Persona, Primera pregunta, Preguntas, 👍, 👎 y Costo US$. Tocando la pregunta se abre la conversación entera abajo, con qué usó para contestar cada respuesta (manual, datos, código, internet) y lo que costó. **"Descargar Excel"** arriba a la derecha.

## Cómo se hace

### Preguntarle algo
1. Tocá la carita de abajo a la derecha.
2. Escribí (o dictá con 🎤) la pregunta y apretá **"Enviar"**.
3. Mientras trabaja muestra qué está haciendo ("Buscando en el manual…", "Consultando los datos…"). Los lugares que nombra son enlaces: tocándolos vas directo.

### Cambiarle el nombre o la carita
1. En [Asistente](/config/asistente), apretá el lápiz.
2. Cambiá el **Nombre** o el interruptor **Carita** (apagado, se ve un signo de pregunta).
3. Apretá **"Grabar"**.

### Dejar que conteste preguntas generales
Prendé **Preguntas fuera del sistema** y grabá. Prendido, contesta también cosas que no son del sistema (impuestos, comercio, Mercado Libre en general) y busca en internet si hace falta. Apagado, a eso contesta que sólo sabe del sistema.

### Ver qué le preguntan
Entrá a la pestaña **Historial**. Con **"Sólo con 👎"** ves las respuestas que no sirvieron: sirven para mejorar el manual o una pantalla confusa.

## Criterios y reglas

- **De dónde saca lo que sabe**: primero del manual del sistema; para datos, de las mismas listas que ves en las pantallas (con sus filtros); y si el manual no alcanza para explicar un criterio, revisa cómo funciona el sistema por dentro. Contesta siempre en palabras, sin mostrar nada técnico.
- **Respeta los permisos**: a cada persona le explica sólo las pantallas y los datos que su rol le deja ver. Si pregunta por otra cosa, le dice que eso lo maneja otro rol y que lo pida al administrador.
- **No cambia nada**: no graba, no borra, no manda nada a Mercado Libre ni a ARCA. Explica cómo hacerlo.
- **Tope de gasto**: cada respuesta cuesta unos centavos de dólar (más si consulta muchos datos o busca en internet). Cuando lo gastado en el mes llega al tope, deja de contestar hasta el mes siguiente y avisa que se terminó el cupo. 0 lo apaga.
- **Historial**: cada pregunta y respuesta queda guardada, con la persona, la pantalla desde la que preguntó, qué usó para contestar, lo que costó y el 👍/👎. El chat lo avisa abajo.
- La conversación sigue mientras cambiás de pantalla y al recargar la página; **"Nueva"** empieza otra.
- Quién lo usa: todas las personas cuyo rol tiene el permiso «Asistente» (viene prendido).

## Preguntas frecuentes

**¿El asistente puede hacer el cambio por mí?** No: te dice dónde y cómo, pero el cambio lo hacés vos.

**¿Por qué me dice que eso lo maneja otro rol?** Porque tu rol no tiene permiso para esa pantalla o esos datos.

**¿Por qué dice que se terminó el cupo?** Se llegó al tope de gasto del mes. Quien administra la organización lo puede subir acá.

**¿Por qué no aparece el micrófono?** Tu navegador no tiene dictado (anda en Chrome y Edge, en PC y en celular).

**¿Lo que le pregunto lo ve alguien?** Sí: queda en el historial y lo ve quien tiene el permiso «Ver el historial del asistente».

**¿Puede equivocarse?** Puede. Si una respuesta no te sirvió, marcala con 👎: así se revisa.

## Relacionado

- [Usuarios y roles](/config/usuarios): los permisos «Asistente», «Configurar el asistente» y «Ver el historial del asistente».
