// Importar productos desde Virtual Seller + Mercado Libre: subir los tres
// archivos y la lista de las corridas anteriores. La lógica está en
// lib/importar/virtualseller.ts.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import SubirVs from "./SubirVs";
import { ESTADOS_VS } from "./estados";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ImportarVs({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("importar_ver");
  const sp = await searchParams;
  const corridas = await consulta<{ id: number; creado_ts: Date; estado: keyof typeof ESTADOS_VS; archivos: { maestro?: string }; skus: number }>(`
    select i.id::int, i.creado_ts, i.estado, i.archivos, (select count(*)::int from importacion_vs_sku s where s.importacion_id = i.id) skus
      from importacion_vs i where i.organizacion_id = $1 order by i.id desc limit 50`, [s.org.id]);
  return (
    <Pantalla titulo="Importar productos desde Virtual Seller" ancho="max-w-5xl"
      camino={[{ texto: "Virtual Seller" }]} subtitulo="Con los datos de las publicaciones de Mercado Libre">
      <Avisos sp={sp} />
      <SubirVs organizacionId={s.org.id} />
      <ul className="text-[11px] text-[#5C6B76] mt-2 mb-5 list-disc pl-4 grid gap-0.5">
        <li>Stock: los SKU de DE (con &quot;DE-&quot; adelante) se suman a los de TV. Va al depósito CORDOBA CENTRAL, cada uno en su ubicación.</li>
        <li>Con stock → activo. Sin stock → inactivo, salvo las notebooks (familia que empieza con NOTEBOOK), que no entran.</li>
        <li>Si está publicado en Mercado Libre: título, fotos, categoría, atributos y medidas de ML; IVA de Virtual Seller; descripción de ML (o de VS si ML no tiene).</li>
        <li>Kits: entran siempre (el stock lo tienen sus componentes) y se arman con su &quot;-U&quot;; la cantidad sale del título (&quot;Pack X5&quot; = 5 × SKU-U). Su costo FOB es la suma de los componentes.</li>
        <li>Antes de grabar nada te muestra el resumen y las diferencias de IVA.</li>
      </ul>

      <h2 className="text-sm font-bold mb-2">Corridas</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={THN}>Fecha</th><th className={TH}>Maestro</th><th className={THN}>SKU</th><th className={TH}>Estado</th></tr></thead>
          <tbody>
            {corridas.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>Todavía no hay ninguna.</td></tr>}
            {corridas.map((c) => {
              const [t, tono] = ESTADOS_VS[c.estado] ?? [c.estado, "gris"];
              return (
                <tr key={c.id} className={TR}>
                  <td className={TDN}>{fechaHora(c.creado_ts)}</td>
                  <td className={TD}><Link href={`/importar/virtualseller/${c.id}`} className="font-semibold text-[#16577F] hover:underline">{c.archivos.maestro ?? `Corrida ${c.id}`}</Link></td>
                  <td className={TDN}>{c.skus.toLocaleString("es-AR")}</td>
                  <td className={TD}><Estado texto={t} tono={tono} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
