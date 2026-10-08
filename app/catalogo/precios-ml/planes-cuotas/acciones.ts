"use server";

// Precios en ML › Planes de cuotas: grabar los planes de un grupo. Nada sale
// a Mercado Libre desde acá: si una cuenta tiene «Sincronizar precios»
// prendido, los cambios de precio van solos a la cola; si no, se preparan en
// la vista previa de Precios en ML y salen con el clic de «Mandar».

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, numero, entero, tildado } from "@/lib/erp/acciones";
import { guardarGrupo, PUBLICACIONES_GANA, type ValoresGrupo, type Gana } from "@/lib/precios-ml/grupos";
import { sincronizarPreciosMl } from "@/lib/precios-ml/preparar";
import { PLANES, type PlanOClasica } from "@/lib/precios-ml/motor";
import { limpiarCachePrevia, PLANES_PML } from "@/app/catalogo/precios-ml/lista";

const BASE = PLANES_PML;

export async function accionGuardarGrupo(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  const grupo = id(fd, "grupo");
  const canal = id(fd, "canal") || null;
  await intentar(canal ? `${BASE}?canal=${canal}` : BASE, async () => {
    const planes = Object.fromEntries(PLANES.map((p) => [p, { usar: tildado(fd, `${p}_usar`), cuotasVisibles: entero(fd, `${p}_cuotas`), margenPct: numero(fd, `${p}_margen`) }]));
    // Quién gana cada publicación: una cuenta o «rota» (Fer, 8/10).
    const gana = Object.fromEntries(PUBLICACIONES_GANA.map((p) => { const x = fd.get(`${p}_gana`); return [p, Number(x) > 0 ? Number(x) : "rota"]; })) as Record<PlanOClasica, Gana>;
    const v = { ...planes, gana, ajusteNoGana: numero(fd, "no_gana") } as unknown as ValoresGrupo;
    await guardarGrupo(s.org.id, grupo, v);
    limpiarCachePrevia();
    revalidatePath(BASE);
    // Las cuentas con «Sincronizar precios» prendido mandan solas lo que cambió.
    const { encoladas } = await sincronizarPreciosMl(s.org.id);
    return `Grabado.${encoladas ? ` ${encoladas} cambio${encoladas === 1 ? "" : "s"} de precio a la cola de Mercado Libre (cuentas con «Sincronizar precios» prendido).` : " Revisá los precios que cambian en la vista previa de Precios en ML."}`;
  });
}
