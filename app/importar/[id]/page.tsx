// Una importación: mapeo de columnas → campos, vista previa de las primeras
// 20 filas, ejecutar (de a lotes, con "Seguir") e informe de rechazadas.

import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta, una } from "@/lib/erp/base";
import { PRIMARIO, VERDE, SUAVE } from "@/app/botones";
import { BotonEnviar, TachoConfirmar } from "@/app/radar/Cliente";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, CAJA,
} from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { DESTINOS, ESTADOS_IMPORTACION, esDestino, faltanObligatorios } from "@/lib/importar/campos";
import type { Valor } from "@/lib/importar/leer";
import { accionGuardarMapeo, accionCargarMapeo, accionBorrarMapeo, accionEjecutar } from "./acciones";

export const dynamic = "force-dynamic";
// Ejecutar corre como acción de esta página: hasta 5 minutos por vuelta.
export const maxDuration = 300;

const POR_PAGINA = 50;

type SP = { pagina?: string; ok?: string; error?: string };

const mostrar = (v: Valor | undefined) => (v == null ? "" : typeof v === "number" ? v.toLocaleString("es-AR", { maximumFractionDigits: 4 }) : String(v));

export default async function Importacion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("importar_ver");
  const { id } = await params;
  const sp = await searchParams;
  const iid = Number(id);
  if (!Number.isInteger(iid) || iid <= 0) notFound();
  const imp = await una<{
    id: number; destino: string; archivo: string; hoja: string | null; columnas: string[]; mapeo: Record<string, string>;
    estado: keyof typeof ESTADOS_IMPORTACION; filas_total: number; creado_ts: Date; terminado_ts: Date | null;
  }>(`
    select id::int, destino, archivo, hoja, columnas, mapeo, estado, filas_total, creado_ts, terminado_ts
      from importacion where id = $1 and organizacion_id = $2`, [iid, s.org.id]);
  if (!imp || !esDestino(imp.destino)) notFound();
  const destino = DESTINOS[imp.destino];
  const cuenta = (await una<{ ok: number; err: number; pend: number }>(`
    select count(*) filter (where resultado = 'ok')::int ok, count(*) filter (where resultado = 'error')::int err,
           count(*) filter (where resultado is null)::int pend
      from importacion_fila where importacion_id = $1 and organizacion_id = $2`, [iid, s.org.id]))!;
  const empezada = cuenta.ok + cuenta.err > 0;
  const faltan = faltanObligatorios(imp.destino, imp.mapeo);
  const mapeados = destino.campos.filter((c) => imp.mapeo[c.clave]);
  const [texto, tono] = ESTADOS_IMPORTACION[imp.estado] ?? [imp.estado, "gris"];

  return (
    <Pantalla titulo={`Importar ${destino.nombre.toLowerCase()}`}
      subtitulo={<><Link href="/importar" className="text-[#16577F] hover:underline">← Importar datos</Link> · {imp.archivo}{imp.hoja ? ` · hoja ${imp.hoja}` : ""} · subido el {fechaHora(imp.creado_ts)}</>}
      acciones={<Estado texto={texto} tono={tono} />}>
      <Avisos sp={sp} />
      <p className="text-xs text-[#5C6B76] mb-3">{destino.ayuda}</p>

      {empezada
        ? <Informe iid={iid} cuenta={cuenta} terminado={imp.terminado_ts} pagina={Math.max(1, Number(sp.pagina) || 1)} org={s.org.id} mapeados={mapeados.map((c) => ({ etiqueta: c.etiqueta, col: imp.mapeo[c.clave] }))} />
        : <Mapeo iid={iid} org={s.org.id} imp={imp} faltan={faltan} />}
    </Pantalla>
  );
}

async function Mapeo({ iid, org, imp, faltan }: {
  iid: number; org: string; faltan: string[];
  imp: { destino: string; columnas: string[]; mapeo: Record<string, string>; filas_total: number };
}) {
  const destino = DESTINOS[imp.destino as keyof typeof DESTINOS];
  const [muestra, guardados] = await Promise.all([
    consulta<{ n: number; datos: Record<string, Valor> }>(
      "select n, datos from importacion_fila where importacion_id = $1 and organizacion_id = $2 order by n limit 20", [iid, org]),
    consulta<{ id: number; nombre: string }>(
      "select id::int, nombre from importacion_mapeo where organizacion_id = $1 and destino = $2 order by nombre", [org, imp.destino]),
  ]);
  const mapeados = destino.campos.filter((c) => imp.mapeo[c.clave]);
  const ejemplo = (col: string) => muestra.find((f) => f.datos[col] != null)?.datos[col];

  return (
    <>
      {guardados.length > 0 && (
        <div className={`${CAJA} mb-3`}>
          <p className="text-[11px] font-semibold text-[#5C6B76] mb-1.5">Mapeos guardados</p>
          <div className="flex flex-wrap gap-3">
            {guardados.map((g) => (
              <span key={g.id} className="inline-flex items-center gap-1">
                <form action={accionCargarMapeo}>
                  <input type="hidden" name="id" value={iid} /><input type="hidden" name="mapeo_id" value={g.id} />
                  <button className={SUAVE}>Cargar “{g.nombre}”</button>
                </form>
                <TachoConfirmar accion={accionBorrarMapeo} campos={{ id: String(iid), mapeo_id: String(g.id) }} pregunta="¿Borrar este mapeo?" />
              </span>
            ))}
          </div>
        </div>
      )}

      <form action={accionGuardarMapeo} className="mb-4">
        <input type="hidden" name="id" value={iid} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Campo del sistema</th><th className={TH}>Columna del archivo</th><th className={TH}>Ejemplo (primera fila con dato)</th></tr></thead>
            <tbody>
              {destino.campos.map((c) => {
                const col = imp.mapeo[c.clave];
                const ej = col ? ejemplo(col) : undefined;
                return (
                  <tr key={c.clave} className={TR}>
                    <td className={TD}>
                      <span className="font-semibold">{c.etiqueta}</span>
                      {c.obligatorio && <span className="text-[#C03420]" title="Obligatorio"> *</span>}
                      {c.ayuda && <div className="text-[10px] text-[#5C6B76]">{c.ayuda}</div>}
                    </td>
                    <td className={TD}>
                      <select name={`campo_${c.clave}`} defaultValue={col ?? ""} className={`${CAMPO} w-full max-w-64`} aria-label={c.etiqueta}>
                        <option value="">— no viene —</option>
                        {imp.columnas.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </td>
                    <td className={`${TD} text-[#5C6B76] max-w-64 truncate`}>{mostrar(ej)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button name="guardar" value="aplicar" className={PRIMARIO}>Aplicar y previsualizar</button>
          <span className="text-xs text-[#5C6B76] ml-2">o guardarlo para la próxima:</span>
          <input name="nombre_mapeo" placeholder="Nombre (ej. Virtual Seller ventas)" className={`${CAMPO} w-56`} />
          <button name="guardar" value="con_nombre" className={SUAVE}>Guardar con nombre</button>
        </div>
      </form>

      <h2 className="text-sm font-bold mb-2">Vista previa <span className="font-normal text-xs text-[#5C6B76]">(primeras {muestra.length} de {imp.filas_total.toLocaleString("es-AR")} filas, con el mapeo aplicado)</span></h2>
      {mapeados.length === 0 ? <p className="text-xs text-[#5C6B76] mb-4">Todavía no hay ningún campo mapeado.</p> : (
        <div className={`${CAJA_TABLA} mb-4`}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={THN}>Fila</th>{mapeados.map((c) => <th key={c.clave} className={TH}>{c.etiqueta}</th>)}</tr></thead>
            <tbody>
              {muestra.map((f) => (
                <tr key={f.n} className={TR}>
                  <td className={TDN}>{f.n}</td>
                  {mapeados.map((c) => {
                    const v = f.datos[imp.mapeo[c.clave]];
                    return <td key={c.clave} className={typeof v === "number" ? TDN : TD}>{mostrar(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {faltan.length > 0 ? (
        <p className="text-xs rounded-lg px-3 py-2 bg-[#FFF8E5] text-[#8a6100]">Para ejecutar falta mapear: {faltan.join(", ")}.</p>
      ) : (
        <form action={accionEjecutar} className="flex items-center gap-2">
          <input type="hidden" name="id" value={iid} />
          <BotonEnviar clase={VERDE} corriendo="Importando… (puede tardar unos minutos)">Ejecutar la importación</BotonEnviar>
          <span className="text-xs text-[#5C6B76]">Usa el mapeo aplicado (si cambiaste algo arriba, primero “Aplicar”).</span>
        </form>
      )}
    </>
  );
}

async function Informe({ iid, org, cuenta, terminado, pagina, mapeados }: {
  iid: number; org: string; cuenta: { ok: number; err: number; pend: number }; terminado: Date | null; pagina: number;
  mapeados: { etiqueta: string; col: string }[];
}) {
  const rechazadas = await consulta<{ n: number; motivo: string | null; datos: Record<string, Valor> }>(`
    select n, motivo, datos from importacion_fila
     where importacion_id = $1 and organizacion_id = $2 and resultado = 'error'
     order by n limit $3 offset $4`, [iid, org, POR_PAGINA, (pagina - 1) * POR_PAGINA]);
  const paginas = Math.max(1, Math.ceil(cuenta.err / POR_PAGINA));
  const ir = (p: number) => url(`/importar/${iid}`, { pagina: p > 1 ? p : null });
  const n = (x: number) => x.toLocaleString("es-AR");

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl">
        <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Importadas</div><div className="text-lg font-bold text-[#1F6E4A] tabular-nums text-right">{n(cuenta.ok)}</div></div>
        <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Rechazadas</div><div className="text-lg font-bold text-[#C03420] tabular-nums text-right">{n(cuenta.err)}</div></div>
        <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Pendientes</div><div className="text-lg font-bold tabular-nums text-right">{n(cuenta.pend)}</div></div>
      </div>
      {cuenta.pend > 0 ? (
        <form action={accionEjecutar} className="flex items-center gap-2 mb-4">
          <input type="hidden" name="id" value={iid} />
          <BotonEnviar clase={VERDE} corriendo="Importando… (puede tardar unos minutos)">Seguir</BotonEnviar>
          <span className="text-xs text-[#5C6B76]">Quedaron filas sin procesar: sigue desde donde quedó.</span>
        </form>
      ) : terminado && <p className="text-xs text-[#5C6B76] mb-4">Terminó el {fechaHora(terminado)}.</p>}

      <h2 className="text-sm font-bold mb-2">Filas rechazadas</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={THN}>Fila</th><th className={TH}>Motivo</th>{mapeados.map((m) => <th key={m.col + m.etiqueta} className={TH}>{m.etiqueta}</th>)}</tr>
          </thead>
          <tbody>
            {rechazadas.length === 0 && <tr><td colSpan={2 + mapeados.length} className={`${TD} text-[#5C6B76]`}>{cuenta.err ? "No hay más en esta página." : "Ninguna fila rechazada."}</td></tr>}
            {rechazadas.map((f) => (
              <tr key={f.n} className={TR}>
                <td className={TDN}>{f.n}</td>
                <td className={`${TD} text-[#C03420] min-w-48`}>{f.motivo}</td>
                {mapeados.map((m) => {
                  const v = f.datos[m.col];
                  return <td key={m.col + m.etiqueta} className={typeof v === "number" ? TDN : TD}>{mostrar(v)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <nav className="flex items-center justify-end gap-2 mt-2 text-xs text-[#5C6B76]">
          <span>Página {pagina} de {paginas}</span>
          {pagina > 1 && <Link href={ir(pagina - 1)} className={SUAVE}>← Anterior</Link>}
          {pagina < paginas && <Link href={ir(pagina + 1)} className={SUAVE}>Siguiente →</Link>}
        </nav>
      )}
    </>
  );
}
