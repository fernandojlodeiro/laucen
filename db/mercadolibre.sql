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

-- Corte de pedidos (Fer, 3/10, 21:35 hora argentina): los pedidos creados en ML
-- antes de esta fecha ya están en Virtual Seller y no entran nunca (ni por
-- notificación, ni por el barrido, ni al conectar una cuenta nueva: todas
-- arrancan con el mismo corte).
alter table meli_cuenta add column if not exists pedidos_corte timestamptz not null default '2026-10-04T00:35:00Z';

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
-- La respuesta fue exactamente la sugerencia de la IA, sin cambios (Fer, 5/10).
alter table meli_pregunta add column if not exists respondida_con_ia boolean not null default false;
-- La IA propone sola la respuesta (Fer, 5/10): cuándo se intentó por última vez, para no repetir una que falla.
alter table meli_pregunta add column if not exists sugerencia_intento_ts timestamptz;
-- Respuesta automática (Fer, 5/10): qué dijo la IA de su propuesta ('ok', 'persona' = pide hablar con una
-- persona, 'falta_dato') y si la respuesta la mandó la IA sola (interruptor de Preguntas prendido).
alter table meli_pregunta add column if not exists ia_estado text;
alter table meli_pregunta add column if not exists respondida_auto boolean not null default false;
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
-- Quién del panel mandó el mensaje (null: lo escribieron desde Mercado Libre o es del comprador).
alter table meli_mensaje add column if not exists usuario_id text;
-- El mensaje fue exactamente la sugerencia de la IA, sin cambios (Fer, 5/10): "Respondió <usuario> con la IA".
alter table meli_mensaje add column if not exists con_ia boolean not null default false;
-- Lo mandó la IA sola (interruptor de Mensajes prendido, Fer, 5/10).
alter table meli_mensaje add column if not exists auto boolean not null default false;

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
-- La IA propone sola la respuesta (Fer, 5/10): cuándo se intentó por última vez, para no repetir una que falla.
alter table meli_conversacion add column if not exists sugerencia_intento_ts timestamptz;
-- Respuesta automática (Fer, 5/10): qué dijo la IA de su última propuesta ('ok', 'persona', 'falta_dato') y
-- desde cuándo el comprador pidió hablar con una persona: desde ahí la IA no contesta más sola esa conversación.
alter table meli_conversacion add column if not exists ia_estado text;
alter table meli_conversacion add column if not exists pidio_persona_ts timestamptz;

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

-- Publicaciones de ML que se borraron de Laucen a propósito (Fer, 4/10:
-- notebooks pausadas sin producto): traer publicaciones, los avisos y la
-- barrida no las vuelven a guardar. Siguen en ML como estaban.
create table if not exists meli_item_descartado (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  item_id          text not null,
  titulo           text,
  sku              text,
  motivo           text,
  creado_ts        timestamptz not null default now(),
  primary key (canal_id, item_id)
);
alter table meli_item_descartado enable row level security;
select erp_politica_org('meli_item_descartado');
-- Cómo estaba en ML al borrarla, y el lote que la elimina en ML (Fer, 4/10:
-- "Eliminar en Mercado Libre" sale con su clic, por la cola).
alter table meli_item_descartado add column if not exists estado text;
alter table meli_item_descartado add column if not exists eliminar_lote_id bigint;

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
  tipo                text not null check (tipo in ('stock', 'estado', 'precio', 'descuento', 'campana', 'atributos', 'crear', 'factura', 'reclamo', 'otro')),
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
-- Subir facturas a la venta (3/10): tipo 'factura', item_id = 'cbte:<id del comprobante>'.
-- Acciones sobre reclamos (3/10): tipo 'reclamo', item_id = 'reclamo:<claim_id de ML>',
-- variation_id = '<acción>:<huella del pedido>' (dos clics iguales no se duplican).
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'ml_cola'::regclass and conname = 'ml_cola_tipo_check'
                and pg_get_constraintdef(oid) not like '%reclamo%') then
    alter table ml_cola drop constraint ml_cola_tipo_check;
    alter table ml_cola add constraint ml_cola_tipo_check
      check (tipo in ('stock', 'estado', 'precio', 'descuento', 'campana', 'atributos', 'crear', 'factura', 'reclamo', 'otro'));
  end if;
end $$;
create index if not exists ml_cola_factura on ml_cola (item_id, id desc) where tipo = 'factura';
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
-- cruzó el umbral en un canal que sincroniza, un cambio de stock que no se
-- avisó al instante (stock_cambio_pendiente de más de un minuto: falló la
-- llamada de pg_net, ver db/stock.sql), publicaciones en revisión en ML sin el
-- motivo leído en el último día, la barrida nocturna de 2 a 5) y,
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
                 where e.procesado_ts is null and ((e.tipo = 'pedido_estado_cambiado' and e.payload ->> 'nuevo' = em.facturar_al)
                                                    or e.tipo = 'pedido_pago_confirmado'))
     or exists (select 1 from public.comprobante where estado = 'error' and intentos < 5)
     or exists (select 1 from public.importacion where segundo_plano and estado = 'ejecutando')
     or exists (select 1 from public.importacion_vs where estado in ('cargando', 'importando') or coalesce((resumen ->> 'iva_en_curso')::boolean, false))
     or exists (select 1 from public.ml_cola where estado = 'pendiente' and proximo_intento_ts <= now())
     or exists (select 1 from public.evento e join public.canal c on c.id = (e.payload ->> 'canal_id')::bigint
                 where e.tipo = 'stock_bajo_umbral' and e.procesado_ts is null and c.tipo = 'mercadolibre'
                   and coalesce((c.config ->> 'sincronizar_stock')::boolean, false))
     or exists (select 1 from public.stock_cambio_pendiente where creado_ts < now() - interval '1 minute')
     -- Motivos de revisión de ML sin leer en el último día (lib/mercadolibre/moderaciones.ts).
     or exists (select 1 from public.meli_item m left join public.meli_moderacion mm on mm.canal_id = m.canal_id and mm.item_id = m.item_id
                 where m.estado = 'under_review' and (mm.leido_ts is null or mm.leido_ts < now() - interval '1 day'))
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

-- ── Historia de las publicaciones (informe "Cambios en publicaciones") ────
-- Cada vez que cambia el estado, el precio o el stock de una fila de
-- meli_item (la copia local de cada publicación/variación, que mantienen al
-- día los avisos, el barrido de 30 minutos y la barrida nocturna), un trigger
-- anota antes → después. La historia arranca con el deploy que la creó (3/10):
-- de antes no hay nada. Las altas (una publicación nueva en meli_item) no se
-- anotan: la primera carga de una cuenta serían miles de filas sin "antes".
-- `origen`: 'laucen' si hace menos de 15 minutos nuestra cola (ml_cola) mandó
-- (o está mandando) un cambio de ese tipo a esa publicación; si no, 'externo'
-- (lo cambió alguien en Mercado Libre, o ML mismo). El stock se anota también
-- (cambia con cada venta); el informe lo esconde salvo que se pida.
create table if not exists meli_item_cambio (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  item_id          text not null,
  variation_id     text not null default '',
  campo            text not null check (campo in ('estado', 'precio', 'stock')),
  antes            text,
  despues          text,
  fecha            timestamptz not null default now(),
  origen           text not null default 'externo' check (origen in ('laucen', 'externo')),
  -- {sku, titulo} de ese momento y, si fue Laucen, {cola_id, cola_origen}.
  datos            jsonb not null default '{}'
);
create index if not exists meli_item_cambio_fecha on meli_item_cambio (organizacion_id, fecha desc);
create index if not exists meli_item_cambio_item on meli_item_cambio (canal_id, item_id, variation_id, fecha);
alter table meli_item_cambio enable row level security;
select erp_politica_org('meli_item_cambio');
-- Para encontrar rápido lo que la cola mandó a una publicación.
create index if not exists ml_cola_por_item on ml_cola (canal_id, item_id, creado_ts desc);

create or replace function public.meli_item_anotar_cambio() returns trigger
language plpgsql as $$
declare
  x record;
  q record;
begin
  for x in
    select v.campo, v.antes, v.despues, v.tipos
      from (values
        ('estado', old.estado, new.estado, array['estado', 'stock']),
        ('precio', old.precio::text, new.precio::text, array['precio', 'descuento', 'campana']),
        ('stock', old.stock::text, new.stock::text, array['stock'])
      ) v(campo, antes, despues, tipos)
     where v.antes is distinct from v.despues
  loop
    select c.id, c.origen into q
      from public.ml_cola c
     where c.canal_id = new.canal_id and c.item_id = new.item_id
       and (c.variation_id = new.variation_id or c.variation_id = '')
       and c.tipo = any(x.tipos)
       and c.estado in ('ok', 'enviando')
       and coalesce(c.enviado_ts, c.tomado_ts, c.creado_ts) > now() - interval '15 minutes'
     order by c.id desc limit 1;
    insert into public.meli_item_cambio (organizacion_id, canal_id, item_id, variation_id, campo, antes, despues, origen, datos)
    values (new.organizacion_id, new.canal_id, new.item_id, new.variation_id, x.campo, x.antes, x.despues,
            case when q.id is null then 'externo' else 'laucen' end,
            jsonb_strip_nulls(jsonb_build_object('sku', new.sku, 'titulo', new.titulo, 'cola_id', q.id, 'cola_origen', q.origen)));
  end loop;
  return null;
end $$;
create or replace trigger meli_item_anotar_cambio after update of estado, precio, stock on meli_item
  for each row when (old.estado is distinct from new.estado or old.precio is distinct from new.precio or old.stock is distinct from new.stock)
  execute function public.meli_item_anotar_cambio();

-- Tablero de Mercado Libre (4/10): la reputación de cada cuenta tal como la
-- informa ML (seller_reputation de /users/{id}), con cuándo se leyó. Se
-- actualiza con el botón del tablero y, sola, cuando tiene más de una hora.
alter table meli_cuenta add column if not exists reputacion jsonb;
alter table meli_cuenta add column if not exists reputacion_ts timestamptz;

-- Por qué una publicación está en revisión en ML (Fer, 5/10): lo que dice ML en
-- /moderations/infractions (motivo y solución sugerida, sin HTML). Se lee sólo para
-- las publicaciones "under_review" (lib/mercadolibre/moderaciones.ts), a lo sumo una
-- vez por día cada una. `por_precio`: el motivo o la solución hablan del precio.
-- `precio_corregido_ts`: cuándo se mandó un precio nuevo desde Laucen para levantarla.
create table if not exists meli_moderacion (
  organizacion_id      text not null references organizaciones(id) on delete cascade,
  canal_id             bigint not null references canal(id) on delete cascade,
  item_id              text not null,
  motivo               text,
  solucion             text,
  grupo                text,
  por_precio           boolean not null default false,
  datos                jsonb,
  leido_ts             timestamptz not null default now(),
  precio_corregido_ts  timestamptz,
  primary key (canal_id, item_id)
);
alter table meli_moderacion enable row level security;
select erp_politica_org('meli_moderacion');

-- Mercado Pago de cada cuenta de ML (Fer, 6/10). Sólo lectura.
-- Llave de Mercado Pago propia de la cuenta (opcional): si la conexión de
-- Mercado Libre no alcanza para leer algo de Mercado Pago, se usa ésta.
-- Nunca se muestra (sólo si hay o no).
create table if not exists mp_credencial (
  canal_id         bigint primary key references canal(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  access_token     text not null,
  actualizado_ts   timestamptz not null default now()
);
alter table mp_credencial enable row level security;

-- Cada lectura del saldo de Mercado Pago (para ver cómo fue cambiando y
-- para los análisis): lo que contestó tal cual, de dónde y con qué llave.
create table if not exists mp_saldo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  leido_ts         timestamptz not null default now(),
  fuente           text,
  datos            jsonb,
  intentos         jsonb not null default '[]'
);
create index if not exists mp_saldo_canal on mp_saldo (canal_id, leido_ts desc);
alter table mp_saldo enable row level security;
select erp_politica_org('mp_saldo');
