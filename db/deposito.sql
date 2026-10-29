-- Depósito (sesión 4/10): picking por pedido o lote con escaneo, recepción de
-- mercadería (compras y devoluciones) con escaneo y asignación de ubicación.
-- El stock se sigue moviendo SÓLO con mover_stock(); esto es el registro del
-- trabajo del depósito.

-- Un lote de picking: uno o varios pedidos que se preparan juntos. Los
-- ítems salen de lo que cada pedido tiene reservado (reservado_de), que ya
-- dice de qué ubicación sacar cada cosa; se recorren por orden de recorrido.
create table if not exists picking_lote (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  deposito_id      bigint not null references deposito(id),
  estado           text not null default 'abierto' check (estado in ('abierto', 'terminado', 'cancelado')),
  usuario_id       text,
  nota             text,
  creado_ts        timestamptz not null default now(),
  terminado_ts     timestamptz
);
create index if not exists picking_lote_abiertos on picking_lote (organizacion_id, estado);
alter table picking_lote enable row level security;
select erp_politica_org('picking_lote');

create table if not exists picking_pedido (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  lote_id          bigint not null references picking_lote(id) on delete cascade,
  pedido_id        bigint not null references pedido(id) on delete cascade,
  primary key (lote_id, pedido_id)
);
create index if not exists picking_pedido_pedido on picking_pedido (pedido_id);
alter table picking_pedido enable row level security;
select erp_politica_org('picking_pedido');

create table if not exists picking_item (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  lote_id          bigint not null references picking_lote(id) on delete cascade,
  pedido_id        bigint not null references pedido(id) on delete cascade,
  variacion_id     bigint not null references variacion(id),
  ubicacion_id     bigint not null references ubicacion(id),
  kit_variacion_id bigint references variacion(id),
  cantidad         int not null check (cantidad > 0),
  escaneado        int not null default 0 check (escaneado >= 0),
  -- Lo que no estaba en la ubicación (lo marca el que prepara).
  faltante         int not null default 0 check (faltante >= 0),
  orden            int not null default 0
);
create index if not exists picking_item_lote on picking_item (lote_id, orden);
alter table picking_item enable row level security;
select erp_politica_org('picking_item');

-- Etiqueta + hoja de preparación (Fer, 3/10). El modo del lote: 'recorrido'
-- (escanear mientras se junta, el de siempre), 'hojas' (se imprime etiqueta +
-- hoja por pedido y cada pedido se cierra con "Preparado" o escaneando el
-- código de su hoja) o 'empacar' (en la mesa: se escanea cada producto y la
-- pantalla dice a qué pedido va). Por pedido: cuándo se imprimió por primera
-- vez su hoja, cuántas veces (más de una = reimpresión) y cuándo se cerró.
alter table picking_lote add column if not exists modo text not null default 'recorrido';
alter table picking_pedido add column if not exists impreso_ts timestamptz;
alter table picking_pedido add column if not exists impresiones int not null default 0;
alter table picking_pedido add column if not exists preparado_ts timestamptz;

-- Recepción: entrada de mercadería escaneada (compra a un proveedor,
-- devolución de un pedido, u otra). Cada línea es un ingreso (o devolución)
-- con mover_stock a la ubicación elegida.
create table if not exists recepcion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  tipo             text not null default 'compra' check (tipo in ('compra', 'devolucion', 'otro')),
  deposito_id      bigint not null references deposito(id),
  proveedor_id     bigint references proveedor(id) on delete set null,
  pedido_id        bigint references pedido(id) on delete set null,
  documento        text,
  estado           text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  usuario_id       text,
  nota             text,
  creado_ts        timestamptz not null default now(),
  cerrada_ts       timestamptz
);
create index if not exists recepcion_org on recepcion (organizacion_id, creado_ts desc);
alter table recepcion enable row level security;
select erp_politica_org('recepcion');
-- Devolución de una venta anterior a Laucen (Virtual Seller, bitácora #341):
-- no hay pedido; queda la referencia que se escribió (nº de venta de ML o de factura).
alter table recepcion add column if not exists venta_externa text;

create table if not exists recepcion_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  recepcion_id     bigint not null references recepcion(id) on delete cascade,
  variacion_id     bigint not null references variacion(id),
  ubicacion_id     bigint not null references ubicacion(id),
  cantidad         int not null check (cantidad > 0),
  -- En una devolución: 'nuevo' vuelve a la venta; 'caja_abierta' va al
  -- depósito de caja abierta / reacondicionados.
  condicion        text not null default 'nuevo' check (condicion in ('nuevo', 'caja_abierta')),
  usuario_id       text,
  creado_ts        timestamptz not null default now()
);
create index if not exists recepcion_linea_rec on recepcion_linea (recepcion_id);
alter table recepcion_linea enable row level security;
select erp_politica_org('recepcion_linea');

-- ── Control de stock (Fer, 29/10) ──────────────────────────
-- En los ratos libres alguien recorre el depósito con el celular: le aparece de a
-- un producto en una ubicación (primero lo de menos stock y, dentro de eso, lo de
-- más plata en stock a precio de venta) y dice «Está», «No está» o «A buscar».
-- «No está» resta con un ajuste; «A buscar» pasa las unidades al depósito especial
-- «En búsqueda», que no vende por ningún canal: el disponible baja y Mercado Libre
-- se entera igual, pero la unidad no se da por perdida hasta resolverlo
-- (lib/deposito/control.ts).

-- Depósito especial del sistema: uno por organización, nunca se vincula a un canal.
alter table deposito add column if not exists especial text check (especial in ('en_busqueda'));
create unique index if not exists deposito_especial_uno on deposito (organizacion_id, especial) where especial is not null;
update deposito d set especial = 'en_busqueda'
 where d.nombre = 'En búsqueda' and d.especial is null
   and not exists (select 1 from deposito o where o.organizacion_id = d.organizacion_id and o.especial = 'en_busqueda');
insert into deposito (organizacion_id, nombre, tipo, usa_ubicaciones, especial)
select o.id, 'En búsqueda', 'propio', false, 'en_busqueda' from organizaciones o
 where exists (select 1 from deposito x where x.organizacion_id = o.id)
   and not exists (select 1 from deposito d where d.organizacion_id = o.id and (d.especial = 'en_busqueda' or d.nombre = 'En búsqueda'));
delete from canal_deposito cd using deposito d where d.id = cd.deposito_id and d.especial is not null;

-- Cada vez que alguien controla un producto en una ubicación.
create table if not exists control_stock (
  id                bigint generated always as identity primary key,
  organizacion_id   text not null references organizaciones(id) on delete cascade,
  variacion_id      bigint not null references variacion(id) on delete cascade,
  ubicacion_id      bigint not null references ubicacion(id) on delete cascade,
  sistema           int not null,                  -- lo que decía el sistema en esa ubicación
  contado           int not null check (contado >= 0),
  -- ok: estaba lo del sistema · faltante: se ajustó lo que falta · a_buscar: lo que falta pasó a En búsqueda ·
  -- sobrante: había más y se sumó.
  resultado         text not null check (resultado in ('ok', 'faltante', 'a_buscar', 'sobrante')),
  diferencia        int not null default 0 check (diferencia >= 0),   -- unidades ajustadas o pasadas a En búsqueda
  precio_ars        numeric(14, 2),                -- precio de venta unitario en ese momento (para valorizar)
  usuario_id        text,
  ts                timestamptz not null default now(),
  -- Sólo a_buscar: buscando hasta que se resuelve.
  buscando          boolean not null default false,
  aparecieron       int check (aparecieron >= 0),
  resuelto_ubicacion_id bigint references ubicacion(id),
  resuelto_por      text,
  resuelto_ts       timestamptz
);
create index if not exists control_stock_lugar on control_stock (organizacion_id, variacion_id, ubicacion_id, ts desc);
create index if not exists control_stock_fecha on control_stock (organizacion_id, ts desc);
create index if not exists control_stock_buscando on control_stock (organizacion_id) where buscando;
alter table control_stock enable row level security;
select erp_politica_org('control_stock');

-- Tarjeta apartada: mientras una persona la tiene en pantalla no le sale a otra
-- (hasta `hasta`); «Saltar» la aparta para esa persona un rato más largo.
create table if not exists control_stock_toma (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  ubicacion_id     bigint not null references ubicacion(id) on delete cascade,
  usuario_id       text not null,
  saltada          boolean not null default false,
  hasta            timestamptz not null,
  primary key (variacion_id, ubicacion_id, usuario_id)
);
alter table control_stock_toma enable row level security;
select erp_politica_org('control_stock_toma');
