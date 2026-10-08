-- Tienda web (sesión 3/10). La tienda es un canal tipo web_minorista: vende
-- con la lista de precios y el stock de ese canal, y sus pedidos entran por
-- crearPedido como los de cualquier otro. Acá queda lo propio de la tienda:
-- medios de pago, métodos de envío, reglas comerciales, pagos y cuentas de
-- clientes. La configuración visible (nombre, colores, WhatsApp, datos para
-- transferir) vive en canal.config.

-- Medios de pago (ABM): cada uno se prende o se apaga. Las credenciales (Mercado
-- Pago, Payway) van aparte, en medio_pago_credencial (sin políticas).
create table if not exists medio_pago (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete cascade,
  tipo             text not null check (tipo in ('mercadopago', 'payway', 'transferencia', 'efectivo', 'cuenta_corriente')),
  nombre           text not null,
  activo           boolean not null default false,
  -- Descuento (o recargo, negativo) por pagar con este medio, en %.
  descuento_pct    numeric(5, 2) not null default 0 check (descuento_pct between -100 and 100),
  -- Lo que se le muestra al comprador al elegirlo (ej. CBU y alias).
  instrucciones    text,
  orden            int not null default 0,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, canal_id, tipo)
);
alter table medio_pago enable row level security;
select erp_politica_org('medio_pago');

create table if not exists medio_pago_credencial (
  medio_pago_id    bigint primary key references medio_pago(id) on delete cascade,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  -- mercadopago: {access_token, public_key} · payway: {public_key, private_key, site_id, ambiente}
  datos            jsonb not null default '{}',
  actualizado_ts   timestamptz not null default now()
);
alter table medio_pago_credencial enable row level security;

-- Métodos de envío (módulo intercambiable): retiro en el local, tarifa fija,
-- por provincia, y después transportistas por API (OCA, Andreani).
create table if not exists metodo_envio (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete cascade,
  tipo             text not null check (tipo in ('retiro', 'tarifa_fija', 'por_provincia', 'a_convenir', 'oca', 'andreani')),
  nombre           text not null,
  activo           boolean not null default false,
  costo_ars        numeric(16, 2) not null default 0,
  -- Envío gratis desde este total (null = nunca).
  gratis_desde_ars numeric(16, 2),
  -- por_provincia: {"Córdoba": 3500, "Buenos Aires": 6000, "*": 8000}
  tarifas          jsonb not null default '{}',
  plazo            text,
  instrucciones    text,
  orden            int not null default 0,
  creado_ts        timestamptz not null default now()
);
alter table metodo_envio enable row level security;
select erp_politica_org('metodo_envio');

-- Reglas comerciales: condición → acción.
--   condicion: {"tipo": "cantidad_minima", "cantidad": 3, "producto_id"?: n, "familia_id"?: n}
--              {"tipo": "monto_minimo", "monto": 50000}
--              {"tipo": "medio_pago", "medio": "transferencia"}
--   accion:    {"tipo": "descuento_pct", "valor": 10} · {"tipo": "descuento_fijo", "valor": 2000}
--              {"tipo": "envio_bonificado"}
-- Un descuento por cantidad sobre un producto/familia se aplica a esas
-- líneas; el resto, al total.
create table if not exists regla_comercial (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete cascade,
  nombre           text not null,
  activa           boolean not null default true,
  condicion        jsonb not null,
  accion           jsonb not null,
  desde            date,
  hasta            date,
  -- false = si se cumple, no se suma con otras reglas de descuento.
  acumulable       boolean not null default true,
  prioridad        int not null default 0,
  creado_ts        timestamptz not null default now()
);
alter table regla_comercial enable row level security;
select erp_politica_org('regla_comercial');

-- Los pagos de la tienda (Mercado Pago, Payway, y la confirmación manual de
-- transferencias y efectivo).
create table if not exists pago (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  pedido_id        bigint not null references pedido(id) on delete cascade,
  medio            text not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado', 'cancelado', 'reembolsado')),
  importe_ars      numeric(16, 2) not null,
  cuotas           int not null default 1,
  id_externo       text,
  detalle          text,
  datos_externos   jsonb not null default '{}',
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  actualizado_ts   timestamptz not null default now()
);
create index if not exists pago_pedido on pago (pedido_id);
create unique index if not exists pago_externo on pago (medio, id_externo) where id_externo is not null;
alter table pago enable row level security;
select erp_politica_org('pago');

-- Pedido: costo de envío, cómo se entrega y un código para seguirlo sin cuenta.
alter table pedido add column if not exists costo_envio_ars numeric(16, 2) not null default 0;
alter table pedido add column if not exists metodo_envio_id bigint references metodo_envio(id) on delete set null;
alter table pedido add column if not exists codigo_seguimiento text;
create unique index if not exists pedido_codigo_seguimiento on pedido (codigo_seguimiento) where codigo_seguimiento is not null;

-- Clientes que pueden comprar en cuenta corriente / "a convenir".
alter table cliente add column if not exists cuenta_corriente boolean not null default false;

-- Cuentas de la tienda (no son usuarios del sistema: no entran al panel).
-- La contraseña se guarda con scrypt.
create table if not exists cliente_cuenta (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cliente_id       bigint not null references cliente(id) on delete cascade,
  email            text not null,
  clave_hash       text not null,
  creado_ts        timestamptz not null default now(),
  ultimo_ingreso   timestamptz,
  unique (organizacion_id, email)
);
alter table cliente_cuenta enable row level security;

-- Dominios propios de las tiendas (Fer, 3/10, bitácora #281): los carga cada
-- organización desde Configuración › Tienda web; el código no tiene ninguno
-- fijo. Uno principal por tienda (abre la tienda) y los demás redirigen (308)
-- al principal. Un dominio es de una sola organización (único global). Laucen
-- lo agrega al proyecto de Vercel por API (lib/tienda/vercel.ts); el
-- middleware resuelve host → tienda leyendo esta tabla.
--   estado: sin_conectar (todavía no está en Vercel) · esperando_dns ·
--           verificado (DNS bien) · con_certificado (abre con https)
--   dns: los registros que hay que cargar, [{tipo, nombre, valor}]
create table if not exists tienda_dominio (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  dominio          text not null unique check (dominio = lower(dominio)),
  principal        boolean not null default false,
  estado           text not null default 'sin_conectar'
                   check (estado in ('sin_conectar', 'esperando_dns', 'verificado', 'con_certificado')),
  dns              jsonb not null default '[]',
  detalle          text,
  creado_ts        timestamptz not null default now(),
  revisado_ts      timestamptz
);
create unique index if not exists tienda_dominio_principal on tienda_dominio (canal_id) where principal;
alter table tienda_dominio enable row level security;
select erp_politica_org('tienda_dominio');

-- Portada de la tienda (4/10): los productos que Fer elige a mano para las filas
-- "Destacados" y "Novedades" de la portada, en el orden que les pone. Una fila por
-- tienda (canal), lista y producto. Destacados vacío = la fila no se muestra;
-- Novedades vacío = salen los últimos cargados.
create table if not exists tienda_portada_producto (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  lista            text not null check (lista in ('destacados', 'novedades')),
  producto_id      bigint not null references producto(id) on delete cascade,
  orden            int not null default 0,
  creado_ts        timestamptz not null default now(),
  unique (canal_id, lista, producto_id)
);
create index if not exists tienda_portada_orden on tienda_portada_producto (canal_id, lista, orden);
alter table tienda_portada_producto enable row level security;
select erp_politica_org('tienda_portada_producto');

-- OCA (ePak), Fer 6/10: la cuenta de OCA de la organización (una sola). El
-- usuario y la contraseña de ePak nunca se muestran; sin políticas: sólo el
-- servidor la lee. origen = de dónde sale la mercadería; centro_origen = la
-- sucursal donde se entrega a OCA (vacío = OCA retira en el origen). Los
-- productos sin peso o medidas viajan con el peso y la caja estándar.
create table if not exists oca_config (
  organizacion_id      text primary key references organizaciones(id) on delete cascade,
  usuario              text,
  clave                text,
  cuit                 text,
  nro_cuenta           text,
  operativa_domicilio  text,
  operativa_sucursal   text,
  origen               jsonb not null default '{}',
  centro_origen        text,
  franja               int not null default 1,
  peso_std_g           int not null default 500 check (peso_std_g > 0),
  caja_std             jsonb not null default '{"largo": 20, "ancho": 15, "alto": 10}',
  ultima_prueba        jsonb,
  actualizado_ts       timestamptz not null default now()
);
alter table oca_config enable row level security;
-- Lo último que contestó OCA cuando no dio sucursales (para revisar; no se muestra).
alter table oca_config add column if not exists diagnostico jsonb;

-- Método de envío "OCA a sucursal" (el comprador elige la sucursal donde retira).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'metodo_envio_tipo_check' and pg_get_constraintdef(oid) like '%oca_sucursal%') then
    alter table metodo_envio drop constraint if exists metodo_envio_tipo_check;
    alter table metodo_envio add constraint metodo_envio_tipo_check
      check (tipo in ('retiro', 'tarifa_fija', 'por_provincia', 'a_convenir', 'oca', 'oca_sucursal', 'andreani'));
  end if;
end $$;

-- Cómo se sigue el envío (Fer, 7/10): 'automatico' = lo informa el transportista (OCA: despachado al
-- retirarlo, entregado al entregarlo; el pedido no muestra esos botones); 'manual' = se marca con los
-- botones del pedido (cadetería, envío propio; el retiro en el local, con «Cliente presente: retira»).
alter table metodo_envio add column if not exists seguimiento text not null default 'manual';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'metodo_envio_seguimiento_check') then
    alter table metodo_envio add constraint metodo_envio_seguimiento_check check (seguimiento in ('automatico', 'manual'));
    update metodo_envio set seguimiento = 'automatico' where tipo in ('oca', 'oca_sucursal');
  end if;
end $$;

-- ── Publicar solo en la Web minorista (Fer, 8/10) ───────────
-- Toda variación activa (de un producto activo y publicable) que todavía no
-- tiene publicación en la Web minorista se publica sola apenas tiene precio
-- de lista y stock en ese canal. Si alguien la apaga a mano (interruptor de la
-- ficha), queda la fila pausada con pausada_manual y esto no la vuelve a prender.
-- Corre al cargar un precio y al entrar stock (de la variación o, si es un
-- componente, de los kits que la usan).
create or replace function public.publicar_web_auto(p_org text, p_variacion bigint)
returns void language plpgsql as $$
declare v bigint; c record;
begin
  for c in select id, lista_precios_id from canal where organizacion_id = p_org and tipo = 'web_minorista' and estado = 'activo' loop
    for v in select p_variacion union select variacion_kit_id from kit_componente where variacion_componente_id = p_variacion loop
      if exists (select 1 from publicacion where canal_id = c.id and variacion_id = v and id_externo is null) then continue; end if;
      if not exists (select 1 from variacion vv join producto pr on pr.id = vv.producto_id
                      where vv.id = v and vv.organizacion_id = p_org and vv.estado = 'activa' and pr.estado = 'activo' and not pr.no_publicable) then continue; end if;
      if c.lista_precios_id is null or (select lista_ars from precio_de(p_org, v, c.lista_precios_id, (now() at time zone 'America/Argentina/Buenos_Aires')::date)) is null then continue; end if;
      if stock_disponible_canal(p_org, v, c.id) <= 0 then continue; end if;
      insert into publicacion (organizacion_id, variacion_id, canal_id, estado, titulo)
      values (p_org, v, c.id, 'activa', titulo_variacion(v))
      on conflict (canal_id, variacion_id) where id_externo is null do nothing;
    end loop;
  end loop;
end $$;

create or replace function public.publicar_web_auto_trg() returns trigger language plpgsql as $$
begin
  perform publicar_web_auto(new.organizacion_id, new.variacion_id);
  return new;
end $$;

create or replace trigger stock_publicar_web after insert or update of cantidad on stock
  for each row when (new.cantidad > 0) execute function publicar_web_auto_trg();
create or replace trigger precio_publicar_web after insert on precio
  for each row execute function publicar_web_auto_trg();
