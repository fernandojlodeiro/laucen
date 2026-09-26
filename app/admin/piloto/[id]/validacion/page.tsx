import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { corrida, productosDe } from "@/lib/piloto/proceso";
import { pesos } from "@/app/radar/Piezas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Validación del filtro de flete: con el precio del candidato elegido por el
// juez (casi FOB) se ve si la línea barco/avión quedó bien puesta. La zona
// gris va remarcada: son los que hay que confirmar o descartar.

export default async function Validacion({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const { id } = await params;
  const c = (await corrida(Number(id), sesion.org.id))!;
  const p = c.parametros;
  const productos = await productosDe(c.id);
  const cuenta = { seguro: 0, gris: 0, fuera: 0, sin: 0 };
  productos.forEach((x) => { cuenta[x.franja ?? "sin"]++; });

  const filas = productos.filter((x) => x.franja !== "fuera").map((x) => {
    const cands = x.china?.candidatos ?? [];
    const el = x.juicio?.elegido != null ? cands[x.juicio.elegido - 1] : null;
    const ventaUsd = x.precio != null ? x.precio / p.dolar : null;
    const fob = el?.usd ?? null;
    const costo = fob != null && x.flete_usd != null ? fob + x.flete_usd : null;
    return {
      x, el, ventaUsd, fob,
      fletePctFob: fob && x.flete_usd != null ? Math.round((x.flete_usd / fob) * 100) : null,
      veces: costo && ventaUsd ? Math.round((ventaUsd / costo) * 10) / 10 : null,
    };
  }).sort((a, b) => (b.veces ?? -1) - (a.veces ?? -1));
  const revisados = productos.filter((x) => x.revision);

  return (
    <div className="grid gap-4">
      <section className="bg-white border border-[#E3E9F0] rounded-lg p-4 text-xs grid gap-1">
        <p className="font-bold text-sm">Resumen</p>
        <p>
          Transporte <b>{p.modo === "avion" ? "aéreo" : "marítimo"}</b>:
          {" "}<b className="text-[#1F6E4A]">{cuenta.seguro} entran seguro</b> ·{" "}
          <b className="text-[#8a6100]">{cuenta.gris} en zona gris</b> ·{" "}
          <span className="text-[#9AA7B3]">{cuenta.fuera} descartados por flete</span>
          {cuenta.sin > 0 && ` · ${cuenta.sin} sin caja estimada (se buscaron igual)`}
        </p>
        <p>El juez: revisaste {revisados.length}, acertó en {revisados.filter((x) => x.revision === "acerto").length}.</p>
        <p className="text-[#5C6B76]">
          “Veces” = precio de venta ÷ (FOB del candidato + flete). Es una cuenta gruesa: no incluye derechos, impuestos, comisión del agente
          ni los costos de vender en Mercado Libre. Sirve para comparar entre productos y para ver si la zona gris se confirma.
        </p>
      </section>

      <div className="bg-white border border-[#E3E9F0] rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[#5C6B76] border-b border-[#E3E9F0]">
            <tr>
              <th className="px-3 py-2">Producto</th><th className="py-2 px-2">Franja</th><th className="py-2 px-2">Venta</th>
              <th className="py-2 px-2">FOB candidato</th><th className="py-2 px-2">Flete</th><th className="py-2 px-2">Flete / FOB</th>
              <th className="py-2 px-2">Veces</th><th className="py-2 px-2">Juez</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ x, el, ventaUsd, fob, fletePctFob, veces }) => (
              <tr key={x.id} className={`border-b last:border-0 border-[#E3E9F0] align-top ${x.franja === "gris" ? "bg-[#FFF7E6]" : ""}`}>
                <td className="px-3 py-2">
                  {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="text-[#16577F] underline">{x.titulo}</a> : x.titulo}
                  {x.campeon && <b className="text-[#8a6100]"> ★</b>}
                </td>
                <td className="py-2 px-2 whitespace-nowrap">{x.franja === "gris" ? <b className="text-[#8a6100]">gris</b> : x.franja ?? "—"}{x.flete_pct != null && ` (${x.flete_pct}%)`}</td>
                <td className="py-2 px-2 whitespace-nowrap">{pesos(x.precio)}{ventaUsd != null && <span className="block text-[#5C6B76]">US$ {ventaUsd.toFixed(0)}</span>}</td>
                <td className="py-2 px-2 whitespace-nowrap">{fob != null ? `US$ ${fob}` : el ? "sin precio" : "—"}</td>
                <td className="py-2 px-2 whitespace-nowrap">{x.flete_usd != null ? `US$ ${x.flete_usd}` : "—"}</td>
                <td className="py-2 px-2 whitespace-nowrap">{fletePctFob != null ? `${fletePctFob}%` : "—"}</td>
                <td className="py-2 px-2 whitespace-nowrap font-bold">{veces ?? "—"}</td>
                <td className="py-2 px-2 whitespace-nowrap">{x.revision === "acerto" ? "acertó" : x.revision === "no_acerto" ? "no acertó" : x.etapa !== "listo" ? `falta ${x.etapa}` : el ? "sin revisar" : "no eligió"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <p className="text-xs text-[#9AA7B3] p-3">Todavía no hay productos buscados en China.</p>}
      </div>
      <p className="text-[11px] text-[#5C6B76]">Detalle de cada uno en <Link href={`/admin/piloto/${c.id}/revision`} className="underline">Revisión</Link>.</p>
    </div>
  );
}
