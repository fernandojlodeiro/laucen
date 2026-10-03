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
