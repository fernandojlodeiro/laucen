"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, entero, id } from "@/lib/erp/acciones";
import { TIPOS_ENVIO, PROVINCIAS, esTipoEnvio } from "./comun";

const VOLVER = "/config/envios";

/** Lee y valida los campos del método (los mismos al crear y al guardar). */
function leer(fd: FormData) {
  const tipo = fd.get("tipo");
  if (!esTipoEnvio(tipo)) throw new ErrorErp("Elegí el tipo de envío.");
  if (!TIPOS_ENVIO[tipo].disponible) throw new ErrorErp("Ese tipo de envío todavía no está disponible.");
  const nombre = texto(fd, "nombre");
  if (!nombre) throw new ErrorErp("Poné el nombre que ve el comprador (ej. Envío a domicilio).");
  const costo = numero(fd, "costo_ars") ?? 0;
  const gratis = numero(fd, "gratis_desde_ars");
  if (costo < 0 || (gratis != null && gratis < 0)) throw new ErrorErp("Los importes no pueden ser negativos.");
  return { tipo, nombre, costo, gratis, plazo: texto(fd, "plazo"), instrucciones: texto(fd, "instrucciones"), orden: entero(fd, "orden") ?? 0 };
}

/** Las tarifas por provincia del formulario (las vacías no van). */
function tarifas(fd: FormData): Record<string, number> | null {
  if (!fd.has("tarifas_editadas")) return null;
  const t: Record<string, number> = {};
  PROVINCIAS.forEach((p, i) => { const n = numero(fd, `tarifa_${i}`); if (n != null && n >= 0) t[p] = n; });
  const resto = numero(fd, "tarifa_resto");
  if (resto != null && resto >= 0) t["*"] = resto;
  return t;
}

export async function accionCrearEnvio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    const d = leer(fd);
    const r = await una<{ id: number }>(`
      insert into metodo_envio (organizacion_id, canal_id, tipo, nombre, activo, costo_ars, gratis_desde_ars, plazo, instrucciones, orden)
      values ($1, null, $2, $3, false, $4, $5, $6, $7, $8) returning id::int`,
      [s.org.id, d.tipo, d.nombre, d.costo, d.gratis, d.plazo, d.instrucciones, d.orden]);
    revalidatePath(VOLVER);
    // Uno por provincia se crea y se abre para cargar las tarifas.
    if (d.tipo === "por_provincia") return { ir: `${VOLVER}?editar=${r!.id}&ok=${encodeURIComponent("Creado (apagado). Cargá las tarifas por provincia.")}` };
    return "Creado (apagado). Prendelo cuando esté listo.";
  });
}

export async function accionGuardarEnvio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    const d = leer(fd);
    const t = tarifas(fd);
    const r = await consulta(`
      update metodo_envio set tipo = $3, nombre = $4, costo_ars = $5, gratis_desde_ars = $6, plazo = $7, instrucciones = $8, orden = $9,
             tarifas = coalesce($10::jsonb, tarifas)
       where id = $1 and organizacion_id = $2 returning id`,
      [id(fd), s.org.id, d.tipo, d.nombre, d.costo, d.gratis, d.plazo, d.instrucciones, d.orden, t ? JSON.stringify(t) : null]);
    if (!r.length) throw new ErrorErp("Ese método de envío no existe.");
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}

export async function accionActivarEnvio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    const m = await una<{ tipo: string }>(
      "select tipo from metodo_envio where id = $1 and organizacion_id = $2", [id(fd), s.org.id]);
    if (!m) throw new ErrorErp("Ese método de envío no existe.");
    const prender = fd.get("valor") === "1";
    if (prender && esTipoEnvio(m.tipo) && !TIPOS_ENVIO[m.tipo].disponible) throw new ErrorErp("Ese tipo de envío todavía no está disponible.");
    await consulta("update metodo_envio set activo = $3 where id = $1 and organizacion_id = $2", [id(fd), s.org.id, prender]);
    revalidatePath(VOLVER);
    return prender ? "Prendido: ya se ofrece en la tienda." : "Apagado.";
  });
}

export async function accionBorrarEnvio(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    await consulta("delete from metodo_envio where id = $1 and organizacion_id = $2", [id(fd), s.org.id]);
    revalidatePath(VOLVER);
    return "Borrado.";
  });
}
