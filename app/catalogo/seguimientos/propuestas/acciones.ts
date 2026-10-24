"use server";

// Propuestas pendientes de la regla de precio, todas juntas (Fer, 23/10): aplicar o descartar todas de una vez, de fondo.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { deFondo } from "@/lib/tareas-fondo";
import { aplicarPropuesta, descartarPropuesta } from "@/lib/seguimiento/regla";

async function conPropuestas(org: string): Promise<number[]> {
  return (await consulta<{ id: number }>("select distinct producto_id::int id from seguimiento_ajuste where organizacion_id = $1 and estado = 'propuesto'", [org])).map((x) => x.id);
}

export async function accionAplicarTodas() {
  const s = await entrarErp("productos_ver");
  return deFondo(s, "seguimiento-propuestas", "Aplicar todas las propuestas", async () => {
    let n = 0, productos = 0;
    for (const pid of await conPropuestas(s.org.id)) { n += await aplicarPropuesta(s.org.id, pid, s.usuario.id); productos++; }
    revalidatePath("/catalogo/seguimientos/propuestas");
    return `Aplicadas: ${productos} productos (${n} variaciones). Desde la lista Clásicas, el esquema de precios lo lleva a las cuentas y planes.`;
  });
}

export async function accionDescartarTodas() {
  const s = await entrarErp("productos_ver");
  return deFondo(s, "seguimiento-propuestas", "Descartar todas las propuestas", async () => {
    const ps = await conPropuestas(s.org.id);
    for (const pid of ps) await descartarPropuesta(s.org.id, pid, s.usuario.id);
    revalidatePath("/catalogo/seguimientos/propuestas");
    return `Descartadas las propuestas de ${ps.length} productos: las listas quedan como estaban.`;
  });
}
