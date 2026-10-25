// Lo que la IA buscó en internet y agregó sola a los datos técnicos de un producto (lib/datos-internet.ts), lo más
// nuevo primero: lo que preguntaron, lo que agregó, la certeza y las páginas de donde salió. El lápiz abre la ficha
// del producto en edición para corregirlo. En Preguntas y mensajes › Datos de internet.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada } from "@/lib/lista";
import { CAJA_TABLA, TABLA, THEAD, TH, TR, TD, Lapiz } from "@/app/componentes/erp";
import { Paginado } from "@/app/componentes/Lista";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { fechaHora } from "@/app/ventas/formato";

const CERTEZA: Record<string, string> = { seguro: "Seguro", duda: "Con duda", contradice: "No coinciden" };

type Fila = {
  id: number; producto_id: number; sku: string; titulo: string; fotos: string[] | null;
  pregunta: string; dato: string; certeza: string; fuentes: string[]; origen: string | null; creado_ts: Date;
};

export async function cuentaDatosInternet(org: string): Promise<number> {
  const r = await consulta<{ n: number }>("select count(*)::int n from producto_dato_web where organizacion_id = $1", [org]).catch(() => []);
  return r[0]?.n ?? 0;
}

export default async function DatosInternet({ org, sp }: { org: string; sp: { p?: string } }) {
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `d.id::int, d.producto_id::int, pr.sku_base sku, pr.titulo, d.pregunta, d.dato, d.certeza, d.fuentes, d.origen, d.creado_ts,
             (select array_agg(pf.url order by pf.orden) from producto_foto pf where pf.producto_id = pr.id) fotos`,
    desde: "producto_dato_web d join producto pr on pr.id = d.producto_id",
    donde: "d.organizacion_id = $1",
    orden: "d.creado_ts desc, d.id desc",
  }, [org], sp);
  if (!total) return <p className="text-xs text-[#5C6B76]">La IA todavía no buscó nada en internet.</p>;
  return (
    <>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Producto</th>
              <th className={TH}>Lo que agregó</th>
              <th className={TH} title="Qué tan seguro es lo que encontró">Certeza</th>
              <th className={TH}>Lo que preguntaron</th>
              <th className={TH}>Fuentes</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className={TR}>
                <td className={`${TD} max-w-80`}>
                  <div className="flex items-start gap-2">
                    <FotosProducto fotos={f.fotos} titulo={f.titulo} />
                    <div>
                      <span className="inline-flex items-center gap-1">
                        <Link href={`/catalogo/productos/${f.producto_id}`} className="font-mono text-[#16577F] hover:underline" title="Abrir la ficha del producto">{f.sku}</Link>
                        <Lapiz href={`/catalogo/productos/${f.producto_id}?editar=ficha`} etiqueta="Editar el producto (datos técnicos para la IA)" />
                      </span>
                      <TituloCorto titulo={f.titulo} />
                    </div>
                  </div>
                </td>
                <td className={`${TD} max-w-96 whitespace-pre-wrap`}>{f.dato}</td>
                <td className={`${TD} whitespace-nowrap`}>{CERTEZA[f.certeza] ?? f.certeza}</td>
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
      <Paginado total={total} />
    </>
  );
}
