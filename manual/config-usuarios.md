---
titulo: Usuarios y roles
menu: Configuración › Usuarios y roles
ruta: /config/usuarios
rutas: /config/usuarios
permiso: usuarios_ver
resumen: Quién está en la organización, con qué rol, los superadministradores y el dueño, invitar personas y armar los roles con sus permisos.
---

## Para qué sirve

Acá se maneja el equipo de la organización: quién entra al sistema, qué rol tiene cada persona y qué puede hacer cada rol. También se ven el **dueño** y los **superadministradores**.

## Cómo se llega

Menú **Configuración › Usuarios y roles** ([Usuarios y roles](/config/usuarios)).

Mirar la pantalla pide el permiso «Usuarios y roles». Para cambiar algo (invitar, cambiar el rol de alguien, suspender) hace falta además «Gestionar equipo». Crear, editar o borrar roles pide «Administrar roles».

## Qué hay en la pantalla

- Arriba a la derecha: **"Invitar persona"** y **"Nuevo rol"** (este último sólo si tenés «Administrar roles»).
- **Personas**: buscador (por nombre, mail, rol, estado o "Superadministrador") y la tabla con Nombre, Mail, Rol, Estado (Activo, Invitado, Suspendido) y Desde.
  - Al lado del nombre: **👑 Dueño** o **⭐ Superadministrador**.
  - En cada fila: el lápiz (cambiar el rol), **"Suspender"** o **"Reactivar"**, el tacho para borrar una invitación que todavía no se usó y, si sos superadministrador, **"Hacer superadministrador"** o **"Quitar superadministrador"**.
- **Roles y permisos**: cada rol con cuántas personas lo tienen y cuántas funciones del menú tiene prendidas. El lápiz abre el rol en la misma fila con sus permisos como cajas para tildar, agrupados como el menú.

## Cómo se hace

### Invitar a una persona
1. Apretá **"Invitar persona"**.
2. Escribí el **Mail**, si querés el **Nombre**, y elegí el **Rol**.
3. Apretá **"Invitar"**.
4. No sale ningún mail: avisale vos. Tiene que registrarse en la pantalla de registro con ese mismo mail (en «Organización» puede poner cualquier cosa: entra a la tuya). Si ya tenía cuenta, entra como siempre y queda adentro.

### Cambiar el rol de alguien
1. En la fila de la persona, apretá el lápiz.
2. Elegí el rol nuevo y apretá **"Guardar"**.

### Crear un rol (por ejemplo, "Gerente" o "Depósito")
1. Apretá **"Nuevo rol"**, poné el nombre y, si querés, elegí de qué rol copia los permisos.
2. Apretá **"Crear"**: se abre el rol para tildar sus permisos.
3. Tildá lo que puede hacer y apretá **"Guardar"**.

Para un gerente que pueda todo menos algunas cosas: copiá los permisos del Admin y destildá, por ejemplo, «Administrar roles», «Gestionar equipo» o «Ver el historial del asistente».

### Nombrar o sacar un superadministrador
Sólo lo puede hacer otro superadministrador.
1. En la fila de la persona, apretá **"Hacer superadministrador"** (o **"Quitar superadministrador"**) y confirmá con **Sí**.
2. Desde ese momento tiene todos los permisos, sin importar el rol (o vuelve a valer su rol).

### Suspender a alguien
Apretá **"Suspender"** y confirmá: ya no puede entrar a la organización. **"Reactivar"** lo vuelve a habilitar.

## Criterios y reglas

- **El dueño** es quien creó la organización. Es superadministrador para siempre: nadie se lo puede sacar ni lo puede suspender. Así la organización nunca queda sin alguien que la maneje.
- **Superadministrador**: tiene todos los permisos siempre, aunque su rol diga otra cosa. Sólo otro superadministrador lo nombra, se lo saca, le cambia el rol o lo suspende. Puede haber varios.
- **Nadie puede dar un permiso que no tiene**: un gerente no puede armar ni asignar un rol con permisos que él no tiene, ni invitar con ese rol. Al editar un rol, las cajas de los permisos que no tenés aparecen bloqueadas con "(no lo tenés: no lo podés cambiar)"; lo que el rol ya tenía queda como está.
- **Candado**: siempre tiene que quedar alguien activo que pueda gestionar el equipo (un superadministrador cuenta siempre). Un cambio que lo rompa se rechaza.
- El rol **Admin** de fábrica (🔒) no se puede borrar y siempre tiene «Gestionar equipo». Un rol con personas no se borra: primero cambiales el rol.
- Las **funciones del menú** que un rol todavía no tiene cargadas cuentan como prendidas (se ven tildadas). Los demás permisos (como «Administrar roles» o «Ver el historial del asistente») nacen apagados.
- El permiso **«Asistente»** viene prendido: si lo apagás en un rol, a esas personas no les aparece la carita del asistente.
- **«Pedirle al asistente que haga cosas»** (nace apagado, salvo en el Admin de fábrica): deja que el asistente prepare acciones (facturar, crear clientes y pedidos, cambiar estados) que la persona confirma con un botón; cada una pide además el permiso de su pantalla.
- **«Consultas libres al asistente»** (nace apagado en todos los roles): deja que el asistente consulte cualquier dato (sólo lectura) y arme listados con Excel, pero sólo de las pantallas que el rol tiene. El superadministrador lo tiene siempre.
- Una invitación queda "Invitado" hasta que la persona se registra o entra con ese mail.

## Preguntas frecuentes

**¿Cómo hago para que un empleado no vea los costos o la contabilidad?** Armale un rol sin esos permisos (por ejemplo, sin «Contabilidad» ni «Informes de inventario») y asignáselo.

**¿Por qué no puedo tildar un permiso?** Porque vos no lo tenés: nadie puede dar un permiso que no tiene.

**¿Por qué no puedo suspender a alguien?** Puede ser el dueño (no se suspende nunca), un superadministrador (sólo lo toca otro superadministrador) o vos mismo.

**¿Le llega un mail al invitado?** No: avisale vos que se registre con ese mail.

**¿Cuál es la diferencia entre Admin y superadministrador?** Admin es un rol, con permisos que se pueden cambiar. El superadministrador tiene todo siempre, sin importar el rol, y sólo otro superadministrador lo cambia.

## Relacionado

- [Asistente](/config/asistente): configuración del asistente y su historial.
