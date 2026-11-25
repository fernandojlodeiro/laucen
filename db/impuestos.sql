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

-- Carpetas del Drive con facturas de compra (lib/compras/drive-facturas.ts): [{texto, segmentos}], cada una ordenada por año y mes.
alter table google_drive add column if not exists rutas_facturas jsonb not null default '[]'::jsonb;
alter table google_drive add column if not exists facturas_leido_ts timestamptz;
alter table google_drive add column if not exists facturas_resultado text;
alter table drive_archivo_leido add column if not exists factura_id bigint references factura_compra(id) on delete set null;

-- ── Libro de IVA: mes de imputación de las compras y traba de los meses liquidados (Fer, 25/11) ──────────────────────
-- Un mes de una razón social está «liquidado» cuando tiene cargada su declaración jurada de IVA (tabla ddjj). Desde ese
-- momento nadie toca lo que entró en su Libro de IVA compras: las facturas de compra y los despachos registrados en ese
-- mes no cambian ni vuelven a borrador, y no se importan ni se borran compras o ventas de otro sistema de ese mes. Un
-- comprobante con fecha de un mes liquidado que se registra después entra en el primer mes sin liquidar (periodo_iva).
-- La traba está acá, en la base, para que valga por cualquier camino (pantallas, asistente, SQL).
create or replace function iva_mes_cerrado(p_emisor bigint, p_periodo text) returns boolean language sql stable as $$
  select p_emisor is not null and p_periodo is not null
     and exists (select 1 from ddjj where emisor_id = p_emisor and impuesto = 'iva' and periodo = p_periodo)
$$;

-- El primer mes sin liquidar desde el de la fecha (AAAA-MM).
create or replace function iva_mes_abierto(p_emisor bigint, p_fecha date) returns text language plpgsql stable as $$
declare m date := date_trunc('month', p_fecha)::date;
begin
  if p_emisor is null or p_fecha is null then return to_char(m, 'YYYY-MM'); end if;
  while iva_mes_cerrado(p_emisor, to_char(m, 'YYYY-MM')) loop m := (m + interval '1 month')::date; end loop;
  return to_char(m, 'YYYY-MM');
end $$;

alter table factura_compra add column if not exists periodo_iva text;
alter table despacho_importacion add column if not exists periodo_iva text;
update factura_compra set periodo_iva = to_char(fecha, 'YYYY-MM') where periodo_iva is null and estado = 'registrada';
update despacho_importacion set periodo_iva = to_char(fecha, 'YYYY-MM') where periodo_iva is null and estado = 'registrado';

create or replace function factura_compra_iva_traba() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.estado = 'registrada' and iva_mes_cerrado(old.emisor_id, old.periodo_iva) then
    if tg_op = 'DELETE' or row(new.estado, new.emisor_id, new.proveedor_id, new.letra, new.tipo_cbte, new.es_nota_credito, new.es_nota_debito,
         new.punto_venta, new.numero, new.fecha, new.periodo_iva, new.moneda, new.cotizacion, new.neto, new.iva, new.iva_detalle,
         new.percepcion_iva, new.percepcion_iibb, new.otros_impuestos, new.no_gravado, new.total)
       is distinct from row(old.estado, old.emisor_id, old.proveedor_id, old.letra, old.tipo_cbte, old.es_nota_credito, old.es_nota_debito,
         old.punto_venta, old.numero, old.fecha, old.periodo_iva, old.moneda, old.cotizacion, old.neto, old.iva, old.iva_detalle,
         old.percepcion_iva, old.percepcion_iibb, old.otros_impuestos, old.no_gravado, old.total) then
      raise exception 'El Libro de IVA compras de % ya está liquidado (tiene cargada la declaración jurada de IVA): sus comprobantes no se pueden cambiar.', old.periodo_iva;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.estado = 'registrada' then
    if tg_op = 'INSERT' or old.estado is distinct from 'registrada' or new.fecha is distinct from old.fecha or new.emisor_id is distinct from old.emisor_id
       or new.periodo_iva is null then
      new.periodo_iva := iva_mes_abierto(new.emisor_id, new.fecha);
    end if;
  else
    new.periodo_iva := null;
  end if;
  return new;
end $$;
drop trigger if exists factura_compra_iva_traba on factura_compra;
create trigger factura_compra_iva_traba before insert or update or delete on factura_compra for each row execute function factura_compra_iva_traba();

create or replace function despacho_iva_traba() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.estado = 'registrado' and iva_mes_cerrado(old.emisor_id, old.periodo_iva) then
    if tg_op = 'DELETE' or row(new.estado, new.emisor_id, new.numero, new.fecha, new.periodo_iva, new.cotizacion, new.fob_usd, new.flete_usd, new.seguro_usd,
         new.gastos, new.impuestos)
       is distinct from row(old.estado, old.emisor_id, old.numero, old.fecha, old.periodo_iva, old.cotizacion, old.fob_usd, old.flete_usd, old.seguro_usd,
         old.gastos, old.impuestos) then
      raise exception 'El Libro de IVA compras de % ya está liquidado (tiene cargada la declaración jurada de IVA): el despacho no se puede cambiar.', old.periodo_iva;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.estado = 'registrado' then
    if tg_op = 'INSERT' or old.estado is distinct from 'registrado' or new.fecha is distinct from old.fecha or new.emisor_id is distinct from old.emisor_id
       or new.periodo_iva is null then
      new.periodo_iva := iva_mes_abierto(new.emisor_id, new.fecha);
    end if;
  else
    new.periodo_iva := null;
  end if;
  return new;
end $$;
drop trigger if exists despacho_iva_traba on despacho_importacion;
create trigger despacho_iva_traba before insert or update or delete on despacho_importacion for each row execute function despacho_iva_traba();

-- Lo importado de otro sistema (ventas de Virtual Seller, compras de Mis Comprobantes) de un mes liquidado tampoco cambia.
create or replace function externa_iva_traba() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and iva_mes_cerrado(old.emisor_id, to_char(old.fecha, 'YYYY-MM')) then
    raise exception 'El Libro de IVA de % ya está liquidado (tiene cargada la declaración jurada de IVA): no se puede cambiar.', to_char(old.fecha, 'YYYY-MM');
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if iva_mes_cerrado(new.emisor_id, to_char(new.fecha, 'YYYY-MM')) then
    raise exception 'El Libro de IVA de % ya está liquidado (tiene cargada la declaración jurada de IVA): no se puede cambiar.', to_char(new.fecha, 'YYYY-MM');
  end if;
  return new;
end $$;
drop trigger if exists venta_externa_iva_traba on venta_externa;
create trigger venta_externa_iva_traba before insert or update or delete on venta_externa for each row execute function externa_iva_traba();
drop trigger if exists compra_externa_iva_traba on compra_externa;
create trigger compra_externa_iva_traba before insert or update or delete on compra_externa for each row execute function externa_iva_traba();

-- La declaración de IVA es la que traba el mes: no se borra ni se cambia de mes, salvo el superadministrador desde
-- Impuestos (la acción prende laucen.ddjj_borrar en su transacción y deja el registro en ddjj_borrada).
create table if not exists ddjj_borrada (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  emisor_id        bigint not null,
  impuesto         text not null,
  periodo          text not null,
  rectificativa    int not null,
  datos            jsonb,
  usuario_id       text,
  usuario_email    text,
  borrada_ts       timestamptz not null default now()
);
alter table ddjj_borrada enable row level security;

create or replace function ddjj_iva_traba() returns trigger language plpgsql as $$
begin
  if old.impuesto = 'iva' and coalesce(current_setting('laucen.ddjj_borrar', true), '') <> 'si'
     and (tg_op = 'DELETE' or row(new.emisor_id, new.impuesto, new.periodo) is distinct from row(old.emisor_id, old.impuesto, old.periodo)) then
    raise exception 'La declaración jurada de IVA de % traba ese mes del Libro de IVA: sólo el superadministrador la puede borrar, desde Impuestos.', old.periodo;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists ddjj_iva_traba on ddjj;
create trigger ddjj_iva_traba before update or delete on ddjj for each row execute function ddjj_iva_traba();

-- Las subidas del Libro de IVA al Drive (Fer, 25/11): las automáticas (ventas el día 1 del mes que terminó; compras cada
-- noche, mientras el mes no esté liquidado, sólo si cambiaron) y las del botón «Mandar al Drive». `que`: todo (los 5 TXT
-- y las ventas por provincia) o compras (los 3 TXT de compras). `huella_compras`: con qué se compara la noche siguiente.
create table if not exists libro_iva_envio (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  emisor_id        bigint not null references emisor(id) on delete cascade,
  periodo          text not null check (periodo ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  que              text not null check (que in ('todo', 'compras')),
  origen           text not null check (origen in ('automatico', 'manual')),
  ok               boolean not null,
  archivos         text[],
  donde            text,
  huella_compras   text,
  error            text,
  usuario_id       text,
  ts               timestamptz not null default now()
);
create index if not exists libro_iva_envio_mes on libro_iva_envio (organizacion_id, emisor_id, periodo, ts desc);
alter table libro_iva_envio enable row level security;
