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

-- Google Drive (Fer, 23/10): la aplicación de Google de Laucen (una para todo el sistema, la carga el dueño en
-- /admin/google) y la conexión de cada organización con su Drive: la llave para seguir subiendo (refresh_token, nunca
-- se muestra) y la carpeta del contador que crea Laucen (permiso drive.file: Laucen sólo ve lo que crea).
create table if not exists plataforma_google (
  id              int primary key check (id = 1),
  client_id       text not null,
  client_secret   text not null,
  actualizado_ts  timestamptz not null default now()
);
alter table plataforma_google enable row level security;

create table if not exists google_drive (
  organizacion_id  text primary key references organizaciones(id) on delete cascade,
  refresh_token    text,
  cuenta_email     text,
  carpeta_id       text,
  carpeta_nombre   text,
  compartida_con   text,
  conectado_ts     timestamptz,
  ultimo_envio_ts  timestamptz,
  ultimo_envio     text,
  actualizado_ts   timestamptz not null default now()
);
alter table google_drive enable row level security;
-- El árbol de carpetas que ya se usa con el contador (Fer, 23/10): la ruta de ejemplo de cada razón social
-- ({"<emisor_id>": {"texto": "...", "segmentos": [...]}}) y el permiso que dio Google al conectar.
alter table google_drive add column if not exists rutas jsonb not null default '{}'::jsonb;
alter table google_drive add column if not exists alcance text;

-- Las declaraciones que el contador deja en el Drive (Fer, 23/10): cada archivo leído (por su id de Google y su fecha
-- de modificación), para no pasarlo dos veces por la IA. `estado`: ddjj (cargada), ya_estaba, otro (cedulón, pago u
-- otro papel que no es una declaración) o error.
create table if not exists drive_archivo_leido (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  archivo_id       text not null,
  nombre           text,
  modificado       text,
  carpeta          text,
  estado           text not null,
  mensaje          text,
  ddjj_id          bigint references ddjj(id) on delete set null,
  leido_ts         timestamptz not null default now(),
  primary key (organizacion_id, archivo_id)
);
alter table drive_archivo_leido enable row level security;
alter table google_drive add column if not exists ddjj_leido_ts timestamptz;
alter table google_drive add column if not exists ddjj_resultado text;

-- Ventas facturadas con otro sistema (Fer, 23/10: Virtual Seller hasta el 3/10/2026, mismo punto de venta): se importan
-- de los TXT del Libro de IVA Digital (ventas: comprobantes + alícuotas) y entran al libro de IVA ventas, a sus TXT y a
-- la posición de impuestos como si las hubiera emitido Laucen. `datos` = el comprobante del libro (lib/administracion/
-- libro-iva.ts, CbteIva sin id). Un comprobante que también está en Laucen (mismo tipo, punto de venta y número) no se importa.
create table if not exists venta_externa (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  emisor_id        bigint not null references emisor(id) on delete cascade,
  sistema          text not null,
  fecha            date not null,
  tipo             int not null,
  punto_venta      int not null,
  numero           bigint not null,
  datos            jsonb not null,
  archivo          text,
  importado_ts     timestamptz not null default now(),
  unique (emisor_id, tipo, punto_venta, numero)
);
create index if not exists venta_externa_fecha on venta_externa (organizacion_id, emisor_id, fecha);
alter table venta_externa enable row level security;

-- Compras de períodos anteriores a Laucen, de "Mis Comprobantes – Recibidos" (lib/administracion/compras-externas.ts).
create table if not exists compra_externa (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  emisor_id        bigint not null references emisor(id) on delete cascade,
  sistema          text not null,
  fecha            date not null,
  cuit             text not null,
  tipo             int not null,
  punto_venta      int not null,
  numero           bigint not null,
  datos            jsonb not null,
  archivo          text,
  importado_ts     timestamptz not null default now(),
  unique (emisor_id, cuit, tipo, punto_venta, numero)
);
create index if not exists compra_externa_fecha on compra_externa (organizacion_id, emisor_id, fecha);
alter table compra_externa enable row level security;
