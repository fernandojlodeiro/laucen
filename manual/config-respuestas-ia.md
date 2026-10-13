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
- Se aplican desde la próxima respuesta que proponga o mande la IA; lo que ya estaba propuesto queda como estaba.
- Hasta 5000 letras.
- Lo que la IA promete sobre la factura se cumple solo: antes de facturar, el sistema lee lo que pidió el comprador (ver "Revisión antes de facturar" en [Pedidos](/ventas/pedidos)).
