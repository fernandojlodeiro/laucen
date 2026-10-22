---
titulo: Respuestas de la IA
menu: Configuración › Respuestas de la IA
ruta: /config/respuestas-ia
rutas: /config/respuestas-ia
permiso: empresa_config
resumen: Las reglas que la IA respeta al contestar preguntas y mensajes de Mercado Libre y los WhatsApp, iguales para todas las cuentas.
---

## Para qué sirve

Acá se escriben las reglas de la empresa que la IA tiene que respetar siempre que contesta a un cliente: las **preguntas** y los **mensajes de posventa** de Mercado Libre (de todas las cuentas) y los **WhatsApp**. Son una sola para toda la empresa: no hace falta cargarlas cuenta por cuenta.

Lo que sí es de cada cuenta es la **firma** del final de cada respuesta (por ejemplo «Saludos, el equipo de …»): se carga en [Canales](/config/canales), caja «Textos de …».

## Cómo se llega

- Menú **Configuración › Respuestas de la IA**.

## Cómo se hace

1. Apretá el **lápiz** de arriba a la derecha.
2. Escribí las reglas, **una por renglón**. Por ejemplo:
   - «Nunca proponer como solución que inicie un reclamo en Mercado Libre.»
   - «Si el comprador pide algo sobre la factura (factura A, CUIT, razón social, que diga una leyenda…), contestá que sí, que tomamos nota y la factura va a salir así.»
3. Apretá **Grabar** (o **Cancelar** para salir sin cambiar nada).

## Criterios

- Las reglas valen **por encima** de las instrucciones de siempre de la IA.
- **Textos fijos**: lo que se escribe entre **[[ ]]** se dice **tal cual, letra por letra**: la IA no lo corrige ni lo cambia (no llega a verlo: deja una marca y el sistema pone el texto exacto en la respuesta propuesta). Sirve, por ejemplo, para pedir un dato escrito de una forma especial: «pedí [[un num...ero de co..nta...cto]]». En WhatsApp el texto va igual, sin los corchetes.
- En Mercado Libre la IA sabe **por qué cuenta entró** la pregunta o el mensaje (el nombre del canal, como figura en [Canales](/config/canales)). Así una regla puede valer para una sola cuenta, nombrándola: por ejemplo, «en la cuenta «ML PUNTO», si preguntan dónde retirar, contestá que la dirección está en la factura; en cualquier otra cuenta, que trabajamos sólo con Mercado Envíos». En WhatsApp no hay cuenta de Mercado Libre: esas reglas no se aplican.
- Se aplican desde la próxima respuesta que proponga o mande la IA; lo que ya estaba propuesto queda como estaba.
- Hasta 5000 letras.
- Lo que la IA promete sobre la factura se cumple solo: antes de facturar, el sistema lee lo que pidió el comprador (ver "Revisión antes de facturar" en [Pedidos](/ventas/pedidos)).
