-- Full de Mercado Libre (Fer, 20/10; bitácora #698/#704): mandar mercadería del depósito propio a
-- Full de una cuenta de ML, seguirla hasta que llega y llevar en Laucen lo que hay en Full.
--
-- Depósitos:
--   - "Full <cuenta>" (tipo full_ml), asociado al canal de esa cuenta en canal_deposito (prioridad
--     99: un pedido que no es Full nunca sale de ahí). Las ventas Full de ML descuentan de acá
--     (lib/mercadolibre/pedidos.ts). No suma al disponible del canal (stock_disponible_canal).
--   - "En camino a Full" (tipo transito), uno por organización, con una ubicación por envío
--     (ENVIO-<id>): lo despachado que ML todavía no recibió. No vende por ningún canal.
--
-- Un envío: borrador (se arman las líneas, a mano o con la sugerencia) → despachado (las unidades
-- pasan del depósito de origen a su ubicación de "En camino a Full") → recibido (todo llegó) o
-- cerrado (se cerró con faltantes: vuelven al origen o se dan por perdidas).
-- Lo recibe solo la lectura de Full (lib/full/lectura.ts): cuando ML muestra más unidades que las
-- que Laucen tiene en Full, primero salen de lo que está en camino (el envío más viejo primero) y lo
-- que sobra es un ajuste. Crear el envío en Mercado Libre lo hace la persona en la Central de
-- vendedores (la API no lo permite en Argentina).
--
-- Flete del envío: un monto, o una factura de gasto vinculada (su neto sin IVA), que se reparte
-- entre las líneas (por unidades, volumen, peso o valor) y queda el flete por unidad. La
-- rentabilidad lo resta en cada venta que salió de ese depósito Full (lib/informes/rentabilidad.ts).

create table if not exists full_envio (
  id                    bigint generated always as identity primary key,
  organizacion_id       text not null references organizaciones(id) on delete cascade,
  canal_id              bigint not null references canal(id),
  deposito_origen_id    bigint not null references deposito(id),
  deposito_full_id      bigint not null references deposito(id),
  -- La ubicación de "En camino a Full" de este envío (se crea al despacharlo).
  ubicacion_transito_id bigint references ubicacion(id),
  -- El número del envío en Mercado Libre (el que da la Central de vendedores) y el turno.
  numero_ml             text,
  fecha_entrega         date,
  estado                text not null default 'borrador' check (estado in ('borrador', 'despachado', 'recibido', 'cerrado')),
  flete_ars             numeric(16, 2),
  flete_factura_id      bigint references factura_compra(id) on delete set null,
  flete_criterio        text not null default 'volumen' check (flete_criterio in ('unidades', 'volumen', 'peso', 'valor')),
  notas                 text,
  usuario_id            text,
  despachado_ts         timestamptz,
  recibido_ts           timestamptz,
  cerrado_ts            timestamptz,
  creado_ts             timestamptz not null default now()
);
create index if not exists full_envio_org on full_envio (organizacion_id, id desc);
alter table full_envio enable row level security;
select erp_politica_org('full_envio');

create table if not exists full_envio_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  envio_id         bigint not null references full_envio(id) on delete cascade,
  variacion_id     bigint not null references variacion(id),
  -- La publicación de ML de la cuenta (para la etiqueta: su Código ML).
  item_id          text,
  variation_id     text not null default '',
  cantidad         int not null check (cantidad > 0),
  recibido         int not null default 0 check (recibido >= 0),
  -- Lo que no llegó y se cerró (volvió al origen o se dio por perdido).
  faltante         int not null default 0 check (faltante >= 0),
  -- El flete del envío repartido: cuánto le toca a cada unidad de esta línea, en pesos.
  flete_unit_ars   numeric(16, 4),
  unique (envio_id, variacion_id)
);
create index if not exists full_envio_linea_variacion on full_envio_linea (variacion_id);
alter table full_envio_linea enable row level security;
select erp_politica_org('full_envio_linea');

-- La última lectura de Full en ML, por Código ML (inventory_id) de cada cuenta. `desde_ts`: desde
-- cuándo ML muestra ese mismo disponible (la conciliación espera a que se quede quieto, así una
-- venta que todavía no llegó a Laucen no se toma por un faltante).
create table if not exists full_stock (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  inventory_id     text not null,
  variacion_id     bigint references variacion(id) on delete set null,
  item_id          text,
  disponible       int,
  no_disponible    int,
  -- [{status, quantity}] de lo que no está disponible (en revisión, dañado, perdido, en retiro…).
  detalle          jsonb not null default '[]',
  desde_ts         timestamptz,
  leido_ts         timestamptz not null default now(),
  conciliado_ts    timestamptz,
  error            text,
  primary key (canal_id, inventory_id)
);
create index if not exists full_stock_variacion on full_stock (variacion_id);
alter table full_stock enable row level security;
select erp_politica_org('full_stock');

-- Cuándo se leyó Full por última vez en cada cuenta (el proceso de fondo lee cada media hora).
create table if not exists full_lectura (
  canal_id         bigint primary key references canal(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  leido_ts         timestamptz not null default now(),
  resumen          jsonb not null default '{}'
);
alter table full_lectura enable row level security;
select erp_politica_org('full_lectura');

-- ── Costos de Full (Fer, 22/10; bitácora #715/#720/#724) ──────────────────────────────────────
-- Tarifas de Full por tamaño (ML no las da por API; se cargan y se corrigen en Stock › Envíos a Full ›
-- Costos de Full). Tamaño según medidas y peso del paquete: Pequeño hasta 15×20×20 cm, Mediano hasta
-- 28×36×51, Grande hasta 60×70×80, todos hasta 12 kg; si no, Extragrande. Valores de la ayuda de ML
-- leídos el 22/10/2026 (los pone lib/full/costos.ts si faltan).
create table if not exists full_tarifa (
  organizacion_id    text not null references organizaciones(id) on delete cascade,
  tamano             text not null check (tamano in ('pequeno', 'mediano', 'grande', 'extragrande')),
  almacenamiento_dia numeric(12, 2) not null,
  antiguo_4_6        numeric(12, 2) not null default 0,
  antiguo_6_12       numeric(12, 2) not null default 0,
  antiguo_12         numeric(12, 2) not null default 0,
  retiro             numeric(12, 2) not null default 0,
  actualizado_ts     timestamptz not null default now(),
  primary key (organizacion_id, tamano)
);
alter table full_tarifa enable row level security;
select erp_politica_org('full_tarifa');

-- Lo que ML cobró por Full (GET /billing/integration/periods/key/{K}/group/ML/full/details): una fila
-- por cargo. Almacenamiento (WAREHOUSING) viene por día y por tarifa, sin producto; colecta
-- (INBOUND_COLLECT) por producto y envío.
create table if not exists full_cargo (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  periodo          date not null,
  detalle_id       bigint not null,
  fecha            date not null,
  tipo             text not null,
  subtipo          text,
  descripcion      text,
  cantidad         numeric(14, 3),
  por_unidad       numeric(14, 4),
  monto            numeric(16, 2) not null,
  inventory_id     text,
  item_id          text,
  sku              text,
  envio_ml         text,
  volumen_m3       numeric(14, 6),
  datos            jsonb not null default '{}',
  primary key (canal_id, detalle_id)
);
create index if not exists full_cargo_fecha on full_cargo (canal_id, fecha);
alter table full_cargo enable row level security;
select erp_politica_org('full_cargo');

-- Qué períodos de facturación ya se leyeron (estado: ok, abierto = ML todavía no lo cerró, error).
create table if not exists full_cargo_lectura (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  periodo          date not null,
  estado           text not null,
  cargos           int not null default 0,
  error            text,
  leido_ts         timestamptz not null default now(),
  primary key (canal_id, periodo)
);
alter table full_cargo_lectura enable row level security;
select erp_politica_org('full_cargo_lectura');

-- Cuántas unidades de cada producto había en el depósito Full de la cuenta cada día (la foto la saca
-- la lectura de Full; si en un día hay varias, queda la mayor) y su tamaño para Full.
create table if not exists full_stock_dia (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  fecha            date not null,
  unidades         int not null,
  tamano           text,
  primary key (canal_id, variacion_id, fecha)
);
alter table full_stock_dia enable row level security;
select erp_politica_org('full_stock_dia');

-- El costo de Full de cada producto por mes (lo recalcula lib/full/costos.ts): almacenamiento cobrado
-- (repartido) o estimado, otros cargos con producto, unidades vendidas desde Full y lo que le toca a
-- cada unidad vendida. Lo de un mes sin ventas pasa al siguiente (arrastre).
create table if not exists full_costo_mes (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  mes              date not null,
  almacenamiento   numeric(16, 2) not null default 0,
  estimado         numeric(16, 2) not null default 0,
  otros            numeric(16, 2) not null default 0,
  unidades_dia     int not null default 0,
  vendidas         int not null default 0,
  arrastre         numeric(16, 2) not null default 0,
  por_unidad       numeric(16, 4),
  primary key (canal_id, variacion_id, mes)
);
alter table full_costo_mes enable row level security;
select erp_politica_org('full_costo_mes');

-- La colecta de Full que le tocó a cada unidad de una línea de envío (del cargo por producto de ML).
alter table full_envio_linea add column if not exists colecta_unit_ars numeric(16, 4);

-- El flete de Full por unidad que le toca a una venta (más la colecta que cobró ML por esa línea): el
-- del último envío de esa variación a ese depósito Full despachado hasta el día de la venta (o, si la
-- venta es anterior, el primero).
create or replace function public.flete_full_unitario(p_deposito bigint, p_variacion bigint, p_fecha timestamptz)
returns numeric language sql stable as $$
  select coalesce(
    (select coalesce(l.flete_unit_ars, 0) + coalesce(l.colecta_unit_ars, 0) from full_envio_linea l join full_envio e on e.id = l.envio_id
      where e.deposito_full_id = p_deposito and l.variacion_id = p_variacion and e.estado <> 'borrador'
        and e.despachado_ts <= p_fecha and (l.flete_unit_ars is not null or l.colecta_unit_ars is not null)
      order by e.despachado_ts desc limit 1),
    (select coalesce(l.flete_unit_ars, 0) + coalesce(l.colecta_unit_ars, 0) from full_envio_linea l join full_envio e on e.id = l.envio_id
      where e.deposito_full_id = p_deposito and l.variacion_id = p_variacion and e.estado <> 'borrador'
        and (l.flete_unit_ars is not null or l.colecta_unit_ars is not null)
      order by e.despachado_ts limit 1))
$$;

-- El almacenamiento de Full por unidad vendida, para la rentabilidad: el del mes de la venta.
create or replace function public.almacenamiento_full_unitario(p_canal bigint, p_variacion bigint, p_fecha timestamptz)
returns numeric language sql stable as $$
  select por_unidad from full_costo_mes
   where canal_id = p_canal and variacion_id = p_variacion
     and mes = date_trunc('month', p_fecha at time zone 'America/Argentina/Buenos_Aires')::date
$$;

-- ── Remito para el transportista (Fer, 22/10) ────────────────
-- Cada envío: el transportista (un proveedor; el envío nuevo trae el último usado), cuántos bultos y
-- el valor declarado (si queda vacío, el remito usa el sugerido: la mercadería al costo sin IVA, en
-- pesos). Los datos de destino son siempre los mismos: uno por organización (Stock › Envíos a
-- Full › Datos del remito).
alter table full_envio add column if not exists valor_declarado_ars numeric(16, 2);
alter table full_envio add column if not exists transportista_id bigint references proveedor(id) on delete set null;
alter table full_envio add column if not exists bultos int;
create table if not exists full_remito_datos (
  organizacion_id  text primary key references organizaciones(id) on delete cascade,
  destinatario     text,
  cuit             text,
  direccion        text,
  localidad        text,
  provincia        text,
  codigo_postal    text,
  telefono         text,
  horario          text,
  observaciones    text,
  actualizado_ts   timestamptz not null default now()
);
alter table full_remito_datos enable row level security;
select erp_politica_org('full_remito_datos');
