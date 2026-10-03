-- El asistente del sistema (pedido de Fer, 3/10): cada pregunta y su
-- respuesta, por organización, para el historial (lo ve quien tiene «Ver el
-- historial del asistente») y para el tope de gasto mensual. La configuración
-- (nombre, carita, fuera del sistema, tope) va en config_org, clave
-- 'asistente' (lib/asistente/config.ts). Idempotente: lo corre
-- lib/erp/esquema.ts al primer uso tras cada arranque.

create table if not exists asistente_conversacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  usuario_id       text not null references usuarios(id),
  titulo           text not null default '',
  ruta             text,
  creada_ts        timestamptz not null default now(),
  actualizada_ts   timestamptz not null default now()
);
create index if not exists asistente_conversacion_org on asistente_conversacion (organizacion_id, actualizada_ts desc);
alter table asistente_conversacion enable row level security;
select erp_politica_org('asistente_conversacion');

create table if not exists asistente_mensaje (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conversacion_id  bigint not null references asistente_conversacion(id) on delete cascade,
  rol              text not null check (rol in ('usuario', 'asistente')),
  texto            text not null,
  ruta             text,
  -- Las herramientas que usó para contestar: [{nombre, entrada}].
  herramientas     jsonb not null default '[]',
  tokens_in        int not null default 0,
  tokens_out       int not null default 0,
  busquedas        int not null default 0,
  usd              numeric(12, 6) not null default 0,
  voto             smallint check (voto in (-1, 1)),
  error            text,
  ts               timestamptz not null default now()
);
create index if not exists asistente_mensaje_conv on asistente_mensaje (conversacion_id, id);
create index if not exists asistente_mensaje_org_ts on asistente_mensaje (organizacion_id, ts);
alter table asistente_mensaje enable row level security;
select erp_politica_org('asistente_mensaje');
