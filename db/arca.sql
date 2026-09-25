-- Importaciones argentinas (ARCA) + enriquecimiento de Softrade.
-- Orden completa: docs/orden-arca-importaciones.md.
--
-- Datos de ARCA, nomencladores y Softrade = GLOBALES (son datos públicos o
-- de Fer, los comparten todas las organizaciones). Los rubros guardados son
-- de cada organización (llevan organizacion_id).
--
-- Idempotente: lib/arca/esquema.ts lo corre al primer uso tras cada arranque
-- de la app, y scripts/arca/cargar.mjs lo corre antes de cada carga. Una
-- migración nueva va en este mismo archivo, siempre con `if not exists`.

-- ── Datos de ARCA ─────────────────────────────────────────

-- Una fila por ítem de despacho (el .lst trae una por ítem y por concepto
-- de arancel; scripts/arca/arca_transform.py las deduplica).
create table if not exists arca_impo_items (
  periodo          char(6)  not null,        -- AAAAMM
  aduana           text     not null,
  destinacion      text     not null,
  num_item         int      not null,
  importador       text     not null,        -- 30 caracteres, tal cual viene
  transporte       text,                     -- código crudo ('2','4','8','', ...)
  unidad           text,
  cantidad         numeric,
  fob_item         numeric,                  -- USD
  fob_total        numeric,                  -- USD, de la destinación
  divisa           text,
  pais_origen      text,                     -- código crudo
  pais_procedencia text,
  ncm              text collate "C" not null, -- '8516.29.00' (orden C: el prefijo '85%' usa el índice)
  primary key (destinacion, num_item)
);
create index if not exists arca_impo_items_ncm_idx on arca_impo_items (ncm, periodo);
create index if not exists arca_impo_items_importador_idx on arca_impo_items (importador);
create index if not exists arca_impo_items_pais_idx on arca_impo_items (pais_origen, periodo);
create index if not exists arca_impo_items_periodo_idx on arca_impo_items (periodo);
alter table arca_impo_items enable row level security;

-- Impuestos: NO se guardan montos por despacho. Del .lst sólo se usan las
-- columnas 14 (concepto) y 15 (monto) para deducir, por NCM, la tasa de IVA y
-- la de estadística que se paga hoy (ver agg_tasas_mes más abajo).
-- (derechos_pct_efectivo, lo pagado por cada competidor, se sacó por pedido
-- de Fer el 25/09: la columna se borra de la base después del deploy.)

-- Qué período se cargó, para no cargar dos veces y saber qué falta.
create table if not exists arca_cargas (
  periodo         char(6) primary key,
  cargado_en      timestamptz default now(),
  filas_crudas    bigint,
  items           bigint,
  filas_impuestos bigint
);
alter table arca_cargas enable row level security;
-- Filas del CSV de ítems que no eran datos (encabezados repetidos en el .lst)
-- y la carga descartó: `verificar` las descuenta de las cifras de la orden.
alter table arca_cargas add column if not exists items_descartados int;

-- ── Tablas de referencia ──────────────────────────────────
-- Nunca se inventan nombres: lo que no se sabe queda con nombre null y el
-- panel muestra el código.

create table if not exists ref_pais       (codigo text primary key, nombre text);
create table if not exists ref_transporte (codigo text primary key, nombre text);
create table if not exists ref_aduana     (codigo text primary key, nombre text);
create table if not exists ref_unidad     (codigo text primary key, nombre text);
create table if not exists ref_concepto   (codigo text primary key, nombre text);
alter table ref_pais       enable row level security;
alter table ref_transporte enable row level security;
alter table ref_aduana     enable row level security;
alter table ref_unidad     enable row level security;
alter table ref_concepto   enable row level security;

-- Nomenclador NCM (desde arancel.zip de ARCA).
create table if not exists ref_ncm (
  codigo               text collate "C" primary key,   -- '85.16', '8516.29.00' o apertura SIM '8516.29.00.100A'
  tipo                 text,               -- 'partida' | 'subpartida' | 'ncm' | 'sim'
  nivel                int,                -- profundidad en el árbol (partida = 1)
  padre                text,
  descripcion          text,
  descripcion_completa text,               -- la de los ancestros + la propia
  unidad               text,
  alic_1 numeric, alic_2 numeric, alic_3 numeric, alic_4 numeric, alic_5 numeric,  -- cuál es cuál: ref_alicuota
  uso_economico        text,               -- futuro: consumo / intermedio / capital
  rubro_ml             text[]              -- futuro: etiquetas de rubro estilo ML
);
create index if not exists ref_ncm_padre_idx on ref_ncm (padre);
alter table ref_ncm enable row level security;
-- La 6ª alícuota y la 2ª unidad (diseño de archivos de ARCA, DI PHSI).
alter table ref_ncm add column if not exists alic_6 numeric;
alter table ref_ncm add column if not exists unidad_derecho_especifico text;

-- Versiones del nomenclador: cada carga de arancel.zip es una versión con su
-- fecha de vigencia (la del nombre del archivo, ej. nomenclador_20260925.txt)
-- y no pisa las anteriores. La clave pasa a ser (codigo, vigencia).
alter table ref_ncm add column if not exists vigencia date;
do $$
begin
  if not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indrelid
     where c.relname = 'ref_ncm' and i.indisprimary and i.indnatts = 2
  ) then
    update ref_ncm set vigencia = date '2026-09-25' where vigencia is null;
    alter table ref_ncm drop constraint if exists ref_ncm_pkey;
    alter table ref_ncm alter column vigencia set not null;
    alter table ref_ncm add primary key (codigo, vigencia);
  end if;
end $$;

-- La versión vigente = la última cargada (cada carga es el nomenclador entero).
drop view if exists ref_ncm_vigente cascade;  -- ncm_arancel depende de ella: se recrea más abajo
create view ref_ncm_vigente with (security_invoker = true) as
select * from ref_ncm where vigencia = (select max(vigencia) from ref_ncm);

-- Qué es cada alícuota del nomenclador: según el diseño oficial de ARCA
-- ("Consulta Arancel Integrado / Sufijos de Valor", DI PHSI). Para Fer, lo que
-- importa es alic_3: el arancel que se paga importando desde fuera del Mercosur.
create table if not exists ref_alicuota (
  columna text primary key,   -- 'alic_1' .. 'alic_6'
  nombre  text,
  nota    text                -- de dónde salió el nombre
);
alter table ref_alicuota enable row level security;
insert into ref_alicuota (columna, nombre, nota) values
  ('alic_1', 'Derecho de exportación', 'Diseño de archivos de ARCA (DI PHSI)'),
  ('alic_2', 'Reintegro extrazona', 'Diseño de archivos de ARCA (DI PHSI)'),
  ('alic_3', 'Arancel de importación (fuera del Mercosur)', 'Diseño de archivos de ARCA (DI PHSI): derecho de importación extrazona'),
  ('alic_4', 'Reintegro intrazona', 'Diseño de archivos de ARCA (DI PHSI)'),
  ('alic_5', 'Arancel de importación (Mercosur)', 'Diseño de archivos de ARCA (DI PHSI): derecho de importación intrazona'),
  ('alic_6', 'Derecho de importación específico mínimo', 'Diseño de archivos de ARCA (DI PHSI)')
on conflict (columna) do update set nombre = excluded.nombre, nota = excluded.nota;

-- Arancel (fuera del Mercosur) de cada NCM de 8 dígitos, vigente: el mínimo y
-- el máximo entre sus aperturas SIM (casi siempre son iguales).
drop view if exists ncm_arancel;
create view ncm_arancel with (security_invoker = true) as
select left(codigo, 10) as ncm, min(alic_3) as arancel_min, max(alic_3) as arancel_max
  from ref_ncm_vigente
 where alic_3 is not null and length(codigo) >= 10
 group by 1;

-- IVA y tasa de estadística por NCM, DEDUCIDOS de los despachos (no están en
-- el nomenclador). Por ítem: CIF = derechos / arancel; estadística % =
-- estadística / CIF; IVA % = IVA / (CIF + derechos + estadística). Sólo ítems
-- con arancel > 0 y un CIF creíble (entre 1 y 1,6 veces el FOB). Se cuentan
-- los ítems por tasa (redondeada a 0,5) y mes; ncm_tasas se queda con la que
-- más se repite en los últimos 12 meses cargados. Lo calcula cargar.mjs.
create table if not exists agg_tasas_mes (
  ncm     text collate "C" not null,
  periodo char(6) not null,
  tipo    text not null check (tipo in ('iva', 'estadistica')),
  pct     numeric not null,
  items   int not null,
  primary key (ncm, periodo, tipo, pct)
);
create index if not exists agg_tasas_mes_periodo_idx on agg_tasas_mes (periodo);
alter table agg_tasas_mes enable row level security;

drop view if exists ncm_tasas;
create view ncm_tasas with (security_invoker = true) as
with ult as (select periodo from arca_cargas order by periodo desc limit 12),
     t as (select ncm, tipo, pct, sum(items)::int items
             from agg_tasas_mes where periodo in (select periodo from ult) group by 1, 2, 3),
     r as (select t.*, sum(items) over (partition by ncm, tipo)::int total,
                  row_number() over (partition by ncm, tipo order by items desc, pct desc) n
             from t)
select ncm,
       max(pct)   filter (where tipo = 'iva' and n = 1)         as iva_pct,
       max(items) filter (where tipo = 'iva' and n = 1)         as iva_items,
       max(total) filter (where tipo = 'iva' and n = 1)         as iva_total,
       max(pct)   filter (where tipo = 'estadistica' and n = 1) as estadistica_pct,
       max(items) filter (where tipo = 'estadistica' and n = 1) as estadistica_items,
       max(total) filter (where tipo = 'estadistica' and n = 1) as estadistica_total
  from r group by ncm;

-- Sufijos de valor (marca, código de artículo, atributos por posición).
create table if not exists ref_sufijo (
  posicion    text not null,   -- '02', '03.03', '9403.20.90.220' (tal cual viene)
  codigo      text not null,   -- 'AA', 'AI', 'NA01', ...
  norma       text,
  descripcion text,
  primary key (posicion, codigo)
);
alter table ref_sufijo enable row level security;

-- Valores confirmados (docs, sección 4). `on conflict do nothing`: si Fer
-- después carga la tabla completa, no se pisa.
insert into ref_transporte (codigo, nombre) values
  ('2', 'Aéreo'), ('4', 'Terrestre'), ('8', 'Marítimo')
on conflict do nothing;
insert into ref_pais (codigo, nombre) values
  ('310', 'China'), ('203', 'Brasil'), ('212', 'Estados Unidos'), ('438', 'Alemania'),
  ('313', 'Taiwan'), ('309', 'Corea Republicana'), ('308', 'Corea Democrática'), ('436', 'Turquía')
on conflict do nothing;
insert into ref_concepto (codigo, nombre) values
  ('415', 'IVA'), ('429', 'Ingresos Brutos'), ('450', 'Ciudad Autónoma de Bs. As.'),
  ('422', 'IVA adicional'), ('424', 'Impuesto a las Ganancias'),
  ('010', 'Derechos de importación'), ('061', 'Tasa de estadística')   -- confirmados por Fer, 25/09
on conflict do nothing;

-- ── Resúmenes (se recalculan al terminar cada carga mensual) ─

create table if not exists agg_ncm_pais_mes (
  ncm                    text collate "C" not null,
  pais_origen            text not null,
  transporte             text not null,   -- '' = sin dato
  periodo                char(6) not null,
  items                  int not null,
  fob                    numeric,
  cantidad               numeric,
  importadores_distintos int not null,    -- del mes: no se suma entre meses
  primary key (ncm, pais_origen, transporte, periodo)
);
create index if not exists agg_ncm_pais_mes_periodo_idx on agg_ncm_pais_mes (periodo, pais_origen);
alter table agg_ncm_pais_mes enable row level security;

-- Además de (ncm, importador, periodo) lleva país de origen y transporte:
-- así el panel resuelve casi todos los filtros sin tocar la tabla grande.
create table if not exists agg_ncm_importador_mes (
  ncm         text collate "C" not null,
  importador  text not null,
  pais_origen text not null,
  transporte  text not null,   -- '' = sin dato
  periodo     char(6) not null,
  items       int not null,
  fob         numeric,
  cantidad    numeric,
  primary key (ncm, importador, pais_origen, transporte, periodo)
);
create index if not exists agg_ncm_importador_mes_imp_idx on agg_ncm_importador_mes (importador, periodo);
create index if not exists agg_ncm_importador_mes_periodo_idx on agg_ncm_importador_mes (periodo);
alter table agg_ncm_importador_mes enable row level security;

create table if not exists agg_importador_mes (
  importador    text not null,
  periodo       char(6) not null,
  items         int not null,
  fob           numeric,
  ncm_distintas int not null,
  primary key (importador, periodo)
);
create index if not exists agg_importador_mes_periodo_idx on agg_importador_mes (periodo);
alter table agg_importador_mes enable row level security;

-- ── Rubros guardados (de cada organización) ───────────────

create table if not exists rubros (
  id              bigint generated always as identity primary key,
  organizacion_id text not null references organizaciones(id) on delete cascade,
  nombre          text not null,
  creado_en       timestamptz not null default now()
);
create index if not exists rubros_org_idx on rubros (organizacion_id);
alter table rubros enable row level security;

create table if not exists rubro_ncm (
  rubro_id bigint not null references rubros(id) on delete cascade,
  ncm      text collate "C" not null,   -- cualquier nivel: '85', '85.16', '8516.29.00', SIM
  primary key (rubro_id, ncm)
);
alter table rubro_ncm enable row level security;

-- ── Softrade (Excel "Importaciones Detalladas") ───────────
-- Enriquece a ARCA, no la reemplaza: misma clave (destinacion, num_item).

create table if not exists softrade_items (
  destinacion      text not null,
  num_item         int  not null,
  fecha            date,
  tipo_dato        text,
  ncm_sim          text,              -- 11 dígitos + letra
  importador       text,              -- completo
  localidad        text,
  destinacion_tipo text,
  aduana           text,
  via              text,
  pais_origen      text,
  pais_procedencia text,
  usd_unitario numeric, usd_fob numeric, flete_usd numeric, seguro_usd numeric, usd_cif numeric,
  cant_estad   numeric, un_estad text, cantidad numeric, unidad text,
  kg_netos     numeric, kg_brutos numeric,
  derecho_usd  numeric, derecho_pct numeric, acuerdo_aladi text,
  cargado_de   text,                  -- nombre del Excel
  primary key (destinacion, num_item)
);
alter table softrade_items enable row level security;

create table if not exists softrade_subitems (
  destinacion     text not null,
  num_item        int  not null,
  num_subitem     int  not null,
  marca_texto     text,              -- col AB tal cual
  cantidad        numeric,
  unitario_divisa numeric,
  fob_divisa      numeric,
  moneda          text,
  incoterm        text,
  sufijos_raw     text,              -- col AH tal cual
  marca           text,              -- parseado de AA(...)
  codigo_articulo text,              -- parseado de AI(...)
  atributos       jsonb,             -- {"NA":"01","NB":"00","AB":"..."}
  descripcion_arancelaria text,
  modelo          text,
  primary key (destinacion, num_item, num_subitem)
);
create index if not exists softrade_subitems_marca_idx on softrade_subitems (marca);
create index if not exists softrade_subitems_codigo_idx on softrade_subitems (codigo_articulo);
alter table softrade_subitems enable row level security;

create table if not exists softrade_cargas (
  archivo    text primary key,
  cargado_en timestamptz default now(),
  parametros text,
  filas int, items int, subitems int
);
alter table softrade_cargas enable row level security;

-- ARCA + lo que haya de Softrade. Vista común (no materializada): se lee
-- siempre filtrada por clave o por período, y así nunca queda vieja.
-- security_invoker: respeta el RLS de las tablas (sin eso, la API pública
-- de Supabase la serviría con los permisos del dueño).
-- Se borra y se recrea (no tiene datos): así sigue andando cuando se le
-- agregan columnas a arca_impo_items.
drop view if exists v_items_enriquecidos;
create view v_items_enriquecidos with (security_invoker = true) as
select a.*,
       s.fecha, s.importador as importador_completo, s.kg_netos, s.kg_brutos,
       s.usd_cif, s.flete_usd, s.seguro_usd, s.derecho_usd, s.ncm_sim, s.via as via_softrade,
       sub.subitems, sub.marcas, sub.codigos_articulo,
       (s.destinacion is not null) as enriquecido
  from arca_impo_items a
  left join softrade_items s on s.destinacion = a.destinacion and s.num_item = a.num_item
  left join lateral (
    select count(*)::int as subitems,
           array_agg(distinct x.marca) filter (where x.marca is not null) as marcas,
           array_agg(distinct x.codigo_articulo) filter (where x.codigo_articulo is not null) as codigos_articulo
      from softrade_subitems x
     where x.destinacion = a.destinacion and x.num_item = a.num_item
  ) sub on s.destinacion is not null;

-- Permisos nuevos: nacen apagados para los roles existentes (lib/permisos.ts).
-- Decisión explícita: se los damos a los roles protegidos (el Admin de cada
-- organización); el resto lo decide cada organización con sus checkboxes.
update roles
   set permisos = permisos || '{"importaciones_ver": true, "importaciones_rubros": true}'::jsonb
 where protegido
   and not (permisos ? 'importaciones_ver');

-- ── Coordinación: lo que esta entrega deja anotado ────────
-- La sesión que la hizo corre en la nube sin acceso a la base; se anota acá,
-- una sola vez (se busca por título), al primer uso tras el deploy. Si el
-- esquema coordinacion no existe (una base de prueba), no hace nada.
do $$
declare
  s text := 'https://claude.ai/code/session_01KZDrNrYYvEps8bs8c5srNx';
begin
  if to_regclass('coordinacion.para_probar') is null or to_regclass('coordinacion.bitacora') is null then
    return;
  end if;

  if not exists (select 1 from coordinacion.bitacora where titulo = 'Importaciones (ARCA + Softrade): base, carga y panel') then
    insert into coordinacion.bitacora (autor, tipo, titulo, detalle, pendientes, ref_doc)
    values ('code', 'entrega', 'Importaciones (ARCA + Softrade): base, carga y panel',
      'Tablas de ARCA, referencias, resúmenes, rubros y Softrade (db/arca.sql, se crean solas). Scripts de carga en scripts/arca/ (se corren desde la PC de Fer). Panel /importaciones: Buscar, Descubrir, Rubros, Cargas, fichas de NCM e importador.',
      '1) Cargar arancel.zip, 202608 y el Excel de ejemplo desde la PC de Fer y correr "verificar"; recién después el resto de los meses. 2) Qué concepto son los derechos de importación (010 o 061): hasta confirmarlo derechos_pct_efectivo queda en null (scripts/arca/parametros.mjs). 3) Tabla completa de países y qué es el transporte vacío.',
      'docs/orden-arca-importaciones.md');
  end if;

  if not exists (select 1 from coordinacion.para_probar where titulo = 'Importaciones: el botón y las pantallas sin datos') then
    insert into coordinacion.para_probar (autor, pedido_por, sesion, titulo, detalle, areas, prioridad)
    values ('code', 'fer', s, 'Importaciones: el botón y las pantallas sin datos',
      'Abrir el Panel: tiene que aparecer "🚢 Importaciones". Entrar: Buscar y Descubrir dicen que todavía no hay meses cargados, con botón a Cargas. Cargas muestra 0 meses, cuántos faltan desde 01/2017, y las referencias (8 países, 3 transportes, 5 conceptos con nombre).',
      '{importaciones,panel}', 'media');
  end if;

  if not exists (select 1 from coordinacion.para_probar where titulo = 'Importaciones: cargar 08/2026, nomenclador y Excel de Softrade') then
    insert into coordinacion.para_probar (autor, pedido_por, sesion, titulo, detalle, areas, prioridad)
    values ('code', 'fer', s, 'Importaciones: cargar 08/2026, nomenclador y Excel de Softrade',
      'Desde la PC, con Claude Code en el repo: seguir scripts/arca/LEEME.md (arancel, 202608, softrade) y correr "node scripts/arca/cargar.mjs verificar". Todo tiene que dar OK: 530.186 ítems, 64.863 despachos, 12.089 importadores, 8516.29.00 China 10 ítems / 7 importadores, 26001IC04154138R/1 con 230 u. y FOB 8.178,75, derechos_pct_efectivo en null, Softrade 158 filas / 93 ítems / 31 importadores, INTELBRAS y SACCARO. Después correr "alicuotas": tiene que decir qué alícuota es derechos.',
      '{importaciones,interno}', 'alta');
  end if;

  if not exists (select 1 from coordinacion.para_probar where titulo = 'Importaciones: buscar, descubrir y armar un rubro') then
    insert into coordinacion.para_probar (autor, pedido_por, sesion, titulo, detalle, areas, prioridad)
    values ('code', 'fer', s, 'Importaciones: buscar, descubrir y armar un rubro',
      'Con 08/2026 cargado: en Buscar poner NCM 8516.29.00 y origen China: 10 ítems, 7 importadores. Probar las cinco vistas y Exportar CSV (abre en Excel con columnas separadas). En Rubros buscar "calentador", tildar, crear el rubro; renombrarlo con el lápiz y borrarlo con el tacho (pregunta Sí/No en el lugar). En la ficha de un importador, agregar sus NCM a un rubro.',
      '{importaciones,panel}', 'media');
  end if;
end $$;
