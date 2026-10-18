// De dónde salen los números de los tableros de gastos (lib/mercadopago/gastos.ts):
// la empresa lee sus tablas (mp_export_*, mp_gasto_*), el espacio personal las
// suyas (personal.*). El tablero personal suma, además, los pagos de las cuentas
// de la empresa que el dueño marcó como personales (sólo para el dueño de la
// organización; pedido de Fer, 18/10): se leen, no se copian.

import { consulta } from "@/lib/erp/base";
import { clasificarGastos, type MovGasto, type Marca, type Regla, type Clasificado } from "@/lib/mercadopago/gastos";
import { avisosDelEspacio, asignacionesDelEspacio, titularesDelEspacio, emparejarAvisos, cuentaDestino } from "@/lib/personal/destinatarios";

const MOVS = (mov: string, pago: string, conexion: string, filtro: string) => `
  select m.conexion_id::int, coalesce(c.nombre, c.mp_user_id::text) cuenta, c.mp_user_id::bigint cuenta_mp_id, m.clave, m.movimiento_id, m.tipo_original,
         coalesce(m.fecha_saldo, m.fecha_operacion) fecha, m.importe_neto::float8 importe_neto, m.descripcion, m.medio_pago,
         p.tipo api_tipo, p.descripcion api_descripcion, p.cobrador_id, p.pagador_id, p.tipo_medio
    from ${mov} m join ${conexion} c on c.id = m.conexion_id
    left join ${pago} p on p.conexion_id = m.conexion_id and p.pago_id = m.movimiento_id
   where ${filtro} and m.importe_neto is not null and coalesce(m.fecha_saldo, m.fecha_operacion) >= $2`;

/** Desde cuándo se leen los movimientos: el primer día del mes de hace un año (hora argentina). */
export function desdeAnio(ahora = new Date()) {
  const ar = new Date(ahora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(ar.getUTCFullYear() - 1, ar.getUTCMonth(), 1, 3));
}

export type Sociedad = { cuenta_mp_id: number; cuenta: string; titular: string | null };

/** Las cuentas de la empresa con su titular (según el último inventario). */
export async function sociedadesEmpresa(org: string): Promise<Sociedad[]> {
  return consulta<Sociedad>(`
    select c.mp_user_id::bigint cuenta_mp_id, coalesce(c.nombre, c.mp_user_id::text) cuenta,
           (select s.datos->'usuario'->>'nombre' from mp_export_sonda s where s.conexion_id = c.id order by s.ts desc limit 1) titular
      from mp_conexion c where c.organizacion_id = $1 order by c.id`, [org]);
}

async function empresa(org: string, desde: Date) {
  const [movs, marcas, reglas, propias] = await Promise.all([
    consulta<MovGasto>(MOVS("mp_export_mov", "mp_export_pago", "mp_conexion", "m.organizacion_id = $1"), [org, desde]),
    consulta<Marca>("select conexion_id::int, clave, categoria, ambito_gasto, recurrencia, nota from mp_gasto_marca where organizacion_id = $1", [org]),
    consulta<Regla>("select id::int, campo, valor, categoria, ambito_gasto, recurrencia from mp_gasto_regla where organizacion_id = $1 order by id", [org]),
    consulta<{ id: string }>("select mp_user_id::text id from mp_conexion where organizacion_id = $1", [org]),
  ]);
  return { movs, marcas, reglas, propias: propias.map((x) => x.id) };
}

/** Las organizaciones que creó la persona (es su dueño). */
export async function orgsDelDueno(usuarioId: string) {
  return (await consulta<{ id: string }>("select id from organizaciones where dueno_usuario_id = $1", [usuarioId])).map((x) => x.id);
}

/** Las cuentas personales del espacio y a quién les pagaron (pista para la empresa). Cada salida lleva su cuenta destino
 *  (del mail de la transferencia, lib/personal/destinatarios.ts). */
async function personales(espacioId: number, desde: Date) {
  const [movs, marcas, reglas, propias, avisos, proveedores, titulares] = await Promise.all([
    consulta<MovGasto>(MOVS("personal.mp_mov", "personal.mp_pago", "personal.mp_conexion", "c.espacio_id = $1"), [espacioId, desde]),
    consulta<Marca>("select g.conexion_id::int, g.clave, g.categoria, g.ambito_gasto, g.recurrencia, g.nota from personal.gasto_marca g join personal.mp_conexion c on c.id = g.conexion_id where c.espacio_id = $1", [espacioId]),
    consulta<Regla>("select id::int, campo, valor, categoria, ambito_gasto, recurrencia from personal.gasto_regla where espacio_id = $1 order by id", [espacioId]),
    consulta<{ id: string }>("select mp_user_id::text id from personal.mp_conexion where espacio_id = $1", [espacioId]),
    avisosDelEspacio(espacioId), asignacionesDelEspacio(espacioId), titularesDelEspacio(espacioId),
  ]);
  const pares = emparejarAvisos(movs, avisos);
  for (const m of movs) {
    const a = pares.get(m.clave);
    const yo = String(m.cuenta_mp_id);
    m.destino_cuenta = Number(m.importe_neto) < 0 ? cuentaDestino(a, m.cobrador_id === yo ? m.pagador_id : m.cobrador_id) : null;
    m.destino_nombre = a?.nombre ?? null;
    m.destino_entidad = a?.entidad ?? null;
  }
  return { movs, marcas, reglas, propias: propias.map((x) => x.id), proveedores, titulares };
}

/** A quién se le pagó desde las cuentas personales del espacio (destinatarios), para marcar candidatos en la empresa. */
export async function pagadosDesdePersonal(espacioId: number): Promise<Set<string>> {
  const f = await consulta<{ id: string }>(`
    select distinct p.cobrador_id id from personal.mp_pago p join personal.mp_conexion c on c.id = p.conexion_id
     where c.espacio_id = $1 and p.pagador_id = c.mp_user_id::text and p.cobrador_id is not null`, [espacioId]);
  return new Set(f.map((x) => x.id));
}

/** Los gastos de la empresa, clasificados. Si quien mira es el dueño con espacio personal, también las pistas de gasto personal
 *  por destinatario (sin mostrar nada de lo personal) y las cuentas personales cuentan como propias. */
export async function gastosEmpresa(org: string, o: { espacioPersonal?: number | null; ahora?: Date } = {}): Promise<Clasificado[]> {
  const e = await empresa(org, desdeAnio(o.ahora));
  const propias = new Set(e.propias);
  let pagados: Set<string> | undefined;
  if (o.espacioPersonal) {
    for (const x of await consulta<{ id: string }>("select mp_user_id::text id from personal.mp_conexion where espacio_id = $1", [o.espacioPersonal])) propias.add(x.id);
    pagados = await pagadosDesdePersonal(o.espacioPersonal);
  }
  return clasificarGastos(e.movs, { propias, ambitoCuenta: () => "empresa", marcas: e.marcas, reglas: e.reglas, pagadosDesdePersonal: pagados });
}

/** Los gastos del espacio personal, clasificados, más (si es el dueño) los de la empresa marcados como personales. */
export async function gastosPersonales(espacioId: number, usuarioId: string, esDueno: boolean, ahora?: Date): Promise<Clasificado[]> {
  const desde = desdeAnio(ahora);
  const p = await personales(espacioId, desde);
  const orgs = esDueno ? await orgsDelDueno(usuarioId) : [];
  const emp = await Promise.all(orgs.map((org) => empresa(org, desde)));
  const propias = new Set([...p.propias, ...emp.flatMap((x) => x.propias)]);
  const propios = clasificarGastos(p.movs, { propias, ambitoCuenta: () => "personal", marcas: p.marcas, reglas: p.reglas, proveedores: p.proveedores, titulares: p.titulares });
  const deEmpresa = emp.flatMap((e) => clasificarGastos(e.movs, { propias, ambitoCuenta: () => "empresa", marcas: e.marcas, reglas: e.reglas })
    .filter((x) => x.es_gasto && x.ambito_gasto === "personal"));
  return [...propios, ...deEmpresa];
}

export type MarcaNueva = { conexionId: number; clave: string; categoria: string | null; ambito: string | null; recurrencia: string | null; regla: { campo: "contraparte" | "texto"; valor: string } | null };

/** Marca un movimiento de una cuenta de la empresa (y, si se pidió, guarda la regla). */
export async function marcarEmpresa(org: string, usuarioId: string, m: MarcaNueva) {
  const ok = await consulta("select 1 from mp_conexion where id = $1 and organizacion_id = $2", [m.conexionId, org]);
  if (!ok.length) throw new Error("Esa cuenta no es de la organización.");
  await consulta(`insert into mp_gasto_marca (organizacion_id, conexion_id, clave, categoria, ambito_gasto, recurrencia, usuario_id) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (conexion_id, clave) do update set categoria = excluded.categoria, ambito_gasto = excluded.ambito_gasto, recurrencia = excluded.recurrencia, usuario_id = excluded.usuario_id, actualizado_ts = now()`,
    [org, m.conexionId, m.clave, m.categoria, m.ambito, m.recurrencia, usuarioId]);
  if (m.regla) await consulta(`insert into mp_gasto_regla (organizacion_id, campo, valor, categoria, ambito_gasto, recurrencia, usuario_id) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (organizacion_id, campo, valor) do update set categoria = excluded.categoria, ambito_gasto = excluded.ambito_gasto, recurrencia = excluded.recurrencia`,
    [org, m.regla.campo, m.regla.valor, m.categoria, m.ambito, m.recurrencia, usuarioId]);
}

/** Marca un movimiento de una cuenta del espacio personal (y, si se pidió, guarda la regla). */
export async function marcarPersonal(espacioId: number, usuarioId: string, m: MarcaNueva) {
  const ok = await consulta("select 1 from personal.mp_conexion where id = $1 and espacio_id = $2", [m.conexionId, espacioId]);
  if (!ok.length) throw new Error("Esa cuenta no es de este espacio.");
  await consulta(`insert into personal.gasto_marca (conexion_id, clave, categoria, ambito_gasto, recurrencia, usuario_id) values ($1, $2, $3, $4, $5, $6)
    on conflict (conexion_id, clave) do update set categoria = excluded.categoria, ambito_gasto = excluded.ambito_gasto, recurrencia = excluded.recurrencia, usuario_id = excluded.usuario_id, actualizado_ts = now()`,
    [m.conexionId, m.clave, m.categoria, m.ambito, m.recurrencia, usuarioId]);
  if (m.regla) await consulta(`insert into personal.gasto_regla (espacio_id, campo, valor, categoria, ambito_gasto, recurrencia, usuario_id) values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (espacio_id, campo, valor) do update set categoria = excluded.categoria, ambito_gasto = excluded.ambito_gasto, recurrencia = excluded.recurrencia`,
    [espacioId, m.regla.campo, m.regla.valor, m.categoria, m.ambito, m.recurrencia, usuarioId]);
}

/** Lo que manda el formulario de la fila (RevisarGastos). */
export function leerMarca(fd: FormData, opciones: { id: number; texto: string }[]): MarcaNueva {
  const cat = opciones.find((o) => o.id === Number(fd.get("categoria")))?.texto ?? null;
  const contraparte = String(fd.get("contraparte") ?? "").trim(), texto = String(fd.get("texto") ?? "").trim();
  return {
    conexionId: Number(fd.get("conexion")), clave: String(fd.get("clave") ?? ""), categoria: cat,
    ambito: String(fd.get("ambito") ?? "") || null, recurrencia: String(fd.get("recurrencia") ?? "") || null,
    regla: fd.get("regla") === "1" ? (contraparte ? { campo: "contraparte", valor: contraparte } : texto.length >= 3 ? { campo: "texto", valor: texto } : null) : null,
  };
}
