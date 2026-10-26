"use server";

// Ventas › Publicidad en Mercado Libre: leer ahora (de fondo, sólo lectura), grabar la configuración y las excepciones
// al tope por producto o familia.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, numero, texto, id } from "@/lib/erp/acciones";
import { consulta, una, ErrorErp } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";
import { leerPublicidad } from "@/lib/publicidad/lectura";
import { guardarYAvisar } from "@/lib/publicidad/avisos";
import { CAMPOS_NUM, configPublicidad, guardarConfigPublicidad, type ConfigPublicidad } from "@/lib/publicidad/config";
import { BASE_PUBLICIDAD } from "./lista";

export async function accionLeerPublicidad() {
  const s = await entrarErp("publicidad_ver");
  return deFondo(s, "publicidad", "Publicidad de Mercado Libre", async () => {
    const l = await leerPublicidad(s.org.id, Date.now() + 270_000);
    const v = await guardarYAvisar(s.org.id);
    revalidatePath(BASE_PUBLICIDAD);
    const con = l.cuentas.filter((c) => c.anunciante);
    const errores = l.cuentas.filter((c) => c.error).map((c) => `${c.cuenta}: ${c.error}`);
    return `Leídas ${con.length} cuentas con publicidad (${con.reduce((a, c) => a + c.campanas, 0)} campañas, ${con.reduce((a, c) => a + c.anuncios, 0)} anuncios). ` +
      `${v.productos} productos con gasto, ${v.cortar} para CORTAR.` + (errores.length ? ` Avisos: ${errores.join(" · ")}` : "");
  });
}

export async function accionGuardarConfigPublicidad(fd: FormData) {
  const s = await entrarErp("publicidad_ver");
  const volver = `${BASE_PUBLICIDAD}?ver=config`;
  await intentar(volver, async () => {
    const c: ConfigPublicidad = { ...(await configPublicidad(s.org.id)) };
    for (const k of CAMPOS_NUM) {
      const v = numero(fd, k.clave);
      if (v == null) throw new ErrorErp(`Falta «${k.rotulo}».`);
      (c as Record<string, unknown>)[k.clave] = v;
    }
    c.ventas = texto(fd, "ventas") === "totales" ? "totales" : "directas";
    const canal = texto(fd, "avisoCanal");
    c.avisoCanal = canal === "windows" || canal === "panel" ? canal : "ambos";
    await guardarConfigPublicidad(s.org.id, c);
    await guardarYAvisar(s.org.id).catch(() => null);
    revalidatePath(BASE_PUBLICIDAD);
    return "Grabado.";
  });
}

const VOLVER_TOPES = `${BASE_PUBLICIDAD}?ver=topes`;

export async function accionCrearTope(fd: FormData) {
  const s = await entrarErp("publicidad_ver");
  await intentar(VOLVER_TOPES, async () => {
    const pct = numero(fd, "pct_max");
    if (pct == null || pct < 0 || pct > 100) throw new ErrorErp("El tope va de 0 % a 100 % del precio.");
    const sku = texto(fd, "sku");
    const familia = id(fd, "familia_id");
    if (!sku && !familia) throw new ErrorErp("Elegí un producto (por su SKU) o una familia.");
    let productoId: number | null = null;
    if (sku) {
      const p = await una<{ id: string }>(`select pr.id from producto pr where pr.organizacion_id = $1 and (upper(pr.sku_base) = upper($2)
                                           or exists (select 1 from variacion v where v.producto_id = pr.id and upper(v.sku) = upper($2))) limit 1`, [s.org.id, sku]);
      if (!p) throw new ErrorErp(`No hay ningún producto con el SKU «${sku}».`);
      productoId = Number(p.id);
    }
    const ya = await una(`select 1 from pub_tope where organizacion_id = $1 and (producto_id = $2 or familia_id = $3)`, [s.org.id, productoId, productoId ? null : familia]);
    if (ya) throw new ErrorErp("Ya hay una excepción para ese producto o familia: cambiala con el lápiz.");
    await consulta("insert into pub_tope (organizacion_id, producto_id, familia_id, pct_max, nota) values ($1, $2, $3, $4, $5)",
      [s.org.id, productoId, productoId ? null : familia, pct, texto(fd, "nota")]);
    revalidatePath(BASE_PUBLICIDAD);
    return "Excepción creada.";
  });
}

export async function accionGuardarTope(fd: FormData) {
  const s = await entrarErp("publicidad_ver");
  await intentar(VOLVER_TOPES, async () => {
    const pct = numero(fd, "pct_max");
    if (pct == null || pct < 0 || pct > 100) throw new ErrorErp("El tope va de 0 % a 100 % del precio.");
    await consulta("update pub_tope set pct_max = $3, nota = $4 where organizacion_id = $1 and id = $2", [s.org.id, id(fd), pct, texto(fd, "nota")]);
    revalidatePath(BASE_PUBLICIDAD);
    return "Grabado.";
  });
}

export async function accionBorrarTope(fd: FormData) {
  const s = await entrarErp("publicidad_ver");
  await intentar(VOLVER_TOPES, async () => {
    await consulta("delete from pub_tope where organizacion_id = $1 and id = $2", [s.org.id, id(fd)]);
    revalidatePath(BASE_PUBLICIDAD);
    return "Borrada.";
  });
}
