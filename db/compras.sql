-- Compras · Proveedores (2/10). Tabla aparte de clientes: en Virtual Seller
-- clientes y proveedores comparten tabla (campo Tipo); acá se separan porque
-- un proveedor lleva cosas que un cliente no (condiciones de pago, moneda
-- habitual, y después sus compras e importaciones). Un mismo CUIT puede ser
-- cliente y proveedor a la vez: son dos filas, una en cada tabla.
-- El resto de Compras (facturas de compra, despachos) lo hace su sesión.

create table if not exists proveedor (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  razon_social     text,
  cuit             text,
  condicion_iva    text check (condicion_iva in ('consumidor_final', 'responsable_inscripto', 'monotributo', 'exento', 'no_responsable')),
  pais             text not null default 'AR',
  email            text,
  telefono         text,
  telefono_movil   text,
  contacto         text,
  calle            text,
  localidad        text,
  provincia        text,
  codigo_postal    text,
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  condiciones_pago text,
  notas            text,
  estado           text not null default 'activo' check (estado in ('activo', 'archivado')),
  -- El dato crudo de cada origen ({"virtual_seller": {...}}): nada se pierde.
  datos_externos   jsonb not null default '{}',
  creado_ts        timestamptz not null default now()
);
create index if not exists proveedor_cuit on proveedor (organizacion_id, cuit) where cuit is not null;
alter table proveedor enable row level security;
select erp_politica_org('proveedor');

-- ── Compras por courier (pedido de Fer, 12/10; lib/compras/courier.ts) ─────
-- En un courier la factura del proveedor entra entera en una sola posición: el
-- costo de cada producto sale del flete por kilo (según su peso) más un único
-- porcentaje para toda la compra (impuestos del courier, ~8 %):
--   costo unitario US$ = (FOB + peso kg × flete US$/kg) × (1 + % courier)
-- La compra NO mueve stock (la mercadería entra por recepción o ya está): sólo
-- calcula el costo y, con «Grabar costos en los productos», lo deja en cada
-- variación (FOB, último costo y peso del producto).
create table if not exists compra_courier (
  id                  bigint generated always as identity primary key,
  organizacion_id     text not null references organizaciones(id) on delete cascade,
  nombre              text not null,                    -- ej. C_006
  proveedor           text,
  ingreso_ts          timestamptz,                      -- cuándo se cargó al stock (desde ahí cuentan las ventas)
  flete_usd_kg        numeric(10, 4) not null default 0,
  courier_pct         numeric(6, 2) not null default 0,
  notas               text,
  costos_grabados_ts  timestamptz,
  creado_ts           timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
alter table compra_courier enable row level security;
select erp_politica_org('compra_courier');

create table if not exists compra_courier_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  compra_id        bigint not null references compra_courier(id) on delete cascade,
  variacion_id     bigint references variacion(id) on delete set null,
  sku              text,
  descripcion      text not null,
  cantidad         int not null check (cantidad > 0),
  fob_unit_usd     numeric(16, 4) not null,
  peso_g           numeric(10, 2),                      -- peso unitario
  cargado          int,                                 -- unidades que se cargaron al stock (si difiere de lo comprado)
  nota             text,
  orden            int not null default 0
);
create index if not exists compra_courier_linea_c on compra_courier_linea (compra_id, orden);
alter table compra_courier_linea enable row level security;
select erp_politica_org('compra_courier_linea');
