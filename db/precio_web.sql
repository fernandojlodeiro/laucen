-- Precios de la tienda web ya calculados (Fer, 25/10): el listado, la portada y los catálogos de
-- publicidad leen esta tabla (al instante, con 500 o con 10.000 productos) en vez de calcular el precio de
-- cada producto en cada visita. La ficha, el carrito y el cobro NO la usan: calculan en vivo con
-- precio_de, la función única, así que lo que se cobra es siempre la cuenta del momento.
--
-- La regla que la sostiene: cada fila es exactamente lo que precio_de / bono_web / stock_disponible_canal
-- devuelven en vivo para esa variación y ese canal. No hay otra cuenta.
--
-- Cómo se mantiene al día:
--   - Cada tabla de la que depende un precio tiene un disparador que anota qué recalcular: la variación
--     tocada (precio, stock, publicación, la variación o su producto, un kit) o «todo» cuando cambia algo
--     general (lista de precios, dólar, comisiones o cargos de ML, reglas de tachado, familias, depósitos).
--   - precio_web_procesar lo recalcula cada 10 segundos (pg_cron), de a lotes, uno solo a la vez.
--   - Un precio depende también de la FECHA (un precio cargado para mañana, el dólar del día): a las 00:00
--     (hora de la base) se recalcula todo. No es un parche: es parte de la cuenta.
--   - Control: cada 10 minutos se comparan 300 filas al azar contra la cuenta en vivo, y una vez por día
--     (la primera, apenas se llena la tabla) todas. Una diferencia se corrige en el acto y queda anotada
--     (precio_web_diferencia) para encontrar la causa.
--   - precio_web_dependencias_sin_aviso() recorre las funciones del precio y lista toda tabla que lean sin
--     disparador: el control la corre y la prueba automática no deja pasar una dependencia nueva sin aviso.

create table if not exists precio_web (
  organizacion_id  text not null references organizaciones(id) on delete cascade,
  canal_id         bigint not null references canal(id) on delete cascade,
  lista_id         bigint not null,
  variacion_id     bigint not null references variacion(id) on delete cascade,
  lista_ars        numeric(16, 2),
  lista_usd        numeric(16, 2),
  venta_ars        numeric(16, 2),
  venta_usd        numeric(16, 2),
  descuento_pct    numeric(8, 2),
  bono             numeric(16, 2) not null default 0,
  disp             int not null default 0,
  calculado_ts     timestamptz not null default now(),
  primary key (canal_id, variacion_id)
);
create index if not exists precio_web_variacion on precio_web (variacion_id);
alter table precio_web enable row level security;

-- Lo que falta recalcular. `desde` cambia con cada aviso: el que procesa sólo borra lo que leyó, así un
-- cambio que entra mientras calcula queda en la cola y se vuelve a hacer.
create table if not exists precio_web_pendiente (
  variacion_id     bigint primary key,
  organizacion_id  text not null,
  desde            timestamptz not null default clock_timestamp()
);
alter table precio_web_pendiente enable row level security;
create table if not exists precio_web_todo (
  organizacion_id  text primary key,
  desde            timestamptz not null default clock_timestamp()
);
alter table precio_web_todo enable row level security;

-- Los controles y las diferencias que encontraron (una diferencia es un aviso que faltó: se busca la causa).
create table if not exists precio_web_control (
  id               bigint generated always as identity primary key,
  ts               timestamptz not null default now(),
  tipo             text not null check (tipo in ('muestra', 'completo')),
  revisadas        int not null,
  diferencias      int not null,
  faltantes        int not null default 0,
  sobrantes        int not null default 0,
  sin_aviso        text[]
);
alter table precio_web_control enable row level security;
create table if not exists precio_web_diferencia (
  id               bigint generated always as identity primary key,
  ts               timestamptz not null default now(),
  canal_id         bigint not null,
  variacion_id     bigint not null,
  guardado         jsonb,
  vivo             jsonb
);
alter table precio_web_diferencia enable row level security;

-- ── La cuenta (la misma que en vivo) ──

-- Los canales web de una organización con su lista: lo que se calcula.
create or replace function public.precio_web_canales(p_org text)
returns table (canal_id bigint, lista_id bigint) language sql stable as $$
  select c.id, c.lista_precios_id from canal c
   where c.organizacion_id = p_org and c.tipo = 'web_minorista' and c.lista_precios_id is not null
$$;

-- La fila en vivo de una variación en un canal (null si la variación o su producto no están activos).
create or replace function public.precio_web_vivo(p_org text, p_canal bigint, p_lista bigint, p_variacion bigint)
returns table (lista_ars numeric, lista_usd numeric, venta_ars numeric, venta_usd numeric, descuento_pct numeric, bono numeric, disp int)
language sql stable as $$
  select pr.lista_ars, pr.lista_usd, pr.venta_ars, pr.venta_usd, pr.descuento_pct,
         coalesce(bono_web(p_org, v.id, p_lista, pr.lista_ars), 0), greatest(stock_disponible_canal(p_org, v.id, p_canal), 0)
    from variacion v join producto p on p.id = v.producto_id
    cross join lateral (select * from precio_de(p_org, v.id, p_lista)) pr
   where v.id = p_variacion and v.organizacion_id = p_org and v.estado = 'activa' and p.estado = 'activo'
$$;

-- Recalcula una variación en todos los canales web de su organización (o la saca si ya no corresponde).
create or replace function public.precio_web_actualizar(p_org text, p_variacion bigint)
returns void language plpgsql as $$
declare c record; r record;
begin
  for c in select * from precio_web_canales(p_org) loop
    select * into r from precio_web_vivo(p_org, c.canal_id, c.lista_id, p_variacion);
    if found then
      insert into precio_web (organizacion_id, canal_id, lista_id, variacion_id, lista_ars, lista_usd, venta_ars, venta_usd, descuento_pct, bono, disp, calculado_ts)
      values (p_org, c.canal_id, c.lista_id, p_variacion, r.lista_ars, r.lista_usd, r.venta_ars, r.venta_usd, r.descuento_pct, r.bono, r.disp, now())
      on conflict (canal_id, variacion_id) do update set lista_id = excluded.lista_id, lista_ars = excluded.lista_ars, lista_usd = excluded.lista_usd,
        venta_ars = excluded.venta_ars, venta_usd = excluded.venta_usd, descuento_pct = excluded.descuento_pct, bono = excluded.bono,
        disp = excluded.disp, calculado_ts = now();
    else
      delete from precio_web where canal_id = c.canal_id and variacion_id = p_variacion;
    end if;
  end loop;
  -- Un canal que dejó de ser web (o cambió de organización) no conserva filas.
  delete from precio_web pw where pw.variacion_id = p_variacion and not exists (select 1 from precio_web_canales(p_org) x where x.canal_id = pw.canal_id);
end $$;

-- Procesa la cola: primero los «todo» (encolan cada variación de la organización), después de a lotes.
-- Uno solo a la vez (candado); devuelve cuántas variaciones recalculó.
create or replace function public.precio_web_procesar(p_limite int default 500)
returns int language plpgsql as $$
declare t record; f record; n int := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('precio_web_procesar')) then return 0; end if;
  for t in select organizacion_id, desde from precio_web_todo for update skip locked loop
    insert into precio_web_pendiente (variacion_id, organizacion_id)
    select v.id, v.organizacion_id from variacion v where v.organizacion_id = t.organizacion_id
    on conflict (variacion_id) do update set desde = clock_timestamp();
    -- Las filas de variaciones que ya no existen en la organización (se borraron) se van con el cascade;
    -- las de canales que dejaron de ser web, acá.
    delete from precio_web pw where pw.organizacion_id = t.organizacion_id
       and not exists (select 1 from precio_web_canales(t.organizacion_id) x where x.canal_id = pw.canal_id);
    delete from precio_web_todo where organizacion_id = t.organizacion_id and desde = t.desde;
  end loop;
  for f in select variacion_id, organizacion_id, desde from precio_web_pendiente order by desde limit p_limite for update skip locked loop
    perform precio_web_actualizar(f.organizacion_id, f.variacion_id);
    delete from precio_web_pendiente where variacion_id = f.variacion_id and desde = f.desde;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Los avisos (disparadores) ──

create or replace function public.precio_web_encolar(p_org text, p_variacion bigint)
returns void language sql as $$
  insert into precio_web_pendiente (variacion_id, organizacion_id) select p_variacion, p_org
   where p_variacion is not null and p_org is not null
  on conflict (variacion_id) do update set desde = clock_timestamp()
$$;

-- Una variación y los kits que la usan (hasta 5 niveles, como stock_disponible_deposito).
create or replace function public.precio_web_encolar_con_kits(p_org text, p_variacion bigint)
returns void language sql as $$
  with recursive k as (
    select p_variacion id, 0 nivel
    union select kc.variacion_kit_id, k.nivel + 1 from kit_componente kc join k on kc.variacion_componente_id = k.id where k.nivel < 6)
  insert into precio_web_pendiente (variacion_id, organizacion_id) select distinct id, p_org from k where id is not null and p_org is not null
  on conflict (variacion_id) do update set desde = clock_timestamp()
$$;

-- Todas las variaciones de un producto (la comisión de ML sale de cualquier publicación del producto).
create or replace function public.precio_web_encolar_producto(p_org text, p_producto bigint)
returns void language sql as $$
  insert into precio_web_pendiente (variacion_id, organizacion_id) select v.id, v.organizacion_id from variacion v where v.producto_id = p_producto
  on conflict (variacion_id) do update set desde = clock_timestamp()
$$;

create or replace function public.precio_web_todo_de(p_org text)
returns void language sql as $$
  insert into precio_web_todo (organizacion_id) select p_org where p_org is not null
  on conflict (organizacion_id) do update set desde = clock_timestamp()
$$;

-- Todas las organizaciones con tienda web (para lo que no es de una organización: dólar, costos de ML).
create or replace function public.precio_web_todo_todas()
returns void language sql as $$
  insert into precio_web_todo (organizacion_id) select distinct organizacion_id from canal where tipo = 'web_minorista'
  on conflict (organizacion_id) do update set desde = clock_timestamp()
$$;

-- Un aviso nunca frena el cambio que lo dispara: si algo falla, se marca «todo» de esa organización
-- (o de todas) y queda en el registro del servidor.
create or replace function public.tg_precio_web_variacion() returns trigger language plpgsql as $$
begin
  begin
    if tg_table_name = 'precio' then
      if tg_op <> 'INSERT' then perform precio_web_encolar(old.organizacion_id, old.variacion_id); end if;
      if tg_op <> 'DELETE' then perform precio_web_encolar(new.organizacion_id, new.variacion_id); end if;
    elsif tg_table_name = 'variacion' then
      if tg_op <> 'INSERT' then perform precio_web_encolar_con_kits(old.organizacion_id, old.id); end if;
      if tg_op <> 'DELETE' then perform precio_web_encolar_con_kits(new.organizacion_id, new.id); end if;
    elsif tg_table_name = 'stock' then
      if tg_op <> 'INSERT' then perform precio_web_encolar_con_kits(old.organizacion_id, old.variacion_id); end if;
      if tg_op <> 'DELETE' then perform precio_web_encolar_con_kits(new.organizacion_id, new.variacion_id); end if;
    elsif tg_table_name = 'kit_componente' then
      if tg_op <> 'INSERT' then perform precio_web_encolar_con_kits(old.organizacion_id, old.variacion_kit_id); end if;
      if tg_op <> 'DELETE' then perform precio_web_encolar_con_kits(new.organizacion_id, new.variacion_kit_id); end if;
    elsif tg_table_name = 'producto' then
      if tg_op <> 'INSERT' then perform precio_web_encolar_producto(old.organizacion_id, old.id); end if;
      if tg_op <> 'DELETE' then perform precio_web_encolar_producto(new.organizacion_id, new.id); end if;
    elsif tg_table_name = 'publicacion' then
      if tg_op <> 'INSERT' then perform precio_web_encolar_producto(old.organizacion_id, (select producto_id from variacion where id = old.variacion_id)); end if;
      if tg_op <> 'DELETE' then perform precio_web_encolar_producto(new.organizacion_id, (select producto_id from variacion where id = new.variacion_id)); end if;
    end if;
  exception when others then
    raise warning 'precio_web (%): %', tg_table_name, sqlerrm;
    perform precio_web_todo_todas();
  end;
  return null;
end $$;

create or replace function public.tg_precio_web_todo() returns trigger language plpgsql as $$
begin
  begin
    perform precio_web_todo_todas();
  exception when others then
    raise warning 'precio_web todo (%): %', tg_table_name, sqlerrm;
  end;
  return null;
end $$;

do $$
declare t text;
begin
  -- Por variación (fila por fila).
  create or replace trigger precio_web_aviso after insert or update or delete on precio for each row execute function tg_precio_web_variacion();
  create or replace trigger precio_web_aviso after insert or update or delete on variacion for each row execute function tg_precio_web_variacion();
  create or replace trigger precio_web_aviso after insert or update or delete on producto for each row execute function tg_precio_web_variacion();
  create or replace trigger precio_web_aviso after insert or update or delete on stock for each row execute function tg_precio_web_variacion();
  create or replace trigger precio_web_aviso after insert or update or delete on kit_componente for each row execute function tg_precio_web_variacion();
  -- La publicación se toca muchísimo (cada lectura de ML): sólo cuando cambia lo que usa la comisión.
  create or replace trigger precio_web_aviso after insert or delete on publicacion for each row execute function tg_precio_web_variacion();
  create or replace trigger precio_web_aviso_upd after update on publicacion for each row
    when (old.variacion_id is distinct from new.variacion_id or old.categoria_externa is distinct from new.categoria_externa
          or old.tipo_publicacion is distinct from new.tipo_publicacion or old.estado is distinct from new.estado
          or old.id_externo is distinct from new.id_externo)
    execute function tg_precio_web_variacion();
  -- El canal se toca seguido (llaves, configuración): sólo cuando cambia su lista, su tipo o su estado.
  create or replace trigger precio_web_aviso after insert or delete on canal for each statement execute function tg_precio_web_todo();
  create or replace trigger precio_web_aviso_upd after update on canal for each row
    when (old.lista_precios_id is distinct from new.lista_precios_id or old.tipo is distinct from new.tipo
          or old.estado is distinct from new.estado or old.organizacion_id is distinct from new.organizacion_id)
    execute function tg_precio_web_todo();
  -- Lo general: cualquier cambio recalcula todo (una vez por sentencia, no por fila).
  foreach t in array array['lista_precios', 'tipo_cambio', 'ml_costos_comisiones', 'ml_costos_cargo_fijo', 'ml_regla_precio',
                           'familia', 'canal_deposito', 'deposito', 'ubicacion'] loop
    if to_regclass('public.' || t) is not null then
      execute format('create or replace trigger precio_web_aviso after insert or update or delete or truncate on public.%I for each statement execute function tg_precio_web_todo()', t);
    end if;
  end loop;
end $$;

-- ── El control ──

-- Las tablas que leen las funciones del precio (recorriéndolas desde precio_de, bono_web y
-- stock_disponible_canal, y lo que hay detrás de cada vista) que NO tienen el disparador del aviso.
create or replace function public.precio_web_dependencias_sin_aviso()
returns text[] language sql stable as $$
  with recursive
  funcs as (select p.proname::text nombre, p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.prolang in (select oid from pg_language where lanname in ('sql', 'plpgsql'))),
  alcanzadas(nombre, prosrc, nivel) as (
    select nombre, prosrc, 0 from funcs where nombre in ('precio_de', 'bono_web', 'stock_disponible_canal')
    union
    select f.nombre, f.prosrc, a.nivel + 1 from alcanzadas a join funcs f on a.prosrc ~ ('\m' || f.nombre || '\s*\(') where a.nivel < 10),
  leidas as (
    select distinct c.oid, c.relkind from (select distinct prosrc from alcanzadas) a
      join pg_class c on a.prosrc ~ ('\m' || c.relname || '\M') join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v') and c.relname not like 'precio_web%'),
  base as (
    select oid from leidas where relkind = 'r'
    union select d.refobjid from leidas l join pg_rewrite r on r.ev_class = l.oid join pg_depend d on d.objid = r.oid
     join pg_class t on t.oid = d.refobjid and t.relkind = 'r' where l.relkind = 'v' and d.refobjid <> l.oid)
  select coalesce(array_agg(c.relname::text order by c.relname), '{}') from base b join pg_class c on c.oid = b.oid
   where not exists (select 1 from pg_trigger tg where tg.tgrelid = b.oid and tg.tgname like 'precio_web_aviso%')
$$;

-- Compara lo guardado con la cuenta en vivo (p_muestra filas al azar; null = todas), corrige lo distinto y
-- lo anota. Deja afuera lo que está en la cola (todavía no le tocó). Devuelve la cantidad de diferencias.
create or replace function public.precio_web_controlar(p_muestra int default 300)
returns int language plpgsql as $$
declare r record; vivo jsonb; guardado jsonb; dif int := 0; rev int := 0; falt int := 0; sobr int := 0; sin text[];
begin
  if not pg_try_advisory_xact_lock(hashtext('precio_web_controlar')) then return 0; end if;
  for r in
    select pw.* from precio_web pw
     where not exists (select 1 from precio_web_pendiente q where q.variacion_id = pw.variacion_id)
       and not exists (select 1 from precio_web_todo t where t.organizacion_id = pw.organizacion_id)
     order by case when p_muestra is null then 0 else random() end
     limit coalesce(p_muestra, 2147483647)
  loop
    rev := rev + 1;
    select to_jsonb(x) into vivo from precio_web_vivo(r.organizacion_id, r.canal_id, r.lista_id, r.variacion_id) x;
    guardado := jsonb_build_object('lista_ars', r.lista_ars, 'lista_usd', r.lista_usd, 'venta_ars', r.venta_ars, 'venta_usd', r.venta_usd,
                                   'descuento_pct', r.descuento_pct, 'bono', r.bono, 'disp', r.disp);
    -- Se comparan los números como números (12.50 y 12.5 son lo mismo).
    if vivo is null or exists (select 1 from jsonb_each(guardado) g where (g.value #>> '{}')::numeric is distinct from (vivo ->> g.key)::numeric) then
      dif := dif + 1;
      insert into precio_web_diferencia (canal_id, variacion_id, guardado, vivo) values (r.canal_id, r.variacion_id, guardado, vivo);
      perform precio_web_actualizar(r.organizacion_id, r.variacion_id);
    end if;
  end loop;
  -- En el control completo, también lo que falta (variación activa sin fila) y lo que sobra.
  if p_muestra is null then
    for r in
      select v.organizacion_id, v.id from variacion v join producto p on p.id = v.producto_id
        join canal c on c.organizacion_id = v.organizacion_id and c.tipo = 'web_minorista' and c.lista_precios_id is not null
       where v.estado = 'activa' and p.estado = 'activo'
         and not exists (select 1 from precio_web pw where pw.canal_id = c.id and pw.variacion_id = v.id)
         and not exists (select 1 from precio_web_pendiente q where q.variacion_id = v.id)
         and not exists (select 1 from precio_web_todo t where t.organizacion_id = v.organizacion_id)
         and exists (select 1 from precio_de(v.organizacion_id, v.id, c.lista_precios_id))
    loop
      falt := falt + 1;
      insert into precio_web_diferencia (canal_id, variacion_id, guardado, vivo) values (0, r.id, null, jsonb_build_object('falta', true));
      perform precio_web_actualizar(r.organizacion_id, r.id);
    end loop;
  end if;
  sin := precio_web_dependencias_sin_aviso();
  -- Una tabla del precio sin aviso (se volvió a crear, se sumó una dependencia nueva): mientras no se
  -- arregle, cada control recalcula todo, así nada queda con un precio viejo más de 10 minutos.
  if sin <> '{}' then perform precio_web_todo_todas(); end if;
  insert into precio_web_control (tipo, revisadas, diferencias, faltantes, sobrantes, sin_aviso)
  values (case when p_muestra is null then 'completo' else 'muestra' end, rev, dif, falt, sobr, nullif(sin, '{}'));
  return dif + falt;
end $$;

-- El control de cada 10 minutos: completo si no hubo uno completo en el último día (el primero corre
-- apenas se crea la tabla, después una vez por día); si no, 300 filas al azar.
create or replace function public.precio_web_controlar_auto()
returns int language plpgsql as $$
begin
  -- Mientras se está llenando por primera vez (o recalculando todo) no se controla: faltan filas a propósito.
  if exists (select 1 from precio_web_todo) or (select count(*) from precio_web_pendiente) > 50 then return 0; end if;
  if not exists (select 1 from precio_web_control where tipo = 'completo' and ts > now() - interval '1 day') then
    return precio_web_controlar(null);
  end if;
  return precio_web_controlar(300);
end $$;

-- La primera vez (tabla vacía) se llena entera.
insert into precio_web_todo (organizacion_id)
select distinct organizacion_id from canal where tipo = 'web_minorista' and not exists (select 1 from precio_web)
on conflict (organizacion_id) do nothing;

-- ── pg_cron: procesar cada 10 s, controlar cada 10 min y recalcular todo a las 00:00 (por la fecha) ──
do $$
declare
  trabajos text[][] := array[
    ['precio-web-procesar', '10 seconds', 'select public.precio_web_procesar(500)'],
    ['precio-web-control', '*/10 * * * *', 'select public.precio_web_controlar_auto()'],
    ['precio-web-dia', '0 0 * * *', 'select public.precio_web_todo_todas()']];
  i int; j record;
begin
  if to_regclass('cron.job') is null then return; end if;
  for i in 1..array_length(trabajos, 1) loop
    select jobid, schedule, command into j from cron.job where jobname = trabajos[i][1];
    if not found then perform cron.schedule(trabajos[i][1], trabajos[i][2], trabajos[i][3]);
    elsif j.schedule is distinct from trabajos[i][2] or j.command is distinct from trabajos[i][3] then
      perform cron.alter_job(j.jobid, schedule := trabajos[i][2], command := trabajos[i][3]);
    end if;
  end loop;
exception when others then
  raise notice 'pg_cron: no se pudieron ajustar los trabajos de precio_web (%)', sqlerrm;
end $$;
