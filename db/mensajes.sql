-- Mensajes (pedido de Fer, 3/10): la carpeta tipo WhatsApp Web donde entran
-- los chats de los clientes (hoy WhatsApp con coexistencia: el número vive en
-- el teléfono y en Laucen) y los contesta Estela, la IA de la tienda. Se copió
-- la Bandeja de CadaMes y sus reglas, adaptada. La configuración (IA prendida,
-- nombre, lo que sabe para los clientes, tope, marca del teléfono, espera) va
-- en config_org, clave 'mensajes' (lib/mensajes/config.ts). Idempotente: lo
-- corre lib/erp/esquema.ts al primer uso tras cada arranque.

-- El número de WhatsApp conectado de cada organización (alta embebida de
-- Meta). El token va acá y sólo lo lee el servidor: RLS sin políticas, y el
-- nombre termina en _credencial para que el asistente no lo consulte nunca.
create table if not exists wa_credencial (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  phone_number_id  text not null unique,
  waba_id          text not null,
  numero           text not null default '',
  nombre           text not null default '',
  token            text not null,
  -- La clave con la que Meta verifica la dirección de entrega de esta cuenta
  -- (override_callback_uri): la inventa Laucen al conectar.
  verify_token     text not null,
  coexistencia     boolean not null default true,
  expira_el        timestamptz,
  estado           text not null default 'activo' check (estado in ('activo', 'desconectado')),
  conectado_ts     timestamptz not null default now()
);
create index if not exists wa_credencial_org on wa_credencial (organizacion_id);
alter table wa_credencial enable row level security;

-- Un chat = una persona en un canal. `externo` es su número de WhatsApp (el
-- wa_id que manda Meta) o, en el probador, 'prueba:<usuario>'.
create table if not exists chat (
  id                    bigint generated always as identity primary key,
  organizacion_id       text not null references organizaciones(id) on delete cascade,
  canal                 text not null check (canal in ('whatsapp', 'prueba')),
  externo               text not null,
  nombre                text not null default '',
  cliente_id            bigint references cliente(id) on delete set null,
  -- El interruptor de la IA de este chat: con fecha, la atiende una persona.
  atiende_persona_desde timestamptz,
  notas                 text not null default '',
  ultimo_ts             timestamptz not null default now(),
  ultimo_entrante_ts    timestamptz,
  creado_ts             timestamptz not null default now(),
  unique (organizacion_id, canal, externo)
);
create index if not exists chat_org_ultimo on chat (organizacion_id, ultimo_ts desc);
alter table chat enable row level security;
select erp_politica_org('chat');

-- Cada mensaje. direccion: entrante (el cliente) / saliente (nosotros).
-- clase: entrante · ia (Estela) · operador (desde el panel) ·
-- desde_el_telefono (eco de coexistencia).
create table if not exists chat_mensaje (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  chat_id          bigint not null references chat(id) on delete cascade,
  direccion        text not null check (direccion in ('entrante', 'saliente')),
  clase            text not null check (clase in ('entrante', 'ia', 'operador', 'desde_el_telefono')),
  texto            text not null,
  wamid            text,
  estado_entrega   text check (estado_entrega in ('enviado', 'entregado', 'leido', 'fallido')),
  entrega_motivo   text,
  usuario_id       text references usuarios(id) on delete set null,
  herramientas     jsonb not null default '[]',
  tokens_in        int not null default 0,
  tokens_out       int not null default 0,
  usd              numeric(12, 6) not null default 0,
  ts               timestamptz not null default now()
);
create index if not exists chat_mensaje_chat on chat_mensaje (chat_id, id);
create index if not exists chat_mensaje_org_ts on chat_mensaje (organizacion_id, ts);
create unique index if not exists chat_mensaje_wamid on chat_mensaje (wamid) where wamid is not null;
alter table chat_mensaje enable row level security;
select erp_politica_org('chat_mensaje');

-- Lo que Estela no supo resolver y pasó a una persona ("En espera").
create table if not exists chat_caso (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  chat_id          bigint not null references chat(id) on delete cascade,
  asunto           text not null,
  motivo           text not null default '',
  asignado_a       text references usuarios(id) on delete set null,
  abierto_ts       timestamptz not null default now(),
  resuelto_ts      timestamptz,
  resolucion       text
);
create index if not exists chat_caso_abiertos on chat_caso (organizacion_id, chat_id) where resuelto_ts is null;
alter table chat_caso enable row level security;
select erp_politica_org('chat_caso');

-- La espera para contestar (copiada de CadaMes): cada mensaje nuevo del
-- cliente corre la hora; contesta sólo la última invocación.
create table if not exists chat_espera (
  chat_id          bigint primary key references chat(id) on delete cascade,
  procesar_desde   timestamptz not null
);
alter table chat_espera enable row level security;

-- Todo lo que manda Meta, crudo (para auditar y depurar). Sin políticas.
create table if not exists wa_evento (
  id               bigint generated always as identity primary key,
  organizacion_id  text references organizaciones(id) on delete cascade,
  tipo             text not null,
  desde            text,
  payload          jsonb not null,
  ts               timestamptz not null default now()
);
create index if not exists wa_evento_ts on wa_evento (ts desc);
alter table wa_evento enable row level security;

-- El permiso de Meta mientras la persona elige qué número conectar (bitácora #868: con varias cuentas o
-- números en el permiso, se elige en pantalla). Vence en una hora; se borra al usarlo.
create table if not exists wa_alta_pendiente (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  token            text not null,
  expira_el        timestamptz,
  coexistencia     boolean not null default true,
  opciones         jsonb not null default '[]',
  creado_ts        timestamptz not null default now()
);
alter table wa_alta_pendiente enable row level security;

-- Instagram (Fer, 25/10, como en CadaMes): los mensajes directos de la cuenta de Instagram del negocio entran a la misma
-- bandeja (canal 'instagram' de chat; `externo` es el id de Instagram de la persona) y los contesta la misma IA.
-- La app de Meta de Laucen para Instagram («Instagram API con inicio de sesión de Instagram»): su id, su clave secreta y
-- la clave con la que Meta verifica la dirección de los avisos. Una sola fila (es de Laucen, no de cada organización);
-- la carga el dueño del sistema en Ventas › Mensajes › Configuración. Termina en _credencial: el asistente no la lee.
create table if not exists ig_app_credencial (
  id            int primary key check (id = 1),
  app_id        text not null,
  app_secret    text not null,
  verify_token  text not null,
  actualizado_ts timestamptz not null default now()
);
alter table ig_app_credencial enable row level security;

-- La cuenta de Instagram conectada de cada organización (con su propio inicio de sesión de Instagram). El token dura
-- 60 días y se renueva solo (lib/mensajes/instagram.ts).
create table if not exists ig_credencial (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  ig_user_id       text not null unique,
  usuario          text not null default '',
  token            text not null,
  expira_el        timestamptz,
  estado           text not null default 'activo' check (estado in ('activo', 'desconectado')),
  conectado_ts     timestamptz not null default now()
);
create index if not exists ig_credencial_org on ig_credencial (organizacion_id);
alter table ig_credencial enable row level security;

-- El canal 'instagram' en los chats.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'chat_canal_check' and pg_get_constraintdef(oid) not like '%instagram%') then
    alter table chat drop constraint chat_canal_check;
    alter table chat add constraint chat_canal_check check (canal in ('whatsapp', 'prueba', 'instagram'));
  end if;
end $$;

-- La misma app de Meta, para «Conectar anuncios de Meta» (embudo de publicidad, Fer 25/10): el identificador y la clave
-- secreta de la app (no los de Instagram, que son otros) y la configuración del inicio de sesión de Facebook para
-- empresas con el permiso de leer anuncios.
alter table ig_app_credencial add column if not exists fb_app_id text;
alter table ig_app_credencial add column if not exists fb_app_secret text;
alter table ig_app_credencial add column if not exists ads_config_id text;

-- El repaso de lo que quedó sin contestar (Fer, 27/10: a Kari la IA no le contestó más). La IA espera unos segundos
-- antes de contestar por si el cliente sigue escribiendo (chat_espera); si en esa espera se corta el servidor (una
-- actualización, por ejemplo), el mensaje queda sin nadie que lo conteste. pg_cron mira cada minuto si hay un chat con
-- la IA prendida cuyo último mensaje es del cliente y lleva más de 90 segundos sin respuesta, y llama a
-- /api/mensajes/repaso (lib/mensajes/repaso.ts). repaso_ts: hasta cuándo ya se repasó (así no lo intenta cada minuto).
alter table chat add column if not exists repaso_ts timestamptz;

do $$
declare
  j record;
  cmd text := $cmd$
  select net.http_get(
    url := 'https://laucen.vercel.app/api/mensajes/repaso?clave=' || (select clave from public.erp_llave where id = 1),
    timeout_milliseconds := 60000
  ) where exists (select 1 from public.chat ch
     where ch.canal in ('whatsapp', 'instagram') and ch.atiende_persona_desde is null
       and ch.ultimo_entrante_ts between now() - interval '1 hour' and now() - interval '90 seconds'
       and (ch.repaso_ts is null or ch.repaso_ts < ch.ultimo_entrante_ts)
       and not exists (select 1 from public.chat_mensaje m where m.chat_id = ch.id and m.clase <> 'entrante' and m.ts > ch.ultimo_entrante_ts))
$cmd$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'mensajes-repaso';
  if not found then perform cron.schedule('mensajes-repaso', '* * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'mensajes-repaso: %', sqlerrm;
end $$;

-- «Terminado» y lo que no necesita respuesta (Fer, 27/10; lib/mensajes/sql-atender.ts): hasta cuándo el chat no espera
-- respuesta. Lo pone el botón «Terminado» de la bandeja, y la IA cuando ve que el último mensaje no la necesita (un
-- «gracias», un emoji). Si el cliente vuelve a escribir después, vuelve a «Para atender».
alter table chat add column if not exists no_responder_ts timestamptz;
