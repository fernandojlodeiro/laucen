# El manual del sistema

Lo lee el asistente (Configuración › Asistente; `lib/asistente/`) para contestar cómo se hace
cada cosa, dónde está y con qué criterio decide el sistema. **Toda pantalla nueva o cambiada
actualiza su página en el mismo commit** (regla en AGENTS.md). `tests/manual.test.ts` falla si
una página del sistema (`app/**/page.tsx`) no figura en las `rutas` de ningún archivo.

Un archivo por ítem del menú (o grupo de pantallas), con este encabezado exacto:

```
---
titulo: Facturas de compra
menu: Compras › Facturas de compra
ruta: /compras/facturas
rutas: /compras/facturas, /compras/facturas/[id], /compras/facturas/nueva, /compras/facturas/arca/[id]
permiso: compras_ver
resumen: Una línea: qué se hace ahí.
---
```

- `rutas`: todas las páginas que cubre, tal cual la carpeta (con `[id]`), separadas por coma.
- `permiso`: la clave de `lib/permisos.ts` que abre la pantalla; `fer` si es herramienta interna
  (sólo la ve Fer); `todos` si no pide permiso. El asistente sólo le muestra a cada persona las
  páginas de los permisos que tiene.

Secciones, en este orden (las que apliquen): `## Para qué sirve`, `## Cómo se llega`,
`## Qué hay en la pantalla`, `## Cómo se hace` (con un `###` por tarea, pasos numerados),
`## Criterios y reglas` (cómo decide el sistema: fórmulas, estados, automatismos — lo más
valioso), `## Preguntas frecuentes`, `## Relacionado`.

Escritura: castellano rioplatense para un empleado que no programa; botones y campos con su
texto exacto; los lugares como enlaces markdown a su dirección (`[Proveedores](/compras/proveedores)`);
nunca código, nombres de archivos, tablas, columnas, funciones ni variables de entorno.

Guías: los archivos que empiezan con `guia-` son guías de recorrido o de conceptos (no una
pantalla). Además de leerlas el asistente, aparecen solas en «Manuales de ayuda» de la barra de
estado (abajo a la derecha) y se leen en /manuales/<archivo>. Una guía nueva = un archivo
`guia-….md` con el mismo encabezado.
