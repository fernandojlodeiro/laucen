-- Impuestos (Fer, 23/10): las declaraciones juradas que presenta el contador (IVA, Ingresos Brutos por Convenio
-- Multilateral y la Contribución sobre el comercio y la industria de la Municipalidad de Córdoba), las jurisdicciones de
-- IIBB de cada razón social (coeficiente unificado y alícuota) y la provincia de cada percepción de IIBB. Con eso,
-- lib/impuestos/ controla cada declaración contra lo cargado y arma la posición del mes en curso. Idempotente.

-- Jurisdicciones de IIBB (Convenio Multilateral) de cada razón social: código de la Comisión Arbitral (901 CABA … 924
-- Tucumán), coeficiente unificado (0 a 1) y alícuota (%). Se cargan solas desde la última declaración de IIBB leída.
create table if not exists iibb_jurisdiccion (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  emisor_id        bigint not null references emisor(id) on delete cascade,
  codigo           int not null check (codigo between 901 and 924),
  coeficiente      numeric(12,8) not null default 0,
  alicuota         numeric(8,4) not null default 0,
  actualizado_ts   timestamptz not null default now(),
  primary key (emisor_id, codigo)
);
alter table iibb_jurisdiccion enable row level security;

-- La razón social: su jurisdicción sede (de entrada Córdoba) y si paga la contribución municipal de Córdoba.
alter table emisor add column if not exists iibb_sede int not null default 904;
alter table emisor add column if not exists municipal_inscripta boolean not null default false;
alter table emisor add column if not exists municipal_alicuota numeric(8,4);
alter table emisor add column if not exists municipal_minimo numeric(14,2);

-- La provincia de las percepciones de IIBB de cada factura de compra: [{"jur": 904, "importe": 123.45}]. Sin detalle,
-- la del proveedor (proveedor.iibb_jurisdiccion) y si no, la sede de la razón social.
alter table factura_compra add column if not exists percepcion_iibb_detalle jsonb;
alter table proveedor add column if not exists iibb_jurisdiccion int;

-- Las declaraciones juradas. `datos` son los importes que se usan (leídos por la IA y corregibles); `lectura`, lo que
-- devolvió la IA tal cual. Una rectificativa es otra fila del mismo período (vale la de número más alto).
create table if not exists ddjj (
  id                 bigint generated always as identity primary key,
  organizacion_id    text not null references organizaciones(id) on delete cascade,
  emisor_id          bigint not null references emisor(id) on delete cascade,
  impuesto           text not null check (impuesto in ('iva', 'iibb', 'municipal')),
  periodo            text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  rectificativa      int not null default 0,
  fecha_presentacion date,
  archivo            text,
  archivo_nombre     text,
  datos              jsonb not null default '{}'::jsonb,
  lectura            jsonb,
  notas              text,
  usuario_id         text,
  creado_ts          timestamptz not null default now(),
  actualizado_ts     timestamptz not null default now(),
  unique (emisor_id, impuesto, periodo, rectificativa)
);
create index if not exists ddjj_org on ddjj (organizacion_id, impuesto, periodo);
alter table ddjj enable row level security;
