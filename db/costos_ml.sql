-- Costos de vender en Mercado Libre, relevados todos los días de la API de ML
-- con la cuenta de Fer (lib/costos-ml/proceso.ts).
--
-- Se guarda SÓLO LO QUE CAMBIA (Fer, 28/9): cada fila dice "desde tal
-- corrida, esto vale tanto". Si al día siguiente ML contesta lo mismo, no se
-- agrega nada; si cambia, se agrega una fila nueva y la anterior queda como
-- historia. Se guardan sólo los números que sirven, no la respuesta entera.
-- Para lo vigente, usar las vistas ml_costos_*_vigente (al final).
--
-- Idempotente. RLS prendido, sin políticas: sólo entra el servidor y el
-- conector de Supabase de las sesiones.

-- 28/9: la primera versión guardaba la foto completa de cada día con la
-- respuesta cruda (~10 MB/día). Si quedan esas tablas, se tiran (eran datos
-- de prueba de un solo día).
do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'ml_costos_comisiones' and column_name = 'crudo') then
    drop view if exists ml_costos_comisiones_vigente, ml_costos_cargo_fijo_vigente,
      ml_costos_envio_gratis_vigente, ml_costos_envio_destino_vigente;
    drop table if exists ml_costos_comisiones, ml_costos_cargo_fijo, ml_costos_envio_gratis,
      ml_costos_envio_destino, ml_costos_referencias;
    delete from ml_costos_corridas;
  end if;
end $$;

-- Una corrida por día (hora argentina). `fases` = las partes ya terminadas;
-- `cursor` = hasta qué categoría llegó la de comisiones.
create table if not exists ml_costos_corridas (
  id          bigint generated always as identity primary key,
  fecha       date not null unique,
  iniciada    timestamptz not null default now(),
  terminada   timestamptz,
  fases       text[] not null default '{}',
  meli_user   bigint,
  resumen     jsonb,
  error       text
);
alter table ml_costos_corridas enable row level security;
alter table ml_costos_corridas add column if not exists cursor text;
alter table ml_costos_corridas add column if not exists fallas int not null default 0;
alter table ml_costos_corridas add column if not exists cambios jsonb;  -- filas nuevas por tabla

-- Comisión por categoría hoja. El % no depende del precio (verificado 28/9).
-- Autos, Inmuebles y Servicios son clasificados: no tienen clásica ni premium.
create table if not exists ml_costos_comisiones (
  categoria_id       text not null,
  desde              timestamptz not null,
  corrida_id         bigint not null references ml_costos_corridas(id) on delete cascade,
  ruta               text,
  clasica_pct        numeric,   -- gold_special: % del precio
  premium_pct        numeric,   -- gold_pro: % total (incluye cuotas sin interés)
  premium_cuotas_pct numeric,   -- gold_pro: la parte del % que es por cuotas
  primary key (categoria_id, desde)
);
alter table ml_costos_comisiones enable row level security;

-- Cargo fijo por unidad (debajo del umbral de envío gratis). Depende del
-- precio y, si se manda logística, del peso facturable. logistica '-' = sin
-- mandar logística ni peso (peso_g 0).
create table if not exists ml_costos_cargo_fijo (
  tipo          text not null,          -- gold_special | gold_pro
  precio        numeric not null,
  logistica     text not null,
  peso_g        int not null,
  desde         timestamptz not null,
  corrida_id    bigint not null references ml_costos_corridas(id) on delete cascade,
  cargo_fijo    numeric,
  porcentaje    numeric,
  comision_total numeric,               -- % + cargo fijo, en pesos
  primary key (tipo, precio, logistica, peso_g, desde)
);
alter table ml_costos_cargo_fijo enable row level security;

-- Lo que paga el vendedor por el envío gratis (desde el umbral), igual para
-- todo el país. xd_drop_off = colecta / punto de despacho; fulfillment = Full.
create table if not exists ml_costos_envio_gratis (
  logistica       text not null,
  tipo            text not null,
  precio          numeric not null,
  peso_g          int not null,
  desde           timestamptz not null,
  corrida_id      bigint not null references ml_costos_corridas(id) on delete cascade,
  medidas         text not null,        -- 'LxAxH' cm, la caja que se mandó
  costo           numeric,              -- lo que paga el vendedor (con bonificación)
  costo_lleno     numeric,              -- sin la bonificación
  bonificacion    numeric,              -- 0,5 = 50 %
  peso_facturable int,                  -- gramos
  primary key (logistica, tipo, precio, peso_g, desde)
);
alter table ml_costos_envio_gratis enable row level security;

-- Lo que paga el comprador cuando el envío no es gratis (debajo del umbral),
-- por destino y peso, saliendo del código postal de la cuenta (Córdoba).
create table if not exists ml_costos_envio_destino (
  cp           text not null,
  peso_g       int not null,
  precio       numeric not null,
  desde        timestamptz not null,
  corrida_id   bigint not null references ml_costos_corridas(id) on delete cascade,
  lugar        text not null,
  provincia    text,
  medidas      text not null,
  costo_min    numeric,                 -- la opción más barata
  opciones     jsonb,                   -- [{nombre, tipo, metodo, costo}]
  primary key (cp, peso_g, precio, desde)
);
alter table ml_costos_envio_destino enable row level security;

-- Datos de referencia (tipos de publicación, métodos de envío, preferencias
-- de envío de la cuenta, nivel de reputación): también sólo cuando cambian.
create table if not exists ml_costos_referencias (
  clave      text not null,
  desde      timestamptz not null,
  corrida_id bigint not null references ml_costos_corridas(id) on delete cascade,
  datos      jsonb,
  primary key (clave, desde)
);
alter table ml_costos_referencias enable row level security;

-- Llave del llamado de continuación (/api/costos-ml/cron?clave=…), que hace
-- la base con pg_cron + pg_net cada 5 minutos mientras la corrida del día no
-- terminó. Una sola fila. El trabajo de pg_cron ("costos-ml-tanda", cada 5
-- minutos) está creado en la base, no acá.
create table if not exists ml_costos_llave (id int primary key default 1 check (id = 1), clave text not null);
alter table ml_costos_llave enable row level security;
insert into ml_costos_llave (clave) values (md5(random()::text || clock_timestamp()::text)) on conflict (id) do nothing;

-- ── Vistas: el valor vigente de cada cosa (la última fila) ──
-- security_invoker: respetan el RLS de quien consulta (no abren nada).

create or replace view ml_costos_comisiones_vigente with (security_invoker = true) as
  select distinct on (categoria_id) * from ml_costos_comisiones order by categoria_id, desde desc;

create or replace view ml_costos_cargo_fijo_vigente with (security_invoker = true) as
  select distinct on (tipo, precio, logistica, peso_g) * from ml_costos_cargo_fijo
   order by tipo, precio, logistica, peso_g, desde desc;

create or replace view ml_costos_envio_gratis_vigente with (security_invoker = true) as
  select distinct on (logistica, tipo, precio, peso_g) * from ml_costos_envio_gratis
   order by logistica, tipo, precio, peso_g, desde desc;

create or replace view ml_costos_envio_destino_vigente with (security_invoker = true) as
  select distinct on (cp, peso_g, precio) * from ml_costos_envio_destino
   order by cp, peso_g, precio, desde desc;
