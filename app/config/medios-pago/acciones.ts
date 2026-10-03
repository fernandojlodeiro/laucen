"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { intentar, texto, numero, entero, id } from "@/lib/erp/acciones";
import { asegurarCuentasDeCanalesSinFallar } from "@/lib/administracion/contabilidad";
import { TIPOS_MEDIO, CREDENCIALES_REQUERIDAS, type TipoMedio } from "./comun";

const VOLVER = "/config/medios-pago";

async function medioDe(org: string, medioId: number) {
  const m = await una<{ id: number; tipo: TipoMedio }>(
    "select id::int, tipo from medio_pago where id = $1 and organizacion_id = $2", [medioId, org]);
  if (!m) throw new ErrorErp("Ese medio de pago no existe.");
  return m;
}

/** ¿Faltan credenciales para prender este medio? Devuelve el motivo o null. */
async function faltaCredencial(m: { id: number; tipo: TipoMedio }): Promise<string | null> {
  const req = CREDENCIALES_REQUERIDAS[m.tipo];
  if (!req) return null;
  const c = await una<{ datos: Record<string, string> }>("select datos from medio_pago_credencial where medio_pago_id = $1", [m.id]);
  const faltan = req.filter((k) => !c?.datos?.[k]);
  if (!faltan.length) return null;
  return m.tipo === "mercadopago"
    ? "Para prender Mercado Pago cargá primero el access token (abajo, en Credenciales)."
    : "Para prender Payway cargá primero la llave pública y la privada (abajo, en Credenciales).";
}

export async function accionActivarMedio(fd: FormData) {
  const s = await entrarErp("medios_pago_ver");
  await intentar(VOLVER, async () => {
    const m = await medioDe(s.org.id, id(fd));
    const prender = fd.get("valor") === "1";
    if (prender) {
      const falta = await faltaCredencial(m);
      if (falta) throw new ErrorErp(falta);
    }
    await consulta("update medio_pago set activo = $3 where id = $1 and organizacion_id = $2", [m.id, s.org.id, prender]);
    revalidatePath(VOLVER);
    return `${TIPOS_MEDIO[m.tipo].nombre}: ${prender ? "prendido" : "apagado"}.`;
  });
}

export async function accionGuardarMedio(fd: FormData) {
  const s = await entrarErp("medios_pago_ver");
  await intentar(VOLVER, async () => {
    const m = await medioDe(s.org.id, id(fd));
    const nombre = texto(fd, "nombre") ?? TIPOS_MEDIO[m.tipo].nombre;
    const desc = numero(fd, "descuento_pct") ?? 0;
    if (desc < -100 || desc > 100) throw new ErrorErp("El descuento va entre -100 % y 100 % (negativo = recargo).");
    await consulta(`update medio_pago set nombre = $3, descuento_pct = $4, instrucciones = $5, orden = $6 where id = $1 and organizacion_id = $2`,
      [m.id, s.org.id, nombre, desc, texto(fd, "instrucciones"), entero(fd, "orden") ?? 0]);
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}

/** Credenciales: se mezclan con las que había; un campo vacío no cambia nada. */
export async function accionGuardarCredencial(fd: FormData) {
  const s = await entrarErp("medios_pago_ver");
  await intentar(VOLVER, async () => {
    const m = await medioDe(s.org.id, id(fd));
    const claves = m.tipo === "mercadopago" ? ["access_token", "public_key"]
      : m.tipo === "payway" ? ["public_key", "private_key", "site_id", "ambiente"] : [];
    if (!claves.length) throw new ErrorErp("Este medio no usa credenciales.");
    const datos: Record<string, string> = {};
    for (const k of claves) { const v = texto(fd, k); if (v) datos[k] = v.replace(/\s+/g, ""); }
    if (datos.ambiente && !["sandbox", "produccion"].includes(datos.ambiente)) delete datos.ambiente;
    if (!Object.keys(datos).length) return "No había nada nuevo para guardar.";
    await consulta(`insert into medio_pago_credencial (medio_pago_id, organizacion_id, datos) values ($1, $2, $3::jsonb)
                    on conflict (medio_pago_id) do update set datos = medio_pago_credencial.datos || excluded.datos, actualizado_ts = now()`,
      [m.id, s.org.id, JSON.stringify(datos)]);
    // Mercado Pago conectado: su cuenta de fondos "Mercado Pago — Tienda web" (con su cuenta contable) se crea sola.
    if (m.tipo === "mercadopago") await asegurarCuentasDeCanalesSinFallar(s.org.id);
    revalidatePath(VOLVER);
    return "Credenciales guardadas.";
  });
}
