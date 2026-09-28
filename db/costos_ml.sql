-- Costos de vender en Mercado Libre, relevados todos los días de la API de ML
-- con la cuenta de Fer (lib/costos-ml/proceso.ts). Cada corrida es una foto
-- con fecha y hora; las otras sesiones que calculan costos leen de acá.
-- Para lo vigente, usar las vistas ml_costos_*_vigente (al final).
--
-- Idempotente. RLS prendido, sin políticas: sólo entra el servidor (Drizzle /
-- pg) y el conector de Supabase de las sesiones.

-- Una corrida por día (hora argentina). `fases` = las partes ya terminadas.
create table if not exists ml_costos_corridas (
  id          bigint generated always as identity primary key,
  fecha       date not null unique,
  iniciada    timestamptz not null default now(),
  terminada   timestamptz,
  fases       text[] not null default '{}',
  meli_user   bigint,               -- la cuenta de ML con que se preguntó
  resumen     jsonb,
  error       text
);
alter table ml_costos_corridas enable row level security;

-- Comisión por categoría hoja y tipo de publicación. El % no depende del
-- precio (verificado 28/9 con $5.000, $20.000 y $500.000); se pregunta con un
-- precio alto para que no se mezcle el cargo fijo. `crudo` = la respuesta
-- entera de /sites/MLA/listing_prices (todos los tipos de publicación).
create table if not exists ml_costos_comisiones (
  corrida_id        bigint not null references ml_costos_corridas(id) on delete cascade,
  categoria_id      text not null,
  ts                timestamptz not null default now(),
  ruta              text,
  status            int not null,
  intentos          int not null default 1,
  precio            numeric,
  clasica_pct       numeric,   -- gold_special: % del precio
  premium_pct       numeric,   -- gold_pro: % total (incluye cuotas sin interés)
  premium_cuotas_pct numeric,  -- gold_pro: la parte del % que es por cuotas (financing_add_on_fee)
  crudo             jsonb,
  primary key (corrida_id, categoria_id)
);
alter table ml_costos_comisiones enable row level security;

-- Cargo fijo por unidad (se cobra debajo del umbral de envío gratis). Depende
-- del precio y, si se manda logística, del peso facturable.
create table if not exists ml_costos_cargo_fijo (
  corrida_id   bigint not null references ml_costos_corridas(id) on delete cascade,
  ts           timestamptz not null default now(),
  categoria_id text not null,          -- la de referencia de la consulta
  tipo         text not null,          -- gold_special | gold_pro
  precio       numeric not null,
  logistica    text,                   -- null = sin mandar logística ni peso
  peso_g       int,
  status       int not null,
  cargo_fijo   numeric,
  porcentaje   numeric,
  comision_total numeric,              -- sale_fee_amount: % + cargo fijo, en pesos
  crudo        jsonb
);
alter table ml_costos_cargo_fijo enable row level security;
create index if not exists ml_costos_cargo_fijo_corrida on ml_costos_cargo_fijo (corrida_id);

-- Lo que paga el vendedor por el envío gratis (desde el umbral), por peso,
-- precio y logística (xd_drop_off = llevarlo a un punto/colecta; fulfillment
-- = Full). ML lo da para todo el país (no depende del destino).
create table if not exists ml_costos_envio_gratis (
  corrida_id      bigint not null references ml_costos_corridas(id) on delete cascade,
  ts              timestamptz not null default now(),
  logistica       text not null,
  tipo            text not null,        -- tipo de publicación
  precio          numeric not null,
  peso_g          int not null,
  medidas         text not null,        -- 'LxAxH' en cm, la caja que se mandó
  status          int not null,
  costo           numeric,              -- list_cost: lo que paga el vendedor
  costo_lleno     numeric,              -- promoted_amount: el costo sin la bonificación
  bonificacion    numeric,              -- discount.rate (0,5 = 50 %)
  peso_facturable int,                  -- billable_weight en gramos
  crudo           jsonb
);
alter table ml_costos_envio_gratis enable row level security;
create index if not exists ml_costos_envio_gratis_corrida on ml_costos_envio_gratis (corrida_id);

-- Lo que paga el comprador por el envío cuando no es gratis (debajo del
-- umbral), por destino y peso, saliendo desde el código postal de la cuenta.
create table if not exists ml_costos_envio_destino (
  corrida_id   bigint not null references ml_costos_corridas(id) on delete cascade,
  ts           timestamptz not null default now(),
  cp           text not null,
  lugar        text not null,           -- ciudad de referencia
  provincia    text,                    -- la que devuelve ML
  precio       numeric not null,
  peso_g       int not null,
  medidas      text not null,
  status       int not null,
  costo_min    numeric,                 -- la opción más barata
  opciones     jsonb,                   -- [{nombre, tipo, metodo, costo, costo_lista}]
  crudo        jsonb
);
alter table ml_costos_envio_destino enable row level security;
create index if not exists ml_costos_envio_destino_corrida on ml_costos_envio_destino (corrida_id);

-- Datos de referencia del día: tipos de publicación, métodos de envío,
-- preferencias de envío de la cuenta, reputación, etc. (respuesta cruda).
create table if not exists ml_costos_referencias (
  corrida_id bigint not null references ml_costos_corridas(id) on delete cascade,
  clave      text not null,
  ts         timestamptz not null default now(),
  ruta       text not null,
  status     int not null,
  datos      jsonb,
  primary key (corrida_id, clave)
);
alter table ml_costos_referencias enable row level security;

-- Llave del llamado de continuación (/api/costos-ml/cron?clave=…), que hace
-- la base con pg_cron + pg_net cada 5 minutos mientras la corrida del día no
-- terminó. Una sola fila. El trabajo de pg_cron ("costos-ml-tanda", cada 5
-- minutos) está creado en la base, no acá.
create table if not exists ml_costos_llave (id int primary key default 1 check (id = 1), clave text not null);
alter table ml_costos_llave enable row level security;
insert into ml_costos_llave (clave) values (md5(random()::text || clock_timestamp()::text)) on conflict (id) do nothing;

-- ── Vistas para leer lo vigente ────────────────────────
-- security_invoker: respetan el RLS de quien consulta (no abren nada).

-- La última lectura buena de cada categoría (aunque la corrida de hoy no haya
-- terminado).
create or replace view ml_costos_comisiones_vigente with (security_invoker = true) as
  select distinct on (categoria_id) categoria_id, ruta, ts, clasica_pct, premium_pct, premium_cuotas_pct, corrida_id
    from ml_costos_comisiones where status = 200
   order by categoria_id, corrida_id desc;

-- Las demás tablas: la última corrida que terminó esa parte.
create or replace view ml_costos_cargo_fijo_vigente with (security_invoker = true) as
  select c.* from ml_costos_cargo_fijo c
   where c.corrida_id = (select max(id) from ml_costos_corridas where 'cargo_fijo' = any(fases));

create or replace view ml_costos_envio_gratis_vigente with (security_invoker = true) as
  select e.* from ml_costos_envio_gratis e
   where e.corrida_id = (select max(id) from ml_costos_corridas where 'envio_gratis' = any(fases));

create or replace view ml_costos_envio_destino_vigente with (security_invoker = true) as
  select e.* from ml_costos_envio_destino e
   where e.corrida_id = (select max(id) from ml_costos_corridas where 'envio_destino' = any(fases));
