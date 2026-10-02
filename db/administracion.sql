-- Administración (sesión 5/10): costos, compras e importaciones, cuentas
-- corrientes, tesorería (caja, bancos, Mercado Pago) y contabilidad.
--
-- Cómo se encadena: los documentos (factura de compra, despacho, recibo,
-- orden de pago, gasto, comprobante de venta) mueven stock, cuenta corriente
-- y fondos con sus funciones de lib/administracion/; la contabilidad NO se
-- carga a mano: "contabilizar" recorre los documentos que todavía no tienen
-- asiento y lo genera (uno por documento, idempotente).

-- ── Costos ────────────────────────────────────────────────
-- Último costo y costo promedio ponderado de cada variación (en pesos y en
-- dólares, congelados al registrar cada compra). Los mueve sólo
-- registrarCosto() al entrar mercadería comprada.
alter table variacion add column if not exists costo_ultimo_ars numeric(16, 2);
alter table variacion add column if not exists costo_ultimo_usd numeric(16, 4);
alter table variacion add column if not exists costo_promedio_ars numeric(16, 2);
alter table variacion add column if not exists costo_promedio_usd numeric(16, 4);
alter table variacion add column if not exists costo_actualizado_ts timestamptz;

-- ── Compras ───────────────────────────────────────────────
create table if not exists factura_compra (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  proveedor_id     bigint not null references proveedor(id),
  -- A, B, C, M, E (exterior), X (remito/otro sin IVA discriminado)
  letra            text not null default 'A' check (letra in ('A', 'B', 'C', 'M', 'E', 'X')),
  es_nota_credito  boolean not null default false,
  punto_venta      int,
  numero           bigint,
  fecha            date not null default current_date,
  vencimiento      date,
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  cotizacion       numeric(14, 4) not null default 1,
  neto             numeric(16, 2) not null default 0,
  iva              numeric(16, 2) not null default 0,
  iva_detalle      jsonb not null default '[]',
  percepcion_iva   numeric(16, 2) not null default 0,
  percepcion_iibb  numeric(16, 2) not null default 0,
  otros_impuestos  numeric(16, 2) not null default 0,
  no_gravado       numeric(16, 2) not null default 0,
  total            numeric(16, 2) not null default 0,
  total_ars        numeric(16, 2) not null default 0,
  total_usd        numeric(16, 2) not null default 0,
  -- Si mueve stock, a qué depósito (si la mercadería ya entró por una
  -- recepción, se vincula y no se vuelve a ingresar).
  deposito_id      bigint references deposito(id),
  recepcion_id     bigint references recepcion(id) on delete set null,
  -- Si es un gasto (servicios, fletes…) y no mercadería: la cuenta contable.
  cuenta_gasto_id  bigint,
  estado           text not null default 'borrador' check (estado in ('borrador', 'registrada', 'anulada')),
  notas            text,
  usuario_id       text,
  registrada_ts    timestamptz,
  creado_ts        timestamptz not null default now()
);
create index if not exists factura_compra_org on factura_compra (organizacion_id, fecha desc);
create unique index if not exists factura_compra_numero on factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, punto_venta, numero)
  where numero is not null and estado <> 'anulada';
alter table factura_compra enable row level security;
select erp_politica_org('factura_compra');

create table if not exists factura_compra_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  factura_id       bigint not null references factura_compra(id) on delete cascade,
  variacion_id     bigint references variacion(id),
  descripcion      text not null,
  cantidad         numeric(12, 3) not null check (cantidad > 0),
  costo_unit       numeric(16, 4) not null,           -- neto (sin IVA), en la moneda de la factura
  iva_pct          numeric(5, 2) not null default 21,
  neto             numeric(16, 2) not null,
  iva              numeric(16, 2) not null,
  orden            int not null default 0
);
create index if not exists factura_compra_linea_f on factura_compra_linea (factura_id, orden);
alter table factura_compra_linea enable row level security;
select erp_politica_org('factura_compra_linea');

-- Despacho de importación: la mercadería importada con todos sus costos
-- (FOB, flete, seguro, derechos, tasas, despachante…). Al registrarlo se
-- prorratean los costos sobre las líneas por su valor FOB y queda el costo
-- unitario "puesto en depósito" de cada variación. El IVA y las
-- percepciones del despacho son crédito fiscal, no costo.
create table if not exists despacho_importacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  numero           text,                             -- nº de despacho (ej. 26001IC04012345X)
  proveedor_id     bigint references proveedor(id),   -- el proveedor del exterior
  fecha            date not null default current_date,
  cotizacion       numeric(14, 4) not null,           -- dólar del despacho
  fob_usd          numeric(16, 2) not null default 0,
  flete_usd        numeric(16, 2) not null default 0,
  seguro_usd       numeric(16, 2) not null default 0,
  -- Costos que se suman al costo (en pesos): derechos, tasa estadística,
  -- despachante, depósito fiscal, flete interno, etc. [{concepto, importe_ars}]
  gastos           jsonb not null default '[]',
  -- Impuestos que NO son costo (crédito fiscal), en pesos: IVA, IVA adicional,
  -- ganancias, IIBB. [{concepto, importe_ars}]
  impuestos        jsonb not null default '[]',
  deposito_id      bigint references deposito(id),
  estado           text not null default 'borrador' check (estado in ('borrador', 'registrado', 'anulado')),
  notas            text,
  usuario_id       text,
  registrado_ts    timestamptz,
  creado_ts        timestamptz not null default now()
);
alter table despacho_importacion enable row level security;
select erp_politica_org('despacho_importacion');

create table if not exists despacho_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  despacho_id      bigint not null references despacho_importacion(id) on delete cascade,
  variacion_id     bigint references variacion(id),
  descripcion      text not null,
  ncm              text,
  cantidad         int not null check (cantidad > 0),
  fob_unit_usd     numeric(16, 4) not null,
  -- Lo calcula el registro: costo unitario puesto en depósito.
  costo_unit_ars   numeric(16, 2),
  costo_unit_usd   numeric(16, 4),
  orden            int not null default 0
);
create index if not exists despacho_linea_d on despacho_linea (despacho_id, orden);
alter table despacho_linea enable row level security;
select erp_politica_org('despacho_linea');

-- ── Cuentas corrientes ────────────────────────────────────
-- Un renglón por documento que genera deuda o la cancela. `importe` > 0
-- aumenta la deuda del tercero con nosotros (cliente) o la nuestra con él
-- (proveedor); < 0 la baja. Saldo = suma. `pendiente` = lo que falta imputar
-- de ese renglón (para vencimientos y aplicación de pagos).
create table if not exists cc_movimiento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  tercero_tipo     text not null check (tercero_tipo in ('cliente', 'proveedor')),
  tercero_id       bigint not null,
  fecha            date not null,
  vencimiento      date,
  tipo             text not null check (tipo in ('factura', 'nota_credito', 'nota_debito', 'cobro', 'pago', 'ajuste', 'saldo_inicial')),
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  importe          numeric(16, 2) not null,
  importe_ars      numeric(16, 2) not null,
  importe_usd      numeric(16, 2) not null,
  pendiente        numeric(16, 2) not null,
  descripcion      text not null,
  referencia_tipo  text,
  referencia_id    bigint,
  creado_ts        timestamptz not null default now()
);
create index if not exists cc_tercero on cc_movimiento (organizacion_id, tercero_tipo, tercero_id, fecha);
create unique index if not exists cc_referencia on cc_movimiento (organizacion_id, referencia_tipo, referencia_id, tercero_tipo) where referencia_tipo is not null;
alter table cc_movimiento enable row level security;
select erp_politica_org('cc_movimiento');

create table if not exists cc_imputacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  debito_id        bigint not null references cc_movimiento(id) on delete cascade,
  credito_id       bigint not null references cc_movimiento(id) on delete cascade,
  importe          numeric(16, 2) not null check (importe > 0),
  creado_ts        timestamptz not null default now()
);
alter table cc_imputacion enable row level security;
select erp_politica_org('cc_imputacion');

-- ── Tesorería ─────────────────────────────────────────────
create table if not exists cuenta_fondos (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  tipo             text not null check (tipo in ('caja', 'banco', 'mercadopago', 'otro')),
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  banco            text,
  cbu              text,
  alias            text,
  saldo_inicial    numeric(16, 2) not null default 0,
  saldo_inicial_fecha date,
  cuenta_contable_id bigint,
  activa           boolean not null default true,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
alter table cuenta_fondos enable row level security;
select erp_politica_org('cuenta_fondos');

create table if not exists movimiento_fondos (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cuenta_id        bigint not null references cuenta_fondos(id),
  fecha            date not null,
  -- > 0 entra, < 0 sale (en la moneda de la cuenta).
  importe          numeric(16, 2) not null,
  importe_ars      numeric(16, 2) not null,
  importe_usd      numeric(16, 2) not null,
  concepto         text not null,
  -- recibo, transferencia o manual (un gasto, un ingreso, una liquidación de
  -- Mercado Pago, comisiones del banco: la contrapartida es cuenta_contable_id).
  referencia_tipo  text,
  referencia_id    bigint,
  cuenta_contable_id bigint,
  conciliado_ts    timestamptz,
  extracto_linea_id bigint,
  usuario_id       text,
  creado_ts        timestamptz not null default now()
);
create index if not exists movimiento_fondos_cuenta on movimiento_fondos (cuenta_id, fecha);
alter table movimiento_fondos enable row level security;
select erp_politica_org('movimiento_fondos');

-- Recibo (cobranza a un cliente) y orden de pago (a un proveedor): cabecera
-- y sus medios (de qué cuenta de fondos sale/entra cada parte, y retenciones).
create table if not exists recibo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  tipo             text not null check (tipo in ('cobro', 'pago')),
  numero           bigint not null,
  tercero_tipo     text not null check (tercero_tipo in ('cliente', 'proveedor')),
  tercero_id       bigint not null,
  fecha            date not null default current_date,
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  total            numeric(16, 2) not null,
  total_ars        numeric(16, 2) not null,
  total_usd        numeric(16, 2) not null,
  -- [{cuenta_id, importe}] y [{concepto, importe}] (retenciones sufridas o practicadas)
  medios           jsonb not null default '[]',
  retenciones      jsonb not null default '[]',
  estado           text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  notas            text,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, tipo, numero)
);
alter table recibo enable row level security;
select erp_politica_org('recibo');

-- Extractos bancarios (o de Mercado Pago) importados para conciliar.
create table if not exists extracto_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cuenta_id        bigint not null references cuenta_fondos(id) on delete cascade,
  fecha            date not null,
  descripcion      text,
  importe          numeric(16, 2) not null,
  referencia       text,
  movimiento_id    bigint references movimiento_fondos(id) on delete set null,
  importado_ts     timestamptz not null default now()
);
create index if not exists extracto_cuenta on extracto_linea (cuenta_id, fecha);
alter table extracto_linea enable row level security;
select erp_politica_org('extracto_linea');

-- ── Contabilidad ──────────────────────────────────────────
create table if not exists plan_cuenta (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  codigo           text not null,                     -- "1.1.01.01"
  nombre           text not null,
  tipo             text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso')),
  imputable        boolean not null default true,
  activa           boolean not null default true,
  -- Para qué la usan los asientos automáticos (ventas, iva_debito, deudores…).
  rol              text,
  unique (organizacion_id, codigo)
);
create unique index if not exists plan_cuenta_rol on plan_cuenta (organizacion_id, rol) where rol is not null;
alter table plan_cuenta enable row level security;
select erp_politica_org('plan_cuenta');

create table if not exists asiento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  numero           bigint not null,
  fecha            date not null,
  concepto         text not null,
  -- venta, nota_credito_venta, compra, despacho, cobro, pago, gasto, cmv, manual, apertura
  origen           text not null,
  referencia_id    bigint,
  estado           text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, numero)
);
create unique index if not exists asiento_origen on asiento (organizacion_id, origen, referencia_id) where referencia_id is not null and estado = 'vigente';
create index if not exists asiento_fecha on asiento (organizacion_id, fecha);
alter table asiento enable row level security;
select erp_politica_org('asiento');

create table if not exists asiento_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  asiento_id       bigint not null references asiento(id) on delete cascade,
  cuenta_id        bigint not null references plan_cuenta(id),
  debe             numeric(16, 2) not null default 0 check (debe >= 0),
  haber            numeric(16, 2) not null default 0 check (haber >= 0),
  detalle          text,
  orden            int not null default 0
);
create index if not exists asiento_linea_cuenta on asiento_linea (cuenta_id);
create index if not exists asiento_linea_asiento on asiento_linea (asiento_id, orden);
alter table asiento_linea enable row level security;
select erp_politica_org('asiento_linea');
