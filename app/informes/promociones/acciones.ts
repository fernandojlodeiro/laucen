"use server";

// "Leer ahora de Mercado Libre": trae las campañas de cada cuenta (y las publicaciones que están en las que están en
// curso) y las registra, sin esperar a la lectura de cada hora. Con "historial", pide también las ya terminadas y las
// programadas. Sólo lectura: no cambia nada en Mercado Libre.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { cuentasDe, ml } from "@/lib/mercadolibre/api";
import { leerCampanas } from "@/lib/precios-ml/promos";

const BASE = "/informes/promociones";

export async function accionLeerPromociones(fd: FormData) {
  const s = await entrarErp("informes_publicaciones_ver");
  const historico = fd.get("historial") === "1";
  await intentar(`${BASE}?ver=campanas`, async () => {
    const cuentas = (await cuentasDe(s.org.id)).filter((c) => c.canalId != null && c.estado === "activa");
    let campanas = 0, nuevas = 0, items = 0, eventos = 0;
    const errores: string[] = [];
    for (const c of cuentas) {
      const r = await leerCampanas(s.org.id, c.canalId!, c.meliUserId, (ruta) => ml(c, "GET", ruta), Date.now() + 50_000, { historico });
      campanas += r.campanas; nuevas += r.nuevas; items += r.items; eventos += r.eventos;
      for (const e of r.errores.slice(0, 3)) errores.push(`${c.nickname ?? c.id}: ${e}`);
    }
    revalidatePath(BASE);
    const n = (x: number) => x.toLocaleString("es-AR");
    return `Leídas ${n(campanas)} campañas (${n(nuevas)} nuevas), ${n(items)} publicaciones en curso, ${n(eventos)} cambios anotados.` +
      (errores.length ? ` Avisos: ${errores.join(" · ")}.` : "");
  });
}
