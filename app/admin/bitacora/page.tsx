import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import {
  ultimasEntradas, losPendientes, losAutores, enHilos, paraVos,
  TIPOS, ESTADOS, PRIORIDADES, esTipo, type Entrada, type Hilo,
  quienLeyo,
} from "@/lib/coordinacion";
import { accionConfirmarLectura, accionAnotarEnBitacora, accionEstadoDePendiente, accionMarcarVisto,
  accionResponderEntrada } from "@/app/coordinacion-actions";
import { SUAVE, VERDE, DESPLEGABLE, DESPLEGABLE_CHICO, FLECHA } from "@/app/botones";
import Vacio from "@/app/Vacio";

export const dynamic = "force-dynamic";

// La bitácora de coordinación, adentro de la app.
// Portado de CadaMes (src/app/(app)/admin/bitacora/page.tsx) sin cambios de
// lógica ni de layout — sólo las rutas de import.

export const metadata = {
  title: "Bitácora",
  robots: { index: false, follow: false },
};

const PRIO: Record<string, string> = {
  alta: "bg-[#FDF1EF] text-[#C03420] border-[#EFD3CE]",
  media: "bg-[#FDF3DD] text-[#8a6100] border-[#F0DFAE]",
  baja: "bg-[#EEF3F8] text-[#5C6B76] border-[#E3E9F0]",
};

const cuando = (d: Date) =>
  d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });

function Firma({ entrada, color }: { entrada: Entrada; color: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5C6B76]">
      <span className="font-bold px-2 py-0.5 rounded-full bg-[#F7F8F6] border border-[#E3E9F0]"
        style={{ color }}>
        {entrada.autor}
      </span>
      <span className="font-semibold">{TIPOS[entrada.tipo as keyof typeof TIPOS] ?? entrada.tipo}</span>
      <span>·</span>
      <span className="tabular-nums">{cuando(entrada.ts)}</span>
      <span>·</span>
      <span className="tabular-nums">#{entrada.id}</span>
      {entrada.refDoc && (
        <span className="px-1.5 py-0.5 rounded bg-[#EEF3F8] text-[#16577F] font-semibold">
          {entrada.refDoc}
        </span>
      )}
      {entrada.autor !== "fer" && entrada.vistoFer === null && (
        <span className="px-1.5 py-0.5 rounded bg-[#FDF3DD] text-[#8a6100] font-bold">nuevo</span>
      )}
    </div>
  );
}

function Cuerpo({ entrada }: { entrada: Entrada }) {
  return (
    <>
      {entrada.detalle && (
        <p className="text-sm text-[#2b3945] mt-1.5 whitespace-pre-wrap">{entrada.detalle}</p>
      )}
      {entrada.motivo && (
        <p className="text-xs text-[#5C6B76] mt-2 whitespace-pre-wrap">
          <b className="text-[#16577F]">Por qué:</b> {entrada.motivo}
        </p>
      )}
      {entrada.pendientes && (
        <p className="text-xs mt-2 whitespace-pre-wrap bg-[#FDF3DD] text-[#8a6100] rounded-lg px-3 py-2">
          <b>Huecos que deja:</b> {entrada.pendientes}
        </p>
      )}
    </>
  );
}

function Lectura({ entrada, leyeron, todos }: {
  entrada: Entrada; leyeron: string[]; todos: string[];
}) {
  if (!entrada.pideLectura) return null;
  const faltan = todos.filter((a) => a !== entrada.autor && !leyeron.includes(a));
  return (
    <div className={`mt-2 rounded-lg px-3 py-2 text-[11px] ${
      faltan.length ? "bg-[#FDF3DD] text-[#8a6100]" : "bg-[#E8F6EF] text-[#107740]"
    }`}>
      <b>Pide confirmación de lectura.</b>{" "}
      {faltan.length
        ? `Falta que la lean: ${faltan.join(", ")}.`
        : "La leyeron todos."}
      {leyeron.length > 0 && faltan.length > 0 && ` Ya la leyeron: ${leyeron.join(", ")}.`}
    </div>
  );
}

function Acciones({ entrada, volverA, leyeron, todos }: {
  entrada: Entrada; volverA: string; leyeron: string[]; todos: string[];
}) {
  const mio = entrada.autor === "fer";
  return (
    <div className="mt-3">
      <Lectura entrada={entrada} leyeron={leyeron} todos={todos} />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {entrada.pideLectura && !mio && !leyeron.includes("fer") && (
          <form action={accionConfirmarLectura}>
            <input type="hidden" name="entradaId" value={entrada.id} />
            <input type="hidden" name="volverA" value={volverA} />
            <button className={SUAVE}>✓ La leí</button>
          </form>
        )}
        {!mio && (entrada.vistoFer === null ? (
          <form action={accionMarcarVisto}>
            <input type="hidden" name="entradaId" value={entrada.id} />
            <input type="hidden" name="volverA" value={volverA} />
            <button className={SUAVE}>✓ Visto</button>
          </form>
        ) : (
          <span className="text-[11px] text-[#5C6B76]">
            Visto el {cuando(entrada.vistoFer)}
          </span>
        ))}
        <details className="group">
          <summary className={DESPLEGABLE_CHICO}>
            ↩ Responder
            <span className="text-[#5C6B76] text-[10px] transition group-open:rotate-180">▾</span>
          </summary>
          <form action={accionResponderEntrada}
            className="mt-2 bg-[#F7F8F6] border border-[#E3E9F0] rounded-xl p-3 grid sm:grid-cols-4 gap-2">
            <input type="hidden" name="respondeA" value={entrada.id} />
            <input type="hidden" name="volverA" value={volverA} />
            <label className="sm:col-span-1">
              <span className="text-xs text-[#5C6B76]">Qué es</span>
              <select name="tipo" defaultValue="respuesta"
                className="border border-[#E3E9F0] rounded-lg px-2 py-2 w-full mt-1 text-sm bg-white">
                <option value="respuesta">Respuesta</option>
                <option value="pregunta">Repregunta</option>
                <option value="decision">Decisión</option>
                <option value="orden">Orden</option>
                <option value="nota">Nota</option>
              </select>
            </label>
            <label className="sm:col-span-3">
              <span className="text-xs text-[#5C6B76]">En una línea</span>
              <input name="titulo" required maxLength={200}
                className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm bg-white"
                placeholder="Lo que le querés decir" />
            </label>
            <label className="sm:col-span-4">
              <span className="text-xs text-[#5C6B76]">Lo que quieras agregar</span>
              <textarea name="detalle" rows={3}
                className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm bg-white"
                placeholder="Dudas, consultas, lo que haga falta" />
            </label>
            <div className="sm:col-span-4">
              <button className={VERDE}>Responder</button>
              <span className="text-[11px] text-[#5C6B76] ml-2">
                Contestar también la da por vista.
              </span>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}

export default async function Bitacora({
  searchParams,
}: {
  searchParams: Promise<{
    tipo?: string; ver?: string; sinver?: string; ok?: string; error?: string;
  }>;
}) {
  if (!(await sosVos())) redirect("/");
  const sp = await searchParams;

  const [entradas, pendientes, autores] = await Promise.all([
    ultimasEntradas(), losPendientes(), losAutores(),
  ]);
  const color = Object.fromEntries(autores.map((a) => [a.slug, a.color]));
  const slugs = autores.filter((a) => a.activo).map((a) => a.slug);
  const leyeron = await quienLeyo(entradas.filter((e) => e.pideLectura).map((e) => e.id));

  const filtro = esTipo(sp.tipo) ? sp.tipo : null;
  const sinLeer = paraVos(entradas, "fer");
  const soloSinVer = sp.sinver === "1";
  const visibles = soloSinVer ? sinLeer : entradas;
  const hilos: Hilo[] = enHilos(filtro ? visibles.filter((e) => e.tipo === filtro) : visibles);

  const cerrado = (e: string) => e === "resuelto" || e === "descartado";
  const verCerrados = sp.ver === "cerrados";
  const lista = pendientes.filter((p) => (verCerrados ? cerrado(p.estado) : !cerrado(p.estado)));
  const abiertos = pendientes.filter((p) => !cerrado(p.estado)).length;

  const conFiltros = (cambio: {
    tipo?: string | null; ver?: string | null; sinver?: boolean;
  }) => {
    const q = new URLSearchParams();
    const t = cambio.tipo === undefined ? filtro : cambio.tipo;
    const v = cambio.ver === undefined ? (verCerrados ? "cerrados" : null) : cambio.ver;
    const s = cambio.sinver === undefined ? soloSinVer : cambio.sinver;
    if (t) q.set("tipo", t);
    if (v) q.set("ver", v);
    if (s) q.set("sinver", "1");
    return q.size ? `/admin/bitacora?${q}` : "/admin/bitacora";
  };
  const aca = conFiltros({});

  const campo = "border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm bg-white";
  const rotulo = "text-xs text-[#5C6B76]";
  const chip = (activo: boolean) =>
    `text-xs font-bold px-3 py-1.5 rounded-lg border ${
      activo ? "bg-[#16577F] text-white border-[#16577F]" : "bg-[#EEF3F8] text-[#16577F] border-[#E3E9F0]"
    }`;

  return (
    <main className="max-w-5xl mx-auto p-5">
      <header className="mt-2 mb-4">
        <Link href="/admin" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
        <h1 className="text-lg font-bold">Bitácora</h1>
        <p className="text-xs text-[#5C6B76] mt-1">
          El canal de coordinación de este proyecto. Acá quedan las órdenes, las decisiones y
          —lo que más sirve— por qué cada cosa se hizo así y qué huecos dejó.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Link href={conFiltros({ sinver: !soloSinVer })}
          className={`${chip(soloSinVer)} ${sinLeer.length > 0 && !soloSinVer ? "ring-2 ring-[#E9B949]" : ""}`}>
          Para vos ({sinLeer.length})
        </Link>
        <Link href="/admin/para-probar" className={SUAVE}>🧪 Para probar</Link>
      </div>

      <details className="group mb-5">
        <summary className={DESPLEGABLE}>
          ＋ Anotar una entrada
          <span className={FLECHA}>▾</span>
        </summary>
        <form action={accionAnotarEnBitacora}
          className="bg-white border border-[#E3E9F0] border-t-0 rounded-b-xl p-4 grid sm:grid-cols-4 gap-3">
          <label className="sm:col-span-1">
            <span className={rotulo}>Tipo</span>
            <select name="tipo" defaultValue="nota" className={campo}>
              {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="sm:col-span-3">
            <span className={rotulo}>Título</span>
            <input name="titulo" required maxLength={200} className={campo}
              placeholder="En una línea, lo que pasó" />
          </label>
          <label className="sm:col-span-4">
            <span className={rotulo}>Detalle</span>
            <textarea name="detalle" rows={3} className={campo}
              placeholder="Qué es, con el nivel de detalle que haga falta" />
          </label>
          <label className="sm:col-span-4">
            <span className={rotulo}>Por qué así y no de otra forma</span>
            <textarea name="motivo" rows={2} className={campo}
              placeholder="La mitad que sirve: el detalle se lee del diff, el porqué no" />
          </label>
          <label className="sm:col-span-4">
            <span className={rotulo}>Huecos que deja</span>
            <textarea name="pendientes" rows={2} className={campo}
              placeholder="Qué queda abierto después de esto" />
          </label>
          <label className="sm:col-span-3">
            <span className={rotulo}>Documento (opcional)</span>
            <input name="refDoc" maxLength={40} className={campo} placeholder="doc 56" />
          </label>
          <div className="sm:col-span-1 flex items-end">
            <button className={`${VERDE} w-full py-2.5`}>Anotar</button>
          </div>

          {sp.ok === "anotado" && (
            <p className="sm:col-span-4 text-xs bg-[#E8F6EF] text-[#107740] rounded-lg px-3 py-2">
              Listo, quedó anotada.
            </p>
          )}
          {sp.error === "falta" && (
            <p className="sm:col-span-4 text-xs bg-[#FDF1EF] text-[#C03420] rounded-lg px-3 py-2">
              Falta el título, o el tipo no es de los de la lista. Completá eso y probá de nuevo.
            </p>
          )}
        </form>
      </details>

      <div className="grid lg:grid-cols-[1fr_20rem] gap-5 items-start">
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Link href={conFiltros({ tipo: null })} className={chip(!filtro)}>Todo</Link>
            {Object.entries(TIPOS).map(([k, v]) => (
              <Link key={k} href={conFiltros({ tipo: k })} className={chip(filtro === k)}>{v}</Link>
            ))}
          </div>

          {hilos.length === 0 ? (
            soloSinVer ? (
              <p className="text-sm text-[#5C6B76] bg-white border border-[#E3E9F0] rounded-2xl px-4 py-6 text-center">
                Estás al día: no quedó nada sin leer.{" "}
                <Link href={conFiltros({ sinver: false })} className={`${SUAVE} inline-block ml-1`}>
                  Ver todo
                </Link>
              </p>
            ) : filtro ? (
              <p className="text-sm text-[#5C6B76] bg-white border border-[#E3E9F0] rounded-2xl px-4 py-6 text-center">
                No hay entradas de ese tipo.{" "}
                <Link href={conFiltros({ tipo: null })} className={`${SUAVE} inline-block ml-1`}>Ver todo</Link>
              </p>
            ) : (
              <Vacio emoji="🗒️" titulo="Todavía no hay nada anotado">
                Acá cae lo que se anota mientras se trabaja: qué se entregó, qué se decidió y
                por qué. Empezá con el desplegable de arriba.
              </Vacio>
            )
          ) : (
            <div className="space-y-3">
              {hilos.map((h) => (
                <article key={h.id} id={`e${h.id}`}
                  className="bg-white border border-[#E3E9F0] rounded-2xl p-4 scroll-mt-4">
                  <Firma entrada={h} color={color[h.autor] ?? "#5C6B76"} />
                  <h2 className="font-semibold text-sm mt-1">{h.titulo}</h2>
                  <Cuerpo entrada={h} />
                  {h.respondeA !== null && (
                    <p className="text-[11px] text-[#5C6B76] mt-2">Contesta a la #{h.respondeA}.</p>
                  )}
                  <Acciones entrada={h} volverA={aca} leyeron={leyeron.get(h.id) ?? []} todos={slugs} />

                  {h.respuestas.map((r) => (
                    <div key={r.id} id={`e${r.id}`}
                      className="mt-3 pl-3 border-l-2 border-[#E3E9F0] scroll-mt-4">
                      <Firma entrada={r} color={color[r.autor] ?? "#5C6B76"} />
                      <h3 className="font-semibold text-sm mt-1">{r.titulo}</h3>
                      <Cuerpo entrada={r} />
                      {r.respondeA !== h.id && (
                        <p className="text-[11px] text-[#5C6B76] mt-2">Contesta a la #{r.respondeA}.</p>
                      )}
                      <Acciones entrada={r} volverA={aca} leyeron={leyeron.get(r.id) ?? []} todos={slugs} />
                    </div>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>

        <aside aria-label="Huecos" className="order-first lg:order-none">
          <div className="flex items-center gap-2 mb-3">
            <Link href={conFiltros({ ver: null })} className={chip(!verCerrados)}>Abiertos ({abiertos})</Link>
            <Link href={conFiltros({ ver: "cerrados" })} className={chip(verCerrados)}>Cerrados</Link>
          </div>

          {lista.length === 0 ? (
            <p className="text-sm text-[#5C6B76] bg-white border border-[#E3E9F0] rounded-2xl px-4 py-6 text-center">
              {verCerrados ? "Todavía no se cerró ninguno." : "No queda ninguno abierto."}
            </p>
          ) : (
            <div className="space-y-3">
              {lista.map((p) => (
                <div key={p.id} id={`p${p.id}`}
                  className="bg-white border border-[#E3E9F0] rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#5C6B76]">
                    <span className={`font-bold px-2 py-0.5 rounded-full border ${PRIO[p.prioridad] ?? PRIO.baja}`}>
                      {PRIORIDADES[p.prioridad as keyof typeof PRIORIDADES] ?? p.prioridad}
                    </span>
                    <span className="font-semibold">{ESTADOS[p.estado as keyof typeof ESTADOS] ?? p.estado}</span>
                    <span style={{ color: color[p.autor] ?? "#5C6B76" }} className="font-bold">{p.autor}</span>
                    {p.refDoc && <span className="text-[#16577F]">{p.refDoc}</span>}
                  </div>
                  <div className="font-semibold text-sm mt-1">{p.titulo}</div>
                  {p.detalle && (
                    <p className="text-xs text-[#5C6B76] mt-1.5 whitespace-pre-wrap">{p.detalle}</p>
                  )}
                  {p.porQueQuedo && (
                    <p className="text-xs text-[#5C6B76] mt-1.5 whitespace-pre-wrap">
                      <b className="text-[#16577F]">Por qué quedó:</b> {p.porQueQuedo}
                    </p>
                  )}
                  {p.notaResolucion && (
                    <p className="text-xs mt-1.5 bg-[#E8F6EF] text-[#107740] rounded-lg px-3 py-2 whitespace-pre-wrap">
                      {p.notaResolucion}
                    </p>
                  )}

                  <form action={accionEstadoDePendiente} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="pendienteId" value={p.id} />
                    <label className="flex-1 min-w-[7rem]">
                      <span className={rotulo}>Estado</span>
                      <select name="estado" defaultValue={p.estado} className={campo}>
                        {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <button className={SUAVE}>Guardar</button>
                    <details className="w-full">
                      <summary className={DESPLEGABLE_CHICO}>✎ Cómo se resolvió</summary>
                      <input name="notaResolucion" defaultValue={p.notaResolucion ?? ""}
                        aria-label="Cómo se resolvió" className={campo} placeholder="Qué lo cerró" />
                    </details>
                  </form>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {sp.ok === "pendiente" && (
        <p className="text-xs bg-[#E8F6EF] text-[#107740] rounded-lg px-3 py-2 mt-4">
          Listo, se guardó el pendiente.
        </p>
      )}
    </main>
  );
}
