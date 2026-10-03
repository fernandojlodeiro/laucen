-- Facturación de Mercado Libre por API (3/10), SÓLO LECTURA: lo que ML y
-- Mercado Pago le cobran a cada cuenta, para el costo por venta, las
-- retenciones y percepciones y el control contra las facturas de compra
-- importadas de ARCA. NO registra facturas: las facturas de ML entran por
-- "Importar de ARCA (Mis Comprobantes)" (lib/administracion/arca-mc.ts).
-- Lo llena lib/mercadolibre/facturacion.ts.

-- Cada período de facturación (mensual) de una cuenta, por grupo (ML o MP).
create table if not exists ml_factura_periodo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cuenta_id        bigint not null references meli_cuenta(id) on delete cascade,
  canal_id         bigint references canal(id) on delete set null,
  grupo            text not null check (grupo in ('ML', 'MP')),
  clave            text not null,                -- la "key" del período en ML (ej. 2026-09-01)
  desde            date,
  hasta            date,
  vencimiento      date,
  monto            numeric(16, 2),
  impago           numeric(16, 2),
  datos            jsonb not null default '{}',
  leido_ts         timestamptz not null default now(),
  detalle_ts       timestamptz,                  -- última vez que se leyó entero su detalle
  unique (cuenta_id, grupo, clave)
);
create index if not exists ml_factura_periodo_org on ml_factura_periodo (organizacion_id, desde desc);
alter table ml_factura_periodo enable row level security;
select erp_politica_org('ml_factura_periodo');

-- Las facturas y notas de crédito que ML emitió en el período.
create table if not exists ml_factura_documento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cuenta_id        bigint not null references meli_cuenta(id) on delete cascade,
  grupo            text not null check (grupo in ('ML', 'MP')),
  clave            text not null,
  documento_id     text not null,
  tipo             text not null check (tipo in ('BILL', 'CREDIT_NOTE')),
  numero           text,                         -- como lo da ML (ej. "A 0034-00123456")
  punto_venta      int,
  numero_cbte      bigint,
  fecha            date,
  monto            numeric(16, 2) not null default 0,
  moneda           text,
  estado           text,
  archivos         jsonb not null default '[]',
  datos            jsonb not null default '{}',
  leido_ts         timestamptz not null default now(),
  unique (cuenta_id, grupo, documento_id)
);
create index if not exists ml_factura_documento_org on ml_factura_documento (organizacion_id, clave);
alter table ml_factura_documento enable row level security;
select erp_politica_org('ml_factura_documento');

-- Cada cargo del detalle: comisión, envío, cargo fijo, publicidad,
-- impuestos (percepciones / retenciones), bonificaciones. `monto` > 0 es lo
-- que cobra ML; < 0, lo que devuelve (bonificación o nota de crédito). Tal
-- como lo factura ML (con IVA). `pedido_id`: la venta de Laucen, por el id de
-- la orden de ML.
create table if not exists ml_cargo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cuenta_id        bigint not null references meli_cuenta(id) on delete cascade,
  canal_id         bigint references canal(id) on delete set null,
  grupo            text not null check (grupo in ('ML', 'MP')),
  clave            text not null,
  detalle_id       text not null,
  documento_id     text,
  fecha            timestamptz,
  tipo             text not null check (tipo in ('comision', 'envio', 'cargo_fijo', 'publicidad', 'impuesto', 'bonificacion', 'otro')),
  impuesto         text check (impuesto in ('iva', 'iibb', 'ganancias', 'otro')),
  concepto         text,
  subtipo          text,
  monto            numeric(16, 2) not null,
  moneda           text,
  order_id         text,
  pedido_id        bigint references pedido(id) on delete set null,
  item_id          text,
  datos            jsonb not null default '{}',
  leido_ts         timestamptz not null default now(),
  unique (cuenta_id, grupo, detalle_id)
);
create index if not exists ml_cargo_pedido on ml_cargo (pedido_id) where pedido_id is not null;
create index if not exists ml_cargo_orden on ml_cargo (organizacion_id, order_id) where order_id is not null;
create index if not exists ml_cargo_periodo on ml_cargo (organizacion_id, clave, tipo);
alter table ml_cargo enable row level security;
select erp_politica_org('ml_cargo');

-- Última lectura de cada cuenta (la nocturna corre una vez por día; también
-- el botón "Traer facturación de ML"). `resultado`: qué se leyó o el error.
create table if not exists ml_facturacion_lectura (
  cuenta_id        bigint primary key references meli_cuenta(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  ultimo_ts        timestamptz not null default now(),
  resultado        jsonb not null default '{}'
);
alter table ml_facturacion_lectura enable row level security;
select erp_politica_org('ml_facturacion_lectura');
