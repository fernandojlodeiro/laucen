"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp, una, consulta } from "@/lib/erp/base";
import { intentar } from "@/lib/erp/acciones";
import { lanzarTarea } from "@/lib/tareas-fondo";
import { leerNumero } from "@/lib/numeros";
import { correrCosteo, recalcularCosteo } from "@/lib/marketpro/costeo";

const VOLVER = "/market-pro/importar";

/** Nuevo costeo: guarda la lista y la lee de fondo (la IA tarda unos minutos). */
export async function accionNuevoCosteo(fd: FormData) {
  const s = await entrarErp("market_pro_ver");
  await intentar(VOLVER, async () => {
    const lista = String(fd.get("lista") ?? "").trim();
    if (lista.length < 10) throw new ErrorErp("Pegá la lista de precios.");
    const monto = leerNumero(fd.get("monto"));
    if (monto != null && monto <= 0) throw new ErrorErp("El monto va en dólares, mayor que 0.");
    const dolar = leerNumero(fd.get("dolar"));
    const titulo = String(fd.get("titulo") ?? "").trim() || null;
    const c = await una<{ id: number }>(`insert into mpro_costeo (organizacion_id, titulo, lista, monto_usd, dolar, usuario_id)
                                          values ($1, $2, $3, $4, $5, $6) returning id::int`, [s.org.id, titulo, lista.slice(0, 100_000), monto, dolar, s.usuario.id]);
    const id = c!.id;
    await lanzarTarea(s.org.id, s.usuario.id, `costeo-${id}`, "Costeo de importación", async () => {
      const msj = await correrCosteo(s.org.id, id, { authId: s.usuario.authId ?? "", permisos: s.permisos, superadmin: s.superadmin, usuarioId: s.usuario.id });
      revalidatePath(VOLVER);
      return msj;
    });
    return { ir: `${VOLVER}?id=${id}` };
  });
}

/** Otro monto u otro dólar sobre un costeo ya leído (sin volver a usar la IA). */
export async function accionRecalcular(fd: FormData) {
  const s = await entrarErp("market_pro_ver");
  const id = Number(fd.get("id")) || 0;
  await intentar(`${VOLVER}?id=${id}`, async () => {
    await recalcularCosteo(s.org.id, id, leerNumero(fd.get("monto")), leerNumero(fd.get("dolar")));
    revalidatePath(VOLVER);
    return "Recalculado.";
  });
}

export async function accionBorrarCosteo(id: number) {
  const s = await entrarErp("market_pro_ver");
  await consulta("delete from mpro_costeo where organizacion_id = $1 and id = $2", [s.org.id, id]);
  revalidatePath(VOLVER);
}
