import Link from "next/link";
import { sesionRequerida, puede } from "@/lib/tenancy";
import { asegurarEsquema } from "@/lib/radar/esquema";
import { GRUPOS, ZONA, type Grupo } from "@/lib/radar/base";
import { historial, type FilaHistorial } from "@/lib/radar/historial";
import { actualizarCostos } from "@/lib/radar/busquedas";
import { PRIMARIO } from "@/app/botones";
import { Aviso, InterruptorFiltro } from "../Piezas";

export const dynamic = "force-dynamic";

// Historial: dónde estuviste. Cada "Ver publicaciones" / "Mejorar con Apify"
// de cualquiera de la organización (y las automáticas del cron), con la
// categoría completa; al tocarla vuelve a Tendencias con esa búsqueda abierta.

const dia = (d: Date) => d.toLocaleDateString("es-AR", { timeZone: ZONA, weekday: "long", day: "2-digit", month: "2-digit" });
const hora = (d: Date) => d.toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });

function destino(f: FilaHistorial) {
  const u = new URLSearchParams();
  if (f.categoria_id) u.set("cat", f.categoria_id);
  if (f.grupo) u.set("g", f.grupo);
  u.set("b", String(f.id));
  return `/radar?${u}`;
}

function fuente(f: FilaHistorial) {
  return f.fuente === "api" ? "Gratis" : `Apify (${f.fuente.slice(6)})`;
}

export default async function Historial({ searchParams }: { searchParams: Promise<{ q?: string; auto?: string }> }) {
  await asegurarEsquema();
  const sesion = await sesionRequerida();
  if (!(await puede("radar_ver"))) return <Aviso tipo="error">No tenés permiso para ver el Radar.</Aviso>;
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const automaticas = sp.auto !== "0";
  // Apify asienta el costo después de terminar: se trae el final antes de mostrar.
  await actualizarCostos().catch(() => 0);
  const filas = await historial(sesion.org.id, { automaticas, texto: q });

  const conAuto = (valor: boolean) => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (!valor) u.set("auto", "0");
    const s = u.toString();
    return s ? `/radar/historial?${s}` : "/radar/historial";
  };

  // Agrupado por día.
  const porDia = new Map<string, FilaHistorial[]>();
  for (const f of filas) {
    const k = dia(f.pedida_el);
    porDia.set(k, [...(porDia.get(k) ?? []), f]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <form action="/radar/historial" className="flex gap-2 flex-1 min-w-[240px]">
          {!automaticas && <input type="hidden" name="auto" value="0" />}
          <input name="q" defaultValue={q} placeholder="Buscar por palabra o categoría"
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 flex-1 text-sm" />
          <button className={PRIMARIO}>Buscar</button>
        </form>
        <InterruptorFiltro href={conAuto(!automaticas)} prendido={automaticas} etiqueta="Incluir automáticas" />
      </div>

      {filas.length === 0 && (
        <Aviso>{q ? `Nada con “${q}” en el historial.` : "Todavía no hay búsquedas. Aparecen acá cuando tocás “Ver publicaciones” o “Mejorar con Apify” en una palabra."}</Aviso>
      )}

      {[...porDia.entries()].map(([d, lista]) => (
        <section key={d} className="mb-4">
          <h2 className="text-xs font-bold text-[#5C6B76] mb-1 capitalize">{d}</h2>
          <ol className="grid gap-1">
            {lista.map((f) => (
              <li key={f.id}>
                <Link href={destino(f)} className="flex gap-3 items-start border border-[#E3E9F0] rounded-lg bg-white px-3 py-2 hover:bg-[#F5F8FB]">
                  <span className="text-xs text-[#5C6B76] w-11 shrink-0 pt-0.5">{hora(f.pedida_el)}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] text-[#5C6B76] truncate">Todo Mercado Libre{f.ruta ? ` › ${f.ruta}` : ""}</span>
                    <span className="block text-sm">
                      <b>“{f.palabra}”</b>
                      <span className="text-xs text-[#5C6B76]">
                        {f.grupo && ` · ${GRUPOS[f.grupo as Grupo]?.label ?? f.grupo}`}
                        {` · ${fuente(f)} · ${f.publicaciones} publ.`}
                        {f.costo_usd ? ` · USD ${Number(f.costo_usd).toFixed(2)}` : ""}
                        {f.estado === "fallo" && " · falló"}
                        {f.estado === "corriendo" && " · corriendo"}
                      </span>
                    </span>
                  </span>
                  <span className="text-xs shrink-0 pt-0.5">{f.origen === "cron" ? "🤖 automática" : f.quien ?? "?"}</span>
                  <span className="text-[#16577F] shrink-0 pt-0.5">→</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {filas.length === 200 && <p className="text-[11px] text-[#9AA7B3]">Se muestran las últimas 200. Usá el buscador para encontrar anteriores.</p>}
    </div>
  );
}
