"use server";

// Configuración › Planes de cuotas: grabar los planes de un grupo. Nada sale
// a Mercado Libre desde acá: si una cuenta tiene «Sincronizar precios»
// prendido, los cambios de precio van solos a la cola; si no, se preparan en
// la vista previa de Precios en ML y salen con el clic de «Mandar».

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar, id, numero, entero, tildado } from "@/lib/erp/acciones";
import { guardarGrupo, type ValoresGrupo } from "@/lib/precios-ml/grupos";
import { sincronizarPreciosMl } from "@/lib/precios-ml/preparar";
import { PLANES } from "@/lib/precios-ml/motor";
import { limpiarCachePrevia } from "@/app/catalogo/precios-ml/lista";

const BASE = "/config/planes-cuotas";

export async function accionGuardarGrupo(fd: FormData) {
  const s = await entrarErp("precios_ml_ver");
  const grupo = id(fd, "grupo");
  await intentar(BASE, async () => {
    const v = Object.fromEntries(PLANES.map((p) => [p, { usar: tildado(fd, `${p}_usar`), cuotasVisibles: entero(fd, `${p}_cuotas`), margenPct: numero(fd, `${p}_margen`) }])) as ValoresGrupo;
    await guardarGrupo(s.org.id, grupo, v);
    limpiarCachePrevia();
    revalidatePath(BASE);
    // Las cuentas con «Sincronizar precios» prendido mandan solas lo que cambió.
    const { encoladas } = await sincronizarPreciosMl(s.org.id);
    return `Grabado.${encoladas ? ` ${encoladas} cambio${encoladas === 1 ? "" : "s"} de precio a la cola de Mercado Libre (cuentas con «Sincronizar precios» prendido).` : " Revisá los precios que cambian en la vista previa de Precios en ML."}`;
  });
}
