-- Facturación electrónica contra ARCA (sesión 4/10). WSAA (login con
-- certificado) + WSFEv1 (CAE) + padrón (constancia de inscripción).

-- Alícuota de IVA de cada producto (los precios se cargan CON IVA; al
-- facturar se discrimina). 21 por defecto.
alter table producto add column if not exists iva_pct numeric(5, 2) not null default 21 check (iva_pct in (0, 2.5, 5, 10.5, 21, 27));

-- Los datos fiscales de quien factura (uno por organización).
create table if not exists emisor (
  id                   bigint generated always as identity primary key,
  organizacion_id      text not null references organizaciones(id) on delete cascade,
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
-- Varias razones sociales (CUIT) en una misma organización (4/10): el stock,
-- el catálogo, los clientes y los proveedores se comparten; lo que se separa
-- es lo fiscal y lo contable (facturas, libros de IVA, cuentas corrientes,
-- fondos, asientos). Hasta hoy había una por organización (clave
-- organizacion_id): se pasa a clave propia y la que había queda como principal.
-- La principal factura todo lo que no es de una cuenta de Mercado Libre con
-- razón social propia (canal.emisor_id).
alter table emisor add column if not exists id bigint generated always as identity;
alter table emisor add column if not exists nombre text;
alter table emisor add column if not exists es_principal boolean not null default false;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.emisor'::regclass and contype = 'p'
               and pg_get_constraintdef(oid) like '%(organizacion_id)%') then
    alter table emisor drop constraint emisor_pkey;
    alter table emisor add constraint emisor_pkey primary key (id);
    update emisor set es_principal = true;
  end if;
end $$;
create unique index if not exists emisor_cuit on emisor (organizacion_id, cuit);
create unique index if not exists emisor_principal on emisor (organizacion_id) where es_principal;
alter table emisor enable row level security;
select erp_politica_org('emisor');

-- La primera razón social de una organización nace principal (siempre hay una).
create or replace function emisor_primera_principal() returns trigger language plpgsql as
$f$ begin
  if not exists (select 1 from emisor where organizacion_id = new.organizacion_id) then new.es_principal := true; end if;
  return new;
end $f$;
drop trigger if exists emisor_primera on emisor;
create trigger emisor_primera before insert on emisor for each row execute function emisor_primera_principal();

-- La razón social principal de una organización.
create or replace function emisor_principal(p_org text) returns bigint language sql stable as
$f$ select id from emisor where organizacion_id = p_org and es_principal $f$;

-- Completa emisor_id con la principal cuando una fila nace sin razón social
-- (lo mismo que hacía el sistema antes de que hubiera dos): así ningún camino
-- de alta se olvida de la columna.
create or replace function emisor_por_defecto() returns trigger language plpgsql as
$f$ begin
  if new.emisor_id is null then new.emisor_id := emisor_principal(new.organizacion_id); end if;
  return new;
end $f$;

-- Agrega emisor_id a una tabla (si no la tiene), la completa con la principal
-- y le pone el disparador. Se llama una vez por tabla desde cada .sql.
create or replace function emisor_columna(p_tabla text) returns void language plpgsql as
$f$ begin
  execute format('alter table %I add column if not exists emisor_id bigint references emisor(id)', p_tabla);
  execute format('create index if not exists %I on %I (emisor_id)', p_tabla || '_emisor', p_tabla);
  execute format('update %I t set emisor_id = emisor_principal(t.organizacion_id) where t.emisor_id is null and emisor_principal(t.organizacion_id) is not null', p_tabla);
  execute format('drop trigger if exists emisor_defecto on %I', p_tabla);
  execute format('create trigger emisor_defecto before insert on %I for each row execute function emisor_por_defecto()', p_tabla);
end $f$;

-- Cada cuenta de Mercado Libre (canal) puede facturar con su propia razón
-- social; sin elegir, factura la principal.
alter table canal add column if not exists emisor_id bigint references emisor(id) on delete set null;

-- Clave privada y certificado de ARCA. RLS SIN políticas a propósito: sólo
-- entra el servidor.
create table if not exists arca_credencial (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  emisor_id        bigint not null references emisor(id) on delete cascade,
  ambiente         text not null check (ambiente in ('homologacion', 'produccion')),
  clave_privada    text not null,
  csr              text not null,
  certificado      text,
  cert_vence       timestamptz,
  actualizado_ts   timestamptz not null default now(),
  primary key (emisor_id, ambiente)
);
-- Antes la clave era (organizacion_id, ambiente): ahora cada razón social tiene las suyas.
alter table arca_credencial add column if not exists emisor_id bigint references emisor(id) on delete cascade;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.arca_credencial'::regclass and contype = 'p'
               and pg_get_constraintdef(oid) like '%organizacion_id%') then
    update arca_credencial c set emisor_id = emisor_principal(c.organizacion_id) where c.emisor_id is null;
    delete from arca_credencial where emisor_id is null;
    alter table arca_credencial drop constraint arca_credencial_pkey;
    alter table arca_credencial alter column emisor_id set not null;
    alter table arca_credencial add constraint arca_credencial_pkey primary key (emisor_id, ambiente);
  end if;
end $$;
alter table arca_credencial enable row level security;

-- El ticket de acceso de WSAA (dura 12 h y ARCA no da otro mientras éste
-- siga vigente: hay que guardarlo y reusarlo).
create table if not exists arca_ticket (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  emisor_id        bigint not null references emisor(id) on delete cascade,
  ambiente         text not null,
  servicio         text not null,
  token            text not null,
  sign             text not null,
  vence            timestamptz not null,
  primary key (emisor_id, ambiente, servicio)
);
alter table arca_ticket add column if not exists emisor_id bigint references emisor(id) on delete cascade;
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'public.arca_ticket'::regclass and contype = 'p'
               and pg_get_constraintdef(oid) like '%organizacion_id%') then
    delete from arca_ticket;  -- es una memoria de 12 h: se vuelve a pedir
    alter table arca_ticket drop constraint arca_ticket_pkey;
    alter table arca_ticket alter column emisor_id set not null;
    alter table arca_ticket add constraint arca_ticket_pkey primary key (emisor_id, ambiente, servicio);
  end if;
end $$;
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
-- Razón social que emitió el comprobante (la numeración es de cada una).
select emisor_columna('comprobante');
drop index if exists comprobante_numero;
create unique index if not exists comprobante_numero_emisor on comprobante (emisor_id, ambiente, punto_venta, tipo_cbte, numero) where numero is not null;
create index if not exists comprobante_pedido on comprobante (pedido_id);
create index if not exists comprobante_estado on comprobante (organizacion_id, estado, creado_ts desc);
-- La factura subida a la venta de Mercado Libre (lib/mercadolibre/facturas.ts):
-- el id que devolvió ML y cuándo. Con ml_subida_ts no se vuelve a subir.
alter table comprobante add column if not exists ml_documento_id text;
alter table comprobante add column if not exists ml_subida_ts timestamptz;
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

-- Datos generales de la empresa (Configuración → Empresa): lo que no es
-- fiscal. Lo fiscal (CUIT, razón social, condición IVA, punto de venta) vive
-- en `emisor`. El logo sale en las facturas y es el de la tienda si la
-- tienda no tiene uno propio.
create table if not exists empresa (
  organizacion_id  text primary key references organizaciones(id) on delete cascade,
  nombre_fantasia  text,
  logo             text,
  email            text,
  telefono         text,
  whatsapp         text,
  web              text,
  direccion        text,
  localidad        text,
  provincia        text,
  codigo_postal    text,
  actualizado_ts   timestamptz not null default now()
);
alter table empresa enable row level security;
select erp_politica_org('empresa');

-- Nota de crédito de una factura emitida FUERA de Laucen (ventas de Virtual
-- Seller, pedido de Fer 5/10, bitácora #341): no hay comprobante_asociado_id,
-- la factura original va acá tal como la devolvió ARCA:
-- {tipo, punto_venta, numero, fecha, total}.
alter table comprobante add column if not exists asociado_externo jsonb;
