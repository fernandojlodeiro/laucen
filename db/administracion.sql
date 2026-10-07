-- Administración (sesión 5/10): costos, compras e importaciones, cuentas
-- corrientes, tesorería (caja, bancos, Mercado Pago) y contabilidad.
--
-- Cómo se encadena: los documentos (factura de compra, despacho, recibo,
-- orden de pago, gasto, comprobante de venta) mueven stock, cuenta corriente
-- y fondos con sus funciones de lib/administracion/; la contabilidad NO se
-- carga a mano: "contabilizar" recorre los documentos que todavía no tienen
-- asiento y lo genera (uno por documento, idempotente).

-- ── Costos ────────────────────────────────────────────────
-- Último costo y costo promedio ponderado de cada variación (en pesos y en
-- dólares, congelados al registrar cada compra). Los mueve sólo
-- registrarCosto() al entrar mercadería comprada.
alter table variacion add column if not exists costo_ultimo_ars numeric(16, 2);
alter table variacion add column if not exists costo_ultimo_usd numeric(16, 4);
alter table variacion add column if not exists costo_promedio_ars numeric(16, 2);
alter table variacion add column if not exists costo_promedio_usd numeric(16, 4);
alter table variacion add column if not exists costo_actualizado_ts timestamptz;

-- ── Compras ───────────────────────────────────────────────
create table if not exists factura_compra (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  proveedor_id     bigint not null references proveedor(id),
  -- A, B, C, M, E (exterior), X (remito/otro sin IVA discriminado)
  letra            text not null default 'A' check (letra in ('A', 'B', 'C', 'M', 'E', 'X')),
  es_nota_credito  boolean not null default false,
  punto_venta      int,
  numero           bigint,
  fecha            date not null default current_date,
  vencimiento      date,
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  cotizacion       numeric(14, 4) not null default 1,
  neto             numeric(16, 2) not null default 0,
  iva              numeric(16, 2) not null default 0,
  iva_detalle      jsonb not null default '[]',
  percepcion_iva   numeric(16, 2) not null default 0,
  percepcion_iibb  numeric(16, 2) not null default 0,
  otros_impuestos  numeric(16, 2) not null default 0,
  no_gravado       numeric(16, 2) not null default 0,
  total            numeric(16, 2) not null default 0,
  total_ars        numeric(16, 2) not null default 0,
  total_usd        numeric(16, 2) not null default 0,
  -- Si mueve stock, a qué depósito (si la mercadería ya entró por una
  -- recepción, se vincula y no se vuelve a ingresar).
  deposito_id      bigint references deposito(id),
  recepcion_id     bigint references recepcion(id) on delete set null,
  -- Si es un gasto (servicios, fletes…) y no mercadería: la cuenta contable.
  cuenta_gasto_id  bigint,
  estado           text not null default 'borrador' check (estado in ('borrador', 'registrada', 'anulada')),
  notas            text,
  usuario_id       text,
  registrada_ts    timestamptz,
  creado_ts        timestamptz not null default now()
);
create index if not exists factura_compra_org on factura_compra (organizacion_id, fecha desc);
-- Nota de débito (3/10, importación de ARCA): suma como una factura, pero
-- lleva su propia numeración, así que entra en el índice único.
alter table factura_compra add column if not exists es_nota_debito boolean not null default false;
drop index if exists factura_compra_numero;
create unique index if not exists factura_compra_numero_tipo on factura_compra (organizacion_id, proveedor_id, letra, es_nota_credito, es_nota_debito, punto_venta, numero)
  where numero is not null and estado <> 'anulada';
-- De dónde vino (null = a mano; 'arca_mc' = "Mis Comprobantes" de ARCA) y su CAE.
alter table factura_compra add column if not exists origen text;
alter table factura_compra add column if not exists cae text;
-- Vinculada a una recepción (3/10): por producto, lo facturado contra lo
-- recibido y la diferencia valorizada al costo de la factura, como quedó al
-- registrarla ([{variacion_id, facturado, recibido, diferencia,
-- costo_unit_ars, importe}]; [] = sin diferencias; null = sin recepción o
-- registrada antes de esto). La asienta "Diferencias en recepciones de stock".
alter table factura_compra add column if not exists diferencia_recepcion jsonb;
alter table factura_compra enable row level security;
select erp_politica_org('factura_compra');

create table if not exists factura_compra_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  factura_id       bigint not null references factura_compra(id) on delete cascade,
  variacion_id     bigint references variacion(id),
  descripcion      text not null,
  cantidad         numeric(12, 3) not null check (cantidad > 0),
  costo_unit       numeric(16, 4) not null,           -- neto (sin IVA), en la moneda de la factura
  iva_pct          numeric(5, 2) not null default 21,
  neto             numeric(16, 2) not null,
  iva              numeric(16, 2) not null,
  orden            int not null default 0
);
create index if not exists factura_compra_linea_f on factura_compra_linea (factura_id, orden);
alter table factura_compra_linea enable row level security;
select erp_politica_org('factura_compra_linea');

-- Despacho de importación: la mercadería importada con todos sus costos
-- (FOB, flete, seguro, derechos, tasas, despachante…). Al registrarlo se
-- prorratean los costos sobre las líneas por su valor FOB y queda el costo
-- unitario "puesto en depósito" de cada variación. El IVA y las
-- percepciones del despacho son crédito fiscal, no costo.
create table if not exists despacho_importacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  numero           text,                             -- nº de despacho (ej. 26001IC04012345X)
  proveedor_id     bigint references proveedor(id),   -- el proveedor del exterior
  fecha            date not null default current_date,
  cotizacion       numeric(14, 4) not null,           -- dólar del despacho
  fob_usd          numeric(16, 2) not null default 0,
  flete_usd        numeric(16, 2) not null default 0,
  seguro_usd       numeric(16, 2) not null default 0,
  -- Costos que se suman al costo (en pesos): derechos, tasa estadística,
  -- despachante, depósito fiscal, flete interno, etc. [{concepto, importe_ars}]
  gastos           jsonb not null default '[]',
  -- Impuestos que NO son costo (crédito fiscal), en pesos: IVA, IVA adicional,
  -- ganancias, IIBB. [{concepto, importe_ars}]
  impuestos        jsonb not null default '[]',
  deposito_id      bigint references deposito(id),
  estado           text not null default 'borrador' check (estado in ('borrador', 'registrado', 'anulado')),
  notas            text,
  usuario_id       text,
  registrado_ts    timestamptz,
  creado_ts        timestamptz not null default now()
);
alter table despacho_importacion enable row level security;
select erp_politica_org('despacho_importacion');

create table if not exists despacho_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  despacho_id      bigint not null references despacho_importacion(id) on delete cascade,
  variacion_id     bigint references variacion(id),
  descripcion      text not null,
  ncm              text,
  cantidad         int not null check (cantidad > 0),
  fob_unit_usd     numeric(16, 4) not null,
  -- Lo calcula el registro: costo unitario puesto en depósito.
  costo_unit_ars   numeric(16, 2),
  costo_unit_usd   numeric(16, 4),
  orden            int not null default 0
);
create index if not exists despacho_linea_d on despacho_linea (despacho_id, orden);
alter table despacho_linea enable row level security;
select erp_politica_org('despacho_linea');

-- ── Cuentas corrientes ────────────────────────────────────
-- Un renglón por documento que genera deuda o la cancela. `importe` > 0
-- aumenta la deuda del tercero con nosotros (cliente) o la nuestra con él
-- (proveedor); < 0 la baja. Saldo = suma. `pendiente` = lo que falta imputar
-- de ese renglón (para vencimientos y aplicación de pagos).
create table if not exists cc_movimiento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  tercero_tipo     text not null check (tercero_tipo in ('cliente', 'proveedor')),
  tercero_id       bigint not null,
  fecha            date not null,
  vencimiento      date,
  tipo             text not null check (tipo in ('factura', 'nota_credito', 'nota_debito', 'cobro', 'pago', 'ajuste', 'saldo_inicial')),
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  importe          numeric(16, 2) not null,
  importe_ars      numeric(16, 2) not null,
  importe_usd      numeric(16, 2) not null,
  pendiente        numeric(16, 2) not null,
  descripcion      text not null,
  referencia_tipo  text,
  referencia_id    bigint,
  creado_ts        timestamptz not null default now()
);
create index if not exists cc_tercero on cc_movimiento (organizacion_id, tercero_tipo, tercero_id, fecha);
create unique index if not exists cc_referencia on cc_movimiento (organizacion_id, referencia_tipo, referencia_id, tercero_tipo) where referencia_tipo is not null;
alter table cc_movimiento enable row level security;
select erp_politica_org('cc_movimiento');

create table if not exists cc_imputacion (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  debito_id        bigint not null references cc_movimiento(id) on delete cascade,
  credito_id       bigint not null references cc_movimiento(id) on delete cascade,
  importe          numeric(16, 2) not null check (importe > 0),
  creado_ts        timestamptz not null default now()
);
alter table cc_imputacion enable row level security;
select erp_politica_org('cc_imputacion');
-- Débito y crédito pueden estar en monedas distintas (una factura en dólares
-- cancelada con una orden de pago en pesos): `importe` es lo que bajó el
-- pendiente del débito (en su moneda), `importe_credito` lo que bajó el del
-- crédito (en la suya) y `cotizacion` el tipo de cambio usado (null si eran de
-- la misma moneda). Las imputaciones viejas sin importe_credito eran de igual
-- importe de los dos lados.
alter table cc_imputacion add column if not exists importe_credito numeric(16, 2);
alter table cc_imputacion add column if not exists cotizacion numeric(14, 4);

-- ── Tesorería ─────────────────────────────────────────────
create table if not exists cuenta_fondos (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  nombre           text not null,
  tipo             text not null check (tipo in ('caja', 'banco', 'mercadopago', 'otro')),
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  banco            text,
  cbu              text,
  alias            text,
  saldo_inicial    numeric(16, 2) not null default 0,
  saldo_inicial_fecha date,
  cuenta_contable_id bigint,
  activa           boolean not null default true,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, nombre)
);
alter table cuenta_fondos enable row level security;
select erp_politica_org('cuenta_fondos');

create table if not exists movimiento_fondos (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cuenta_id        bigint not null references cuenta_fondos(id),
  fecha            date not null,
  -- > 0 entra, < 0 sale (en la moneda de la cuenta).
  importe          numeric(16, 2) not null,
  importe_ars      numeric(16, 2) not null,
  importe_usd      numeric(16, 2) not null,
  concepto         text not null,
  -- recibo, transferencia o manual (un gasto, un ingreso, una liquidación de
  -- Mercado Pago, comisiones del banco: la contrapartida es cuenta_contable_id).
  referencia_tipo  text,
  referencia_id    bigint,
  cuenta_contable_id bigint,
  conciliado_ts    timestamptz,
  extracto_linea_id bigint,
  usuario_id       text,
  creado_ts        timestamptz not null default now()
);
create index if not exists movimiento_fondos_cuenta on movimiento_fondos (cuenta_id, fecha);
alter table movimiento_fondos enable row level security;
select erp_politica_org('movimiento_fondos');

-- Recibo (cobranza a un cliente) y orden de pago (a un proveedor): cabecera
-- y sus medios (de qué cuenta de fondos sale/entra cada parte, y retenciones).
create table if not exists recibo (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  tipo             text not null check (tipo in ('cobro', 'pago')),
  numero           bigint not null,
  tercero_tipo     text not null check (tercero_tipo in ('cliente', 'proveedor')),
  tercero_id       bigint not null,
  fecha            date not null default current_date,
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  total            numeric(16, 2) not null,
  total_ars        numeric(16, 2) not null,
  total_usd        numeric(16, 2) not null,
  -- [{cuenta_id, importe}] y [{concepto, importe}] (retenciones sufridas o practicadas)
  medios           jsonb not null default '[]',
  retenciones      jsonb not null default '[]',
  estado           text not null default 'emitido' check (estado in ('emitido', 'anulado')),
  notas            text,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, tipo, numero)
);
alter table recibo enable row level security;
select erp_politica_org('recibo');

-- Extractos bancarios (o de Mercado Pago) importados para conciliar.
create table if not exists extracto_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  cuenta_id        bigint not null references cuenta_fondos(id) on delete cascade,
  fecha            date not null,
  descripcion      text,
  importe          numeric(16, 2) not null,
  referencia       text,
  movimiento_id    bigint references movimiento_fondos(id) on delete set null,
  importado_ts     timestamptz not null default now()
);
create index if not exists extracto_cuenta on extracto_linea (cuenta_id, fecha);
alter table extracto_linea enable row level security;
select erp_politica_org('extracto_linea');

-- ── Contabilidad ──────────────────────────────────────────
create table if not exists plan_cuenta (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  codigo           text not null,                     -- "1.1.01.01"
  nombre           text not null,
  tipo             text not null check (tipo in ('activo', 'pasivo', 'patrimonio', 'ingreso', 'egreso')),
  imputable        boolean not null default true,
  activa           boolean not null default true,
  -- Para qué la usan los asientos automáticos (ventas, iva_debito, deudores…).
  rol              text,
  unique (organizacion_id, codigo)
);
create unique index if not exists plan_cuenta_rol on plan_cuenta (organizacion_id, rol) where rol is not null;
alter table plan_cuenta enable row level security;
select erp_politica_org('plan_cuenta');

create table if not exists asiento (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  numero           bigint not null,
  fecha            date not null,
  concepto         text not null,
  -- venta, nota_credito_venta, compra, despacho, cobro, pago, gasto, cmv, manual, apertura
  origen           text not null,
  referencia_id    bigint,
  estado           text not null default 'vigente' check (estado in ('vigente', 'anulado')),
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  unique (organizacion_id, numero)
);
create unique index if not exists asiento_origen on asiento (organizacion_id, origen, referencia_id) where referencia_id is not null and estado = 'vigente';
create index if not exists asiento_fecha on asiento (organizacion_id, fecha);
alter table asiento enable row level security;
select erp_politica_org('asiento');

create table if not exists asiento_linea (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  asiento_id       bigint not null references asiento(id) on delete cascade,
  cuenta_id        bigint not null references plan_cuenta(id),
  debe             numeric(16, 2) not null default 0 check (debe >= 0),
  haber            numeric(16, 2) not null default 0 check (haber >= 0),
  detalle          text,
  orden            int not null default 0
);
create index if not exists asiento_linea_cuenta on asiento_linea (cuenta_id);
create index if not exists asiento_linea_asiento on asiento_linea (asiento_id, orden);
alter table asiento_linea enable row level security;
select erp_politica_org('asiento_linea');

-- ── Importar "Mis Comprobantes – Recibidos" de ARCA (3/10) ─────────────
-- La cuenta de gasto que se recuerda por proveedor (la propone la
-- importación y la usa el asiento de sus facturas sin líneas de mercadería).
alter table proveedor add column if not exists cuenta_gasto_id bigint references plan_cuenta(id) on delete set null;

-- Cada archivo subido: los comprobantes leídos (vista previa) y, al
-- confirmar, el resultado. El estado de cada comprobante (nueva / ya cargada
-- / distinta) se calcula al mirar, contra lo que haya en ese momento.
create table if not exists arca_mc_lote (
  id               bigint generated always as identity primary key,
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  archivo          text not null,
  version          text,
  comprobantes     jsonb not null default '[]',
  errores          jsonb not null default '[]',
  estado           text not null default 'vista_previa' check (estado in ('vista_previa', 'importado')),
  resultado        jsonb,
  usuario_id       text,
  creado_ts        timestamptz not null default now(),
  importado_ts     timestamptz
);
create index if not exists arca_mc_lote_org on arca_mc_lote (organizacion_id, creado_ts desc);
alter table arca_mc_lote enable row level security;
select erp_politica_org('arca_mc_lote');

-- ── Cuentas propias de cada canal y de cada Mercado Pago (pedido de Fer, 3/10) ──
-- Cada canal tiene su cuenta de ingresos "Ventas — <canal>" (el neto de sus
-- facturas va ahí en vez de a la Ventas general) y cada cuenta de Mercado
-- Libre colgada de un canal, su cuenta de fondos "Mercado Pago — <apodo>" con
-- su cuenta contable propia (lo cobrado de sus pedidos va ahí en vez de a
-- "Cobros de canales a liquidar"). Las crea asegurarCuentasDeCanales()
-- (lib/administracion/contabilidad.ts) al crear el canal, al conectar la
-- cuenta de ML y, para las que ya estaban, en la primera vuelta de los asientos.
alter table canal add column if not exists cuenta_ventas_id bigint references plan_cuenta(id) on delete set null;
-- De qué cuenta de ML es la cuenta de fondos (el usuario de ML, que no cambia
-- aunque la cuenta se pase a otro canal) y de qué canal cobra.
alter table cuenta_fondos add column if not exists meli_user_id bigint;
alter table cuenta_fondos add column if not exists canal_id bigint references canal(id) on delete set null;
create unique index if not exists cuenta_fondos_meli on cuenta_fondos (organizacion_id, meli_user_id) where meli_user_id is not null;

-- Ya no hay una "Mercado Pago" genérica en el plan: la que sembraba el plan
-- por defecto (rol 'mercadopago') se borra si nunca se usó. Si se usó, queda
-- (con su historia) y sigue siendo el respaldo de una cuenta de fondos de
-- Mercado Pago sin cuenta contable propia.
delete from plan_cuenta p where p.rol = 'mercadopago'
   and not exists (select 1 from asiento_linea l where l.cuenta_id = p.id)
   and not exists (select 1 from cuenta_fondos f where f.cuenta_contable_id = p.id)
   and not exists (select 1 from movimiento_fondos m where m.cuenta_contable_id = p.id)
   and not exists (select 1 from factura_compra fc where fc.cuenta_gasto_id = p.id)
   and not exists (select 1 from proveedor pr where pr.cuenta_gasto_id = p.id);

-- ── Cobros de pedidos en Caja y bancos (pedido de Fer, 3/10, «opción a») ──
-- Cada cobro de pedido que se asienta en una cuenta de Mercado Pago deja
-- también su movimiento en esa cuenta de fondos (referencia_tipo 'pedido',
-- referencia_id = el pedido), así el saldo de Caja y bancos da igual que el
-- mayor. Es la pata de fondos del mismo asiento "Cobro de pedido" (como los
-- movimientos de un recibo): no genera otro asiento. Uno por pedido.
create unique index if not exists movimiento_fondos_pedido on movimiento_fondos (organizacion_id, referencia_id) where referencia_tipo = 'pedido';
-- La cuenta de Mercado Pago de la tienda web: la cuenta de fondos que cobra
-- lo que entra por el medio de pago Mercado Pago del checkout (la crea sola
-- asegurarCuentasDeCanales cuando el medio tiene su access token cargado).
alter table cuenta_fondos add column if not exists medio_pago_id bigint references medio_pago(id) on delete set null;
create unique index if not exists cuenta_fondos_medio_pago on cuenta_fondos (organizacion_id, medio_pago_id) where medio_pago_id is not null;

-- ── Varias razones sociales en una organización (4/10) ────────────────
-- Stock, catálogo, clientes, proveedores y plan de cuentas se comparten. Cada
-- documento y cada cuenta lleva la razón social (emisor) a la que pertenece:
-- compras y despachos (a nombre de quién), cuentas corrientes, cuentas de
-- fondos (el banco o la Mercado Pago es de un CUIT), recibos, asientos
-- (de ahí salen los libros por razón social) y lotes de Mis Comprobantes.
-- Una fila que nace sin razón social toma la principal (disparador).
select emisor_columna('factura_compra');
select emisor_columna('despacho_importacion');
select emisor_columna('cc_movimiento');
select emisor_columna('cuenta_fondos');
select emisor_columna('recibo');
select emisor_columna('asiento');
select emisor_columna('arca_mc_lote');

-- ── CUIT y CBU: sólo números (Fer, 6/10) ──────────────────
-- El operador los carga como quiera (con guiones, puntos o espacios); la base
-- guarda sólo los números y las pantallas los muestran formateados
-- (lib/numeros-doc.ts). Así el buscador los encuentra escritos de cualquier forma.
create or replace function erp_solo_digitos() returns trigger language plpgsql as $$
declare c text; v text;
begin
  foreach c in array TG_ARGV loop
    v := to_jsonb(new) ->> c;
    if v is not null and v ~ '[^0-9]' then
      new := jsonb_populate_record(new, jsonb_build_object(c, nullif(regexp_replace(v, '[^0-9]', '', 'g'), '')));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists cliente_solo_digitos on cliente;
create trigger cliente_solo_digitos before insert or update of cuit on cliente for each row execute function erp_solo_digitos('cuit');
drop trigger if exists proveedor_solo_digitos on proveedor;
create trigger proveedor_solo_digitos before insert or update of cuit on proveedor for each row execute function erp_solo_digitos('cuit');
drop trigger if exists emisor_solo_digitos on emisor;
create trigger emisor_solo_digitos before insert or update of cuit on emisor for each row execute function erp_solo_digitos('cuit');
drop trigger if exists cuenta_fondos_solo_digitos on cuenta_fondos;
create trigger cuenta_fondos_solo_digitos before insert or update of cbu on cuenta_fondos for each row execute function erp_solo_digitos('cbu');
-- Lo cargado antes, también (no hace nada si ya está limpio).
update cliente set cuit = cuit where cuit ~ '[^0-9]';
update proveedor set cuit = cuit where cuit ~ '[^0-9]';
update emisor set cuit = cuit where cuit ~ '[^0-9]';
update cuenta_fondos set cbu = cbu where cbu ~ '[^0-9]';

-- ── Teléfonos de clientes y proveedores: el número sólo con números y, aparte, el
-- interno o la aclaración (Fer, 6/10). Lo que se cargue como "(011) 4613-0698 INT 32"
-- queda número "01146130698" y aclaración "INT 32": lo que empieza en la primera
-- letra o "/" pasa a la aclaración (si la aclaración ya tiene algo, no se pisa).
alter table cliente add column if not exists telefono_aclaracion text;
alter table cliente add column if not exists telefono_movil_aclaracion text;

-- Buscar clientes rápido (Fer, 7/10: son más de 100.000; va acá porque usa las aclaraciones de los teléfonos): todos los datos que mira el buscador
-- (camposCliente) en un solo texto en minúsculas, con documento, CUIT y teléfonos también sólo
-- en números, y un índice de trigramas. prefiltroCliente() (app/ventas/clientes/lista.tsx) lo usa.
create extension if not exists pg_trgm with schema extensions;
alter table cliente add column if not exists busqueda text generated always as (lower(
  id::text || ' ' || coalesce(nombre, '') || ' ' || coalesce(razon_social, '') || ' ' || coalesce(nombre_pila, '') || ' ' || coalesce(apellido, '') || ' ' ||
  coalesce(email, '') || ' ' || coalesce(apodo_ml, '') || ' ' || coalesce(documento_tipo, '') || ' ' || coalesce(documento_numero, '') || ' ' || coalesce(cuit, '') || ' ' ||
  coalesce(telefono, '') || ' ' || coalesce(telefono_aclaracion, '') || ' ' || coalesce(telefono_movil, '') || ' ' || coalesce(telefono_movil_aclaracion, '') || ' ' ||
  coalesce(notas, '') || ' ' ||
  regexp_replace(coalesce(documento_numero, ''), '[^0-9]', '', 'g') || ' ' || regexp_replace(coalesce(cuit, ''), '[^0-9]', '', 'g') || ' ' ||
  regexp_replace(coalesce(telefono, ''), '[^0-9]', '', 'g') || ' ' || regexp_replace(coalesce(telefono_movil, ''), '[^0-9]', '', 'g'))) stored;
create index if not exists cliente_busqueda_trgm on cliente using gin (busqueda extensions.gin_trgm_ops);
-- Lo mismo con las direcciones (la pantalla Clientes busca también en ellas).
alter table cliente_direccion add column if not exists busqueda text generated always as (lower(
  coalesce(etiqueta, '') || ' ' || coalesce(calle, '') || ' ' || coalesce(numero, '') || ' ' || coalesce(piso_depto, '') || ' ' || coalesce(localidad, '') || ' ' ||
  coalesce(provincia, '') || ' ' || coalesce(codigo_postal, '') || ' ' || coalesce(pais, '') || ' ' || coalesce(receptor, '') || ' ' ||
  coalesce(receptor_telefono, '') || ' ' || coalesce(referencia, '') || ' ' || regexp_replace(coalesce(receptor_telefono, ''), '[^0-9]', '', 'g'))) stored;
create index if not exists cliente_direccion_busqueda_trgm on cliente_direccion using gin (busqueda extensions.gin_trgm_ops);
alter table proveedor add column if not exists telefono_aclaracion text;
alter table proveedor add column if not exists telefono_movil_aclaracion text;
create or replace function erp_telefono() returns trigger language plpgsql as $$
declare i int := 1; c text; ca text; v text; m text[]; acl text;
begin
  while i < coalesce(array_length(TG_ARGV, 1), 0) loop
    c := TG_ARGV[i - 1]; ca := TG_ARGV[i]; i := i + 2;
    v := to_jsonb(new) ->> c;
    if v is not null and v ~ '[^0-9]' then
      m := regexp_match(v, '^([^A-Za-z/]*)(.*)$', 's');
      acl := nullif(btrim(regexp_replace(m[2], '^[\s/,;:>-]+', '')), '');
      new := jsonb_populate_record(new, jsonb_build_object(
        c, nullif(regexp_replace(m[1], '[^0-9]', '', 'g'), ''),
        ca, coalesce(nullif(btrim(to_jsonb(new) ->> ca), ''), acl)));
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists cliente_telefono on cliente;
create trigger cliente_telefono before insert or update of telefono, telefono_movil on cliente for each row
  execute function erp_telefono('telefono', 'telefono_aclaracion', 'telefono_movil', 'telefono_movil_aclaracion');
drop trigger if exists proveedor_telefono on proveedor;
create trigger proveedor_telefono before insert or update of telefono, telefono_movil on proveedor for each row
  execute function erp_telefono('telefono', 'telefono_aclaracion', 'telefono_movil', 'telefono_movil_aclaracion');
update cliente set telefono = telefono where telefono ~ '[^0-9]';
update cliente set telefono_movil = telefono_movil where telefono_movil ~ '[^0-9]';
update proveedor set telefono = telefono where telefono ~ '[^0-9]';
update proveedor set telefono_movil = telefono_movil where telefono_movil ~ '[^0-9]';
