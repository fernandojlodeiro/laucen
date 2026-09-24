import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { losAutores, PRIORIDADES, esPrioridad } from "@/lib/coordinacion";
import {
  todasLasFilas, vueltasDe, filtrar, ordenar, contar, areasConAlgo, letra, AREAS, ESTADOS_PRUEBA,
  TIPOS_DE_VUELTA, esArea, esEstadoPrueba, type Fila, type Filtro, type Vuelta,
} from "@/lib/para-probar";
import { accionCargarParaProbar, accionMarcarPrueba, accionEditarVuelta, accionBorrarVuelta, accionBorrarHilo } from "@/app/coordinacion-actions";
import { SUAVE, VERDE, BORRAR, APAGAR, ICONO_BORRAR, DESPLEGABLE, DESPLEGABLE_CHICO, FLECHA } from "@/app/botones";
import { TarjetaVacia } from "@/app/Vacio";

export const dynamic = "force-dynamic";

// Para probar: la cola de lo que hay que ir a mirar.
// Portado de CadaMes (src/app/(app)/admin/para-probar/page.tsx) sin cambios
// de lógica ni de layout — sólo las rutas de import.

export const metadata = {
  title: "Para probar",
  robots: { index: false, follow: false },
};

const PRIO: Record<string, string> = {
  alta: "bg-[#FDF1EF] text-[#C03420] border-[#EFD3CE]",
  media: "bg-[#FDF3DD] text-[#8a6100] border-[#F0DFAE]",
  baja: "bg-[#EEF3F8] text-[#5C6B76] border-[#E3E9F0]",
};

const ESTADO: Record<string, string> = {
  por_probar: "bg-[#EEF3F8] text-[#16577F] border-[#E3E9F0]",
  ok: "bg-[#E8F6EF] text-[#107740] border-[#CFE9DA]",
  con_fallas: "bg-[#FDF1EF] text-[#C03420] border-[#EFD3CE]",
  observado: "bg-[#FDF3DD] text-[#8a6100] border-[#F0DFAE]",
};

const VUELTA: Record<string, string> = {
  falla: "bg-[#FDF1EF] text-[#C03420]",
  observado: "bg-[#FDF3DD] text-[#8a6100]",
  ok: "bg-[#E8F6EF] text-[#107740]",
  arreglo: "bg-[#EEF3F8] text-[#16577F]",
  nota: "bg-[#F7F8F6] text-[#5C6B76]",
};

const cuando = (d: Date) =>
  d.toLocaleString("es-AR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });

const chip = (activo: boolean) =>
  `text-xs font-bold px-3 py-1.5 rounded-lg border ${
    activo ? "bg-[#16577F] text-white border-[#16577F]" : "bg-[#EEF3F8] text-[#16577F] border-[#E3E9F0]"
  }`;

function Numeros({ n, tenue }: { n: ReturnType<typeof contar>; tenue?: boolean }) {
  const fondo = tenue ? "bg-[#F7F8F6]" : "bg-white";
  const caja = `rounded-lg px-2 py-1.5 border border-[#E3E9F0] ${fondo}`;
  const rotulo = "text-[10px] text-[#5C6B76] leading-tight";
  const cifra = "font-bold text-base tabular-nums leading-tight";
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
      <div className={caja}>
        <div className={rotulo}>Por probar</div>
        <div className={cifra}>{n.porProbar}</div>
      </div>
      <div className={`rounded-lg px-2 py-1.5 border ${n.deAlta ? "bg-[#FDF1EF] border-[#EFD3CE]" : `border-[#E3E9F0] ${fondo}`}`}>
        <div className={rotulo}>De alta</div>
        <div className={`${cifra} ${n.deAlta ? "text-[#C03420]" : ""}`}>{n.deAlta}</div>
      </div>
      <div className={caja}>
        <div className={rotulo}>Con fallas</div>
        <div className={`${cifra} ${n.conFallas ? "text-[#C03420]" : ""}`}>{n.conFallas}</div>
      </div>
      <div className={caja}>
        <div className={rotulo}>Observados</div>
        <div className={`${cifra} ${n.observados ? "text-[#8a6100]" : ""}`}>{n.observados}</div>
      </div>
      <div className={caja}>
        <div className={rotulo}>Chequeadas</div>
        <div className={`${cifra} ${n.chequeadas ? "text-[#107740]" : ""}`}>{n.chequeadas}</div>
      </div>
    </div>
  );
}

function ConTexto({ fila, marca, boton, tono, fondo, rotulo, placeholder, obligatorio, volverA }: {
  fila: Fila; marca: string; boton: string; tono: "falla" | "observado" | "nota"; fondo: string;
  rotulo: string; placeholder: string; obligatorio: boolean; volverA: string;
}) {
  return (
    <details className="group">
      <summary className={DESPLEGABLE_CHICO}>
        {boton}
        <span className="text-[#5C6B76] text-[10px] transition group-open:rotate-180">▾</span>
      </summary>
      <form action={accionMarcarPrueba}
        className={`mt-2 ${fondo} rounded-xl p-3 grid gap-2 min-w-[260px]`}>
        <input type="hidden" name="id" value={fila.id} />
        <input type="hidden" name="marca" value={marca} />
        <input type="hidden" name="volverA" value={volverA} />
        <label>
          <span className="text-xs text-[#5C6B76]">{rotulo}</span>
          <textarea name="texto" required={obligatorio} rows={3} maxLength={2000}
            className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm bg-white"
            placeholder={placeholder} />
        </label>
        {tono === "falla" ? (
          <button className={`${BORRAR} justify-self-start`}>Guardar</button>
        ) : tono === "observado" ? (
          <button className={`${APAGAR} justify-self-start`}>Guardar</button>
        ) : (
          <button className={`${SUAVE} justify-self-start`}>Guardar</button>
        )}
      </form>
    </details>
  );
}

function Hilo({ fila, vueltas, color, nombre, volverA, recien }: {
  fila: Fila; vueltas: Vuelta[]; color: Record<string, string>; nombre: Record<string, string>;
  volverA: string; recien: boolean;
}) {
  const borde = fila.estado === "con_fallas" ? "border-[#EFD3CE]"
    : fila.estado === "observado" ? "border-[#F0DFAE]"
    : fila.estado === "ok" ? "border-[#CFE9DA]" : "border-[#E3E9F0]";
  const quien = (slug: string | null) => (slug ? nombre[slug] ?? slug : "");
  return (
    <li id={`p${fila.id}`} className={`bg-white border ${borde} rounded-2xl p-4`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-bold tabular-nums text-[#16577F]">#{fila.id}</span>
        <span className={`px-2 py-0.5 rounded-full border font-bold ${PRIO[fila.prioridad] ?? PRIO.baja}`}>
          {PRIORIDADES[fila.prioridad as keyof typeof PRIORIDADES] ?? fila.prioridad}
        </span>
        <span className={`px-2 py-0.5 rounded-full border font-bold ${ESTADO[fila.estado] ?? ESTADO.por_probar}`}>
          {ESTADOS_PRUEBA[fila.estado as keyof typeof ESTADOS_PRUEBA] ?? fila.estado}
        </span>
        {fila.areas.map((a) => (
          <span key={a} className="px-2 py-0.5 rounded bg-[#F7F8F6] border border-[#E3E9F0] text-[#5C6B76] font-semibold">
            {AREAS[a as keyof typeof AREAS] ?? a}
          </span>
        ))}
        {recien && (
          <span className="ml-auto px-2 py-0.5 rounded bg-[#E8F6EF] text-[#107740] font-bold">Listo</span>
        )}
      </div>

      <h3 className="text-sm font-bold mt-2">{fila.titulo}</h3>
      {fila.detalle && (
        <p className="text-sm text-[#2b3945] mt-1 whitespace-pre-wrap">{fila.detalle}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#5C6B76] mt-2">
        <span>Lo hizo</span>
        <span className="font-bold px-2 py-0.5 rounded-full bg-[#F7F8F6] border border-[#E3E9F0]"
          style={{ color: color[fila.autor] }}>
          {quien(fila.autor)}
        </span>
        {fila.sesion && (
          <span className="px-2 py-0.5 rounded bg-[#EEF3F8] border border-[#E3E9F0] text-[#16577F] font-semibold">
            {fila.sesion}
          </span>
        )}
        {fila.pedidoPor && (
          <>
            <span>· por pedido de</span>
            <span className="font-bold px-2 py-0.5 rounded-full bg-[#F7F8F6] border border-[#E3E9F0]"
              style={{ color: color[fila.pedidoPor] }}>
              {quien(fila.pedidoPor)}
            </span>
          </>
        )}
        <span>·</span>
        <span className="tabular-nums">{cuando(fila.ts)}</span>
        {fila.version && (
          <>
            <span>·</span>
            <span className="tabular-nums">build {fila.version}</span>
          </>
        )}
      </div>

      {vueltas.length > 0 && (
        <ol className="mt-3 grid gap-1.5">
          {vueltas.map((v, i) => (
            <li key={v.id} className={`text-xs rounded-lg px-3 py-2 ${VUELTA[v.tipo] ?? VUELTA.nota}`}>
              <span className="font-bold tabular-nums">{fila.id}{letra(i)}</span>
              <span className="mx-1.5">·</span>
              <b>{TIPOS_DE_VUELTA[v.tipo as keyof typeof TIPOS_DE_VUELTA] ?? v.tipo}</b>
              {v.texto && <span className="whitespace-pre-wrap">: {v.texto}</span>}
              <span className="block text-[11px] mt-1 opacity-80">
                {quien(v.autor)}{v.sesion ? ` · ${v.sesion}` : ""} · {cuando(v.ts)}
                {v.version ? ` · build ${v.version}` : ""}
              </span>
              {v.autor === "fer" && (
                <details className="group mt-1.5">
                  <summary className={DESPLEGABLE_CHICO}>
                    ✎ Editar
                    <span className="text-[#5C6B76] text-[10px] transition group-open:rotate-180">▾</span>
                  </summary>
                  <form action={accionBorrarVuelta} className="mt-2">
                    <input type="hidden" name="vueltaId" value={v.id} />
                    <input type="hidden" name="id" value={fila.id} />
                    <input type="hidden" name="volverA" value={volverA} />
                    <button className={ICONO_BORRAR} aria-label={`Borrar la vuelta ${fila.id}${letra(i)}`}>🗑 Borrar esta vuelta</button>
                  </form>
                  <form action={accionEditarVuelta} className="mt-2 grid gap-2">
                    <input type="hidden" name="vueltaId" value={v.id} />
                    <input type="hidden" name="id" value={fila.id} />
                    <input type="hidden" name="volverA" value={volverA} />
                    <label>
                      <span className="sr-only">Texto de la vuelta {fila.id}{letra(i)}</span>
                      <textarea name="texto" required rows={3} maxLength={2000} defaultValue={v.texto ?? ""}
                        className="border border-[#E3E9F0] rounded-lg px-3 py-2 w-full text-sm bg-white text-[#1E2A32]" />
                    </label>
                    <button className={`${SUAVE} justify-self-start`}>Guardar</button>
                  </form>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap items-start gap-2 mt-3">
        {fila.estado === "por_probar" ? (
          <>
            <form action={accionMarcarPrueba}>
              <input type="hidden" name="id" value={fila.id} />
              <input type="hidden" name="marca" value="ok" />
              <input type="hidden" name="volverA" value={volverA} />
              <button className={VERDE}>✓ Anda</button>
            </form>
            <ConTexto fila={fila} marca="con_fallas" boton="✗ Falló" tono="falla"
              fondo="bg-[#FDF1EF] border border-[#EFD3CE]" rotulo="Qué pasó"
              placeholder="Qué hiciste, qué esperabas y qué salió" obligatorio volverA={volverA} />
            <ConTexto fila={fila} marca="observado" boton="👀 Observado" tono="observado"
              fondo="bg-[#FDF3DD] border border-[#F0DFAE]" rotulo="Qué observaste"
              placeholder="Anda, pero: un detalle chico" obligatorio volverA={volverA} />
          </>
        ) : (
          <form action={accionMarcarPrueba}>
            <input type="hidden" name="id" value={fila.id} />
            <input type="hidden" name="marca" value="por_probar" />
            <input type="hidden" name="volverA" value={volverA} />
            <button className={SUAVE}>↩ Volver a probar</button>
          </form>
        )}
        <ConTexto fila={fila} marca="nota" boton="💬 Nota" tono="nota"
          fondo="bg-[#F7F8F6] border border-[#E3E9F0]" rotulo="Qué querés dejar anotado"
          placeholder="Algo que viste, una duda, un pedido" obligatorio volverA={volverA} />
        {fila.autor === "fer" && (
          <form action={accionBorrarHilo} className="ml-auto">
            <input type="hidden" name="id" value={fila.id} />
            <input type="hidden" name="volverA" value={volverA} />
            <button className={BORRAR}>🗑 Borrar</button>
          </form>
        )}
      </div>
    </li>
  );
}

export default async function ParaProbar({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string; prioridad?: string; area?: string; quien?: string; ok?: string; error?: string;
  }>;
}) {
  if (!(await sosVos())) redirect("/");
  const sp = await searchParams;

  const [filas, autores] = await Promise.all([todasLasFilas(), losAutores()]);
  const color = Object.fromEntries(autores.map((a) => [a.slug, a.color]));
  const nombre = Object.fromEntries(autores.map((a) => [a.slug, a.nombre]));
  const activos = autores.filter((a) => a.activo);

  const estado = sp.estado === "todo" ? null : esEstadoPrueba(sp.estado) ? sp.estado : "por_probar";
  const filtro: Filtro = {
    estado,
    prioridad: esPrioridad(sp.prioridad) ? sp.prioridad : null,
    area: esArea(sp.area) ? sp.area : null,
    autor: activos.some((a) => a.slug === sp.quien) ? sp.quien! : null,
  };
  const vueltas = await vueltasDe(filas.map((f) => f.id));
  const lista = ordenar(filtrar(filas, filtro), vueltas);

  const deTodo = contar(filas);

  const con = (cambio: Partial<Record<"estado" | "prioridad" | "area" | "quien", string | null>>) => {
    const q = new URLSearchParams();
    const e = cambio.estado === undefined ? (estado ?? "todo") : cambio.estado;
    const p = cambio.prioridad === undefined ? filtro.prioridad : cambio.prioridad;
    const a = cambio.area === undefined ? filtro.area : cambio.area;
    const w = cambio.quien === undefined ? filtro.autor : cambio.quien;
    if (e && e !== "por_probar") q.set("estado", e);
    if (p) q.set("prioridad", p);
    if (a) q.set("area", a);
    if (w) q.set("quien", w);
    return q.size ? `/admin/para-probar?${q}` : "/admin/para-probar";
  };
  const aca = con({});
  const hayFiltro = Boolean(filtro.prioridad || filtro.area || filtro.autor);
  const delFiltro = contar(filtrar(filas, { ...filtro, estado: null }));
  const areasOfrecidas = areasConAlgo(filtrar(filas, { ...filtro, area: null }));
  const hayLaElegida = areasOfrecidas.some((a) => a.area === filtro.area);

  const campo = "border border-[#E3E9F0] rounded-lg px-3 py-2 w-full mt-1 text-sm bg-white";
  const rotulo = "text-xs text-[#5C6B76]";

  return (
    <main className="max-w-3xl mx-auto p-5">
      <header className="mt-2 mb-4">
        <Link href="/admin" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
        <h1 className="text-lg font-bold">Para probar</h1>
        <p className="text-xs text-[#5C6B76] mt-1">
          Todo lo que llegó a la app y todavía nadie abrió. Lo que se movió último, arriba. Cada hilo
          se marca acá mismo: anda, o falló y qué pasó. Lo que sigue cuelga del mismo número.
        </p>
      </header>

      <div className="mb-4">
        <Numeros n={deTodo} />
        {hayFiltro && (
          <>
            <p className="text-[10px] text-[#5C6B76] mt-1.5 mb-1">Con los filtros puestos</p>
            <Numeros n={delFiltro} tenue />
          </>
        )}
      </div>

      <details className="group mb-4">
        <summary className={DESPLEGABLE}>
          ＋ Cargar algo para probar
          <span className={FLECHA}>▾</span>
        </summary>
        <form action={accionCargarParaProbar}
          className="bg-white border border-[#E3E9F0] border-t-0 rounded-b-xl p-4 grid sm:grid-cols-4 gap-3">
          <input type="hidden" name="volverA" value={aca} />
          <label className="sm:col-span-3">
            <span className={rotulo}>Qué se hizo</span>
            <input name="titulo" required maxLength={200} className={campo}
              placeholder="En una línea" />
          </label>
          <label className="sm:col-span-1">
            <span className={rotulo}>Prioridad</span>
            <select name="prioridad" defaultValue="media" className={campo}>
              {Object.entries(PRIORIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="sm:col-span-4">
            <span className={rotulo}>Qué probar y dónde</span>
            <textarea name="detalle" rows={3} maxLength={2000} className={campo}
              placeholder="Qué abrir, qué hacer y qué tiene que pasar" />
          </label>
          <fieldset className="sm:col-span-3">
            <legend className={rotulo}>Qué parte toca</legend>
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(AREAS).map(([k, v]) => (
                <label key={k} className="inline-flex items-center gap-1.5 text-xs bg-[#F7F8F6] border border-[#E3E9F0] rounded-lg px-2 py-1.5">
                  <input type="checkbox" name="areas" value={k} />
                  {v}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="sm:col-span-1">
            <span className={rotulo}>Sesión</span>
            <input name="sesion" maxLength={120} className={campo} placeholder="opcional" />
            <span className={`${rotulo} block mt-2`}>Por pedido de</span>
            <select name="pedidoPor" defaultValue="fer" className={campo}>
              {activos.map((a) => <option key={a.slug} value={a.slug}>{a.nombre}</option>)}
            </select>
          </label>
          <div className="sm:col-span-4">
            <button className={`${VERDE} w-full py-2.5`}>Cargar</button>
          </div>
        </form>
      </details>

      {sp.error === "falta" && (
        <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-3">
          Falta el título. Sin eso el hilo no se encuentra nunca más.
        </p>
      )}
      {sp.error && sp.error !== "falta" && (
        <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-3">
          Para marcar #{sp.error} hay que escribir qué pasó.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Link href={con({ estado: "por_probar" })} className={chip(estado === "por_probar")}>Por probar</Link>
        <Link href={con({ estado: "con_fallas" })} className={chip(estado === "con_fallas")}>Con fallas</Link>
        <Link href={con({ estado: "observado" })} className={chip(estado === "observado")}>Observados</Link>
        <Link href={con({ estado: "ok" })} className={chip(estado === "ok")}>Anda</Link>
        <Link href={con({ estado: "todo" })} className={chip(estado === null)}>Todo</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-[11px] text-[#5C6B76]">Prioridad</span>
        <Link href={con({ prioridad: null })} className={chip(!filtro.prioridad)}>Todas</Link>
        {Object.entries(PRIORIDADES).map(([k, v]) => (
          <Link key={k} href={con({ prioridad: k })} className={chip(filtro.prioridad === k)}>{v}</Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[11px] text-[#5C6B76]">Lo hizo</span>
        <Link href={con({ quien: null })} className={chip(!filtro.autor)}>Todos</Link>
        {activos.map((a) => (
          <Link key={a.slug} href={con({ quien: a.slug })} className={chip(filtro.autor === a.slug)}>{a.nombre}</Link>
        ))}
        <form className="ml-auto" action="/admin/para-probar" method="get">
          {estado && estado !== "por_probar" && <input type="hidden" name="estado" value={estado} />}
          {estado === null && <input type="hidden" name="estado" value="todo" />}
          {filtro.prioridad && <input type="hidden" name="prioridad" value={filtro.prioridad} />}
          {filtro.autor && <input type="hidden" name="quien" value={filtro.autor} />}
          <label className="text-[11px] text-[#5C6B76] inline-flex items-center gap-2">
            Área
            <select name="area" defaultValue={filtro.area ?? ""}
              className="border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-xs bg-white text-[#16577F] font-bold">
              <option value="">Todas</option>
              {areasOfrecidas.map(({ area, cuantos }) => (
                <option key={area} value={area}>{AREAS[area]} ({cuantos})</option>
              ))}
              {filtro.area && !hayLaElegida && (
                <option value={filtro.area}>{AREAS[filtro.area]} (0)</option>
              )}
            </select>
          </label>
          <button className={`${SUAVE} ml-2`}>Ver</button>
        </form>
      </div>

      {lista.length === 0 ? (
        estado === "por_probar" && !hayFiltro ? (
          <TarjetaVacia emoji="✅" titulo="No queda nada por probar">
            Cada cosa que llega a la app deja un hilo acá. Cuando haya algo nuevo, aparece
            arriba con su prioridad.
          </TarjetaVacia>
        ) : (
          <TarjetaVacia emoji="🔍" titulo="Nada con estos filtros"
            salidas={[{ href: "/admin/para-probar", texto: "Ver lo que falta probar", principal: true }]}>
            Probá sacando un filtro, o mirá todo lo que queda por probar.
          </TarjetaVacia>
        )
      ) : (
        <ul className="grid gap-3">
          {lista.map((f) => (
            <Hilo key={f.id} fila={f} vueltas={vueltas.get(f.id) ?? []} color={color} nombre={nombre}
              volverA={aca} recien={sp.ok === String(f.id)} />
          ))}
        </ul>
      )}
    </main>
  );
}
