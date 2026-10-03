"use server";

// "Traer facturación de ML": lee ya (sólo lectura) los últimos meses de las
// cuentas de Mercado Libre de la organización. Lo mismo corre solo de noche.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, texto } from "@/lib/erp/acciones";
import { traerFacturacionMl } from "@/lib/mercadolibre/facturacion";

const BASE = "/administracion/facturacion-ml";

export async function accionTraerFacturacionMl(fd: FormData) {
  const s = await entrarErp("facturacion_ml_ver");
  const v = texto(fd, "volver");
  await intentar(v && v.startsWith(BASE) ? v : BASE, async () => {
    const informe = await traerFacturacionMl(s.org.id, { hastaMs: Date.now() + 50_000, periodos: 3 });
    const rs = Object.values(informe) as { periodos: number; documentos: number; cargos: number; incompleto: boolean; avisos: string[] }[];
    if (!rs.length) throw new ErrorErp("No hay ninguna cuenta de Mercado Libre conectada con un canal.");
    revalidatePath(BASE);
    const t = rs.reduce((a, r) => ({ periodos: a.periodos + r.periodos, documentos: a.documentos + r.documentos, cargos: a.cargos + r.cargos }), { periodos: 0, documentos: 0, cargos: 0 });
    const avisos = rs.flatMap((r) => r.avisos);
    if (!t.periodos && avisos.length) throw new ErrorErp(`Mercado Libre no dio la facturación (${avisos[0]}).`);
    const incompleto = rs.some((r) => r.incompleto);
    return `Leídos ${t.periodos} períodos: ${t.documentos} facturas y notas de crédito, ${t.cargos} cargos.${incompleto ? " No alcanzó el tiempo para todo: apretá de nuevo para seguir." : ""}`;
  });
}
