---
titulo: Cuenta y acceso
menu: (fuera del menú: pantallas de entrada)
ruta: /login
rutas: /, /login, /registro, /olvide, /reset, /onboarding
permiso: todos
resumen: Crear una cuenta, entrar, recuperar la contraseña, crear la organización y salir del sistema.
---

## Para qué sirve

Son las pantallas para **entrar a Laucen**: crear una cuenta nueva (con su organización), entrar con mail y contraseña, pedir un link para cambiar la contraseña olvidada, elegir la contraseña nueva, crear la organización si la cuenta quedó sin ninguna, y salir.

Laucen está armado para varias organizaciones (empresas): cada usuario pertenece a una o más, con un rol en cada una, y todo lo que ve (pedidos, productos, clientes) es de la organización en la que está trabajando.

## Cómo se llega

- La página de inicio pública (la dirección principal del sistema, sin nada más) muestra "Laucen · Sitio en construcción" con dos botones: **"Iniciar sesión"** (va a [Entrar](/login)) y **"Registrarse"** (va a [Crear cuenta](/registro)).
- Si entrás a cualquier pantalla del sistema sin haber iniciado sesión, te manda solo a [Entrar](/login).
- El panel se usa desde la dirección del sistema en Vercel (laucen.vercel.app). Los dominios laucen.com.ar y laucen.com abren la **tienda web**, no el panel.
- **"Salir"** está en la barra de arriba, a la derecha (en la PC).

## Qué hay en la pantalla

**La página de inicio** (la dirección principal del sitio del panel, sin nada después): dice "Sitio en construcción." y tiene dos botones, **"Iniciar sesión"** y **"Registrarse"**.

### [Entrar](/login)

- Título **"Entrar"**.
- Campos **"Email"** y **"Contraseña"**.
- Botón **"Entrar"** (mientras trabaja dice "Entrando…").
- Abajo, dos botones: **"Crear cuenta"** (va a [Crear cuenta](/registro)) y **"Olvidé mi contraseña"** (va a [Olvidé mi contraseña](/olvide)).

### [Crear cuenta](/registro)

- Título **"Crear cuenta"**.
- Campos **"Tu nombre"**, **"Nombre de la organización"**, **"Email"** y **"Contraseña"** (mínimo 8 caracteres). Todos obligatorios.
- Botón **"Crear cuenta"** (mientras trabaja, "Creando…").
- Al terminar, si hay que confirmar el mail, la pantalla cambia a **"Revisá tu mail"** con el aviso de que se mandó el link.

### [Olvidé mi contraseña](/olvide)

- Campo **"Email"** y botón **"Mandarme el link"** (mientras trabaja, "Enviando…").
- Botón **"Volver"** (a [Entrar](/login)).

### [Elegí una contraseña nueva](/reset)

- Se llega sólo desde el link del mail de recuperación.
- Campo **"Contraseña nueva"** (mínimo 8) y botón **"Guardar"** (mientras trabaja, "Guardando…").

### [Creá tu organización](/onboarding)

- Campo **"Nombre de la organización"** y botón **"Crear"** (mientras trabaja, "Creando…").
- Aparece sola cuando el usuario entró pero no pertenece a ninguna organización activa.

Ninguna de estas pantallas tiene el menú ni la barra de estado del sistema.

## Cómo se hace

### Crear una cuenta nueva (con organización propia)

1. Andá a [Crear cuenta](/registro).
2. Completá **"Tu nombre"**, **"Nombre de la organización"** (tu empresa), **"Email"** y **"Contraseña"** (8 caracteres o más).
3. Apretá **"Crear cuenta"**.
4. Aparece **"Revisá tu mail"**: "Te mandamos un mail a … Abrí el link para confirmar la cuenta y entrás directo al panel."
5. Abrí el mail (fijate en spam) y tocá el link. Entrás directo al [Panel](/panel).

En ese mismo paso se crea la organización y quedás en ella con el rol **Admin** (el rol protegido, que puede todo).

### Entrar a una organización a la que te invitaron

Si un administrador te invitó desde [Usuarios y roles](/config/usuarios), **no te llega ningún mail del sistema**: te tiene que avisar él.

1. Si **todavía no tenés cuenta**: andá a [Crear cuenta](/registro) y registrate **con el mismo mail con el que te invitaron**. El formulario pide igual "Nombre de la organización": poné cualquier cosa, porque si ya tenés una invitación **no se crea una organización nueva**. Confirmá el mail con el link.
2. Si **ya tenés cuenta**: simplemente entrá en [Entrar](/login) con ese mail.
3. Al entrar, la invitación se acepta sola y quedás activo en esa organización con el rol que te asignaron.

### Entrar

1. Andá a [Entrar](/login).
2. Escribí tu **"Email"** y tu **"Contraseña"**.
3. Apretá **"Entrar"**. Vas al [Panel](/panel) (si tu rol no tiene el Panel, a [Radar](/radar)).

Errores típicos:
- **"El mail o la contraseña no coinciden."**: revisá lo escrito, o usá "Olvidé mi contraseña".
- **"Todavía no confirmaste el mail. Buscá el link que te mandamos (fijate en spam)."**: falta tocar el link del mail de registro.
- **"Completá el email y la contraseña."**: quedó un campo vacío.
- **"No se pudo completar. Probá de nuevo en un momento."**: un problema del servicio; reintentá.

### Recuperar la contraseña

1. En [Entrar](/login), apretá **"Olvidé mi contraseña"**.
2. Escribí tu **"Email"** y apretá **"Mandarme el link"**.
3. Sale el aviso: "Si ese mail tiene cuenta, te llega un link para elegir una contraseña nueva." (Por seguridad dice lo mismo exista o no la cuenta.)
4. Abrí el mail y tocá el link: se abre [Elegí una contraseña nueva](/reset).
5. Escribí la **"Contraseña nueva"** (8 caracteres o más) y apretá **"Guardar"**. Entrás directo al [Panel](/panel).

Si el link está vencido o ya se usó, el sistema te devuelve a [Entrar](/login); pedí otro link.

### Crear la organización si la cuenta quedó sin ninguna

Casi nunca pasa (el registro ya crea la organización), pero si entrás y no pertenecés a ninguna organización activa, el sistema te lleva a [Creá tu organización](/onboarding):

1. Escribí el **"Nombre de la organización"**.
2. Apretá **"Crear"**. Quedás como Admin de esa organización y vas al [Panel](/panel).

### Cambiar de organización

Hoy **no hay un selector de organización en pantalla**. Si pertenecés a más de una, el sistema abre la que tengas elegida o, si no hay ninguna elegida, la primera por orden alfabético. El nombre de la organización en la que estás se ve abajo a la derecha (barra de estado, en la PC) o arriba (en el celular).

### Salir

1. En la barra de arriba (PC), apretá **"Salir"**, a la derecha del buscador.
2. Se cierra la sesión y volvés a [Entrar](/login).

## Criterios y reglas

- **Un registro = cuenta + organización + rol Admin**, en un solo paso. Si el mail ya tenía una invitación (o ya pertenece a alguna organización), no se crea otra organización.
- **Mail ya registrado**: el registro contesta "Ese mail ya tiene una cuenta."
- **Contraseña**: mínimo 8 caracteres, en el registro y al elegir una nueva.
- **Confirmación por mail**: está prendida. Hasta que no tocás el link, no podés entrar.
- **Invitaciones**: no mandan mail. Quedan "Invitado" hasta que la persona entra (o se registra) con ese mail; ahí pasan a "Activo" solas.
- **Usuarios suspendidos**: una organización en la que estás suspendido no se abre (es como si no pertenecieras).
- **Sesión**: se mantiene abierta y se renueva sola mientras usás el sistema. Si entrás a una pantalla sin sesión, te lleva a [Entrar](/login).
- **Después de entrar** siempre vas al [Panel](/panel), aunque hayas intentado abrir otra pantalla antes de iniciar sesión.
- **Errores**: nunca se muestra el error técnico; se traduce a una frase en castellano.
- Hoy no hay entrada con Google ni otras redes: sólo mail y contraseña.

## Preguntas frecuentes

**Me registré y no puedo entrar.**
Seguramente falta confirmar el mail: buscá el mail de Laucen (también en spam) y tocá el link.

**Me invitaron pero no me llegó ningún mail.**
Es normal: Laucen no manda mail de invitación. Registrate (o entrá) con el mismo mail con el que te invitaron.

**Al registrarme me pide "Nombre de la organización", pero me invitaron a una que ya existe.**
Completalo con cualquier cosa: si tenés una invitación, no se crea una organización nueva y quedás en la que te invitó.

**Me olvidé la contraseña.**
"Olvidé mi contraseña" en la pantalla de entrada; te llega un link para elegir una nueva.

**El link para cambiar la contraseña no anda.**
Puede estar vencido o ya usado. Pedí otro desde "Olvidé mi contraseña".

**Estoy en dos empresas, ¿cómo cambio de una a otra?**
Todavía no hay selector en pantalla: el sistema abre una sola (la elegida o la primera por orden alfabético).

**¿Cómo cierro la sesión?**
Con "Salir", arriba a la derecha (en la PC).

## Relacionado

- [Panel](/panel)
- [Usuarios y roles](/config/usuarios)
- [Empresa](/config/empresa)
