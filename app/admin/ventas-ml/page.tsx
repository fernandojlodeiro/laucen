import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { tokenVigente } from "@/lib/meli";
import { agrupar, ventasPorPublicacion } from "@/lib/ventas-ml";
import { formatearNumero } from "@/lib/numeros";
import { PRIMARIO, SUAVE } from "@/app/botones";
import CampoNumero from "@/app/componentes/CampoNumero";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Ventas ML por categoría", robots: { index: false, follow: false } };

// Ventas de Fer en Mercado Libre por categoría (interno, sólo Fer): primer
// nivel de categorías con ventas en los últimos N días (90 por defecto), con
// monto, publicaciones que vendieron y unidades. Cada categoría abre el nivel
// que sigue; en la última, las publicaciones. Se lee en vivo de ML.

const TH = "py-1 px-2 font-normal";
const TD = "py-1 px-2";
const pesos = (n: number) => `$ ${formatearNumero(Math.round(n), "pesos")}`;

export default async function VentasML({ searchParams }: { searchParams: Promise<{ dias?: string; cat?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  const n = Number(String(sp.dias ?? "").replace(/\./g, ""));
  const dias = Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 730) : 90;
  const cat = sp.cat && /^MLA\d+$/.test(sp.cat) ? sp.cat : null;
  const enlace = (c: string | null) => `/admin/ventas-ml?dias=${dias}${c ? `&cat=${c}` : ""}`;

  let problema = "";
  let datos: Awaited<ReturnType<typeof ventasPorPublicacion>> | null = null;
  try {
    const token = await tokenVigente(sesion.org.id);
    if (!token) problema = "No hay cuenta de Mercado Libre conectada (conectala en Mercado Libre).";
    else datos = await ventasPorPublicacion(token, dias);
  } catch (e) {
    problema = `No se pudieron leer las ventas: ${String(e).replace(/^Error: /, "")}`;
  }
  const { camino, filas, publicaciones } = agrupar(datos?.vendidos ?? [], cat);
  const total = filas.length
    ? filas.reduce((a, f) => ({ monto: a.monto + f.monto, unidades: a.unidades + f.unidades, publicaciones: a.publicaciones + f.publicaciones }), { monto: 0, unidades: 0, publicaciones: 0 })
    : publicaciones.reduce((a, p) => ({ monto: a.monto + p.monto, unidades: a.unidades + p.unidades, publicaciones: a.publicaciones + 1 }), { monto: 0, unidades: 0, publicaciones: 0 });

  return (
    <main className="max-w-4xl mx-auto p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
      <h1 className="text-lg font-bold mb-1">Ventas en Mercado Libre por categoría</h1>
      <p className="text-xs text-[#5C6B76] mb-3">
        Ventas pagadas de tu cuenta en los últimos días que elijas. Tocá una categoría para ver la que sigue; en la última, las publicaciones.
      </p>

      <form className="flex items-center gap-2 mb-4">
        {cat && <input type="hidden" name="cat" value={cat} />}
        <label className="text-sm">Últimos</label>
        <CampoNumero name="dias" valor={dias} tipo="entero" className="border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm w-24" />
        <span className="text-sm">días</span>
        <button className={PRIMARIO}>Ver</button>
      </form>

      <nav className="text-sm mb-3 flex flex-wrap gap-1 items-center">
        <Link href={enlace(null)} className="text-[#16577F] hover:underline">Todas</Link>
        {camino.map((c) => (
          <span key={c.id} className="flex gap-1 items-center">
            <span className="text-[#9AA7B3]">›</span>
            {c.id === cat ? <b>{c.nombre}</b> : <Link href={enlace(c.id)} className="text-[#16577F] hover:underline">{c.nombre}</Link>}
          </span>
        ))}
      </nav>

      {problema && <p className="text-sm text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-4">{problema}</p>}

      {datos && (filas.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#5C6B76]">
              <th className={TH}>Categoría</th><th className={`${TH} text-right`}>Monto</th>
              <th className={`${TH} text-right`}>Publicaciones</th><th className={`${TH} text-right`}>Unidades</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t border-[#E3E9F0]">
                <td className={TD}>
                  <Link href={enlace(f.id)} className="text-[#16577F] hover:underline">{f.nombre}</Link>
                  {!f.tieneHijos && <span className="text-[11px] text-[#9AA7B3] ml-1">(última)</span>}
                </td>
                <td className={`${TD} text-right tabular-nums`}>{pesos(f.monto)}</td>
                <td className={`${TD} text-right tabular-nums`}>{formatearNumero(f.publicaciones, "entero")}</td>
                <td className={`${TD} text-right tabular-nums`}>{formatearNumero(f.unidades, "entero")}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#E3E9F0] font-bold">
              <td className={TD}>Total</td>
              <td className={`${TD} text-right tabular-nums`}>{pesos(total.monto)}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatearNumero(total.publicaciones, "entero")}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatearNumero(total.unidades, "entero")}</td>
            </tr>
          </tbody>
        </table>
      ) : publicaciones.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#5C6B76]">
              <th className={TH}>Publicación</th><th className={`${TH} text-right`}>Monto</th><th className={`${TH} text-right`}>Unidades</th>
            </tr>
          </thead>
          <tbody>
            {publicaciones.map((p) => (
              <tr key={p.itemId} className="border-t border-[#E3E9F0]">
                <td className={TD}>{p.titulo} <span className="text-[11px] text-[#9AA7B3]">{p.itemId}</span></td>
                <td className={`${TD} text-right tabular-nums`}>{pesos(p.monto)}</td>
                <td className={`${TD} text-right tabular-nums`}>{formatearNumero(p.unidades, "entero")}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-[#E3E9F0] font-bold">
              <td className={TD}>Total</td>
              <td className={`${TD} text-right tabular-nums`}>{pesos(total.monto)}</td>
              <td className={`${TD} text-right tabular-nums`}>{formatearNumero(total.unidades, "entero")}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-[#5C6B76]">No hubo ventas en esos días.</p>
      ))}

      {datos && (
        <p className="text-[11px] text-[#9AA7B3] mt-3">
          {formatearNumero(datos.ordenes, "entero")} ventas pagadas en {formatearNumero(dias, "entero")} días. Monto = precio de venta × unidades, antes de comisiones y envío.
          &quot;Publicaciones&quot; = cuántas publicaciones distintas vendieron.
        </p>
      )}
    </main>
  );
}
