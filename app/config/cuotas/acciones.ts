"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { consulta, ErrorErp } from "@/lib/erp/base";
import { intentar, entero, numero } from "@/lib/erp/acciones";

const BASE = "/config/cuotas";

/** A dónde volver (con la búsqueda que había), sin el ?editar. */
const volverDe = (fd: FormData) => {
  const q = String(fd.get("q") ?? "").trim();
  return q ? `${BASE}?q=${encodeURIComponent(q)}` : BASE;
};

/** "f12" → familia 12, "p34" → producto 34. */
function destino(fd: FormData): { tabla: "familia" | "producto"; id: number } {
  const m = String(fd.get("cual") ?? "").match(/^([fp])(\d+)$/);
  if (!m) throw new ErrorErp("No sé a qué familia o producto van los planes.");
  return { tabla: m[1] === "f" ? "familia" : "producto", id: Number(m[2]) };
}

async function guardar(org: string, d: { tabla: "familia" | "producto"; id: number }, planes: unknown[] | null) {
  // La tabla sale de una lista fija (nunca del formulario tal cual).
  const sql = d.tabla === "familia"
    ? "update familia set planes_cuotas = $3::jsonb where id = $1 and organizacion_id = $2 returning id"
    : "update producto set planes_cuotas = $3::jsonb where id = $1 and organizacion_id = $2 returning id";
  const r = await consulta(sql, [d.id, org, planes ? JSON.stringify(planes) : null]);
  if (!r.length) throw new ErrorErp(d.tabla === "familia" ? "La familia no existe." : "El producto no existe.");
}

export async function accionGuardarPlanes(fd: FormData) {
  const s = await entrarErp("reglas_ver");
  await intentar(volverDe(fd), async () => {
    const d = destino(fd);
    const claves = String(fd.get("filas") ?? "").split(",").filter((k) => /^\d+$/.test(k));
    const planes: { cuotas: number; interes_pct: number }[] = [];
    for (const k of claves) {
      const cuotas = entero(fd, `cuotas_${k}`);
      if (cuotas == null) continue;
      if (cuotas < 1 || cuotas > 24) throw new ErrorErp("Las cuotas van de 1 a 24.");
      const interes = numero(fd, `interes_${k}`) ?? 0;
      if (interes < 0 || interes > 300) throw new ErrorErp("El interés va de 0 a 300 % (0 = sin interés).");
      if (planes.some((p) => p.cuotas === cuotas)) throw new ErrorErp(`El plan de ${cuotas} cuotas está repetido.`);
      planes.push({ cuotas, interes_pct: interes });
    }
    planes.sort((a, b) => a.cuotas - b.cuotas);
    await guardar(s.org.id, d, planes.length ? planes : null);
    revalidatePath(BASE);
    return planes.length ? "Planes guardados." : "Sin planes propios: ahora hereda.";
  });
}

export async function accionHeredarPlanes(fd: FormData) {
  const s = await entrarErp("reglas_ver");
  await intentar(volverDe(fd), async () => {
    await guardar(s.org.id, destino(fd), null);
    revalidatePath(BASE);
    return "Sin planes propios: ahora hereda.";
  });
}
