import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { radarSeguidas } from "@/db/radar";
import { sesionRequerida, puede } from "@/lib/tenancy";
import { asegurarEsquema } from "@/lib/radar/esquema";
import { FUENTE_GRUPOS, GRUPOS, GRUPOS_CONFIRMADOS, SITIO, fechaCorta, semanaDe, type Grupo } from "@/lib/radar/base";
import { caminoDe, hijasDe, type Categoria } from "@/lib/radar/categorias";
import ExploradorCategorias from "@/app/componentes/ExploradorCategorias";
import { comparar, lecturaAnterior, lecturaDeLaSemana, palabrasDe, type Cambio } from "@/lib/radar/tendencias";
import { busquedasDeLaSemana, publicacionesDe, sirve, type Busqueda, type Publicacion } from "@/lib/radar/busquedas";
import { vistas } from "@/lib/radar/historial";
import { meliBusquedas } from "@/db/radar";
import { FUENTES_APIFY, configDe, costoProfundizar, type FuenteApify } from "@/lib/radar/config";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { accionApify, accionBuscarPropia, accionProfundizar, accionSeguir, accionSeguirPalabra, accionVerPublicaciones } from "./actions";
import { sigoPalabra } from "@/lib/radar/palabras";
import { Aviso, Estrella, Interruptor, pesos } from "./Piezas";
import { BotonEnviar } from "./Cliente";

export const dynamic = "force-dynamic";
// "Mejorar con Apify" espera a que el actor termine (~1 min).
export const maxDuration = 300;

type Params = { cat?: string; g?: string; q?: string; abierta?: string; b?: string; propia?: string; error?: string };

const ERRORES: Record<string, string> = {
  permiso: "No tenés permiso para eso.",
  tope: "Se llegó al tope semanal de gasto de Apify. Se puede cambiar en Configuración.",
  apify: "Apify no pudo completar la búsqueda. Probá de nuevo en un rato.",
};

function Cambio({ c }: { c: Cambio }) {
  if (c.tipo === "nueva") return <span className="text-[10px] font-bold rounded px-1 bg-[#EEF7F1] text-[#1F6E4A]">NUEVA</span>;
  if (c.tipo === "sube") return <span className="text-[11px] text-[#1F6E4A]">▲{c.lugares}</span>;
  if (c.tipo === "baja") return <span className="text-[11px] text-[#C03420]">▼{c.lugares}</span>;
  if (c.tipo === "igual") return <span className="text-[11px] text-[#9AA7B3]">=</span>;
  return null;
}

function TablaPublicaciones({ b, pubs }: { b: Busqueda; pubs: Publicacion[] }) {
  const esApify = b.fuente.startsWith("apify");
  return (
    <div className="mt-2 border border-[#E3E9F0] rounded-lg bg-[#FAFBFC] overflow-x-auto">
      <p className="text-[11px] text-[#5C6B76] px-3 pt-2">
        {esApify ? `Apify (${b.fuente.slice(6)})` : "API de Mercado Libre (catálogo, gratis)"} · {fechaCorta(b.pedidaEl)}
        {b.totalResultados && ` · ${b.totalResultados}`}
        {b.costoUsd ? ` · USD ${b.costoUsd.toFixed(3)}` : ""}
        {b.estado === "fallo" && <span className="text-[#C03420]"> · falló: {b.error}</span>}
        {b.estado === "corriendo" && " · corriendo…"}
      </p>
      {pubs.length > 0 && (
        <table className="w-full text-xs">
          <thead className="text-[#5C6B76] text-left">
            <tr><th className="px-3 py-1">#</th><th className="py-1 pr-2">Foto</th><th className="py-1">Publicación</th><th className="py-1 text-right">Precio</th>
              {esApify && <th className="py-1 text-right px-2">Vendidos</th>}<th className="py-1 px-2">Vendedor</th></tr>
          </thead>
          <tbody>
            {pubs.slice(0, esApify ? 10 : 10).map((p) => (
              <tr key={p.posicion} className="border-t border-[#E3E9F0] align-top">
                <td className="px-3 py-1 text-[#9AA7B3]">{p.posicion < 1000 ? p.posicion : ""}</td>
                <td className="py-1 pr-2">
                  {p.foto ? (
                    <a href={p.url ?? p.foto} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto externa de ML, miniatura */}
                      <img src={p.foto} alt="" loading="lazy" referrerPolicy="no-referrer"
                        className="w-14 h-14 object-contain rounded border border-[#E3E9F0] bg-white" />
                    </a>
                  ) : <span className="inline-block w-14 h-14 rounded border border-dashed border-[#E3E9F0]" />}
                </td>
                <td className="py-1">
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-[#16577F] underline">{p.titulo}</a> : p.titulo}
                  {p.stockTexto && <span className="text-[#5C6B76]"> · {p.stockTexto}</span>}
                </td>
                <td className="py-1 text-right whitespace-nowrap">
                  {pesos(p.precio)}
                  {p.precioAnterior && p.precioAnterior > (p.precio ?? 0) && <span className="block text-[10px] text-[#9AA7B3] line-through">{pesos(p.precioAnterior)}</span>}
                </td>
                {esApify && <td className="py-1 px-2 text-right whitespace-nowrap">{p.vendidos != null ? `+${p.vendidos}` : "—"}</td>}
                <td className="py-1 px-2">{p.vendedor}{p.tiendaOficial && " (oficial)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {esApify && pubs.length > 10 && <p className="text-[11px] text-[#5C6B76] px-3 pb-2">Se muestran 10 de {pubs.length} guardadas.</p>}
    </div>
  );
}

export default async function Tendencias({ searchParams }: { searchParams: Promise<Params> }) {
  await asegurarEsquema();
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  if (!(await puede("radar_ver"))) return <Aviso tipo="error">No tenés permiso para ver el Radar.</Aviso>;
  const puedeGastar = await puede("radar_gastar");

  const cat = sp.cat?.trim() || SITIO;
  const grupo: Grupo = sp.g && sp.g in GRUPOS ? (sp.g as Grupo) : "populares";
  const url = (cambios: Partial<Params>) => {
    const u = new URLSearchParams();
    const todo: Params = { cat, g: grupo, ...cambios };
    for (const [k, v] of Object.entries(todo)) if (v && !(k === "cat" && v === SITIO)) u.set(k, v);
    const s = u.toString();
    return s ? `/radar?${s}` : "/radar";
  };
  const aqui = url({ abierta: sp.abierta });

  const config = await configDe(sesion.org.id);
  let problema = "";
  let camino: Categoria[] = [], hijas: Categoria[] = [];
  try {
    [camino, hijas] = await Promise.all([caminoDe(cat), hijasDe(cat)]);
  } catch (e) {
    console.error("[radar] categorías:", e);
    problema = "No se pudieron leer las categorías de Mercado Libre.";
  }

  const lectura = await lecturaDeLaSemana(cat, sesion.org.id).catch(() => null);
  const anterior = lectura ? await lecturaAnterior(cat, lectura.semana) : null;
  const [actuales, previas] = await Promise.all([
    lectura ? palabrasDe([lectura.id]) : Promise.resolve([]),
    anterior ? palabrasDe([anterior.id]) : Promise.resolve(null),
  ]);
  const { lista, salieron } = comparar(actuales, previas, grupo);

  const seguidas = await db.select().from(radarSeguidas).where(eq(radarSeguidas.organizacionId, sesion.org.id));
  const seguidaMap = new Map(seguidas.map((s) => [s.categoriaId, s]));
  const estaSeguida = cat !== SITIO ? seguidaMap.get(cat) : undefined;

  const busquedas = await busquedasDeLaSemana([...lista.map((p) => p.palabra), ...(sp.abierta ? [sp.abierta] : [])]);
  const yaTiene = (palabra: string, pref: string) =>
    busquedas.find((b) => b.palabra.toLowerCase() === palabra.toLowerCase() && b.fuente.startsWith(pref) && sirve(b));

  // Una búsqueda puntual (desde el Historial): se abre aunque sea de otra semana.
  const [puntual] = sp.b && /^\d+$/.test(sp.b)
    ? await db.select().from(meliBusquedas).where(and(eq(meliBusquedas.id, Number(sp.b)), eq(meliBusquedas.organizacionId, sesion.org.id)))
    : [];
  const abierta = (puntual?.palabra ?? sp.abierta)?.toLowerCase();
  const abiertas = puntual ? [puntual] : abierta ? busquedas.filter((b) => b.palabra.toLowerCase() === abierta) : [];
  const ultimaPorFuente = [...new Map(abiertas.map((b) => [b.fuente, b])).values()];
  const pubsAbiertas = await Promise.all(ultimaPorFuente.map(async (b) => ({ b, pubs: await publicacionesDe(b.id) })));
  const abiertaEnLista = !!abierta && lista.some((p) => p.palabra.toLowerCase() === abierta);
  const yaVistas = await vistas(sesion.org.id, lista.map((p) => p.palabra));
  const esPropia = !!abierta && (sp.propia === "1" || pubsAbiertas.some(({ b }) => b.semilla === "propia"));
  const palabraAbierta = puntual?.palabra ?? sp.abierta ?? "";
  const palabraSeguida = palabraAbierta ? await sigoPalabra(sesion.org.id, palabraAbierta) : false;
  const fuente = FUENTES_APIFY[config.fuenteApify as FuenteApify];

  return (
    <div>
      {sp.error && <Aviso tipo="error">{ERRORES[sp.error] ?? "Algo falló."}</Aviso>}
      {problema && <Aviso tipo="error">{problema}</Aviso>}

      {/* Buscador de rubros: mientras se escribe, dentro de la categoría donde
          uno está parado (en todo el árbol si está en la raíz). */}
      <div className="mb-3">
        <ExploradorCategorias key={cat} modo="ir" irA="/radar?cat=" inicio={cat} soloBuscador alto="75vh" />
      </div>

      {/* Migas */}
      <nav className="text-xs mb-3 flex flex-wrap items-center gap-1">
        <Link href={url({ cat: SITIO })} className="text-[#16577F] underline">Todo Mercado Libre</Link>
        {camino.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span className="text-[#9AA7B3]">›</span>
            <Link href={url({ cat: c.id })} className={c.id === cat ? "font-bold" : "text-[#16577F] underline"}>{c.nombre}</Link>
          </span>
        ))}
        <span className="ml-auto text-[#5C6B76]">semana del {fechaCorta(semanaDe())}</span>
      </nav>

      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        {/* Subcategorías */}
        <aside className="border border-[#E3E9F0] rounded-lg bg-white p-2 self-start">
          <p className="text-[11px] font-bold text-[#5C6B76] px-1 mb-1">SUBCATEGORÍAS</p>
          {hijas.length === 0 && <p className="text-xs text-[#9AA7B3] px-1">No tiene subcategorías.</p>}
          <ul className="max-h-[75vh] overflow-y-auto">
            {hijas.map((h) => (
              <li key={h.id} className="flex items-center gap-1 py-0.5">
                <Estrella accion={accionSeguir} prendida={seguidaMap.has(h.id)} campos={{ cat: h.id, volver: aqui }} />
                <Link href={url({ cat: h.id })} className="flex-1 text-xs text-[#16577F] hover:underline truncate" title={h.ruta}>{h.nombre}</Link>
                <span className="text-[10px] text-[#9AA7B3]">{h.publicaciones != null ? h.publicaciones.toLocaleString("es-AR") : ""}</span>
              </li>
            ))}
          </ul>
          {cat !== SITIO && (
            <div className="border-t border-[#E3E9F0] mt-2 pt-2 grid gap-2">
              <Link href="/radar/ayuda#seguir" className="text-[11px] text-[#16577F] underline">¿Qué hace seguir y profundizar?</Link>
              <Interruptor accion={accionSeguir} prendido={!!estaSeguida} etiqueta="Seguir esta categoría"
                campos={{ cat, volver: aqui }} />
              <Interruptor accion={accionProfundizar} prendido={!!estaSeguida?.profundizar} etiqueta="Profundizar automático"
                deshabilitado={!estaSeguida || !puedeGastar} campos={{ cat, volver: aqui }}
                ayuda={`${config.palabrasAProfundizar} por grupo con Apify los días del proceso · ~USD ${costoProfundizar(config).toFixed(2)}`} />
            </div>
          )}
        </aside>

        {/* Tendencias */}
        <section>
          {/* Buscar mis palabras: una búsqueda propia, asociada a esta categoría (o suelta en Todo ML). */}
          <form action={accionBuscarPropia} className="border border-[#E3E9F0] rounded-lg bg-white p-2 mb-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="cat" value={cat} />
            <input type="hidden" name="volver" value={url({})} />
            <span className="text-xs font-bold text-[#5C6B76]">✍ Buscar mis palabras</span>
            <input name="palabra" required maxLength={120} defaultValue={esPropia ? palabraAbierta : undefined} placeholder={cat === SITIO ? "ej: maceta autorriego 30 cm" : `dentro de “${camino.at(-1)?.nombre ?? ""}”`}
              className="border border-[#E3E9F0] rounded-lg px-3 py-1.5 flex-1 min-w-[180px] text-sm" />
            <BotonEnviar clase={SUAVE} corriendo="Buscando…"><span>Ver publicaciones</span></BotonEnviar>
            {puedeGastar && (
              <button name="modo" value="apify" className={`${VERDE} disabled:opacity-60`}>Con Apify ~USD {fuente.costoPorPalabra.toFixed(2)}</button>
            )}
          </form>
          <nav className="flex gap-1 border-b border-[#E3E9F0] mb-2">
            {(Object.keys(GRUPOS) as Grupo[]).map((g) => (
              <span key={g} className="flex items-center -mb-px">
                <Link href={url({ g })}
                  className={`pl-3 pr-1 py-2 text-xs font-bold border-b-2 ${g === grupo ? "border-[#16577F] text-[#16577F]" : "border-transparent text-[#5C6B76]"}`}>
                  {GRUPOS[g].label} <span className="font-normal text-[#9AA7B3]">({actuales.filter((p) => p.grupo === g).length})</span>
                </Link>
                {/* Globo con la regla del ranking: al pasar el mouse o al tocar la "i". */}
                <span className="relative group mr-2">
                  <button type="button" aria-label={`Cómo se arma “${GRUPOS[g].label}”`}
                    className="w-4 h-4 rounded-full border border-[#9AA7B3] text-[10px] leading-none text-[#5C6B76] bg-white">i</button>
                  <span role="tooltip"
                    className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition absolute z-20 left-1/2 -translate-x-1/2 top-6 w-72 rounded-lg border border-[#E3E9F0] bg-white shadow-lg p-3 text-[11px] text-[#1F2A33] font-normal">
                    <b className="block text-xs mb-1">{GRUPOS[g].label}</b>
                    <ul className="list-disc pl-4 grid gap-1">
                      {GRUPOS[g].regla.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    <span className="block mt-2 text-[10px] text-[#9AA7B3]">{FUENTE_GRUPOS}</span>
                  </span>
                </span>
              </span>
            ))}
          </nav>
          <p className="text-[11px] text-[#5C6B76] mb-2">
            {GRUPOS[grupo].ayuda}
            {!GRUPOS_CONFIRMADOS && " (Grupo deducido por la posición en la lista: supuesto, a confirmar con algunas semanas.)"}
            {lectura && ` · Leída el ${fechaCorta(lectura.leidaEl)}.`}
            {lectura && !anterior && " Primera lectura: todavía no hay semana anterior para comparar."}
          </p>

          {!lectura && <Aviso tipo="error">No se pudieron leer las tendencias. ¿Está conectada la cuenta de Mercado Libre?</Aviso>}
          {lectura && actuales.length === 0 && <Aviso>Mercado Libre no informa tendencias para esta categoría.</Aviso>}

          {puntual && semanaDe(puntual.pedidaEl) !== semanaDe() && (
            <Aviso>Búsqueda del {fechaCorta(puntual.pedidaEl)}. La lista de tendencias de abajo es la de esta semana.</Aviso>
          )}
          {abierta && !abiertaEnLista && pubsAbiertas.length > 0 && (
            <div className="border border-[#E3E9F0] rounded-lg bg-white px-3 py-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">“{pubsAbiertas[0].b.palabra}”</p>
                <span className="text-xs text-[#5C6B76]">
                  {esPropia ? "✍ palabra propia" : "(esta semana no está en este grupo)"}
                </span>
              </div>
              {esPropia && (
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  {/* Estrella de la PALABRA (no de una categoría): la vuelve a buscar el proceso automático. */}
                  <Estrella accion={accionSeguirPalabra} prendida={palabraSeguida}
                    campos={{ palabra: pubsAbiertas[0].b.palabra, cat, volver: url({ abierta: pubsAbiertas[0].b.palabra, propia: "1" }) }} />
                  <span className="text-[#5C6B76]">
                    {palabraSeguida
                      ? <>Seguís <b>esta palabra</b>{cat === SITIO ? " (en Todo Mercado Libre)" : ""}: los días del proceso se vuelve a buscar sola con Apify.</>
                      : <>Seguir <b>esta palabra</b> (no la categoría): los días del proceso se vuelve a buscar sola con Apify.</>}
                  </span>
                  {puedeGastar && !yaTiene(pubsAbiertas[0].b.palabra, "apify") && (
                    <form action={accionBuscarPropia} className="ml-auto">
                      <input type="hidden" name="palabra" value={pubsAbiertas[0].b.palabra} />
                      <input type="hidden" name="cat" value={cat} />
                      <input type="hidden" name="modo" value="apify" />
                      <input type="hidden" name="volver" value={url({})} />
                      <BotonEnviar clase={VERDE} corriendo="Corriendo… ~1 min">Mejorar con Apify ~USD {fuente.costoPorPalabra.toFixed(2)}</BotonEnviar>
                    </form>
                  )}
                </div>
              )}
              {pubsAbiertas.map(({ b, pubs }) => <TablaPublicaciones key={b.id} b={b} pubs={pubs} />)}
            </div>
          )}

          <ol className="grid gap-1">
            {lista.map((p) => {
              const gratis = yaTiene(p.palabra, "api");
              const paga = yaTiene(p.palabra, "apify");
              const estaAbierta = abierta === p.palabra.toLowerCase();
              const vista = yaVistas.get(p.palabra.toLowerCase());
              return (
                <li key={p.posicion} className={`border rounded-lg px-3 py-2 ${vista ? "bg-[#F1F3F5] border-[#DCE2E8]" : "bg-white border-[#E3E9F0]"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#9AA7B3] w-5 text-right">{p.lugar}.</span>
                    <span className="text-sm font-semibold">{p.palabra}</span>
                    <Cambio c={p.cambio} />
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-[11px] text-[#16577F] underline">ver en ML ↗</a>}
                    {vista && (
                      <Link href={`/radar/historial?q=${encodeURIComponent(p.palabra)}`} title="Ver en el historial"
                        className="text-[10px] rounded px-1.5 py-0.5 bg-white border border-[#DCE2E8] text-[#5C6B76]">
                        👁 vista {fechaCorta(vista.cuando)} · {vista.automatica ? "🤖 automática" : vista.quien ?? "?"}
                      </Link>
                    )}
                    <span className="ml-auto flex gap-1">
                      {gratis ? (
                        <Link href={estaAbierta ? url({}) : url({ abierta: p.palabra })} className={SUAVE}>
                          {estaAbierta ? "Cerrar" : "Ver publicaciones"}
                        </Link>
                      ) : (
                        <form action={accionVerPublicaciones}>
                          <input type="hidden" name="palabra" value={p.palabra} />
                          <input type="hidden" name="cat" value={cat} />
                          <input type="hidden" name="volver" value={url({})} />
                          <BotonEnviar clase={SUAVE} corriendo="Buscando…">Ver publicaciones</BotonEnviar>
                        </form>
                      )}
                      {puedeGastar && !paga && (
                        <form action={accionApify}>
                          <input type="hidden" name="palabra" value={p.palabra} />
                          <input type="hidden" name="cat" value={cat} />
                          <input type="hidden" name="volver" value={url({})} />
                          <BotonEnviar clase={VERDE} corriendo="Corriendo… ~1 min">
                            Mejorar con Apify ~USD {fuente.costoPorPalabra.toFixed(2)}
                          </BotonEnviar>
                        </form>
                      )}
                      {paga && !estaAbierta && <Link href={url({ abierta: p.palabra })} className={SUAVE}>Ver (Apify)</Link>}
                    </span>
                  </div>
                  {estaAbierta && pubsAbiertas.map(({ b, pubs }) => <TablaPublicaciones key={b.id} b={b} pubs={pubs} />)}
                </li>
              );
            })}
          </ol>

          {config.mostrarSalieron && salieron.length > 0 && (
            <p className="text-[11px] text-[#5C6B76] mt-3">
              <b>Salieron de este grupo</b> desde la semana pasada: {salieron.join(" · ")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
