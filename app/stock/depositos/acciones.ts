"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp, motivoErp } from "@/lib/erp/base";
import { intentar, texto, entero, id, tildado } from "@/lib/erp/acciones";

const BASE = "/stock/depositos";
const TIPOS = ["propio", "full_ml", "tercerizado", "caja_abierta"];

function volverDe(fd: FormData) {
  const v = texto(fd, "volver");
  return v && (v === BASE || v.startsWith(`${BASE}?`)) ? v : BASE;
}

const tipo = (fd: FormData) => {
  const t = String(fd.get("tipo"));
  return TIPOS.includes(t) ? t : "propio";
};

// ── Depósitos ─────────────────────────────────────────────

export async function accionCrearDeposito(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  await intentar(BASE, async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El depósito necesita un nombre.");
    // La ubicación GENERAL la crea sola la base (trigger deposito_ubicacion_default).
    const [d] = await consulta<{ id: number }>(
      "insert into deposito (organizacion_id, nombre, tipo, usa_ubicaciones, direccion) values ($1, $2, $3, $4, $5) returning id::int",
      [s.org.id, nombre, tipo(fd), tildado(fd, "usa_ubicaciones"), texto(fd, "direccion")]);
    revalidatePath(BASE);
    return { ir: `${BASE}?d=${d.id}&ok=${encodeURIComponent("Depósito creado.")}` };
  });
}

export async function accionGuardarDeposito(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  await intentar(volverDe(fd), async () => {
    const nombre = texto(fd, "nombre");
    if (!nombre) throw new ErrorErp("El depósito necesita un nombre.");
    await consulta(`update deposito set nombre = $3, tipo = $4, usa_ubicaciones = $5, direccion = $6, estado = $7
                     where id = $2 and organizacion_id = $1`,
      [s.org.id, id(fd), nombre, tipo(fd), tildado(fd, "usa_ubicaciones"), texto(fd, "direccion"),
        fd.get("estado") === "archivado" ? "archivado" : "activo"]);
    revalidatePath(BASE);
    return "Guardado.";
  });
}

/** El interruptor "usa ubicaciones" de la fila. */
export async function accionUsaUbicaciones(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  await intentar(volverDe(fd), async () => {
    await consulta("update deposito set usa_ubicaciones = $3 where id = $2 and organizacion_id = $1",
      [s.org.id, id(fd), fd.get("valor") === "1"]);
    revalidatePath(BASE);
    return fd.get("valor") === "1" ? "Ahora usa ubicaciones." : "Ya no usa ubicaciones: todo va a la general.";
  });
}

export async function accionArchivarDeposito(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  await intentar(BASE, async () => {
    await consulta("update deposito set estado = 'archivado' where id = $2 and organizacion_id = $1", [s.org.id, id(fd)]);
    revalidatePath(BASE);
    return "Depósito archivado: ya no cuenta para el stock disponible de los canales.";
  });
}

export async function accionBorrarDeposito(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  const dep = id(fd);
  // Con stock o movimientos no se borra (la base tampoco deja: los movimientos
  // apuntan a sus ubicaciones). Se vuelve con la oferta de archivarlo.
  const ofrecerArchivar = (motivo: string) =>
    ({ ir: `${BASE}?archivar=${dep}&error=${encodeURIComponent(motivo)}` });
  await intentar(BASE, async () => {
    const uso = await una<{ stock: boolean; movs: boolean }>(`
      select exists (select 1 from stock s join ubicacion u on u.id = s.ubicacion_id
                      where u.deposito_id = $2 and s.organizacion_id = $1 and (s.cantidad <> 0 or s.reservado <> 0)) stock,
             exists (select 1 from movimiento_stock m join ubicacion u on u.id in (m.ubicacion_origen_id, m.ubicacion_destino_id)
                      where u.deposito_id = $2 and m.organizacion_id = $1) movs`, [s.org.id, dep]);
    if (uso?.stock) return ofrecerArchivar("El depósito tiene stock: no se puede borrar.");
    if (uso?.movs) return ofrecerArchivar("El depósito tiene movimientos de stock guardados: no se puede borrar.");
    try {
      await consulta("delete from deposito where id = $2 and organizacion_id = $1", [s.org.id, dep]);
    } catch (e) {
      return ofrecerArchivar(motivoErp(e).replace(" Archivalo.", ""));
    }
    revalidatePath(BASE);
    return { ir: `${BASE}?ok=${encodeURIComponent("Depósito borrado.")}` };
  });
}

// ── Ubicaciones ───────────────────────────────────────────

export async function accionCrearUbicacion(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  await intentar(volverDe(fd), async () => {
    const codigo = texto(fd, "codigo");
    if (!codigo) throw new ErrorErp("La ubicación necesita un código (ej. A-03-2).");
    const d = await una<{ id: number; usa_ubicaciones: boolean }>(
      "select id::int, usa_ubicaciones from deposito where id = $2 and organizacion_id = $1", [s.org.id, id(fd, "deposito")]);
    if (!d) throw new ErrorErp("El depósito no existe.");
    if (!d.usa_ubicaciones) throw new ErrorErp("Este depósito no usa ubicaciones: prendé el interruptor primero.");
    await consulta(
      "insert into ubicacion (organizacion_id, deposito_id, codigo, descripcion, orden_recorrido) values ($1, $2, $3, $4, $5)",
      [s.org.id, d.id, codigo.toUpperCase(), texto(fd, "descripcion"), entero(fd, "orden") ?? 0]);
    revalidatePath(BASE);
    return "Ubicación creada.";
  });
}

export async function accionGuardarUbicacion(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  await intentar(volverDe(fd), async () => {
    const codigo = texto(fd, "codigo");
    if (!codigo) throw new ErrorErp("La ubicación necesita un código.");
    // La general (es_default) no se renombra ni se archiva.
    const r = await consulta(`update ubicacion set codigo = $3, descripcion = $4, orden_recorrido = $5, estado = $6
                               where id = $2 and organizacion_id = $1 and not es_default returning id`,
      [s.org.id, id(fd), codigo.toUpperCase(), texto(fd, "descripcion"), entero(fd, "orden") ?? 0,
        fd.get("estado") === "archivada" ? "archivada" : "activa"]);
    if (!r.length) throw new ErrorErp("La ubicación general no se cambia.");
    revalidatePath(BASE);
    return "Guardado.";
  });
}

export async function accionBorrarUbicacion(fd: FormData) {
  const s = await entrarErp("depositos_ver");
  await intentar(volverDe(fd), async () => {
    const u = await una<{ es_default: boolean; con_stock: boolean; movs: boolean }>(`
      select u.es_default,
             exists (select 1 from stock s where s.ubicacion_id = u.id and (s.cantidad <> 0 or s.reservado <> 0)) con_stock,
             exists (select 1 from movimiento_stock m where u.id in (m.ubicacion_origen_id, m.ubicacion_destino_id)) movs
        from ubicacion u where u.id = $2 and u.organizacion_id = $1`, [s.org.id, id(fd)]);
    if (!u) throw new ErrorErp("La ubicación no existe.");
    if (u.es_default) throw new ErrorErp("La ubicación general no se borra.");
    if (u.con_stock) throw new ErrorErp("La ubicación tiene stock: transferilo a otra antes de borrarla, o archivala con el lápiz.");
    if (u.movs) throw new ErrorErp("La ubicación tiene movimientos de stock guardados: no se puede borrar. Archivala con el lápiz.");
    await consulta("delete from ubicacion where id = $2 and organizacion_id = $1 and not es_default", [s.org.id, id(fd)]);
    revalidatePath(BASE);
    return "Ubicación borrada.";
  });
}
