-- Facturación electrónica contra ARCA (sesión 4/10). WSAA (login con
-- certificado) + WSFEv1 (CAE) + padrón (constancia de inscripción).

-- Alícuota de IVA de cada producto (los precios se cargan CON IVA; al
-- facturar se discrimina). 21 por defecto.
alter table producto add column if not exists iva_pct numeric(5, 2) not null default 21 check (iva_pct in (0, 2.5, 5, 10.5, 21, 27));

-- Los datos fiscales de quien factura (uno por organización).
create table if not exists emisor (
  organizacion_id      text primary key references organizaciones(id) on delete cascade,
  cuit                 text not null,
  razon_social         text not null,
  condicion_iva        text not null default 'responsable_inscripto' check (condicion_iva in ('responsable_inscripto', 'monotributo', 'exento')),
  domicilio            text,
  iibb                 text,
  inicio_actividades   date,
  punto_venta          int not null default 1 check (punto_venta between 1 and 99998),
  ambiente             text not null default 'homologacion' check (ambiente in ('homologacion', 'produccion')),
  -- Facturar solo: al llegar el pedido a este estado (o nunca).
  facturar_automatico  boolean not null default false,
  facturar_al          text not null default 'preparado' check (facturar_al in ('pagado', 'preparado', 'despachado')),
  actualizado_ts       timestamptz not null default now()
);
alter table emisor enable row level security;
select erp_politica_org('emisor');

-- Clave privada y certificado de ARCA. RLS SIN políticas a propósito: sólo
-- entra el servidor.
create table if not exists arca_credencial (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  ambiente         text not null check (ambiente in ('homologacion', 'produccion')),
  clave_privada    text not null,
  csr              text not null,
  certificado      text,
  cert_vence       timestamptz,
  actualizado_ts   timestamptz not null default now(),
  primary key (organizacion_id, ambiente)
);
alter table arca_credencial enable row level security;

-- El ticket de acceso de WSAA (dura 12 h y ARCA no da otro mientras éste
-- siga vigente: hay que guardarlo y reusarlo).
create table if not exists arca_ticket (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  ambiente         text not null,
  servicio         text not null,
  token            text not null,
  sign             text not null,
  vence            timestamptz not null,
  primary key (organizacion_id, ambiente, servicio)
);
alter table arca_ticket enable row level security;

-- Comprobantes (facturas y notas de crédito).
create table if not exists comprobante (
  id                     bigint generated always as identity primary key,
  organizacion_id        text not null references organizaciones(id) on delete cascade,
  pedido_id              bigint references pedido(id) on delete set null,
  cliente_id             bigint references cliente(id) on delete set null,
  ambiente               text not null,
  -- 1/6/11 factura A/B/C · 3/8/13 nota de crédito A/B/C.
  tipo_cbte              int not null,
  punto_venta            int not null,
  numero                 bigint,
  fecha                  date not null default current_date,
  concepto               int not null default 1,
  doc_tipo               int not null,
  doc_nro                text not null,
  receptor_nombre        text,
  receptor_condicion_iva int,
  receptor_domicilio     text,
  moneda                 text not null default 'PES',
  cotizacion             numeric(14, 6) not null default 1,
  importe_total          numeric(16, 2) not null,
  importe_neto           numeric(16, 2) not null,
  importe_iva            numeric(16, 2) not null default 0,
  iva_detalle            jsonb not null default '[]',
  comprobante_asociado_id bigint references comprobante(id),
  estado                 text not null default 'pendiente' check (estado in ('pendiente', 'autorizado', 'rechazado', 'error')),
  cae                    text,
  cae_vto                date,
  observaciones          text,
  intentos               int not null default 0,
  pedido_a_arca          jsonb,
  respuesta_arca         jsonb,
  usuario_id             text,
  creado_ts              timestamptz not null default now(),
  autorizado_ts          timestamptz
);
create unique index if not exists comprobante_numero on comprobante (organizacion_id, ambiente, punto_venta, tipo_cbte, numero) where numero is not null;
create index if not exists comprobante_pedido on comprobante (pedido_id);
create index if not exists comprobante_estado on comprobante (organizacion_id, estado, creado_ts desc);
alter table comprobante enable row level security;
select erp_politica_org('comprobante');

create table if not exists comprobante_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  comprobante_id   bigint not null references comprobante(id) on delete cascade,
  variacion_id     bigint references variacion(id) on delete set null,
  descripcion      text not null,
  cantidad         numeric(12, 3) not null,
  precio_unit      numeric(16, 2) not null,     -- con IVA
  iva_pct          numeric(5, 2) not null,
  neto             numeric(16, 2) not null,
  iva              numeric(16, 2) not null,
  total            numeric(16, 2) not null,
  orden            int not null default 0
);
create index if not exists comprobante_linea_cbte on comprobante_linea (comprobante_id, orden);
alter table comprobante_linea enable row level security;
select erp_politica_org('comprobante_linea');

-- La llave de las tareas periódicas del ERP. El job de pg_cron (creado a
-- mano en Supabase el 2/10, nombre 'erp-tareas', cada 2 minutos) llama a
-- https://laucen.vercel.app/api/erp/tareas?clave=<erp_llave.clave> cuando hay
-- facturación automática prendida o comprobantes con error para reintentar.
create table if not exists erp_llave (
  id     int primary key check (id = 1),
  clave  text not null
);
insert into erp_llave (id, clave) values (1, encode(gen_random_bytes(24), 'hex')) on conflict (id) do nothing;
alter table erp_llave enable row level security;
