// Lo que la IA buscó en internet y nadie revisó todavía (lib/datos-internet.ts), con lo que preguntó el cliente, la
// certeza y las páginas de donde salió. «Pasar a datos técnicos» lo suma a los datos técnicos del producto; el tacho
// lo borra. En Preguntas y mensajes › Datos de internet (todos) y en la ficha del producto (los suyos).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { SUAVE } from "@/app/botones";
import { CAJA_TABLA, TABLA, THEAD, TH, TR, TD } from "@/app/componentes/erp";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { fechaHora } from "@/app/ventas/formato";
import { accionAprobarDatoWeb, accionBorrarDatoWeb } from "./acciones-datos-internet";

const CERTEZA: Record<string, string> = { seguro: "Seguro", duda: "Con duda", contradice: "No coinciden" };

type Fila = {
  id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null;
  pregunta: string; dato: string; certeza: string; fuentes: string[]; origen: string | null; creado_ts: Date;
};

export async function cuentaDatosInternet(org: string): Promise<number> {
  const r = await consulta<{ n: number }>("select count(*)::int n from producto_dato_web where organizacion_id = $1", [org]).catch(() => []);
  return r[0]?.n ?? 0;
}

export default async function DatosInternet({ org, productoId, volver }: { org: string; productoId?: number; volver: string }) {
  const filas = await consulta<Fila>(`
    select d.id::int, d.producto_id::int, pr.sku_base sku, pr.titulo, d.pregunta, d.dato, d.certeza, d.fuentes, d.origen, d.creado_ts,
           (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = pr.id) fotos
      from producto_dato_web d join producto pr on pr.id = d.producto_id
     where d.organizacion_id = $1 and ($2::bigint is null or d.producto_id = $2)
     order by d.creado_ts desc limit 200`, [org, productoId ?? null]);
  if (!filas.length) {
    return productoId ? null : <p className="text-xs text-[#5C6B76]">No hay datos de internet sin revisar.</p>;
  }
  return (
    <div className={CAJA_TABLA}>
      <table className={TABLA}>
        <thead className={THEAD}>
          <tr>
            {!productoId && <th className={TH}>Producto</th>}
            <th className={TH}>Lo que encontró</th>
            <th className={TH} title="Qué tan seguro es lo que encontró">Certeza</th>
            <th className={TH} />
            <th className={TH}>Lo que preguntaron</th>
            <th className={TH}>Fuentes</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id} className={TR}>
              {!productoId && (
                <td className={`${TD} max-w-80`}>
                  <div className="flex items-start gap-2">
                    <FotosProducto fotos={f.fotos} titulo={f.titulo} />
                    <div>
                      <Link href={`/catalogo/productos/${f.producto_id}`} className="font-mono text-[#16577F] hover:underline">{f.sku}</Link>
                      <TituloCorto titulo={f.titulo} />
                    </div>
                  </div>
                </td>
              )}
              <td className={`${TD} max-w-96 whitespace-pre-wrap`}>{f.dato}</td>
              <td className={`${TD} whitespace-nowrap`}>{CERTEZA[f.certeza] ?? f.certeza}</td>
              <td className={TD}>
                <div className="flex items-center gap-1">
                  <form action={accionAprobarDatoWeb}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="volver" value={volver} />
                    <button className={`${SUAVE} whitespace-nowrap`} title="Lo suma al final de los datos técnicos del producto">Pasar a datos técnicos</button>
                  </form>
                  <TachoConfirmar accion={accionBorrarDatoWeb} campos={{ id: String(f.id), volver }} pregunta="¿Borrar?" />
                </div>
              </td>
              <td className={`${TD} max-w-80 text-[#5C6B76]`}>
                <span className="line-clamp-2" title={f.pregunta}>{f.pregunta}</span>
                <span className="block text-[10px]">{f.origen ?? ""} · {fechaHora(f.creado_ts)}</span>
              </td>
              <td className={`${TD} whitespace-nowrap`}>
                {f.fuentes.map((u, i) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block text-[#16577F] hover:underline" title={u}>
                    {(() => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return `fuente ${i + 1}`; } })()} ↗
                  </a>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
