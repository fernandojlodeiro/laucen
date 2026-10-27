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
-- Lo que ve el comprador en el pago al elegir el medio (Fer, 24/10: «Transferencia o efectivo» explica
-- que en efectivo sólo se cobra retirando en el local). Vacío: el texto de fábrica.
alter table medio_pago add column if not exists aviso text;
-- Las cuentas para transferir (transferencia): [{banco, titular, cuit, cbu, alias}]. Van en el mail
-- del pedido y en la página del pedido, con el total bien grande.
alter table medio_pago add column if not exists cuentas jsonb;
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
-- Días de la semana en que vale (Fer, 27/10: «miércoles y sábados −10 % en 3 cuotas»): 1 = lunes …
-- 7 = domingo, hora argentina; null = todos. Una condición medio_pago puede llevar además "cuotas".
alter table regla_comercial add column if not exists dias smallint[];

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

-- Los links por mail de las cuentas de la tienda (Fer, 25/10): confirmar el mail de una cuenta nueva
-- («registro», guarda nombre y contraseña hasta que se confirma) y cambiar la contraseña olvidada
-- («recuperar»). Se guarda el hash del código, nunca el código; vence y se usa una sola vez.
create table if not exists cuenta_tienda_token (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  tipo             text not null check (tipo in ('registro', 'recuperar')),
  email            text not null,
  nombre           text,
  clave_hash       text,
  token_hash       text not null unique,
  vence_ts         timestamptz not null,
  usado_ts         timestamptz,
  creado_ts        timestamptz not null default now()
);
alter table cuenta_tienda_token enable row level security;

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
-- Otra marca (Fer, 24/10): un dominio con `marca` abre la misma tienda (catálogo, precios,
-- stock, pedidos) pero con su propio nombre, logo, colores de la franja, banners y mail
-- ({nombre, logo, color_marca, color_marca_texto, banner, banner_2, banner_3, email}).
-- Los que redirigen van al principal, o al dominio de `redirige_a_id` (el www de una marca).
alter table tienda_dominio add column if not exists marca jsonb;
alter table tienda_dominio add column if not exists redirige_a_id bigint references tienda_dominio(id) on delete set null;
-- Publicidad por dominio (24/10: Google Ads, Meta y TikTok): {google: {activo, tag_id (AW-…),
-- conversion_label, ga4_id (G-…)}, meta: {activo, pixel_id}, tiktok: {activo, pixel_id},
-- contar_al_crear (transferencia y efectivo cuentan como venta al crear el pedido),
-- datos_comprador (manda el mail y el teléfono del comprador en la compra)}. lib/tienda/publicidad.ts.
alter table tienda_dominio add column if not exists publicidad jsonb;
-- Canonical (24/10, bitácora #856): un dominio de otra marca le dice a Google que cada página suya
-- es la misma del dominio principal (para que no la tome como copia y junte todo ahí). null = el
-- de fábrica: prendido en los de otra marca. Se apaga para posicionar esa marca por separado.
alter table tienda_dominio add column if not exists canonical_principal boolean;

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

-- Categorías que no salen en la portada (Fer, 24/10: "que resistencias no aparezca en la home"):
-- sus productos (y los de sus subcategorías) no entran en las filas que se arman solas ni en la
-- grilla de categorías. Lo elegido a mano en Destacados/Novedades sale igual.
create table if not exists tienda_portada_familia (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  familia_id       bigint not null references familia(id) on delete cascade,
  creado_ts        timestamptz not null default now(),
  unique (canal_id, familia_id)
);
alter table tienda_portada_familia enable row level security;
select erp_politica_org('tienda_portada_familia');

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
      -- Sin precio o con precio cero no se publica (un $ 0 en la web es venderlo regalado).
      if c.lista_precios_id is null or coalesce((select lista_ars from precio_de(p_org, v, c.lista_precios_id, (now() at time zone 'America/Argentina/Buenos_Aires')::date)), 0) <= 0 then continue; end if;
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

-- Antibot de la tienda (Fer, 24/10: "en el dominio viejo tengo 300.000 clientes creados por bots").
-- Cada intento de los formularios públicos (checkout, ingresar, crear cuenta) queda acá con su
-- resultado: es el contador del límite por IP y la auditoría. Sin políticas: sólo el servidor.
create table if not exists tienda_intento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint references canal(id) on delete cascade,
  ruta             text not null,
  ip               text not null,
  resultado        text not null,
  user_agent       text,
  creado_ts        timestamptz not null default now()
);
-- «sin_turnstile»: una compra que Cloudflare no verificó y pasó igual (lib/tienda/antibot.ts, Fer 27/10).
alter table tienda_intento drop constraint if exists tienda_intento_resultado_check;
alter table tienda_intento add constraint tienda_intento_resultado_check
  check (resultado in ('ok', 'trampa', 'muy_rapido', 'vencido', 'turnstile', 'tope_ip', 'sin_turnstile'));
create index if not exists tienda_intento_ip on tienda_intento (ruta, ip, creado_ts);
create index if not exists tienda_intento_org on tienda_intento (organizacion_id, creado_ts);
alter table tienda_intento enable row level security;

-- Cloudflare Turnstile de la organización (la clave secreta nunca se muestra). Sin políticas.
create table if not exists tienda_antibot (
  organizacion_id  text primary key references organizaciones(id) on delete cascade,
  site_key         text,
  secret_key       text,
  actualizado_ts   timestamptz not null default now()
);
alter table tienda_antibot enable row level security;

-- Catálogos para publicidad (24/10: Google Merchant Center, Meta, TikTok; lib/tienda/feed.ts).
-- Por categoría: el grupo de campaña (custom_label_0; los productos de sus subcategorías también, salvo
-- que una subcategoría tenga el suyo) o que no vaya al catálogo. Por producto: los que no van.
create table if not exists tienda_feed_familia (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  familia_id       bigint not null references familia(id) on delete cascade,
  grupo            text,
  excluida         boolean not null default false,
  check (excluida or grupo is not null),
  unique (canal_id, familia_id)
);
alter table tienda_feed_familia enable row level security;
select erp_politica_org('tienda_feed_familia');
create table if not exists tienda_feed_producto (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  producto_id      bigint not null references producto(id) on delete cascade,
  unique (canal_id, producto_id)
);
alter table tienda_feed_producto enable row level security;
select erp_politica_org('tienda_feed_producto');

-- El catálogo calculado de cada tienda (app/tienda/[slug]/catalogo.ts, catalogoGuardado): las páginas leen
-- esto al instante y uno solo lo recalcula en segundo plano cuando tiene más de 90 segundos.
create table if not exists tienda_catalogo (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  lista_id         bigint not null,
  moneda           text not null,
  filas            jsonb not null,
  calculado_ts     timestamptz not null default now(),
  primary key (canal_id, lista_id, moneda)
);
alter table tienda_catalogo enable row level security;

-- Banners de la portada (Fer, 25/10): los que se quieran, en dos familias (clara y oscura) que se
-- turnan cada 12 horas; cada semana se invierte cuál va primero (lib/tienda/banners.ts). Cada uno
-- es para todas las marcas de la tienda (dominio_id null) o para una sola (el dominio principal o
-- uno de otra marca); en una marca se ven los suyos más los de todas. link vacío = no lleva a
-- ningún lado; imagen_celular vacía = la misma imagen en el celular.
create table if not exists tienda_banner (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  dominio_id       bigint references tienda_dominio(id) on delete cascade,
  familia          text not null default 'clara' check (familia in ('clara', 'oscura')),
  imagen           text not null,
  imagen_celular   text,
  link             text,
  orden            int not null default 0,
  activo           boolean not null default true,
  creado_ts        timestamptz not null default now()
);
create index if not exists tienda_banner_orden on tienda_banner (canal_id, familia, orden);
-- Para qué pantalla es cada banner (Fer, 26/10): la compu, el celular o las dos. Se elige al subirlo.
alter table tienda_banner add column if not exists pantalla text not null default 'todas' check (pantalla in ('todas', 'compu', 'celular'));
-- Cuándo sale (Fer, 27/10: el banner de la promo de miércoles y sábados): días de la semana (1 = lunes …
-- 7 = domingo, hora argentina; null = todos) y desde / hasta (null = sin límite).
alter table tienda_banner add column if not exists dias smallint[];
alter table tienda_banner add column if not exists desde date;
alter table tienda_banner add column if not exists hasta date;
-- Banners que vienen del Google Drive de la organización (Fer, 26/10: los cargó Code desde su carpeta de
-- banners). La imagen del banner apunta a /api/tienda/imagen/<id del archivo>: la primera vez se baja del
-- Drive, se pasa a WebP y queda acá; desde ahí se sirve de la base, sin volver al Drive.
create table if not exists tienda_banner_archivo (
  id               text primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  tipo             text not null,
  contenido        bytea not null,
  creado_ts        timestamptz not null default now()
);
alter table tienda_banner_archivo enable row level security;
-- La carpeta del Drive de los banners de cada tienda (Fer, 26/10): «Leer Drive» en Banners de la tienda la recorre
-- (lib/tienda/banners-drive.ts). dominio_id null = todas las tiendas; si no, la principal o una de otra marca.
create table if not exists tienda_banner_drive (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  dominio_id       bigint references tienda_dominio(id) on delete cascade,
  carpeta          text not null,
  leido_ts         timestamptz,
  creado_ts        timestamptz not null default now()
);
create unique index if not exists tienda_banner_drive_destino on tienda_banner_drive (canal_id, coalesce(dominio_id, 0));
alter table tienda_banner_drive enable row level security;
alter table tienda_banner enable row level security;
select erp_politica_org('tienda_banner');
-- Los tres casilleros de antes (canal.config banner, banner_2, banner_3 y los de cada marca en
-- tienda_dominio.marca) pasan a la tabla como familia clara y se sacan de donde estaban (así esto
-- corre una sola vez).
insert into tienda_banner (organizacion_id, canal_id, familia, imagen, orden)
  select c.organizacion_id, c.id, 'clara', c.config ->> k.clave, k.n
    from canal c cross join (values ('banner', 1), ('banner_2', 2), ('banner_3', 3)) k(clave, n)
   where c.tipo = 'web_minorista' and coalesce(c.config ->> k.clave, '') <> '';
update canal set config = config - 'banner' - 'banner_2' - 'banner_3'
 where tipo = 'web_minorista' and config ?| array['banner', 'banner_2', 'banner_3'];
insert into tienda_banner (organizacion_id, canal_id, dominio_id, familia, imagen, orden)
  select d.organizacion_id, d.canal_id, d.id, 'clara', d.marca ->> k.clave, 10 + k.n
    from tienda_dominio d cross join (values ('banner', 1), ('banner_2', 2), ('banner_3', 3)) k(clave, n)
   where coalesce(d.marca ->> k.clave, '') <> '';
update tienda_dominio set marca = marca - 'banner' - 'banner_2' - 'banner_3'
 where marca ?| array['banner', 'banner_2', 'banner_3'];
