import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { sesionRequerida } from "@/lib/tenancy";
import { corrida, productosDe } from "@/lib/piloto/proceso";
import { pesos, InterruptorFiltro } from "@/app/radar/Piezas";
import { BotonEnviar } from "@/app/radar/Cliente";
import { SUAVE, VERDE, BORRAR } from "@/app/botones";
import { accionRevisar } from "../../actions";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const VEREDICTO = { si: "equiparable", dudoso: "dudoso", no: "no es" } as const;
const FRANJA = {
  seguro: { texto: "entra seguro", color: "text-[#1F6E4A]" },
  gris: { texto: "zona gris: puede no ser rentable", color: "text-[#8a6100]" },
  fuera: { texto: "descartado por flete (no se buscó en China)", color: "text-[#9AA7B3]" },
} as const;
const COLOR = { si: "text-[#1F6E4A]", dudoso: "text-[#8a6100]", no: "text-[#9AA7B3]" } as const;

function Foto({ src }: { src: string | null }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-24 h-24 object-cover rounded shrink-0" />
  ) : <span className="w-24 h-24 shrink-0 rounded bg-[#EEF3F8]" />;
}

type SP = { campeones?: string; pasan?: string };

export default async function Revision({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  if (!(await sosVos())) redirect("/panel");
  const sesion = await sesionRequerida();
  const { id } = await params;
  const sp = await searchParams;
  const c = (await corrida(Number(id), sesion.org.id))!;
  const rutas = new Map(c.parametros.categorias.map((x) => [x.id, x.ruta]));
  let productos = await productosDe(c.id);
  if (sp.campeones) productos = productos.filter((x) => x.campeon);
  if (sp.pasan) productos = productos.filter((x) => x.franja !== "fuera");
  const filtro = (k: keyof SP) => {
    const q = new URLSearchParams(Object.entries({ ...sp, [k]: sp[k] ? "" : "1" }).filter(([, v]) => v) as [string, string][]);
    return `/admin/piloto/${c.id}/revision${q.size ? `?${q}` : ""}`;
  };
  const revisados = productos.filter((x) => x.revision);
  const aciertos = revisados.filter((x) => x.revision === "acerto").length;

  return (
    <div>
      <div className="flex flex-wrap gap-4 items-center mb-3">
        <InterruptorFiltro href={filtro("campeones")} prendido={!!sp.campeones} etiqueta="Sólo campeones" />
        <InterruptorFiltro href={filtro("pasan")} prendido={!!sp.pasan} etiqueta="Ocultar los descartados por flete" />
        <span className="text-xs text-[#5C6B76]">{productos.length} productos · revisados {revisados.length} · el juez acertó {aciertos}</span>
      </div>
      {productos.length === 0 && <p className="text-xs text-[#9AA7B3]">Todavía no hay productos (se crean al procesar Mercado Libre).</p>}
      <div className="grid gap-3">
        {productos.map((x) => {
          const cands = x.china?.candidatos ?? [];
          const j = x.juicio;
          const elegido = j?.elegido != null ? cands[j.elegido - 1] : null;
          const cuenta = { si: 0, dudoso: 0, no: 0 };
          j?.veredictos.forEach((v) => { cuenta[v.v] = (cuenta[v.v] ?? 0) + 1; });
          return (
            <article key={x.id} className="bg-white border border-[#E3E9F0] rounded-lg p-3 text-xs">
              <p className="text-[11px] text-[#5C6B76] mb-2">
                {rutas.get(x.categoria_id)} · {x.lado === "buscado" ? `más buscado (“${x.palabra}”)` : "más vendido"}
                {x.campeon && <b className="text-[#8a6100]"> · ★ campeón</b>}
                {x.etapa !== "listo" && <span> · falta: {x.etapa}</span>}
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex gap-3">
                  <Foto src={x.foto} />
                  <div>
                    <p className="font-bold">Mercado Libre</p>
                    {x.url ? <a href={x.url} target="_blank" rel="noreferrer" className="text-[#16577F] underline">{x.titulo}</a> : x.titulo}
                    <p className="text-[#5C6B76]">{pesos(x.precio)}{x.vendidos_texto && ` · ${x.vendidos_texto}`}</p>
                    {x.caja && (
                      <p className="mt-1">
                        Caja {x.caja.largo}×{x.caja.ancho}×{x.caja.alto} cm · {x.caja.kg} kg ({x.caja.fuente === "claude" ? "estimado por Claude" : "dato de China"})
                        {x.flete_pct != null && (
                          <b className={FRANJA[x.franja ?? "gris"].color}> · flete {x.flete_pct}% del precio (US$ {x.flete_usd}) · {FRANJA[x.franja ?? "gris"].texto}</b>
                        )}
                        {x.flete_usd != null && elegido?.usd ? (
                          <span className="block text-[#5C6B76]">= {Math.round((x.flete_usd / elegido.usd) * 100)}% del FOB del candidato (US$ {elegido.usd})</span>
                        ) : null}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Foto src={elegido?.foto ?? null} />
                  <div>
                    <p className="font-bold">Candidato del juez</p>
                    {elegido ? (
                      <>
                        {elegido.url ? <a href={elegido.url} target="_blank" rel="noreferrer" className="text-[#16577F] underline">{elegido.titulo}</a> : elegido.titulo}
                        <p className="text-[#5C6B76]">
                          {elegido.sitio === "1688" ? "1688" : "Alibaba"} · {elegido.usd != null ? `US$ ${elegido.usd}` : "sin precio"}
                          {elegido.precioTexto && ` (${elegido.precioTexto})`} · mínimo {elegido.minimo ?? "?"}
                          {elegido.proveedor && ` · ${elegido.proveedor}`}{elegido.anios ? `, ${elegido.anios} años` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="text-[#9AA7B3]">{x.etapa === "listo" ? "No eligió ninguno." : "Todavía no juzgó."}</p>
                    )}
                    {j && (
                      <p className="mt-1">
                        {j.motivo && <span>{j.motivo} </span>}
                        <span className="text-[#5C6B76]">({cuenta.si} equiparables · {cuenta.dudoso} dudosos · {cuenta.no} no son, de {cands.length})</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {x.error && <p className="text-[#C03420] mt-2">{x.error}</p>}
              {j?.nota && <p className="text-[#8a6100] mt-1 text-[11px]">{j.nota}</p>}
              {cands.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[#16577F]">Ver los {cands.length} resultados de China con el veredicto</summary>
                  <p className="text-[11px] text-[#5C6B76] my-1">Se buscó: EN “{x.china?.en}” · ZH “{x.china?.zh}”</p>
                  <table className="w-full text-[11px]">
                    <tbody>
                      {cands.map((k, i) => {
                        const v = j?.veredictos.find((y) => y.n === i + 1);
                        return (
                          <tr key={i} className={`border-t border-[#E3E9F0] align-top ${j?.elegido === i + 1 ? "bg-[#EEF7F1]" : ""}`}>
                            <td className="py-1 pr-2 w-12">
                              {k.foto && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={k.foto} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-10 h-10 object-cover rounded" />
                              )}
                            </td>
                            <td className="py-1 pr-2">
                              {k.url ? <a href={k.url} target="_blank" rel="noreferrer" className="text-[#16577F] underline">{k.titulo}</a> : k.titulo}
                              <span className="block text-[#5C6B76]">{k.sitio} · {k.usd != null ? `US$ ${k.usd}` : "—"} · mín. {k.minimo ?? "?"}</span>
                            </td>
                            <td className={`py-1 w-56 ${v ? COLOR[v.v] : ""}`}>{v ? <><b>{VEREDICTO[v.v]}</b> — {v.motivo}</> : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              )}
              {x.etapa === "listo" && x.franja !== "fuera" && (
                <form action={accionRevisar} className="mt-3 flex flex-wrap gap-2 items-center border-t border-[#E3E9F0] pt-2">
                  <input type="hidden" name="producto" value={x.id} />
                  <input type="hidden" name="corrida" value={c.id} />
                  <span className="text-[#5C6B76]">¿El juez acertó?</span>
                  <button name="revision" value="acerto" className={x.revision === "acerto" ? VERDE : SUAVE}>Acertó</button>
                  <button name="revision" value="no_acerto" className={x.revision === "no_acerto" ? `${BORRAR} bg-[#FDF1EF]` : SUAVE}>No acertó</button>
                  <input name="comentario" defaultValue={x.comentario ?? ""} placeholder="Comentario (qué estuvo mal, qué mirarías)"
                    className="border border-[#E3E9F0] rounded-lg px-3 py-2 text-xs flex-1 min-w-48" />
                  <BotonEnviar clase={SUAVE} corriendo="Guardando…">Guardar comentario</BotonEnviar>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
