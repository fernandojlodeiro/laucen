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
     -- El IVA deducido sale apenas corrido (21,5 en vez de 21; 11 en vez de
     -- 10,5): la base real tiene algo más que CIF + derechos + estadística.
     -- Se lleva a la tasa legal más cercana si está a ≤ 1,5 puntos.
     t0 as (select ncm, tipo, items,
                   case when tipo = 'iva' then
                     case when abs(pct - 21) <= 1.5 then 21 when abs(pct - 10.5) <= 1.5 then 10.5
                          when abs(pct - 27) <= 1.5 then 27 else pct end
                   else pct end::numeric(6, 1) as pct
              from agg_tasas_mes where periodo in (select periodo from ult)),
     t as (select ncm, tipo, pct, sum(items)::int items from t0 group by 1, 2, 3),
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

-- ── Depuración: posiciones que Fer no va a estudiar ────────
-- Prefijos de NCM (capítulo = 2 dígitos, partida = 4) que se sacan de la
-- base. `propuesta` = lo que propuso Code (26/09); `excluir` = lo que decide
-- Fer en /importaciones/depurar. Lo excluido no se carga más (cargar.mjs) y,
-- al aplicar, se borra de ítems y resúmenes. Los archivos de cada mes siguen
-- en la PC de Fer: se puede recargar si cambia de idea.
create table if not exists arca_depuracion (
  prefijo        text collate "C" primary key,   -- '27', '8708' (sólo dígitos)
  excluir        boolean not null,
  propuesta      boolean not null,
  motivo         text,
  actualizado_ts timestamptz not null default now()
);
alter table arca_depuracion enable row level security;
alter table arca_depuracion add column if not exists aplicado_ts timestamptz;   -- última vez que se borró de la base
insert into arca_depuracion (prefijo, excluir, propuesta, motivo) values
  ('01', true, true, 'Capítulo 01: animales vivos — alimentos/bebidas: no es rubro de importación desde China'),
  ('02', true, true, 'Capítulo 02: carnes — alimentos/bebidas: no es rubro de importación desde China'),
  ('03', true, true, 'Capítulo 03: pescados — alimentos/bebidas: no es rubro de importación desde China'),
  ('04', true, true, 'Capítulo 04: lácteos, huevos, miel — alimentos/bebidas: no es rubro de importación desde China'),
  ('05', true, true, 'Capítulo 05: productos de origen animal — alimentos/bebidas: no es rubro de importación desde China'),
  ('06', true, true, 'Capítulo 06: plantas y flores — alimentos/bebidas: no es rubro de importación desde China'),
  ('07', true, true, 'Capítulo 07: hortalizas — alimentos/bebidas: no es rubro de importación desde China'),
  ('08', true, true, 'Capítulo 08: frutas — alimentos/bebidas: no es rubro de importación desde China'),
  ('09', true, true, 'Capítulo 09: café, té, especias — alimentos/bebidas: no es rubro de importación desde China'),
  ('10', true, true, 'Capítulo 10: cereales — alimentos/bebidas: no es rubro de importación desde China'),
  ('11', true, true, 'Capítulo 11: harinas — alimentos/bebidas: no es rubro de importación desde China'),
  ('12', true, true, 'Capítulo 12: semillas y oleaginosas — alimentos/bebidas: no es rubro de importación desde China'),
  ('13', true, true, 'Capítulo 13: gomas y resinas — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('14', true, true, 'Capítulo 14: materias vegetales — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('15', true, true, 'Capítulo 15: grasas y aceites — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('16', true, true, 'Capítulo 16: preparaciones de carne — alimentos/bebidas: no es rubro de importación desde China'),
  ('17', true, true, 'Capítulo 17: azúcares — alimentos/bebidas: no es rubro de importación desde China'),
  ('18', true, true, 'Capítulo 18: cacao — alimentos/bebidas: no es rubro de importación desde China'),
  ('19', true, true, 'Capítulo 19: preparaciones de cereales — alimentos/bebidas: no es rubro de importación desde China'),
  ('20', true, true, 'Capítulo 20: conservas vegetales — alimentos/bebidas: no es rubro de importación desde China'),
  ('21', true, true, 'Capítulo 21: preparaciones alimenticias — alimentos/bebidas: no es rubro de importación desde China'),
  ('22', true, true, 'Capítulo 22: bebidas — alimentos/bebidas: no es rubro de importación desde China'),
  ('23', true, true, 'Capítulo 23: residuos de la industria alimentaria — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('24', true, true, 'Capítulo 24: tabaco — alimentos/bebidas: no es rubro de importación desde China'),
  ('25', true, true, 'Capítulo 25: sal, piedras, cemento — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('26', true, true, 'Capítulo 26: minerales metalíferos — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('27', true, true, 'Capítulo 27: combustibles — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('28', true, true, 'Capítulo 28: químicos inorgánicos — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('29', true, true, 'Capítulo 29: químicos orgánicos — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('30', true, true, 'Capítulo 30: farmacéuticos — regulado (ANMAT)'),
  ('31', true, true, 'Capítulo 31: abonos — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('32', true, true, 'Capítulo 32: curtientes, pinturas, tintas — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('35', true, true, 'Capítulo 35: almidones, colas, enzimas — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('36', true, true, 'Capítulo 36: explosivos, fósforos — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('37', true, true, 'Capítulo 37: fotografía — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('38', true, true, 'Capítulo 38: productos químicos diversos — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('41', true, true, 'Capítulo 41: cueros en bruto — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('47', true, true, 'Capítulo 47: pasta de papel — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('50', true, true, 'Capítulo 50: seda — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('51', true, true, 'Capítulo 51: lana — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('52', true, true, 'Capítulo 52: algodón (fibra e hilados) — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('53', true, true, 'Capítulo 53: otras fibras vegetales — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('54', true, true, 'Capítulo 54: filamentos sintéticos — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('55', true, true, 'Capítulo 55: fibras sintéticas — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('56', true, true, 'Capítulo 56: guata, fieltro, cordeles — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('58', true, true, 'Capítulo 58: tejidos especiales — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('59', true, true, 'Capítulo 59: telas técnicas — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('60', true, true, 'Capítulo 60: tejidos de punto — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('72', true, true, 'Capítulo 72: hierro y acero (en bruto) — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('75', true, true, 'Capítulo 75: níquel — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('78', true, true, 'Capítulo 78: plomo — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('79', true, true, 'Capítulo 79: cinc — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('80', true, true, 'Capítulo 80: estaño — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('81', true, true, 'Capítulo 81: otros metales comunes — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('86', true, true, 'Capítulo 86: ferrocarriles — industrial'),
  ('88', true, true, 'Capítulo 88: aeronaves — industrial'),
  ('89', true, true, 'Capítulo 89: barcos — industrial'),
  ('93', true, true, 'Capítulo 93: armas — regulado'),
  ('97', true, true, 'Capítulo 97: arte y antigüedades — materia prima, insumo o rubro fuera de lo que se trae de China para reventa'),
  ('3901', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3902', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3903', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3904', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3905', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3906', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3907', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3908', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3909', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3910', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3911', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3912', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3913', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3914', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3915', true, true, 'Plástico en formas primarias / desperdicios (materia prima)'),
  ('3917', true, true, 'Tubos y mangueras de plástico (insumo de obra/industria)'),
  ('3919', true, true, 'Placas y cintas autoadhesivas en rollo (insumo)'),
  ('3920', true, true, 'Placas y láminas de plástico (insumo)'),
  ('3921', true, true, 'Placas y láminas de plástico (insumo)'),
  ('4001', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4002', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4003', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4004', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4005', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4006', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4007', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4008', true, true, 'Caucho en bruto o semielaborado (materia prima)'),
  ('4009', true, true, 'Tubos y mangueras de caucho (industrial/automotor)'),
  ('4010', true, true, 'Correas transportadoras y de transmisión (industrial)'),
  ('4011', true, true, 'Neumáticos nuevos (automotor)'),
  ('4012', true, true, 'Neumáticos recauchutados/usados (automotor)'),
  ('4013', true, true, 'Cámaras de neumáticos (automotor)'),
  ('4016', true, true, 'Manufacturas de caucho: juntas, retenes, piezas técnicas (mayormente industrial/automotor)'),
  ('4401', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4402', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4403', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4404', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4405', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4406', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4407', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4408', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4409', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4410', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4411', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4412', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4413', true, true, 'Madera en bruto, aserrada o tableros (materia prima)'),
  ('4801', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4802', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4803', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4804', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4805', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4806', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4807', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4808', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4809', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4810', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4811', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4812', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('4813', true, true, 'Papel y cartón en bobinas u hojas (insumo)'),
  ('6901', true, true, 'Cerámica refractaria o de construcción'),
  ('6902', true, true, 'Cerámica refractaria o de construcción'),
  ('6903', true, true, 'Cerámica refractaria o de construcción'),
  ('6904', true, true, 'Cerámica refractaria o de construcción'),
  ('6905', true, true, 'Cerámica refractaria o de construcción'),
  ('6906', true, true, 'Cerámica refractaria o de construcción'),
  ('6907', true, true, 'Cerámica refractaria o de construcción'),
  ('6908', true, true, 'Cerámica refractaria o de construcción'),
  ('6909', true, true, 'Cerámica refractaria o de construcción'),
  ('7001', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7002', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7003', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7004', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7005', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7006', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7007', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7008', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7011', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7014', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7015', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7016', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7017', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7019', true, true, 'Vidrio en bruto, placas o técnico (insumo)'),
  ('7101', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7102', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7103', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7104', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7105', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7106', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7107', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7108', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7109', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7110', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7111', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7112', true, true, 'Piedras y metales preciosos en bruto o semielaborados'),
  ('7301', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7302', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7303', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7304', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7305', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7306', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7307', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7308', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7309', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7310', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7311', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7312', true, true, 'Estructuras, tubos, depósitos y cables de acero (industria/construcción)'),
  ('7313', true, true, 'Alambre de púas (agro)'),
  ('7314', true, true, 'Telas y redes metálicas (construcción)'),
  ('7315', true, true, 'Cadenas industriales'),
  ('7316', true, true, 'Anclas'),
  ('7318', true, true, 'Tornillos, tuercas, arandelas (ferretería industrial)'),
  ('7320', true, true, 'Muelles/resortes (industrial/automotor)'),
  ('7401', true, true, 'Cobre en bruto o semielaborado'),
  ('7402', true, true, 'Cobre en bruto o semielaborado'),
  ('7403', true, true, 'Cobre en bruto o semielaborado'),
  ('7404', true, true, 'Cobre en bruto o semielaborado'),
  ('7405', true, true, 'Cobre en bruto o semielaborado'),
  ('7406', true, true, 'Cobre en bruto o semielaborado'),
  ('7407', true, true, 'Cobre en bruto o semielaborado'),
  ('7408', true, true, 'Cobre en bruto o semielaborado'),
  ('7409', true, true, 'Cobre en bruto o semielaborado'),
  ('7410', true, true, 'Cobre en bruto o semielaborado'),
  ('7411', true, true, 'Cobre en bruto o semielaborado'),
  ('7412', true, true, 'Cobre en bruto o semielaborado'),
  ('7413', true, true, 'Cobre en bruto o semielaborado'),
  ('7414', true, true, 'Cobre en bruto o semielaborado'),
  ('7415', true, true, 'Cobre en bruto o semielaborado'),
  ('7416', true, true, 'Cobre en bruto o semielaborado'),
  ('7417', true, true, 'Cobre en bruto o semielaborado'),
  ('7419', true, true, 'Manufacturas de cobre técnicas'),
  ('7601', true, true, 'Aluminio en bruto o semielaborado'),
  ('7602', true, true, 'Aluminio en bruto o semielaborado'),
  ('7603', true, true, 'Aluminio en bruto o semielaborado'),
  ('7604', true, true, 'Aluminio en bruto o semielaborado'),
  ('7605', true, true, 'Aluminio en bruto o semielaborado'),
  ('7606', true, true, 'Aluminio en bruto o semielaborado'),
  ('7607', true, true, 'Aluminio en bruto o semielaborado'),
  ('7608', true, true, 'Aluminio en bruto o semielaborado'),
  ('7609', true, true, 'Aluminio en bruto o semielaborado'),
  ('7610', true, true, 'Aluminio en bruto o semielaborado'),
  ('7611', true, true, 'Aluminio en bruto o semielaborado'),
  ('7612', true, true, 'Aluminio en bruto o semielaborado'),
  ('7613', true, true, 'Aluminio en bruto o semielaborado'),
  ('7614', true, true, 'Aluminio en bruto o semielaborado'),
  ('8401', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8402', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8403', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8404', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8405', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8406', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8407', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8408', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8409', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8410', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8411', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8412', true, true, 'Reactores, calderas, turbinas y motores (industrial/automotor)'),
  ('8413', true, true, 'Bombas para líquidos (industrial/automotor)'),
  ('8416', true, true, 'Quemadores industriales'),
  ('8417', true, true, 'Hornos industriales'),
  ('8420', true, true, 'Calandrias y laminadores'),
  ('8425', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8426', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8427', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8428', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8429', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8430', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8431', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8432', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8433', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8434', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8435', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8436', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8437', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8438', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8439', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8440', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8441', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8442', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8444', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8445', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8446', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8447', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8448', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8449', true, true, 'Maquinaria de elevación, construcción, agrícola o industrial'),
  ('8451', true, true, 'Máquinas industriales de lavado y acabado textil'),
  ('8453', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8454', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8455', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8456', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8457', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8458', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8459', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8460', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8461', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8462', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8463', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8464', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8465', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8466', true, true, 'Maquinaria industrial y máquinas herramienta'),
  ('8468', true, true, 'Máquinas de soldar a gas'),
  ('8474', true, true, 'Maquinaria para minerales'),
  ('8475', true, true, 'Maquinaria para vidrio'),
  ('8477', true, true, 'Maquinaria para plástico y caucho'),
  ('8478', true, true, 'Maquinaria para tabaco'),
  ('8480', true, true, 'Moldes industriales'),
  ('8481', true, true, 'Válvulas y grifería (mayormente industrial)'),
  ('8482', true, true, 'Rodamientos'),
  ('8483', true, true, 'Transmisiones, engranajes, cajas (industrial/automotor)'),
  ('8484', true, true, 'Juntas metaloplásticas'),
  ('8486', true, true, 'Maquinaria para semiconductores'),
  ('8487', true, true, 'Partes de máquinas sin función eléctrica'),
  ('8501', true, true, 'Motores y generadores eléctricos (industrial)'),
  ('8502', true, true, 'Grupos electrógenos (industrial)'),
  ('8503', true, true, 'Partes de motores y generadores'),
  ('8511', true, true, 'Encendido de motores (automotor)'),
  ('8512', true, true, 'Luces y señalización de vehículos (automotor)'),
  ('8514', true, true, 'Hornos eléctricos industriales'),
  ('8515', true, true, 'Máquinas de soldar'),
  ('8530', true, true, 'Señalización ferroviaria y vial'),
  ('8532', true, true, 'Condensadores (componentes)'),
  ('8533', true, true, 'Resistencias (componentes)'),
  ('8534', true, true, 'Circuitos impresos (componentes)'),
  ('8535', true, true, 'Aparatos de alta tensión'),
  ('8536', true, true, 'Interruptores, fusibles, conectores (componentes eléctricos)'),
  ('8537', true, true, 'Tableros de control'),
  ('8538', true, true, 'Partes de tableros'),
  ('8540', true, true, 'Válvulas y tubos electrónicos'),
  ('8541', true, true, 'Semiconductores, diodos, paneles solares (componentes)'),
  ('8542', true, true, 'Circuitos integrados (componentes)'),
  ('8544', true, true, 'Cables y conductores eléctricos (insumo)'),
  ('8545', true, true, 'Electrodos de carbono'),
  ('8546', true, true, 'Aisladores'),
  ('8547', true, true, 'Piezas aislantes'),
  ('8548', true, true, 'Desperdicios eléctricos'),
  ('8549', true, true, 'Desperdicios electrónicos'),
  ('8701', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8702', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8703', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8704', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8705', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8706', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8707', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8708', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8709', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8710', true, true, 'Tractores, autos, camiones y sus partes (automotor)'),
  ('8716', true, true, 'Remolques y semirremolques'),
  ('9001', true, true, 'Fibras ópticas y lentes sin montar (componentes)'),
  ('9002', true, true, 'Lentes montadas (componentes)'),
  ('9010', true, true, 'Laboratorio fotográfico'),
  ('9011', true, true, 'Microscopios'),
  ('9012', true, true, 'Microscopios electrónicos'),
  ('9014', true, true, 'Instrumentos de navegación'),
  ('9015', true, true, 'Instrumentos de topografía'),
  ('9016', true, true, 'Balanzas de precisión'),
  ('9017', true, true, 'Instrumentos de dibujo y medida (técnico)'),
  ('9018', true, true, 'Instrumental médico y odontológico (regulado)'),
  ('9020', true, true, 'Máscaras y aparatos respiratorios'),
  ('9022', true, true, 'Rayos X'),
  ('9023', true, true, 'Modelos para enseñanza'),
  ('9024', true, true, 'Ensayo de materiales'),
  ('9026', true, true, 'Instrumentos de medición y control (industrial)'),
  ('9027', true, true, 'Instrumentos de medición y control (industrial)'),
  ('9028', true, true, 'Instrumentos de medición y control (industrial)'),
  ('9029', true, true, 'Instrumentos de medición y control (industrial)'),
  ('9030', true, true, 'Instrumentos de medición y control (industrial)'),
  ('9031', true, true, 'Instrumentos de medición y control (industrial)'),
  ('9032', true, true, 'Instrumentos de medición y control (industrial)'),
  ('9033', true, true, 'Instrumentos de medición y control (industrial)')
on conflict do nothing;

-- Peso de cada partida (4 dígitos) en ítems, para mostrar cuánto se ahorra.
-- Se refresca al final de cada carga (cargar.mjs) y al aplicar la depuración.
create materialized view if not exists arca_peso_partida as
select left(ncm, 4) as partida, sum(items)::bigint as items from agg_ncm_pais_mes group by 1;

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
