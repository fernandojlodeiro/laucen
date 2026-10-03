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

-- ── La cola de salida a Mercado Libre (lib/mercadolibre/cola.ts) ──────────
-- AGENTS.md: todo lo que va a ML pasa por acá. Lo automático (stock que llega
-- al umbral, reactivar) entra 'pendiente' y lo manda el trabajador
-- (procesarCola, desde /api/erp/tareas y /api/meli/barrido); lo que pide Fer
-- (o se prepara desde el chat) entra en un lote 'preparado' y sale recién
-- cuando Fer aprieta "Mandar a Mercado Libre".

-- Lotes preparados: un grupo de cambios que espera el clic de Fer.
create table if not exists ml_lote (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete cascade,
  descripcion      text not null,
  estado           text not null default 'preparado' check (estado in ('preparado', 'enviado', 'descartado')),
  creado_por       text,
  creado_ts        timestamptz not null default now(),
  enviado_por      text,
  enviado_ts       timestamptz
);
create index if not exists ml_lote_org on ml_lote (organizacion_id, estado, creado_ts desc);
alter table ml_lote enable row level security;
select erp_politica_org('ml_lote');

-- Cada cambio a mandar. Una fila por publicación (item y variación) y tipo.
-- `payload`: lo que se pide (stock: {cantidad, estado}; estado: {estado};
-- precio: {precio}; los demás: {pedidos: [{metodo, ruta, cuerpo}]}).
-- `antes`: lo que había (para mostrar antes → después). `efecto`: qué se
-- graba en Laucen cuando ML lo acepta (ej. la publicación queda pausada).
create table if not exists ml_cola (
  id                  bigint generated always as identity primary key,
  organizacion_id     text not null references organizaciones(id) on delete cascade,
  canal_id            bigint not null references canal(id) on delete cascade,
  item_id             text not null default '',
  variation_id        text not null default '',
  publicacion_id      bigint references publicacion(id) on delete set null,
  tipo                text not null check (tipo in ('stock', 'estado', 'precio', 'descuento', 'campana', 'atributos', 'crear', 'otro')),
  payload             jsonb not null default '{}',
  antes               jsonb,
  efecto              jsonb,
  -- Mayor = antes. Pausar por stock = 100 (lo más urgente).
  prioridad           int not null default 10,
  estado              text not null default 'pendiente' check (estado in ('preparado', 'pendiente', 'enviando', 'ok', 'error', 'descartado')),
  intentos            int not null default 0,
  proximo_intento_ts  timestamptz not null default now(),
  ultimo_error        text,
  origen              text not null default 'automatico' check (origen in ('automatico', 'boton', 'barrida')),
  usuario_id          text,
  lote_id             bigint references ml_lote(id) on delete cascade,
  -- Cuántas veces un cambio más nuevo reemplazó a éste mientras esperaba.
  reemplazos          int not null default 0,
  creado_ts           timestamptz not null default now(),
  tomado_ts           timestamptz,
  enviado_ts          timestamptz,
  respuesta           jsonb
);
-- Una sola pendiente por publicación y tipo (fuera de lotes): la más nueva
-- reemplaza a la anterior (sólo importa el último stock o precio).
create unique index if not exists ml_cola_una_pendiente on ml_cola (canal_id, item_id, variation_id, tipo)
  where estado = 'pendiente' and lote_id is null;
create index if not exists ml_cola_por_salir on ml_cola (canal_id, prioridad desc, creado_ts, id) where estado = 'pendiente';
create index if not exists ml_cola_org on ml_cola (organizacion_id, estado, creado_ts desc);
create index if not exists ml_cola_lote on ml_cola (lote_id) where lote_id is not null;
alter table ml_cola enable row level security;
select erp_politica_org('ml_cola');

-- El turno de cada cuenta: un solo trabajador por canal a la vez
-- (ocupado_hasta) y, si ML cortó por exceso de pedidos, hasta cuándo se
-- frena (frenado_hasta).
create table if not exists ml_cola_canal (
  canal_id         bigint primary key references canal(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  ocupado_hasta    timestamptz not null default now(),
  frenado_hasta    timestamptz,
  motivo_freno     text,
  ultimo_envio_ts  timestamptz
);
alter table ml_cola_canal enable row level security;
select erp_politica_org('ml_cola_canal');

-- La barrida nocturna (una por canal y noche): lee de ML el estado real de
-- todas las publicaciones, refresca el espejo y encola las diferencias.
-- Se retoma entre corridas del cron (fase, scroll y posición).
create table if not exists ml_barrida (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  noche            date not null,
  fase             text not null default 'ids' check (fase in ('ids', 'items', 'comparar', 'terminada', 'error')),
  scroll_id        text,
  ids              jsonb not null default '[]',
  posicion         int not null default 0,
  revisadas        int not null default 0,
  diferencias      int not null default 0,
  encoladas        int not null default 0,
  pausas           int not null default 0,
  errores          int not null default 0,
  detalle          jsonb not null default '[]',
  ocupado_hasta    timestamptz not null default now(),
  iniciada_ts      timestamptz not null default now(),
  terminada_ts     timestamptz,
  unique (canal_id, noche)
);
create index if not exists ml_barrida_org on ml_barrida (organizacion_id, noche desc);
alter table ml_barrida enable row level security;
select erp_politica_org('ml_barrida');

-- Los jobs de pg_cron que llaman a la app (Fer, 3/10: nada de procesos que
-- corran porque sí). 'erp-tareas' se revisa cada 2 minutos pero sólo llama a
-- /api/erp/tareas si hay algo pendiente de verdad (facturar un pedido, un
-- comprobante con error, una importación andando, la cola de ML, stock que
-- cruzó el umbral en un canal que sincroniza, la barrida nocturna de 2 a 5) y,
-- como red de seguridad, a los minutos 1 y 31 (asientos y cuenta corriente).
-- 'meli-barrido' (avisos que fallaron, ventas y preguntas perdidas) pasa a
-- cada 30 minutos: los avisos de ML se procesan en el momento en que llegan.
-- La clave se lee de su tabla al correr (no queda escrita en el job). Si no hay
-- pg_cron (tests, local) o no se puede, no pasa nada.
do $$
declare
  j record;
  cmd text := $cmd$
  select net.http_get(
    url := 'https://laucen.vercel.app/api/erp/tareas?clave=' || (select clave from public.erp_llave where id = 1),
    timeout_milliseconds := 130000
  ) where extract(minute from now()) in (1, 31) -- red de seguridad
     or exists (select 1 from public.evento e join public.emisor em on em.organizacion_id = e.organizacion_id and em.facturar_automatico
                 where e.tipo = 'pedido_estado_cambiado' and e.procesado_ts is null and e.payload ->> 'nuevo' = em.facturar_al)
     or exists (select 1 from public.comprobante where estado = 'error' and intentos < 5)
     or exists (select 1 from public.importacion where segundo_plano and estado = 'ejecutando')
     or exists (select 1 from public.importacion_vs where estado in ('cargando', 'importando') or coalesce((resumen ->> 'iva_en_curso')::boolean, false))
     or exists (select 1 from public.ml_cola where estado = 'pendiente' and proximo_intento_ts <= now())
     or exists (select 1 from public.evento e join public.canal c on c.id = (e.payload ->> 'canal_id')::bigint
                 where e.tipo = 'stock_bajo_umbral' and e.procesado_ts is null and c.tipo = 'mercadolibre'
                   and coalesce((c.config ->> 'sincronizar_stock')::boolean, false))
     or (extract(hour from now() at time zone 'America/Argentina/Buenos_Aires') between 2 and 4
         and exists (select 1 from public.canal where tipo = 'mercadolibre' and estado = 'activo' and coalesce((config ->> 'sincronizar_stock')::boolean, false)))
$cmd$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'erp-tareas';
  if found and j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd); end if;
  select jobid, schedule into j from cron.job where jobname = 'meli-barrido';
  if found and j.schedule <> '*/30 * * * *' then perform cron.alter_job(j.jobid, schedule := '*/30 * * * *'); end if;
exception when others then
  raise notice 'pg_cron: no se pudieron ajustar los jobs (%)', sqlerrm;
end $$;
