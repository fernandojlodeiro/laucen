"use server";

// "Traer facturación de ML": lee ya (sólo lectura) los últimos meses de las
// cuentas de Mercado Libre de la organización: de la cuenta elegida en el
// filtro "Cuenta", o de todas si está en "Todas las cuentas". Lo mismo corre
// solo de noche (de todas).

import { deFondo } from "@/lib/tareas-fondo";
import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, texto } from "@/lib/erp/acciones";
import { traerFacturacionMl, cuentasMl, canalElegido } from "@/lib/mercadolibre/facturacion";

const BASE = "/administracion/facturacion-ml";

export async function accionTraerFacturacionMl(fd: FormData) {
  const s = await entrarErp("facturacion_ml_ver");
  const v = texto(fd, "volver");
  return deFondo(s, `facturacion-ml:${texto(fd, "canal") ?? "todas"}`, "Facturación de Mercado Libre", async () => {
    const cuentas = await cuentasMl(s.org.id);
    const canal = canalElegido(texto(fd, "canal"), cuentas);
    const informe = await traerFacturacionMl(s.org.id, { hastaMs: Date.now() + 50_000, periodos: 3, canalId: canal });
    const rs = Object.values(informe) as { periodos: number; documentos: number; cargos: number; incompleto: boolean; avisos: string[] }[];
    const nombre = cuentas.find((c) => c.id === canal)?.nombre;
    if (!rs.length) throw new ErrorErp(canal ? `La cuenta «${nombre}» no está conectada a Mercado Libre o la conexión no está activa: revisala en Canales.` : "No hay ninguna cuenta de Mercado Libre conectada con un canal.");
    revalidatePath(BASE);
    const t = rs.reduce((a, r) => ({ periodos: a.periodos + r.periodos, documentos: a.documentos + r.documentos, cargos: a.cargos + r.cargos }), { periodos: 0, documentos: 0, cargos: 0 });
    const avisos = rs.flatMap((r) => r.avisos);
    if (!t.periodos && avisos.length) throw new ErrorErp(`Mercado Libre no dio la facturación (${avisos[0]}).`);
    const incompleto = rs.some((r) => r.incompleto);
    const de = canal ? ` de ${nombre}` : rs.length > 1 ? ` de ${rs.length} cuentas` : "";
    return `Leídos${de} ${t.periodos} períodos: ${t.documentos} facturas y notas de crédito, ${t.cargos} cargos.${incompleto ? " No alcanzó el tiempo para todo: apretá de nuevo para seguir." : ""}`;
  });
}
