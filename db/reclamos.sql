-- Reclamos y devoluciones (Ventas → Reclamos y devoluciones). Idempotente:
-- lo corre lib/erp/esquema.ts al primer uso tras cada arranque.
--
-- Un reclamo es de Mercado Libre (entra solo: notificaciones "claims" y el
-- barrido de 30 min, lib/mercadolibre/reclamos.ts) o de la web / el local
-- (se carga a mano con "Nuevo reclamo", lib/reclamos). Las acciones sobre un
-- reclamo de ML (mensaje, devolver la plata, aceptar la devolución, pedir
-- mediación) son siempre un clic de Fer y salen por la cola (ml_cola, tipo
-- 'reclamo').

create table if not exists reclamo (
  id                   bigint generated always as identity primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  canal_id             bigint references canal(id) on delete set null,
  origen               text not null default 'mercadolibre' check (origen in ('mercadolibre', 'web', 'local')),
  -- El id del reclamo en ML (claim_id). Null en los manuales.
  id_externo           text,
  pedido_id            bigint references pedido(id) on delete set null,
  cliente_id           bigint references cliente(id) on delete set null,
  -- De ML: la orden (resource_id) y el comprador (user_id del que reclama).
  orden_externa        text,
  comprador_externo    text,
  tipo                 text not null default 'reclamo' check (tipo in ('reclamo', 'devolucion', 'cancelacion', 'mediacion', 'cambio')),
  motivo_id            text,
  motivo               text,
  -- abierto · en_proceso · resuelto (ML: opened → abierto, closed → resuelto).
  estado               text not null default 'abierto' check (estado in ('abierto', 'en_proceso', 'resuelto')),
  -- ML: claim (entre comprador y vendedor) · dispute (mediación de ML) · recontact · none · stale.
  etapa                text,
  estado_externo       text,
  fecha                timestamptz not null default now(),
  -- Fecha límite para responder (la más próxima de las acciones del vendedor).
  vence_ts             timestamptz,
  -- ¿Mercado Libre espera algo del vendedor? (tiene acciones obligatorias).
  espera_respuesta     boolean not null default false,
  acciones_disponibles jsonb not null default '[]',
  resolucion           text,
  monto                numeric(16, 2),
  -- Lo que se devolvió de plata (en ML lo informa ML; en los manuales se anota).
  reembolso_ars        numeric(16, 2),
  -- La devolución física (ML: /v2/claims/{id}/returns).
  devolucion_id        text,
  devolucion_estado    text,
  devolucion_envio_estado text,
  devolucion_tracking  text,
  recepcion_id         bigint references recepcion(id) on delete set null,
  notas                text,
  ml_actualizado       text,
  datos_externos       jsonb not null default '{}',
  creado_por           text,
  creado_ts            timestamptz not null default now(),
  actualizado_ts       timestamptz not null default now()
);
create unique index if not exists reclamo_externo on reclamo (organizacion_id, origen, id_externo) where id_externo is not null;
create index if not exists reclamo_org_estado on reclamo (organizacion_id, estado, vence_ts);
create index if not exists reclamo_pedido on reclamo (pedido_id);
create index if not exists reclamo_orden on reclamo (canal_id, orden_externa) where orden_externa is not null;
alter table reclamo enable row level security;
select erp_politica_org('reclamo');

-- La conversación del reclamo. de: comprador · vendedor · ml (el mediador) ·
-- interno (nota que sólo se ve en Laucen).
create table if not exists reclamo_mensaje (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  reclamo_id       bigint not null references reclamo(id) on delete cascade,
  -- Para no duplicar lo que viene de ML (su hash, o uno armado con fecha + quién + texto).
  clave            text,
  de               text not null check (de in ('comprador', 'vendedor', 'ml', 'interno')),
  para             text,
  texto            text,
  adjuntos         jsonb not null default '[]',
  fecha            timestamptz not null default now(),
  usuario_id       text,
  datos_externos   jsonb not null default '{}'
);
create unique index if not exists reclamo_mensaje_clave on reclamo_mensaje (reclamo_id, clave) where clave is not null;
create index if not exists reclamo_mensaje_reclamo on reclamo_mensaje (reclamo_id, fecha);
alter table reclamo_mensaje enable row level security;
select erp_politica_org('reclamo_mensaje');

-- La historia del reclamo: cuándo entró, cambios de estado o etapa, acciones
-- mandadas a ML (y su resultado), devolución recibida, notas.
create table if not exists reclamo_evento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  reclamo_id       bigint not null references reclamo(id) on delete cascade,
  tipo             text not null,
  detalle          text,
  usuario_id       text,
  fecha            timestamptz not null default now()
);
create index if not exists reclamo_evento_reclamo on reclamo_evento (reclamo_id, fecha);
alter table reclamo_evento enable row level security;
select erp_politica_org('reclamo_evento');
