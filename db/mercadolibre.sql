-- Mercado Libre (sesión 2/10). Multi-cuenta: cada cuenta de ML es un canal
-- (tipo 'mercadolibre') con su llave. Lo que entra de ML (pedidos, clientes)
-- va a las tablas del cimiento por crearPedido/cambiarEstado; acá queda lo
-- propio de ML: cuentas, notificaciones, envíos, preguntas y mensajes.

-- Las llaves de cada cuenta. RLS prendido SIN políticas a propósito: tienen
-- tokens y sólo entra el servidor (conexión directa).
create table if not exists meli_cuenta (
  id                    bigint generated always as identity primary key,
  organizacion_id       text not null references organizaciones(id) on delete cascade,
  canal_id              bigint unique references canal(id) on delete set null,
  meli_user_id          bigint not null,
  nickname              text,
  access_token          text not null,
  refresh_token         text not null,
  expira_el             timestamptz not null,
  estado                text not null default 'activa' check (estado in ('activa', 'desconectada')),
  -- Hasta cuándo se trajeron pedidos (el barrido de seguridad sigue desde acá).
  pedidos_desde         timestamptz,
  ultimo_error          text,
  actualizado_ts        timestamptz not null default now(),
  creado_ts             timestamptz not null default now(),
  unique (organizacion_id, meli_user_id)
);
alter table meli_cuenta enable row level security;

-- La cuenta que ya estaba conectada (meli_cuentas, una por organización, la
-- usan Radar, Costos ML y Ventas ML) pasa acá. Desde ahora la llave vive en
-- meli_cuenta y meli_cuentas queda como espejo de la principal.
do $$ begin
  if to_regclass('public.meli_cuentas') is not null then
    insert into meli_cuenta (organizacion_id, meli_user_id, nickname, access_token, refresh_token, expira_el)
    select organizacion_id, meli_user_id, meli_nickname, access_token, refresh_token, expira_el from meli_cuentas
    on conflict (organizacion_id, meli_user_id) do nothing;
  end if;
end $$;

-- Lo que avisa ML (webhook /api/meli/notificaciones): se guarda tal cual al
-- llegar y se procesa después (en el momento y, si falla, en el barrido).
create table if not exists meli_notificacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text references organizaciones(id) on delete cascade,
  meli_user_id     bigint,
  topic            text not null,
  resource         text not null,
  payload          jsonb not null default '{}',
  recibida_ts      timestamptz not null default now(),
  intentos         int not null default 0,
  procesada_ts     timestamptz,
  error            text
);
create index if not exists meli_notificacion_pendientes on meli_notificacion (recibida_ts) where procesada_ts is null;
alter table meli_notificacion enable row level security;

-- Envíos (Mercado Envíos y, después, los de la tienda). Uno por envío del
-- canal; un pedido de ML tiene uno (o ninguno si es "a convenir").
create table if not exists envio (
  id                     bigint generated always as identity primary key,
  organizacion_id        text not null references organizaciones(id) on delete cascade,
  canal_id               bigint references canal(id) on delete set null,
  pedido_id              bigint references pedido(id) on delete set null,
  id_externo             text,
  -- fulfillment (Full), cross_docking / xd_drop_off / drop_off (colecta o
  -- punto de despacho), self_service (Flex), custom / not_specified (a convenir).
  logistica              text,
  metodo                 text,
  estado                 text,
  subestado              text,
  tracking               text,
  transportista          text,
  receptor               text,
  direccion              jsonb not null default '{}',
  costo_ars              numeric(16, 2),
  despachar_antes        timestamptz,
  entrega_estimada       timestamptz,
  etiqueta_impresa_ts    timestamptz,
  datos_externos         jsonb not null default '{}',
  actualizado_ts         timestamptz not null default now(),
  creado_ts              timestamptz not null default now()
);
create unique index if not exists envio_externo on envio (canal_id, id_externo) where id_externo is not null;
create index if not exists envio_pedido on envio (pedido_id);
create index if not exists envio_estado on envio (organizacion_id, estado, despachar_antes);
alter table envio enable row level security;
select erp_politica_org('envio');

-- Preguntas de los compradores (todas las cuentas, una bandeja).
create table if not exists meli_pregunta (
  id               bigint primary key,            -- el id de la pregunta en ML
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete set null,
  item_id          text not null,
  publicacion_id   bigint references publicacion(id) on delete set null,
  comprador_id     bigint,
  texto            text not null,
  estado           text not null,                 -- UNANSWERED, ANSWERED, CLOSED_UNANSWERED, UNDER_REVIEW, BANNED, DELETED
  fecha            timestamptz not null,
  respuesta        text,
  respondida_ts    timestamptz,
  respondida_por   text,
  -- Lo que propone la IA (el operador la aprueba, la cambia o la descarta).
  sugerencia       text,
  sugerencia_ts    timestamptz,
  datos_externos   jsonb not null default '{}',
  actualizado_ts   timestamptz not null default now()
);
create index if not exists meli_pregunta_pendientes on meli_pregunta (organizacion_id, fecha) where estado = 'UNANSWERED';
alter table meli_pregunta enable row level security;
select erp_politica_org('meli_pregunta');

-- Mensajes de posventa (con el comprador de un pedido).
create table if not exists meli_mensaje (
  id               text primary key,              -- el id del mensaje en ML
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete set null,
  pack_id          text not null,
  pedido_id        bigint references pedido(id) on delete set null,
  de_vendedor      boolean not null,
  texto            text,
  fecha            timestamptz not null,
  leido_ts         timestamptz,
  adjuntos         jsonb not null default '[]',
  datos_externos   jsonb not null default '{}'
);
create index if not exists meli_mensaje_pack on meli_mensaje (organizacion_id, pack_id, fecha);
alter table meli_mensaje enable row level security;
select erp_politica_org('meli_mensaje');

-- Borradores de respuesta a mensajes que propone la IA, por conversación.
create table if not exists meli_conversacion (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete cascade,
  pack_id          text not null,
  pedido_id        bigint references pedido(id) on delete set null,
  sin_leer         int not null default 0,
  ultimo_ts        timestamptz,
  sugerencia       text,
  sugerencia_ts    timestamptz,
  primary key (organizacion_id, pack_id)
);
alter table meli_conversacion enable row level security;
select erp_politica_org('meli_conversacion');

-- Las publicaciones de cada cuenta tal como están en ML (una fila por item
-- y variación). Sirve para vincularlas con las variaciones de Laucen: las
-- vinculadas tienen `publicacion_id`; las que no, se ven en la pantalla de
-- vinculación (o se crea el producto desde ahí).
create table if not exists meli_item (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  item_id          text not null,
  variation_id     text not null default '',
  titulo           text,
  atributos        text,
  sku              text,
  precio           numeric(16, 2),
  stock            int,
  vendidos         int,
  estado           text,
  tipo             text,
  logistica        text,
  categoria        text,
  permalink        text,
  foto             text,
  publicacion_id   bigint references publicacion(id) on delete set null,
  datos_externos   jsonb not null default '{}',
  actualizado_ts   timestamptz not null default now(),
  primary key (canal_id, item_id, variation_id)
);
create index if not exists meli_item_sin_vincular on meli_item (organizacion_id, canal_id) where publicacion_id is null;
alter table meli_item enable row level security;
select erp_politica_org('meli_item');

-- La llave del barrido. El job de pg_cron (creado a mano en Supabase el 2/10,
-- nombre 'meli-barrido', cada 2 minutos) llama a
-- https://laucen.vercel.app/api/meli/barrido?clave=<meli_llave.clave>, sólo
-- si hay alguna cuenta activa con canal.
create table if not exists meli_llave (
  id     int primary key check (id = 1),
  clave  text not null
);
insert into meli_llave (id, clave) values (1, encode(gen_random_bytes(24), 'hex')) on conflict (id) do nothing;
alter table meli_llave enable row level security;
