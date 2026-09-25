import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { meliCategorias, radarSeguidas } from "@/db/radar";
import { sesionRequerida, puede } from "@/lib/tenancy";
import { asegurarEsquema } from "@/lib/radar/esquema";
import { fechaCorta } from "@/lib/radar/base";
import { novedades } from "@/lib/radar/tendencias";
import { gastoDeLaSemana } from "@/lib/radar/busquedas";
import { configDe, costoProfundizar } from "@/lib/radar/config";
import { accionProfundizar, accionSeguir, accionSeguirPalabra } from "../actions";
import { palabrasSeguidas, ultimasDe } from "@/lib/radar/palabras";
import { FUENTES_APIFY, type FuenteApify } from "@/lib/radar/config";
import { Aviso, Interruptor } from "../Piezas";
import { TachoConfirmar } from "../Cliente";

export const dynamic = "force-dynamic";

export default async function Seguidas() {
  await asegurarEsquema();
  const sesion = await sesionRequerida();
  if (!(await puede("radar_ver"))) return <Aviso tipo="error">No tenés permiso para ver el Radar.</Aviso>;
  const puedeGastar = await puede("radar_gastar");

  const [config, seguidas, gastado] = await Promise.all([
    configDe(sesion.org.id),
    db.select().from(radarSeguidas).where(eq(radarSeguidas.organizacionId, sesion.org.id)),
    gastoDeLaSemana(sesion.org.id),
  ]);
  const cats = seguidas.length
    ? await db.select().from(meliCategorias).where(inArray(meliCategorias.id, seguidas.map((s) => s.categoriaId)))
    : [];
  const rutas = new Map(cats.map((c) => [c.id, c.ruta]));
  const filas = await Promise.all(seguidas.map(async (s) => ({ s, n: await novedades(s.categoriaId) })));
  // Primero las que más cambiaron.
  filas.sort((a, b) => ((b.n?.nuevas.length ?? 0) + (b.n?.subieron ?? 0)) - ((a.n?.nuevas.length ?? 0) + (a.n?.subieron ?? 0)));
  const costo = costoProfundizar(config);
  const propias = await palabrasSeguidas(sesion.org.id);
  const ultimas = await ultimasDe(sesion.org.id, propias.map((p) => p.clave));
  const costoPalabra = FUENTES_APIFY[config.fuenteApify as FuenteApify].costoPorPalabra;
  const estimado = seguidas.filter((s) => s.profundizar).length * costo + propias.length * costoPalabra;

  const seccionPalabras = (
    <section className="mt-6">
      <h2 className="text-sm font-bold mb-1">✍ Mis palabras seguidas</h2>
      <p className="text-xs text-[#5C6B76] mb-2">
        Palabras propias (de “Buscar mis palabras”) marcadas con ★. Los días del proceso se vuelven a buscar solas con Apify
        (~USD {costoPalabra.toFixed(2)} cada una, dentro del tope semanal).
      </p>
      {propias.length === 0 ? (
        <p className="text-xs text-[#9AA7B3]">Ninguna todavía. Buscá una palabra en Tendencias → “Buscar mis palabras” y tocá su ★.</p>
      ) : (
        <div className="overflow-x-auto border border-[#E3E9F0] rounded-lg bg-white">
          <table className="w-full text-xs">
            <thead className="text-left text-[#5C6B76] border-b border-[#E3E9F0]">
              <tr><th className="px-3 py-2">Palabra</th><th className="py-2">Categoría</th><th className="py-2 px-2">Última búsqueda</th><th className="py-2 px-2"></th></tr>
            </thead>
            <tbody>
              {propias.map((p) => {
                const u = ultimas.get(p.clave);
                const href = u ? `/radar?${new URLSearchParams({ ...(p.categoriaId ? { cat: p.categoriaId } : {}), b: String(u.id), propia: "1" })}` : `/radar${p.categoriaId ? `?cat=${p.categoriaId}` : ""}`;
                return (
                  <tr key={p.clave} className="border-b last:border-0 border-[#E3E9F0] align-top">
                    <td className="px-3 py-2"><Link href={href} className="text-[#16577F] underline">★ {p.palabra}</Link></td>
                    <td className="py-2">{p.ruta ?? "Todo Mercado Libre"}</td>
                    <td className="py-2 px-2 whitespace-nowrap">{u ? `${fechaCorta(u.pedidaEl)} · ${u.fuente === "api" ? "gratis" : "Apify"}` : "—"}</td>
                    <td className="py-2 px-2">
                      <TachoConfirmar accion={accionSeguirPalabra} pregunta="¿Dejar de seguir?"
                        campos={{ palabra: p.palabra, cat: p.categoriaId ?? "", valor: "0", volver: "/radar/seguidas" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  if (!seguidas.length) {
    return (
      <div>
        <Aviso>
          Todavía no seguís ninguna categoría. En <Link href="/radar" className="underline">Tendencias</Link>, tocá la
          estrella ☆ de una subcategoría o prendé “Seguir esta categoría”.
        </Aviso>
        {seccionPalabras}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto border border-[#E3E9F0] rounded-lg bg-white">
        <table className="w-full text-xs">
          <thead className="text-left text-[#5C6B76] border-b border-[#E3E9F0]">
            <tr>
              <th className="px-3 py-2">Categoría</th>
              <th className="py-2">Novedades de la semana</th>
              <th className="py-2 px-2">Profundizar</th>
              <th className="py-2 px-2">Última lectura</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ s, n }) => (
              <tr key={s.categoriaId} className="border-b last:border-0 border-[#E3E9F0] align-top">
                <td className="px-3 py-2">
                  <Link href={`/radar?cat=${s.categoriaId}`} className="text-[#16577F] underline">
                    ★ {rutas.get(s.categoriaId) ?? s.categoriaId}
                  </Link>
                </td>
                <td className="py-2">
                  {!n && <span className="text-[#9AA7B3]">Sin lectura esta semana todavía.</span>}
                  {n && n.primera && <span className="text-[#5C6B76]">Primera lectura ({n.total} palabras).</span>}
                  {n && !n.primera && (
                    <>
                      <span>{n.nuevas.length} nuevas · {n.subieron} ▲{config.mostrarSalieron && ` · ${n.salieron.length} salieron`}</span>
                      {n.nuevas.length > 0 && <span className="block text-[#1F6E4A]">nuevas: {n.nuevas.slice(0, 8).join(", ")}{n.nuevas.length > 8 && "…"}</span>}
                      {config.mostrarSalieron && n.salieron.length > 0 && (
                        <span className="block text-[#9AA7B3]">salieron: {n.salieron.slice(0, 6).join(", ")}{n.salieron.length > 6 && "…"}</span>
                      )}
                    </>
                  )}
                </td>
                <td className="py-2 px-2 min-w-[150px]">
                  <Interruptor accion={accionProfundizar} prendido={s.profundizar} deshabilitado={!puedeGastar}
                    etiqueta={s.profundizar ? `~USD ${costo.toFixed(2)}` : "apagado"} campos={{ cat: s.categoriaId, volver: "/radar/seguidas" }} />
                </td>
                <td className="py-2 px-2 whitespace-nowrap">{n ? fechaCorta(n.leidaEl) : "—"}</td>
                <td className="py-2 px-2">
                  <TachoConfirmar accion={accionSeguir} pregunta="¿Dejar de seguir?"
                    campos={{ cat: s.categoriaId, valor: "0", volver: "/radar/seguidas" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#5C6B76] mt-3">
        Gasto estimado por corrida automática (profundizar + palabras seguidas): <b>USD {estimado.toFixed(2)}</b> · Gastado en Apify esta semana:{" "}
        <b>USD {gastado.toFixed(2)}</b> de un tope de USD {config.topeSemanalUsd}.
      </p>
      {seccionPalabras}
    </div>
  );
}
