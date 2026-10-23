// Las declaraciones juradas del contador (tabla ddjj): grabar (leída por la IA o cargada a mano), corregir y borrar.
// La última declaración de IIBB de una razón social deja sus provincias (coeficiente y alícuota) en iibb_jurisdiccion,
// y la última municipal, la alícuota y el mínimo: así la posición del mes en curso usa lo vigente.

import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { datosDe, type DatosDdjj, type DatosIibb, type DatosMunicipal, type Impuesto } from "@/lib/impuestos/ddjj-leer";
import { asegurarCuentasIibb } from "@/lib/impuestos/cuentas";

export async function grabarDdjj(org: string, d: {
  emisorId: number; impuesto: Impuesto; periodo: string; rectificativa: number; fecha: string | null; datos: DatosDdjj;
  lectura?: unknown; archivo?: string | null; archivoNombre?: string | null; usuarioId: string;
}): Promise<{ id: number; reemplazo: boolean }> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(d.periodo)) throw new ErrorErp("El período va como mes y año.");
  const e = await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and id = $2", [org, d.emisorId]);
  if (!e) throw new ErrorErp("La razón social no existe.");
  const ya = await una<{ id: number }>("select id::int from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = $3 and periodo = $4 and rectificativa = $5",
    [org, d.emisorId, d.impuesto, d.periodo, d.rectificativa]);
  const r = await una<{ id: number }>(`
    insert into ddjj (organizacion_id, emisor_id, impuesto, periodo, rectificativa, fecha_presentacion, datos, lectura, archivo, archivo_nombre, usuario_id)
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
    on conflict (emisor_id, impuesto, periodo, rectificativa) do update set
      fecha_presentacion = excluded.fecha_presentacion, datos = excluded.datos, lectura = coalesce(excluded.lectura, ddjj.lectura),
      archivo = coalesce(excluded.archivo, ddjj.archivo), archivo_nombre = coalesce(excluded.archivo_nombre, ddjj.archivo_nombre),
      usuario_id = excluded.usuario_id, actualizado_ts = now()
    returning id::int`,
    [org, d.emisorId, d.impuesto, d.periodo, d.rectificativa, d.fecha, JSON.stringify(d.datos), d.lectura == null ? null : JSON.stringify(d.lectura),
      d.archivo ?? null, d.archivoNombre ?? null, d.usuarioId]);
  await aplicarVigente(org, d.emisorId, d.impuesto);
  return { id: r!.id, reemplazo: !!ya };
}

/** Corrige los importes de una declaración (el lápiz de su ficha). */
export async function corregirDdjj(org: string, id: number, datos: DatosDdjj, extra: { fecha: string | null; notas: string | null }) {
  const r = await una<{ emisor_id: number; impuesto: Impuesto }>(`update ddjj set datos = $3::jsonb, fecha_presentacion = $4, notas = $5, actualizado_ts = now()
    where organizacion_id = $1 and id = $2 returning emisor_id::int, impuesto`, [org, id, JSON.stringify(datos), extra.fecha, extra.notas]);
  if (!r) throw new ErrorErp("La declaración no existe.");
  await aplicarVigente(org, r.emisor_id, r.impuesto);
}

export async function borrarDdjj(org: string, id: number) {
  // Si vino del Drive, se olvida que se leyó: la próxima búsqueda la vuelve a leer.
  await consulta("delete from drive_archivo_leido where organizacion_id = $1 and ddjj_id = $2", [org, id]);
  const r = await una<{ emisor_id: number; impuesto: Impuesto }>("delete from ddjj where organizacion_id = $1 and id = $2 returning emisor_id::int, impuesto", [org, id]);
  if (!r) throw new ErrorErp("La declaración no existe.");
  await aplicarVigente(org, r.emisor_id, r.impuesto);
}

/** Lo vigente sale de la última declaración (período más nuevo, rectificativa más alta). */
async function aplicarVigente(org: string, emisorId: number, impuesto: Impuesto) {
  if (impuesto === "iva") return;
  const u = await una<{ datos: unknown }>(`select datos from ddjj where organizacion_id = $1 and emisor_id = $2 and impuesto = $3
    order by periodo desc, rectificativa desc, id desc limit 1`, [org, emisorId, impuesto]);
  if (!u) return;
  if (impuesto === "iibb") {
    // Sólo si la declaración trae los coeficientes (un resumen del SIFERE trae sólo los saldos): si no, quedan los que estaban.
    const d = datosDe("iibb", u.datos) as DatosIibb;
    if (!d.jurisdicciones.some((j) => j.coeficiente > 0)) return;
    for (const j of d.jurisdicciones) {
      await consulta(`insert into iibb_jurisdiccion (organizacion_id, emisor_id, codigo, coeficiente, alicuota) values ($1, $2, $3, $4, $5)
        on conflict (emisor_id, codigo) do update set coeficiente = excluded.coeficiente, alicuota = excluded.alicuota, actualizado_ts = now()`,
        [org, emisorId, j.codigo, j.coeficiente, j.alicuota]);
    }
    await consulta("delete from iibb_jurisdiccion where organizacion_id = $1 and emisor_id = $2 and not (codigo = any($3::int[]))",
      [org, emisorId, d.jurisdicciones.map((j) => j.codigo)]);
    await asegurarCuentasIibb(org);
  } else {
    const d = datosDe("municipal", u.datos) as DatosMunicipal;
    await consulta(`update emisor set municipal_inscripta = true, municipal_alicuota = coalesce(nullif($3::numeric, 0), municipal_alicuota),
      municipal_minimo = coalesce(nullif($4::numeric, 0), municipal_minimo) where organizacion_id = $1 and id = $2`, [org, emisorId, d.alicuota, d.minimo]);
  }
}

/** Una provincia a mano (la pestaña Provincias): alta o corrección del coeficiente y la alícuota. */
export async function grabarJurisdiccion(org: string, emisorId: number, codigo: number, coeficiente: number, alicuota: number) {
  if (!(codigo >= 901 && codigo <= 924)) throw new ErrorErp("Elegí la provincia.");
  if (!(coeficiente >= 0 && coeficiente <= 1)) throw new ErrorErp("El coeficiente va entre 0 y 1 (ej. 0,8512).");
  if (!(alicuota >= 0 && alicuota < 100)) throw new ErrorErp("La alícuota va en porcentaje (ej. 4,75).");
  await consulta(`insert into iibb_jurisdiccion (organizacion_id, emisor_id, codigo, coeficiente, alicuota) values ($1, $2, $3, $4, $5)
    on conflict (emisor_id, codigo) do update set coeficiente = excluded.coeficiente, alicuota = excluded.alicuota, actualizado_ts = now()`,
    [org, emisorId, codigo, coeficiente, alicuota]);
  await asegurarCuentasIibb(org);
}

export async function borrarJurisdiccion(org: string, emisorId: number, codigo: number) {
  await consulta("delete from iibb_jurisdiccion where organizacion_id = $1 and emisor_id = $2 and codigo = $3", [org, emisorId, codigo]);
}

export async function grabarMunicipal(org: string, emisorId: number, d: { inscripta: boolean; alicuota: number | null; minimo: number | null }) {
  await consulta("update emisor set municipal_inscripta = $3, municipal_alicuota = $4, municipal_minimo = $5 where organizacion_id = $1 and id = $2",
    [org, emisorId, d.inscripta, d.alicuota, d.minimo]);
}
