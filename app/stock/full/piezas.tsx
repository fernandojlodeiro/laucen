// Lo común de las pantallas de Full: las pestañas Envíos / Stock en Full, con su cuenta.

import Pestanas from "@/app/componentes/Pestanas";
import { una } from "@/lib/erp/base";

export async function PestanasFull({ org, activa }: { org: string; activa: "envios" | "stock" | "costos" }) {
  const c = await una<{ envios: number; stock: number; costos: number }>(`
    select (select count(*) from full_envio where organizacion_id = $1)::int envios,
           (select count(distinct variacion_id) from full_stock where organizacion_id = $1 and variacion_id is not null)::int stock,
           (select count(distinct (canal_id, date_trunc('month', fecha))) from full_cargo where organizacion_id = $1)::int costos`, [org]);
  return (
    <Pestanas items={[
      { href: "/stock/full", texto: "Envíos", cuenta: c?.envios ?? 0, activa: activa === "envios" },
      { href: "/stock/full/stock", texto: "Stock en Full", cuenta: c?.stock ?? 0, activa: activa === "stock" },
      { href: "/stock/full/costos", texto: "Costos de Full", cuenta: c?.costos ?? 0, activa: activa === "costos" },
    ]} />
  );
}

/** Un día guardado como 'YYYY-MM-DD' en "DD/MM/YYYY" (sin pasar por la hora, que lo correría un día). */
export const diaAR = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : "—");
