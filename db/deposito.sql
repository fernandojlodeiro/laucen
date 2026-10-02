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
