-- El dólar de cada día, grabado junto a cada importe en pesos (Fer, 5/10).
-- Todo lo que la base guarda en pesos y no tiene su dólar (comprobantes, asientos,
-- envíos, cargos y facturas de ML, pagos, pedidos —lo que no es el total—, reclamos)
-- lleva ahora `tc_dia`: el tipo de cambio oficial venta del día del documento
-- (tc_del_dia), puesto al crearlo y, para lo anterior, completado con el del día
-- que corresponde. Así cualquier importe se puede ver en dólares exactos de su día
-- (importe_ars / tc_dia) sin recalcular con el dólar de hoy, y los totales en dólares
-- se suman en SQL. Si no había dólar cargado ese día, queda vacío (se completa solo
-- cuando se carga). Lo fiscal sigue siendo en pesos: sólo se agrega el dólar del día al lado.

-- El tipo de cambio de un instante (en hora argentina).
create or replace function tc_de_ts(p_org text, p_ts timestamptz) returns numeric language sql stable as
$f$ select case when p_ts is null then null else tc_del_dia(p_org, (p_ts at time zone 'America/Argentina/Buenos_Aires')::date) end $f$;

-- Agrega `tc_dia` a una tabla (si no la tiene), le pone el disparador (se completa al
-- crear la fila y se recalcula si cambia la fecha) y completa las filas que ya había.
-- `p_fecha`: expresión de la fecha del documento sobre la fila nueva (ej. 'new.fecha'),
-- `p_org`: expresión de su organización (por defecto new.organizacion_id).
create or replace function tc_columna(p_tabla text, p_fecha text, p_org text default 'new.organizacion_id') returns void language plpgsql as
$f$
declare fn text := 'tc_dia_' || p_tabla;
begin
  execute format('alter table %I add column if not exists tc_dia numeric(16, 4)', p_tabla);
  execute format($q$create or replace function %I() returns trigger language plpgsql as $b$
    begin
      if new.tc_dia is null or (tg_op = 'UPDATE' and (%s) is distinct from (%s)) then
        new.tc_dia := tc_del_dia(%s, %s);
      end if;
      return new;
    end $b$$q$, fn, replace(p_fecha, 'new.', 'new.'), replace(p_fecha, 'new.', 'old.'), p_org, p_fecha);
  execute format('create or replace trigger tc_dia_defecto before insert or update on %I for each row execute function %I()', p_tabla, fn);
  -- Lo que ya estaba: con el dólar de su día.
  execute format('update %I t set tc_dia = tc_del_dia(%s, %s) where t.tc_dia is null',
    p_tabla, replace(p_org, 'new.', 't.'), replace(p_fecha, 'new.', 't.'));
end $f$;

select tc_columna('comprobante', 'new.fecha');
select tc_columna('asiento', 'new.fecha');
select tc_columna('envio', '(new.creado_ts at time zone ''America/Argentina/Buenos_Aires'')::date');
select tc_columna('ml_cargo', '(new.fecha at time zone ''America/Argentina/Buenos_Aires'')::date');
select tc_columna('ml_factura_documento', 'new.fecha');
select tc_columna('pago', '(new.creado_ts at time zone ''America/Argentina/Buenos_Aires'')::date');
select tc_columna('pedido', '(new.fecha at time zone ''America/Argentina/Buenos_Aires'')::date');
select tc_columna('reclamo', '(new.fecha at time zone ''America/Argentina/Buenos_Aires'')::date');

-- Cuando se carga un dólar que faltaba, lo que quedó sin tipo de cambio se completa solo.
create or replace function tc_dia_completar(p_org text) returns void language plpgsql as
$f$ begin
  update comprobante t set tc_dia = tc_del_dia(t.organizacion_id, t.fecha) where t.organizacion_id = p_org and t.tc_dia is null;
  update asiento t set tc_dia = tc_del_dia(t.organizacion_id, t.fecha) where t.organizacion_id = p_org and t.tc_dia is null;
  update pedido t set tc_dia = tc_de_ts(t.organizacion_id, t.fecha) where t.organizacion_id = p_org and t.tc_dia is null;
  update reclamo t set tc_dia = tc_de_ts(t.organizacion_id, t.fecha) where t.organizacion_id = p_org and t.tc_dia is null;
end $f$;
