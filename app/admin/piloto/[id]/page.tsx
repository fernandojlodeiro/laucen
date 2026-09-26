import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { corrida, productosDe } from "@/lib/piloto/proceso";
import type { PubML } from "@/lib/piloto/tipos";
import { pesos } from "@/app/radar/Piezas";

export const dynamic = "force-dynamic";
// Cada tanda de "Procesar" corre acá: hasta 5 minutos.
export const maxDuration = 300;

function Tarjeta({ p, extra, marca }: { p: Pick<PubML, "titulo" | "url" | "foto" | "precio" | "vendidosTexto">; extra?: string | null; marca?: string }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0 border-[#E3E9F0]">
      {p.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.foto} alt="" referrerPolicy="no-referrer" className="w-12 h-12 object-cover rounded shrink-0" />
      ) : <span className="w-12 h-12 shrink-0 rounded bg-[#EEF3F8]" />}
      <div className="text-[11px] min-w-0">
        {marca && <span className="font-bold text-[#8a6100] mr-1">{marca}</span>}
        {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-[#16577F] underline">{p.titulo}</a> : p.titulo}
        <span className="block text-[#5C6B76]">{pesos(p.precio)}{p.vendidosTexto && ` · ${p.vendidosTexto}`}{extra && ` · ${extra}`}</span>
      </div>
    </div>
  );
}

export default async function PilotoML({ params }: { params: Promise<{ id: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const { id } = await params;
  const c = (await corrida(Number(id), sesion.org.id))!;
  const productos = await productosDe(c.id);

  return (
    <div className="grid gap-6">
      {c.parametros.categorias.map((cat) => {
        const av = c.avance[cat.id];
        const buscados = productos.filter((x) => x.categoria_id === cat.id && x.lado === "buscado");
        const elegidos = productos.filter((x) => x.categoria_id === cat.id && x.lado === "vendido");
        return (
          <section key={cat.id} className="bg-white border border-[#E3E9F0] rounded-lg p-4">
            <h2 className="text-sm font-bold">{cat.ruta}</h2>
            {!av?.hecho ? (
              <p className="text-xs text-[#9AA7B3] mt-1">Todavía no se procesó.</p>
            ) : (
              <>
                <div className="text-[11px] text-[#5C6B76] mt-1 mb-3 grid gap-0.5">
                  {av.urlListado && <span>Listado: <a href={av.urlListado} target="_blank" rel="noreferrer" className="underline break-all">{av.urlListado}</a></span>}
                  {av.actores?.map((a) => (
                    <span key={a.actor}>
                      <code>{a.actor.replace("~", "/")}</code>: {a.ok ? `${a.cantidad} publicaciones` : `no anduvo (${a.error})`}
                      {a.costoUsd != null && ` · US$ ${a.costoUsd.toFixed(3)}`}
                    </span>
                  ))}
                  {av.palabras && av.palabras.length > 0 && (
                    <span>Palabras más buscadas probadas: {av.palabras.map((w) => `${w.palabra}${w.encontrada ? " ✓" : ` ✗ (${w.motivo})`}`).join(" · ")}</span>
                  )}
                  {av.errores?.map((e) => <span key={e} className="text-[#C03420]">{e}</span>)}
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <h3 className="text-xs font-bold mb-1">Más buscados <span className="font-normal text-[#5C6B76]">(tendencias, gratis)</span></h3>
                    {buscados.length === 0 && <p className="text-[11px] text-[#9AA7B3]">Ninguno dentro del rango de precio.</p>}
                    {buscados.map((x) => (
                      <Tarjeta key={x.id} p={{ ...x, vendidosTexto: x.vendidos_texto }} extra={`“${x.palabra}”`} marca={x.campeon ? "★ campeón" : undefined} />
                    ))}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold mb-1">Más vendidos <span className="font-normal text-[#5C6B76]">(listado, Apify; primeros 10 de {av.listado?.length ?? 0})</span></h3>
                    {!av.listado?.length && <p className="text-[11px] text-[#9AA7B3]">El listado no trajo publicaciones en el rango.</p>}
                    {av.listado?.slice(0, 10).map((x, i) => (
                      <Tarjeta key={`${x.itemId}-${i}`} p={x}
                        marca={i < elegidos.length ? (elegidos[i]?.campeon ? "★ campeón · elegido" : "elegido") : undefined} />
                    ))}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold mb-1">Campeones <span className="font-normal text-[#5C6B76]">(buscado y vendido)</span></h3>
                    {!av.cruce?.length && <p className="text-[11px] text-[#9AA7B3]">Ningún buscado aparece entre los vendidos del listado.</p>}
                    {av.cruce?.map((x, i) => (
                      <p key={i} className="text-[11px] py-1.5 border-b last:border-0 border-[#E3E9F0]">
                        <b>{x.buscado}</b><span className="block text-[#5C6B76]">≈ {x.vendido} ({x.como})</span>
                      </p>
                    ))}
                  </div>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
