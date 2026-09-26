// Depurar posiciones: qué capítulos y partidas se sacan de la base de ARCA.
// Viene marcada la propuesta de Code; Fer tilda o destilda y guarda. Guardar
// no borra: el borrado ("aplicar") lo hace Code cuando Fer lo pide.

import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { estadoDepuracion, itemsASacar } from "@/lib/arca/depuracion";
import { DESPLEGABLE_CHICO, SUAVE, VERDE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { accionGuardarDepuracion } from "./actions";
import { entrar } from "../Piezas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const pctDe = (n: number, total: number) => (total ? `${((n / total) * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—");

export default async function Depurar({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  await entrar();
  if (!(await sosVos())) redirect("/importaciones");
  const sp = await searchParams;
  const { capitulos, total, aplicado } = await estadoDepuracion();
  const sacar = itemsASacar(capitulos);
  const CASILLA = "h-4 w-4 accent-[#C03420] shrink-0 mt-0.5";

  return (
    <div className="space-y-4">
      <Link href="/importaciones/cargas" className={SUAVE}>← Cargas</Link>
      <section className="bg-white border border-[#E3E9F0] rounded-xl p-3 text-xs space-y-1">
        <h2 className="text-sm font-bold">Depurar posiciones</h2>
        <p className="text-[#5C6B76]">
          Tildado = <b>se saca de la base</b>. Viene marcada una propuesta (etiqueta <i>propuesta</i>, con el motivo).
          Tildar un capítulo entero saca todas sus partidas. <b>Guardar no borra nada</b>: el borrado se hace después, cuando lo pedís.
          Lo sacado deja de cargarse en las próximas cargas; si cambiás de idea, se vuelve a cargar desde los archivos de tu PC.
        </p>
        <p>
          Con lo marcado se saca <b>{pctDe(sacar, total)}</b> de la base ({sacar.toLocaleString("es-AR")} de {total.toLocaleString("es-AR")} registros de resumen).
          {aplicado ? ` Última vez aplicado: ${aplicado.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.` : " Todavía no se aplicó."}
        </p>
        {sp.ok && <p className="text-[#1F6E4A] font-semibold">Guardado.</p>}
      </section>

      <form action={accionGuardarDepuracion} className="space-y-1">
        {capitulos.filter((c) => c.items > 0 || c.excluir || c.partidas.some((p) => p.excluir)).map((c) => {
          const partidasSacadas = c.partidas.filter((p) => p.excluir).length;
          return (
            <div key={c.prefijo} className={`bg-white border rounded-lg px-3 py-2 text-xs ${c.excluir ? "border-[#EFD3CE] bg-[#FDF6F5]" : "border-[#E3E9F0]"}`}>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="sacar" value={c.prefijo} defaultChecked={c.excluir} className={CASILLA} aria-label={`Sacar capítulo ${c.prefijo}`} />
                <span className="flex-1">
                  <b className="font-mono">{c.prefijo}</b> {c.nombre}
                  {c.propuesta && <span className="ml-1 text-[10px] rounded px-1 bg-[#FDF3DD] text-[#8a6100]">propuesta</span>}
                  {c.motivo && <span className="block text-[11px] text-[#5C6B76]">{c.motivo}</span>}
                </span>
                <span className="tabular-nums text-[#5C6B76] whitespace-nowrap">{pctDe(c.items, total)}</span>
              </label>
              {c.partidas.length > 0 && (
                <details className="group mt-1 ml-6">
                  <summary className={DESPLEGABLE_CHICO}>
                    Partidas ({c.partidas.length}){partidasSacadas ? ` · ${partidasSacadas} tildadas` : ""}
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    {c.partidas.map((p) => (
                      <li key={p.prefijo}>
                        <label className="flex items-start gap-2">
                          <input type="checkbox" name="sacar" value={p.prefijo} defaultChecked={p.excluir} className={CASILLA}
                            aria-label={`Sacar partida ${p.prefijo}`} />
                          <span className="flex-1">
                            <span className="font-mono">{p.prefijo.slice(0, 2)}.{p.prefijo.slice(2)}</span> {p.descripcion ?? "(sin descripción)"}
                            {p.propuesta && <span className="ml-1 text-[10px] rounded px-1 bg-[#FDF3DD] text-[#8a6100]">propuesta</span>}
                            {p.motivo && <span className="block text-[11px] text-[#5C6B76]">{p.motivo}</span>}
                          </span>
                          <span className="tabular-nums text-[#5C6B76] whitespace-nowrap">{pctDe(p.items, total)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
        <div className="sticky bottom-0 bg-[#F6F7F5] py-2">
          <BotonEnviar clase={VERDE} corriendo="Guardando…">Guardar lo tildado</BotonEnviar>
        </div>
      </form>
    </div>
  );
}
