// Etiquetas de Full de Mercado Libre (bitácora #288): elegir la cuenta de
// ML, agregar publicaciones con el buscador (SKU, título o Código ML), cada
// una con cuántas etiquetas, elegir la impresora e "Imprimir" (un PDF con
// todas, en el orden cargado). Ver lib/deposito/etiquetas-full.ts.

import { cookies } from "next/headers";
import { consulta } from "@/lib/erp/base";
import { entrarErp, Pantalla } from "@/app/componentes/erp";
import { COOKIE_IMPRESORA_FULL, esImpresoraFull } from "@/lib/deposito/etiquetas-full-tipos";
import { PestanasEtiquetas } from "../piezas";
import ArmarFull from "./ArmarFull";

export const dynamic = "force-dynamic";

export default async function EtiquetasFull() {
  const s = await entrarErp("etiquetas_ver");
  const canales = await consulta<{ id: number; nombre: string }>(`
    select c.id::int, c.nombre from canal c where c.organizacion_id = $1 and c.tipo = 'mercadolibre'
       and exists (select 1 from meli_item m where m.canal_id = c.id) order by c.id`, [s.org.id]);
  const c = (await cookies()).get(COOKIE_IMPRESORA_FULL)?.value;

  return (
    <Pantalla titulo="Etiquetas" subtitulo="Para pegar en los productos y en las estanterías" ancho="max-w-2xl">
      <PestanasEtiquetas />
      {canales.length ? <ArmarFull canales={canales} impresora={esImpresoraFull(c) ? c : "termica"} />
        : <p className="text-sm text-[#5C6B76]">No hay ninguna cuenta de Mercado Libre con publicaciones traídas a Laucen.</p>}
    </Pantalla>
  );
}
