// Descarga en Excel de lo que la creación automática no pudo crear (lib/mercadolibre/auto-altas.ts),
// de una cuenta (?canal=) o de todas.

import type { NextRequest } from "next/server";
import { entrarErp } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { respuestaExcel, type ColumnaExcel } from "@/lib/informes/excel";
import { PLAN_INFO } from "@/lib/precios-ml/motor";

export const dynamic = "force-dynamic";

type Fila = { cuenta: string; sku: string; producto: string | null; plan: string; motivo: string; intentos: number; primer: string; ultimo: string; proximo: string };

export async function GET(req: NextRequest) {
  const s = await entrarErp("precios_ml_ver");
  const canal = Number(req.nextUrl.searchParams.get("canal")) || null;
  const filas = await consulta<Fila>(`
    select c.nombre cuenta, g.sku, p.titulo producto, g.plan, g.motivo, g.intentos,
           g.primer_ts::text primer, g.ultimo_ts::text ultimo, g.proximo_ts::text proximo
      from ml_alta_colgada g join canal c on c.id = g.canal_id
      left join variacion v on v.organizacion_id = g.organizacion_id and v.sku = g.sku
      left join producto p on p.id = v.producto_id
     where g.organizacion_id = $1 and ($2::bigint is null or g.canal_id = $2)
     order by c.nombre, g.sku, g.plan`, [s.org.id, canal]);
  const fecha = (t: string) => new Date(new Date(t).toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }) + " UTC");
  const columnas: ColumnaExcel<Fila>[] = [
    { titulo: "Cuenta", valor: (r) => r.cuenta, ancho: 18 },
    { titulo: "SKU", valor: (r) => r.sku, ancho: 14, formato: "texto" },
    { titulo: "Producto", valor: (r) => r.producto, ancho: 50 },
    { titulo: "Publicación", valor: (r) => (r.plan === "*" ? "Todas" : PLAN_INFO[r.plan as keyof typeof PLAN_INFO]?.nombre ?? r.plan), ancho: 14 },
    { titulo: "Motivo", valor: (r) => r.motivo, ancho: 90 },
    { titulo: "Intentos", valor: (r) => r.intentos, ancho: 9, formato: "entero" },
    { titulo: "Primera vez", valor: (r) => fecha(r.primer), ancho: 16, formato: "fechahora" },
    { titulo: "Última vez", valor: (r) => fecha(r.ultimo), ancho: 16, formato: "fechahora" },
    { titulo: "Próximo intento", valor: (r) => fecha(r.proximo), ancho: 16, formato: "fechahora" },
  ];
  return respuestaExcel("No se pudieron crear en ML", "No se pudieron crear", columnas, filas);
}
