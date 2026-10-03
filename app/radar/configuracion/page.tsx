import Link from "next/link";
import CampoNumero from "@/app/componentes/CampoNumero";
import { sesionRequerida, puede } from "@/lib/tenancy";
import { sosVos } from "@/lib/admin";
import { asegurarEsquema } from "@/lib/radar/esquema";
import { ZONA, fechaCorta, semanaDe } from "@/lib/radar/base";
import { FUENTES_APIFY, configDe } from "@/lib/radar/config";
import { estadoDelArbol } from "@/lib/radar/categorias";
import { situacionDelArbol, ultimosProcesos } from "@/lib/radar/procesos";
import { cuentaDe } from "@/lib/meli";
import { SUAVE, VERDE } from "@/app/botones";
import { accionCorrerAhora, accionGuardarConfig } from "../actions";
import { Aviso } from "../Piezas";
import { BotonConfirmar, BotonEnviar } from "../Cliente";

export const dynamic = "force-dynamic";
// "Correr ahora" espera al proceso (hasta ~4 min).
export const maxDuration = 300;

const campo = "border border-[#E3E9F0] rounded-lg px-2 py-1.5 text-sm";

function Fila({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div className="grid sm:grid-cols-[220px_1fr] gap-2 py-3 border-b last:border-0 border-[#E3E9F0]">
      <div>
        <p className="text-sm font-semibold">{titulo}</p>
        {ayuda && <p className="text-[11px] text-[#5C6B76]">{ayuda}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">{children}</div>
    </div>
  );
}

function Frecuencia({ prefijo, cada, unidad, desde, editando }: { prefijo: string; cada: number; unidad: string; desde: string; editando: boolean }) {
  if (!editando) {
    return <span>cada <b className="tabular-nums">{cada}</b> {unidad === "meses" ? "meses" : "días"}, comenzando el {desde ? desde.split("-").reverse().join("/") : "—"}</span>;
  }
  return (
    <>
      <span>cada</span>
      <CampoNumero name={`${prefijo}_cada`} valor={cada} tipo="entero" className={`${campo} w-20`} />
      <select name={`${prefijo}_unidad`} defaultValue={unidad} className={campo}>
        <option value="dias">días</option>
        <option value="meses">meses</option>
      </select>
      <span>comenzando el</span>
      <input name={`${prefijo}_desde`} type="date" defaultValue={desde} className={campo} />
    </>
  );
}

const hora = (d: Date | null) => d ? d.toLocaleString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function Configuracion({ searchParams }: { searchParams: Promise<{ ok?: string; editar?: string }> }) {
  await asegurarEsquema();
  const sesion = await sesionRequerida();
  const sp = await searchParams;
  if (!(await puede("radar_ver"))) return <Aviso tipo="error">No tenés permiso para ver el Radar.</Aviso>;
  const puedeConfigurar = await puede("radar_configurar");
  // Abre en vista (AGENTS.md); el lápiz la pasa a edición (?editar=ficha) y "Grabar" queda arriba a la derecha.
  const editando = puedeConfigurar && sp.editar === "ficha";

  const [c, arbol, procesos, cuenta, esFer, situacion] = await Promise.all([
    configDe(sesion.org.id), estadoDelArbol(), ultimosProcesos(sesion.org.id, 12), cuentaDe(sesion.org.id), sosVos(),
    situacionDelArbol(),
  ]);
  const arbolCompleto = arbol.total > 0 && arbol.pendientes === 0;

  return (
    <div className="grid gap-6">
      {sp.ok === "guardado" && <Aviso tipo="ok">Configuración guardada.</Aviso>}
      {sp.ok === "corrido" && <Aviso tipo="ok">Proceso corrido. El resultado está abajo, en “Últimas corridas”.</Aviso>}
      {!cuenta && (
        <Aviso tipo="error">
          Esta organización no tiene cuenta de Mercado Libre conectada; se usa la de otra organización si la hay.
          {esFer && <> Conectala en <Link href="/admin/meli" className="underline">Mercado Libre</Link>.</>}
        </Aviso>
      )}

      <form id="ficha" action={accionGuardarConfig} className="border border-[#E3E9F0] rounded-lg bg-white px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
          <h2 className="text-sm font-bold">Configuración</h2>
          {puedeConfigurar ? (
            <span className="inline-flex gap-2">
              {editando ? (
                <>
                  <button className={VERDE}>Grabar</button>
                  <Link href="/radar/configuracion" className={SUAVE} scroll={false}>Cancelar</Link>
                </>
              ) : (
                <Link href="/radar/configuracion?editar=ficha" scroll={false} aria-label="Editar" title="Editar"
                  className="inline-block text-sm leading-none rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0] text-[#16577F]">✏️</Link>
              )}
            </span>
          ) : <span className="text-xs text-[#5C6B76]">No tenés permiso para cambiar la configuración.</span>}
        </div>
        <fieldset disabled={!editando}>
          <Fila titulo="Tope de gasto en Apify" ayuda="Por semana, sumando búsquedas a mano y automáticas. Al llegar, no corre más hasta el lunes.">
            {editando ? (
              <>
                <span>USD</span>
                <CampoNumero name="tope" valor={c.topeSemanalUsd} tipo="usd" className={`${campo} w-24`} />
                <span>por semana</span>
              </>
            ) : <span>USD <b className="tabular-nums">{c.topeSemanalUsd}</b> por semana</span>}
          </Fila>
          <Fila titulo="Leer tendencias" ayuda="La general y las de tus categorías seguidas (gratis). Mercado Libre las cambia una vez por semana.">
            <Frecuencia prefijo="tendencias" cada={c.tendenciasCada} unidad={c.tendenciasUnidad} desde={c.tendenciasDesde} editando={editando} />
          </Fila>
          <Fila titulo="Actualizar el árbol de categorías" ayuda="Relee todas las categorías de Mercado Libre (gratis, tarda). Casi no cambia.">
            <Frecuencia prefijo="arbol" cada={c.arbolCada} unidad={c.arbolUnidad} desde={c.arbolDesde} editando={editando} />
          </Fila>
          <Fila titulo="Profundizar" ayuda="En las categorías con “Profundizar” prendido: cuántas palabras de cada grupo se buscan con Apify.">
            {editando
              ? <CampoNumero name="palabras" valor={c.palabrasAProfundizar} tipo="entero" className={`${campo} w-20`} />
              : <b className="tabular-nums">{c.palabrasAProfundizar}</b>}
            <span>primeras de cada grupo (× 2 grupos: más deseadas y más populares)</span>
          </Fila>
          <Fila titulo="Fuente de Apify" ayuda="Para “Mejorar con Apify” y para profundizar.">
            {editando ? (
              <select name="fuente" defaultValue={c.fuenteApify} className={campo}>
                {Object.entries(FUENTES_APIFY).map(([k, f]) => (
                  <option key={k} value={k}>{f.label} · ~USD {f.costoPorPalabra.toFixed(2)} por palabra</option>
                ))}
              </select>
            ) : (() => {
              const f = FUENTES_APIFY[c.fuenteApify as keyof typeof FUENTES_APIFY];
              return <span>{f ? `${f.label} · ~USD ${f.costoPorPalabra.toFixed(2)} por palabra` : c.fuenteApify}</span>;
            })()}
          </Fila>
          <Fila titulo="Mostrar las que salieron" ayuda="Las palabras que estaban la semana anterior y ya no.">
            {editando ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" name="mostrar_salieron" defaultChecked={c.mostrarSalieron} className="h-4 w-4" />
                <span>Mostrarlas</span>
              </label>
            ) : <span>{c.mostrarSalieron ? "Sí, mostrarlas" : "No"}</span>}
          </Fila>
        </fieldset>
      </form>

      <section className="border border-[#E3E9F0] rounded-lg bg-white p-4">
        <h2 className="text-sm font-bold mb-1">Procesos</h2>
        <p className="text-xs text-[#5C6B76] mb-3">
          El disparador corre todos los días a las 8:00 y hace lo que toque según lo de arriba.
        </p>
        {arbolCompleto ? (
          <Aviso tipo="ok">
            ✅ Árbol completo: <b>{arbol.total.toLocaleString("es-AR")}</b> categorías
            {situacion.completoEl && <>, al {fechaCorta(situacion.completoEl)}</>}.
            {situacion.refrescando && <> Se está releyendo{situacion.faltan != null && <> (faltan {situacion.faltan.toLocaleString("es-AR")})</>}; mientras tanto se usa el que está.</>}
          </Aviso>
        ) : (
          <Aviso tipo="info">
            {arbol.total === 0
              ? "El árbol de categorías todavía no se cargó."
              : <>Cargando el árbol: van <b>{arbol.total.toLocaleString("es-AR")}</b> categorías, faltan leer <b>{arbol.pendientes.toLocaleString("es-AR")}</b> (el total crece a medida que aparecen subcategorías).</>}
          </Aviso>
        )}
        {puedeConfigurar && (
          <div className="flex flex-wrap gap-2 mb-4">
            <form action={accionCorrerAhora}>
              <input type="hidden" name="tipo" value="tendencias" />
              <BotonEnviar clase={VERDE} corriendo="Corriendo…">Leer tendencias ahora</BotonEnviar>
            </form>
            {arbolCompleto ? (
              <BotonConfirmar accion={accionCorrerAhora} campos={{ tipo: "arbol" }} clase={SUAVE} texto="Releer el árbol ahora"
                pregunta={`¿Releer las ${arbol.total.toLocaleString("es-AR")} categorías? Casi nunca hace falta.`}
                corriendo="Releyendo… (hasta 4 min)" />
            ) : (
              <form action={accionCorrerAhora}>
                <input type="hidden" name="tipo" value="arbol" />
                <BotonEnviar clase={SUAVE} corriendo="Cargando… (hasta 4 min)">Seguir cargando el árbol</BotonEnviar>
              </form>
            )}
          </div>
        )}
        <h3 className="text-xs font-bold text-[#5C6B76] mb-1">Últimas corridas</h3>
        {procesos.length === 0 && <p className="text-xs text-[#9AA7B3]">Todavía no corrió ninguno.</p>}
        <table className="w-full text-xs">
          <tbody>
            {procesos.map((p) => (
              <tr key={p.id} className="border-t border-[#E3E9F0] align-top">
                <td className="py-1 pr-2 whitespace-nowrap">{hora(p.empezo)}</td>
                <td className="py-1 pr-2">{p.tipo === "arbol" ? "Árbol" : "Tendencias"}{p.origen === "manual" && " (a mano)"}</td>
                <td className={`py-1 pr-2 font-bold ${p.estado === "ok" ? "text-[#1F6E4A]" : p.estado === "fallo" ? "text-[#C03420]" : "text-[#8a6100]"}`}>
                  {{ ok: "completo", parcial: "parcial (sigue mañana)", fallo: "falló", corriendo: "corriendo" }[p.estado] ?? p.estado}
                </td>
                <td className="py-1 text-[#5C6B76] break-all">{resumen(p.tipo, p.detalle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-[11px] text-[#9AA7B3]">Semana actual: desde el lunes {fechaCorta(semanaDe())}.</p>
    </div>
  );
}

function resumen(tipo: string, d: unknown): string {
  const x = (d ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (x.error) return String(x.error).slice(0, 160);
  if (tipo === "arbol") return `${x.leidas ?? 0} leídas · ${x.pendientes ?? "?"} pendientes de ${x.total ?? "?"}`;
  const t = x.tendencias ?? {}, p = x.profundizar ?? {};
  return `${t.leidas ?? 0} categorías leídas${t.fallidas?.length ? ` (${t.fallidas.length} fallaron)` : ""} · profundizar: ${p.hechas ?? 0}/${p.pedidas ?? 0}${p.tope ? " · tope de gasto alcanzado" : ""}`;
}
