// Etiquetas de ubicación: el código de la ubicación en grande con su código
// de barras, para pegar en las estanterías y escanearlo en la recepción.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, CAJA, CAMPO } from "@/app/componentes/erp";
import { GRANDE } from "../../formato";
import { PestanasEtiquetas, ElegirFormato } from "../piezas";

export const dynamic = "force-dynamic";

export default async function EtiquetasUbicaciones({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const s = await entrarErp("etiquetas_ver");
  const sp = await searchParams;
  const depositos = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo <> 'full_ml' order by id", [s.org.id]);
  const dep = depositos.find((d) => d.id === Number(sp.d)) ?? depositos[0];
  const ubicaciones = dep ? await consulta<{ id: number; codigo: string; descripcion: string | null; es_default: boolean }>(`
    select id::int, codigo, descripcion, es_default from ubicacion
     where organizacion_id = $1 and deposito_id = $2 and estado = 'activa' order by es_default desc, orden_recorrido, codigo`, [s.org.id, dep.id]) : [];

  return (
    <Pantalla titulo="Etiquetas" subtitulo="Para pegar en los productos y en las estanterías" ancho="max-w-2xl">
      <PestanasEtiquetas />
      {!dep ? (
        <p className="text-sm text-[#5C6B76]">No hay depósitos activos. Crealos en <Link href="/stock/depositos" className="underline">Stock → Depósitos</Link>.</p>
      ) : (
        <>
          {depositos.length > 1 && (
            <form className="flex gap-2 mb-4">
              <select name="d" defaultValue={dep.id} className={`${CAMPO} flex-1 text-base py-2.5`} aria-label="Depósito">
                {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <button className={`${SUAVE} ${GRANDE}`}>Ver</button>
            </form>
          )}
          <form action="/deposito/etiquetas/imprimir" target="_blank" className="space-y-4">
            <input type="hidden" name="tipo" value="ubicaciones" />
            <input type="hidden" name="d" value={dep.id} />
            <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0]">
              {ubicaciones.map((u) => (
                <li key={u.id}>
                  <label className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <input type="checkbox" name="u" value={u.id} className="h-5 w-5 accent-[#16577F]" />
                    <b>{u.codigo}</b>
                    <span className="text-xs text-[#5C6B76]">{u.es_default ? "la general" : u.descripcion}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className={CAJA}><ElegirFormato /></div>
            <div className="grid grid-cols-2 gap-2">
              <button className={`${PRIMARIO} ${GRANDE}`}>Las tildadas</button>
              <button name="todas" value="1" className={`${SUAVE} ${GRANDE}`}>Todas ({ubicaciones.length})</button>
            </div>
          </form>
        </>
      )}
    </Pantalla>
  );
}
