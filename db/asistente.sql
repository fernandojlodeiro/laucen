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

-- Lo que el asistente prepara para hacer (pedido de Fer, 3/10): nunca lo hace
-- solo; queda 'propuesta' hasta que quien lo pidió aprieta Confirmar (o
-- Cancelar) en el chat. `datos`: lo necesario para hacerlo; `detalle`: lo que
-- se le mostró (renglones). Lo hace lib/asistente/acciones.ts.
create table if not exists asistente_accion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conversacion_id  bigint not null references asistente_conversacion(id) on delete cascade,
  mensaje_id       bigint references asistente_mensaje(id) on delete set null,
  usuario_id       text not null references usuarios(id),
  tipo             text not null,
  resumen          text not null,
  detalle          jsonb not null default '[]',
  datos            jsonb not null default '{}',
  estado           text not null default 'propuesta' check (estado in ('propuesta', 'hecha', 'cancelada', 'error')),
  resultado        text,
  creada_ts        timestamptz not null default now(),
  resuelta_ts      timestamptz
);
create index if not exists asistente_accion_conv on asistente_accion (conversacion_id, id);
create index if not exists asistente_accion_org on asistente_accion (organizacion_id, creada_ts desc);
alter table asistente_accion enable row level security;
select erp_politica_org('asistente_accion');

-- Lo que le pidieron al asistente que haga y todavía no sabe hacer: lo ve el
-- superadministrador en Configuración › Asistente › Pedidos sin resolver, y
-- con "Mandar a programar" pasa a la bitácora como orden para Code.
create table if not exists asistente_pendiente (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conversacion_id  bigint references asistente_conversacion(id) on delete set null,
  usuario_id       text not null references usuarios(id),
  pedido           text not null,
  estado           text not null default 'nuevo' check (estado in ('nuevo', 'mandado', 'descartado')),
  bitacora_id      bigint,
  creado_ts        timestamptz not null default now(),
  resuelto_ts      timestamptz
);
create index if not exists asistente_pendiente_org on asistente_pendiente (organizacion_id, creado_ts desc);
alter table asistente_pendiente enable row level security;
select erp_politica_org('asistente_pendiente');

-- Las consultas libres del asistente (pedido de Fer, 3/10): se guardan para
-- que su "Descargar Excel" las vuelva a correr —con los permisos de ese
-- momento— y baje todas las filas. Sólo las baja quien las pidió.
create table if not exists asistente_consulta (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  conversacion_id  bigint references asistente_conversacion(id) on delete set null,
  usuario_id       text not null references usuarios(id),
  titulo           text not null,
  sql              text not null,
  creada_ts        timestamptz not null default now()
);
create index if not exists asistente_consulta_org on asistente_consulta (organizacion_id, creada_ts desc);
alter table asistente_consulta enable row level security;
select erp_politica_org('asistente_consulta');
