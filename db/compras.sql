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

-- ── Invoices de compra: historial (pedido de Fer, 12/10; lib/compras/invoices.ts) ──
-- Los invoices de los proveedores del exterior, sólo para estadística: qué se
-- compró, cuándo, cuánto y a qué precio. NO mueven stock ni costos. La fecha es
-- la del invoice (aproximada): la llegada se estima sumándole la demora de la
-- vía (avión o barco, configurable en config_org 'invoices'). Entra «a revisar»
-- y cuenta recién cuando se confirma. Si el invoice es el de una compra por
-- courier ya cargada, se lo vincula y esa compra no se cuenta dos veces.
-- El proveedor preferido del producto sale del invoice confirmado más reciente
-- (y se puede cambiar a mano en la ficha).
alter table producto add column if not exists proveedor_id bigint references proveedor(id) on delete set null;
create index if not exists producto_proveedor on producto (organizacion_id, proveedor_id) where proveedor_id is not null;

create table if not exists compra_invoice (
  id                 bigint generated always as identity primary key,
  organizacion_id    text not null references organizaciones(id) on delete cascade,
  proveedor_id       bigint references proveedor(id) on delete set null,
  compra_courier_id  bigint references compra_courier(id) on delete set null,
  archivo            text not null,
  ruta_storage       text,
  hoja               text,
  numero             text,
  fecha              date,
  fecha_texto        text,                                -- como venía escrita en el invoice
  fecha_dudosa       boolean not null default false,      -- día y mes se podían leer al revés
  via                text not null default 'avion' check (via in ('avion', 'barco')),
  estado             text not null default 'revisar' check (estado in ('revisar', 'confirmado')),
  avisos             jsonb not null default '[]',
  notas              text,
  usuario_id         text,
  creado_ts          timestamptz not null default now()
);
-- Precio no confiable (invoices viejos): cuentan fecha, cantidad y proveedor; el precio no se usa.
alter table compra_invoice add column if not exists ignorar_precio boolean not null default false;
create index if not exists compra_invoice_fecha on compra_invoice (organizacion_id, fecha desc);
alter table compra_invoice enable row level security;
select erp_politica_org('compra_invoice');

create table if not exists compra_invoice_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  invoice_id       bigint not null references compra_invoice(id) on delete cascade,
  fila             int,                                   -- renglón del Excel
  sku              text not null,                         -- como venía en el invoice
  descripcion      text,
  cantidad         numeric(12, 2) not null check (cantidad > 0),
  precio_usd       numeric(16, 4),
  variacion_id     bigint references variacion(id) on delete set null
);
create index if not exists compra_invoice_linea_i on compra_invoice_linea (invoice_id, fila);
create index if not exists compra_invoice_linea_v on compra_invoice_linea (organizacion_id, variacion_id) where variacion_id is not null;
alter table compra_invoice_linea enable row level security;
select erp_politica_org('compra_invoice_linea');
