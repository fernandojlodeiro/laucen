// Rubros guardados: grupos de NCM que después se usan como filtro. Se arman
// buscando en el nomenclador por texto y tildando posiciones (o desde la
// ficha de un importador: "agregar sus NCM a un rubro").

import Link from "next/link";
import { pool } from "@/db";
import { tienePermiso } from "@/lib/permisos";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { accionAgregarNcm, accionBorrarRubro, accionCrearRubro, accionQuitarNcm, accionRenombrarRubro } from "../actions";
import { CAJA_TABLA, CAMPO, TABLA, TD, THEAD, TR, entrar } from "../Piezas";

export const dynamic = "force-dynamic";

type Params = { r?: string; editar?: string; q?: string; error?: string };

const ERRORES: Record<string, string> = {
  permiso: "No tenés permiso para armar rubros.",
  nombre: "El rubro necesita un nombre.",
  rubro: "Ese rubro no existe.",
};

const LAPIZ = "text-sm leading-none rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0] text-[#16577F]";

export default async function Rubros({ searchParams }: { searchParams: Promise<Params> }) {
  const sesion = await entrar();
  const org = sesion.org.id;
  const puedeEditar = tienePermiso(sesion.permisos, "importaciones_rubros");
  const sp = await searchParams;
  const elegido = sp.r ? Number(sp.r) : undefined;
  const editar = sp.editar ? Number(sp.editar) : undefined;
  const q = sp.q?.trim() ?? "";

  const rubros = (await pool.query<{ id: number; nombre: string; ncms: number }>(`
    select r.id::int, r.nombre, count(rn.ncm)::int ncms
      from rubros r left join rubro_ncm rn on rn.rubro_id = r.id
     where r.organizacion_id = $1 group by r.id order by r.nombre`, [org])).rows;
  const actual = rubros.find((r) => r.id === elegido);
  const suyas = actual ? (await pool.query<{ ncm: string; descripcion: string | null }>(`
    select rn.ncm, x.descripcion_completa descripcion
      from rubro_ncm rn left join ref_ncm_vigente x on x.codigo = rn.ncm
     where rn.rubro_id = $1 order by rn.ncm`, [actual.id])).rows : [];
  const yaEsta = new Set(suyas.map((x) => x.ncm));

  let encontradas: { codigo: string; tipo: string | null; nivel: number | null; descripcion: string | null; descripcion_completa: string | null }[] = [];
  if (q) {
    const palabras = q.split(/\s+/).filter(Boolean).slice(0, 6);
    const valores: string[] = [];
    const cond = palabras.map((p) => {
      valores.push(`%${p}%`);
      return `(x.descripcion_completa ilike $${valores.length} or x.codigo like $${valores.length})`;
    });
    encontradas = (await pool.query(`
      select codigo, tipo, nivel, descripcion, descripcion_completa from ref_ncm_vigente x
       where ${cond.join(" and ")} order by codigo limit 200`, valores)).rows;
  }
  const hayNomenclador = q ? true : !!(await pool.query("select 1 from ref_ncm_vigente limit 1")).rowCount;
  const aqui = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ r: elegido, q: q || undefined, ...extra })) if (v !== undefined) p.set(k, String(v));
    return `/importaciones/rubros?${p}`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
      <section>
        {sp.error && ERRORES[sp.error] && <p className="text-xs text-[#C03420] mb-2">{ERRORES[sp.error]}</p>}
        <h2 className="text-sm font-bold mb-2">Mis rubros</h2>
        <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0] mb-3">
          {rubros.length === 0 && <li className="px-3 py-3 text-xs text-[#5C6B76]">Todavía no hay rubros.</li>}
          {rubros.map((r) => (
            <li key={r.id} className={`px-3 py-2 text-xs flex items-center gap-2 ${r.id === elegido ? "bg-[#EEF3F8]" : ""}`}>
              {editar === r.id && puedeEditar ? (
                <form action={accionRenombrarRubro} className="flex gap-1 w-full">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="nombre" defaultValue={r.nombre} className={`${CAMPO} flex-1`} autoFocus />
                  <button className={VERDE}>Guardar</button>
                  <Link href={aqui({ r: r.id })} className={SUAVE}>Cancelar</Link>
                </form>
              ) : (
                <>
                  <Link href={aqui({ r: r.id })} className="flex-1 font-semibold text-[#16577F]">{r.nombre}</Link>
                  <span className="text-[#5C6B76]">{r.ncms} NCM</span>
                  {puedeEditar && <Link href={aqui({ r: r.id, editar: r.id })} className={LAPIZ} aria-label="Cambiar el nombre">✏️</Link>}
                  {puedeEditar && <TachoConfirmar accion={accionBorrarRubro} campos={{ id: String(r.id) }} pregunta="¿Borrar?" />}
                </>
              )}
            </li>
          ))}
        </ul>
        {puedeEditar && (
          <form action={accionCrearRubro} className="flex gap-1">
            <input name="nombre" placeholder="Rubro nuevo" className={`${CAMPO} flex-1`} />
            <button className={PRIMARIO}>Crear</button>
          </form>
        )}
      </section>

      <section className="min-w-0">
        {actual && (
          <div className="mb-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-bold">{actual.nombre}</h2>
              <Link href={`/importaciones?rubro=${actual.id}`} className={PRIMARIO}>Buscar con este rubro</Link>
            </div>
            <div className={CAJA_TABLA}>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className="text-left px-2 py-1.5">NCM</th><th className="text-left px-2 py-1.5">Descripción</th><th /></tr></thead>
                <tbody>
                  {suyas.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Sin NCM todavía: buscá abajo y tildá.</td></tr>}
                  {suyas.map((x) => (
                    <tr key={x.ncm} className={TR}>
                      <td className={`${TD} whitespace-nowrap`}><Link href={`/importaciones/ncm?c=${encodeURIComponent(x.ncm)}`} className="text-[#16577F] underline">{x.ncm}</Link></td>
                      <td className={`${TD} text-[#5C6B76]`}>{x.descripcion ?? "(no está en el nomenclador)"}</td>
                      <td className={`${TD} text-right`}>{puedeEditar && <TachoConfirmar accion={accionQuitarNcm} campos={{ rubro: String(actual.id), ncm: x.ncm }} pregunta="¿Quitar?" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#5C6B76] mt-1">Una partida o prefijo (ej. 85.16) incluye todas las NCM que empiezan así.</p>
          </div>
        )}

        <h2 className="text-sm font-bold mb-2">Buscar en el nomenclador</h2>
        <form className="flex gap-1 mb-2">
          {elegido !== undefined && <input type="hidden" name="r" value={elegido} />}
          <input name="q" defaultValue={q} placeholder="ej. calentador, radiador, 8516.29" className={`${CAMPO} flex-1`} />
          <button className={SUAVE}>Buscar</button>
        </form>
        {!hayNomenclador && <p className="text-xs text-[#5C6B76]">El nomenclador (arancel.zip) todavía no está cargado: ver la pestaña Cargas.</p>}
        {q && (
          <form action={actual ? accionAgregarNcm : accionCrearRubro}>
            {actual && <input type="hidden" name="rubro" value={actual.id} />}
            {actual && <input type="hidden" name="volver" value={aqui({})} />}
            <div className={`${CAJA_TABLA} max-h-[28rem] overflow-y-auto`}>
              <table className={TABLA}>
                <tbody>
                  {encontradas.length === 0 && <tr><td className={`${TD} text-[#5C6B76]`}>Nada con ese texto.</td></tr>}
                  {encontradas.map((x) => (
                    <tr key={x.codigo} className={TR}>
                      <td className={`${TD} w-6`}>
                        <input type="checkbox" name="ncm" value={x.codigo} defaultChecked={yaEsta.has(x.codigo)} disabled={yaEsta.has(x.codigo) || !puedeEditar}
                          className="h-4 w-4 accent-[#16577F]" aria-label={`Tildar ${x.codigo}`} />
                      </td>
                      <td className={`${TD} whitespace-nowrap font-mono`} style={{ paddingLeft: `${(x.nivel ?? 1) * 6}px` }}>{x.codigo}</td>
                      <td className={TD}>
                        <span className={x.tipo === "partida" ? "font-bold" : ""}>{x.descripcion}</span>
                        {x.descripcion_completa && x.descripcion_completa !== x.descripcion && (
                          <span className="block text-[10px] text-[#5C6B76]">{x.descripcion_completa}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {puedeEditar && encontradas.length > 0 && (
              <div className="flex gap-2 mt-2 items-center">
                {actual ? (
                  <button className={VERDE}>Agregar las tildadas a “{actual.nombre}”</button>
                ) : (
                  <>
                    <input name="nombre" placeholder="Nombre del rubro nuevo" className={CAMPO} />
                    <button className={VERDE}>Crear rubro con las tildadas</button>
                  </>
                )}
              </div>
            )}
            {encontradas.length === 200 && <p className="text-[11px] text-[#5C6B76] mt-1">Se muestran las primeras 200: afiná la búsqueda.</p>}
          </form>
        )}
      </section>
    </div>
  );
}
