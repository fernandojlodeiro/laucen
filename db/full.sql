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

-- El flete de Full por unidad que le toca a una venta: el del último envío de esa variación a ese
-- depósito Full despachado hasta el día de la venta (o, si la venta es anterior, el primero).
create or replace function public.flete_full_unitario(p_deposito bigint, p_variacion bigint, p_fecha timestamptz)
returns numeric language sql stable as $$
  select coalesce(
    (select l.flete_unit_ars from full_envio_linea l join full_envio e on e.id = l.envio_id
      where e.deposito_full_id = p_deposito and l.variacion_id = p_variacion and e.estado <> 'borrador'
        and e.despachado_ts <= p_fecha and l.flete_unit_ars is not null
      order by e.despachado_ts desc limit 1),
    (select l.flete_unit_ars from full_envio_linea l join full_envio e on e.id = l.envio_id
      where e.deposito_full_id = p_deposito and l.variacion_id = p_variacion and e.estado <> 'borrador' and l.flete_unit_ars is not null
      order by e.despachado_ts limit 1))
$$;

-- Cuándo se leyó Full por última vez en cada cuenta (el proceso de fondo lee cada media hora).
create table if not exists full_lectura (
  canal_id         bigint primary key references canal(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  leido_ts         timestamptz not null default now(),
  resumen          jsonb not null default '{}'
);
alter table full_lectura enable row level security;
select erp_politica_org('full_lectura');
