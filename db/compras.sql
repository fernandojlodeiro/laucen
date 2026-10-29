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
-- Llegada real (opcional): pisa la estimada (fecha + demora de la vía). Ej.: mercadería que quedó en zona franca.
alter table compra_invoice add column if not exists llegada date;
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

-- ── Packing lists: peso y volumen por unidad (pedido de Fer, 13/10; lib/compras/packing.ts) ──
-- De cada packing list se guarda, por SKU, cuántas unidades vinieron y qué parte
-- del peso y del CBM de sus cajas le toca. Caja con un solo SKU → exacto (peso y
-- CBM de la caja ÷ unidades). Caja mezclada → aproximado: la caja se reparte entre
-- todas sus unidades por partes iguales. Si un SKU tiene cajas propias y además
-- unidades en cajas mezcladas, cuentan sólo sus cajas propias (exacto).
-- No pisa el peso de la ficha: es un dato aparte, con su origen. Por variación vale
-- el exacto antes que el aproximado y, entre iguales, el packing list más nuevo.
create table if not exists packing_list (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  archivo          text not null,
  numero           text,
  fecha            date,
  invoice_id       bigint references compra_invoice(id) on delete set null,
  via              text check (via in ('avion', 'barco')),
  cajas            int not null default 0,
  unidades         numeric(14, 2) not null default 0,
  peso_kg          numeric(14, 3) not null default 0,
  cbm              numeric(14, 6) not null default 0,
  creado_ts        timestamptz not null default now()
);
alter table packing_list enable row level security;
select erp_politica_org('packing_list');

create table if not exists packing_item (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  packing_list_id  bigint not null references packing_list(id) on delete cascade,
  sku              text not null,
  variacion_id     bigint references variacion(id) on delete set null,
  cantidad         numeric(14, 2) not null check (cantidad > 0),   -- las unidades que se usaron para la cuenta
  peso_kg          numeric(14, 4) not null,                         -- el peso de esas unidades (con su parte de caja)
  cbm              numeric(14, 6) not null,
  exacto           boolean not null,
  cajas            text                                             -- números de caja, para ubicarlo en el archivo
);
create index if not exists packing_item_v on packing_item (organizacion_id, variacion_id) where variacion_id is not null;
create index if not exists packing_item_pl on packing_item (packing_list_id);
alter table packing_item enable row level security;
select erp_politica_org('packing_item');

-- ── Precio de mercado (pedido de Fer, 13/10; lib/compras/precio-mercado.ts) ──
-- Una búsqueda en Mercado Libre (Apify) por producto, para comparar la Clásica
-- con lo que se vende hoy. Se piden en tandas: la tanda se procesa de a varios
-- productos por vez y se relanza sola hasta terminar.
create table if not exists precio_mercado_tanda (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  token            uuid not null default gen_random_uuid(),
  total            int not null default 0,
  estado           text not null default 'corriendo' check (estado in ('corriendo', 'terminada', 'cortada')),
  mensaje          text,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  actualizado_ts   timestamptz not null default now()
);
alter table precio_mercado_tanda enable row level security;
select erp_politica_org('precio_mercado_tanda');

create table if not exists precio_mercado (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint not null references producto(id) on delete cascade,
  tanda_id         bigint references precio_mercado_tanda(id) on delete set null,
  texto            text not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'ok', 'error')),
  ts               timestamptz,
  encontradas      int,                     -- publicaciones que se parecen (sin packs ni las nuestras)
  minimo           numeric(14, 2),
  p25              numeric(14, 2),
  mediana          numeric(14, 2),
  resultados       jsonb not null default '[]',
  error            text,
  primary key (organizacion_id, producto_id)
);
create index if not exists precio_mercado_tanda_i on precio_mercado (tanda_id, estado);
-- «Precio de mercado para todos» (Fer, 28/10): una tanda con tope de gasto propio (tope_usd, lo gastado en Apify en
-- gastado_usd), que primero prueba gratis con las publicaciones ya leídas de los vendedores referentes (referentes) y
-- busca en el orden de `orden` (lo que más plata movió primero).
alter table precio_mercado_tanda add column if not exists tope_usd numeric(10, 2);
alter table precio_mercado_tanda add column if not exists gastado_usd numeric(10, 4) not null default 0;
alter table precio_mercado_tanda add column if not exists referentes boolean not null default false;
alter table precio_mercado add column if not exists orden int;
-- Veces que Mercado Libre frenó la búsqueda del producto con su control anti-robots (se reintenta hasta 3).
alter table precio_mercado add column if not exists intentos int not null default 0;
alter table precio_mercado enable row level security;
select erp_politica_org('precio_mercado');

-- Reanudador de las tandas de precio de mercado: si una vuelta se cortó (tope de tiempo del servidor), cada 5 minutos
-- la base la vuelve a llamar (pg_cron + pg_net). Las protege el token de la tanda.
do $$
declare j record; cmd text := $c$select net.http_get('https://laucen.com/api/precios-mercado?tanda=' || id || '&token=' || token) from public.precio_mercado_tanda where estado = 'corriendo' and actualizado_ts < now() - interval '6 minutes'$c$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'precios-mercado';
  if not found then perform cron.schedule('precios-mercado', '*/5 * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar precios-mercado (%)', sqlerrm;
end $$;

-- Productos de un vendedor referente (Fer, 13/10): su listado entero en Mercado Libre (Apify), para encontrar
-- productos que no tenemos y pedirle cotización al proveedor (lib/compras/vendedor-referente.ts).
create table if not exists vendedor_referente (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  vendedor_id      bigint not null,
  nombre           text,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'corriendo', 'terminada', 'error')),
  detalle          boolean not null default false,   -- entrar a cada publicación (trae ventas; cuesta más)
  maximo           int not null default 3000,
  items            jsonb not null default '[]',
  costo_usd        numeric(10, 4),
  error            text,
  token            uuid not null default gen_random_uuid(),
  creado_ts        timestamptz not null default now(),
  actualizado_ts   timestamptz not null default now()
);
alter table vendedor_referente enable row level security;
select erp_politica_org('vendedor_referente');

-- Vendedores referentes, fase 1 (Fer, 28/10; lib/compras/referentes.ts): lo que venden los vendedores de la competencia
-- leídos, una fila por publicación (sin repetir), cruzada con nuestro catálogo, y lo que Fer decidió de cada una (cotizar o
-- descartar). referente_pub se rearma entera (por organización) con cada cruce; referente_decision queda.
alter table vendedor_referente add column if not exists url text;
alter table vendedor_referente alter column vendedor_id drop not null;
create table if not exists referente_pub (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  item_id          text not null,
  vendedor_id      bigint,
  vendedor         text,
  titulo           text not null,
  precio           numeric(14, 2),
  vendidos         int,
  foto             text,
  url              text,
  categoria_id     text,
  grupo            text not null,          -- catálogo de ML o el título normalizado: para contar cuántos referentes lo venden
  lo_venden        int not null default 1,
  producto_id      bigint references producto(id) on delete set null,   -- el nuestro más parecido, si se parece
  parecido         numeric(4, 2),
  leido_ts         timestamptz,
  primary key (organizacion_id, item_id)
);
alter table referente_pub enable row level security;
select erp_politica_org('referente_pub');
create table if not exists referente_decision (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  item_id          text not null,
  estado           text not null check (estado in ('cotizar', 'descartado')),
  usuario_id       text,
  ts               timestamptz not null default now(),
  primary key (organizacion_id, item_id)
);
alter table referente_decision enable row level security;
select erp_politica_org('referente_decision');

-- Vendedores referentes, fase 2 (Fer, 29/10; lib/compras/referentes-ia.ts): la IA junta en un grupo las publicaciones de
-- los distintos vendedores que son el mismo producto (referente_pub.grupo_id) y compara cada grupo con todos nuestros
-- productos, activos y archivados (referente_grupo.producto_id; null = no lo tenemos). Cada pasada de la IA, con su tope
-- de gasto y su avance, en referente_ia; la corre /api/referentes-ia con el token de la fila.
alter table referente_pub add column if not exists grupo_id bigint;
create table if not exists referente_grupo (
  id               bigserial primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  producto_id      bigint references producto(id) on delete set null,   -- el nuestro que es el mismo, según la IA
  motivo           text,                                                  -- por qué (lo dice la IA)
  juzgado_ts       timestamptz,                                           -- cuándo se comparó con el catálogo (null = falta)
  creado_ts        timestamptz not null default now()
);
create index if not exists referente_grupo_org_i on referente_grupo (organizacion_id);
alter table referente_grupo enable row level security;
select erp_politica_org('referente_grupo');
create table if not exists referente_ia (
  id               bigserial primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  token            uuid not null default gen_random_uuid(),
  estado           text not null default 'corriendo' check (estado in ('corriendo', 'terminada', 'error')),
  tope_usd         numeric(10, 2) not null,
  gastado_usd      numeric(10, 4) not null default 0,
  error            text,
  creado_ts        timestamptz not null default now(),
  actualizado_ts   timestamptz not null default now()
);
alter table referente_ia enable row level security;
select erp_politica_org('referente_ia');

-- Reanudador de la IA de vendedores referentes: si una vuelta se cortó, cada 5 minutos la base la vuelve a llamar.
do $$
declare j record; cmd text := $c$select net.http_get('https://laucen.com/api/referentes-ia?id=' || id || '&token=' || token) from public.referente_ia where estado = 'corriendo' and actualizado_ts < now() - interval '6 minutes'$c$;
begin
  if to_regclass('cron.job') is null then return; end if;
  select jobid, command into j from cron.job where jobname = 'referentes-ia';
  if not found then perform cron.schedule('referentes-ia', '*/5 * * * *', cmd);
  elsif j.command is distinct from cmd then perform cron.alter_job(j.jobid, command := cmd);
  end if;
exception when others then
  raise notice 'pg_cron: no se pudo ajustar referentes-ia (%)', sqlerrm;
end $$;
