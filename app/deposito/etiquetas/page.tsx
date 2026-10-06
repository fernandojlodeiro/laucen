// Etiquetas de producto: buscar variaciones (o llegar con ?v=<id> desde la
// ficha), elegir cuántas de cada una, el formato y si llevan precio, y
// abrir la página para imprimir.

import { consulta } from "@/lib/erp/base";
import { listasDePrecios } from "@/lib/precios";
import { PRIMARIO, SUAVE } from "@/app/botones";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { GRANDE } from "../formato";
import { PestanasEtiquetas, ElegirFormato } from "./piezas";
import { verInactivos, MostrarInactivos } from "@/app/componentes/Inactivos";
import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import { camposVariacionYProducto } from "@/app/catalogo/busqueda";

export const dynamic = "force-dynamic";

type SP = { q?: string; v?: string; inactivos?: string };

export default async function EtiquetasProductos({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("etiquetas_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const v = Number(sp.v) || 0;
  type Hallada = { id: number; sku: string; titulo: string; codigo_barras: string | null };
  const buscar = (inactivos: boolean) => consulta<Hallada>(`
      select v.id::int, v.sku, titulo_variacion(v.id) titulo, v.codigo_barras
        from variacion v join producto p on p.id = v.producto_id
       where v.organizacion_id = $1 and v.estado <> 'archivada' and not es_kit(v.id)
         -- Inactivos sólo con la caja tildada (o si se llegó con ?v= desde la ficha).
         and ($4 or v.id = $2 or p.estado <> 'archivado')
         and (v.id = $2 or ($3 <> '' and (v.codigo_barras = $3 or ${sqlBusqueda("$5", ["titulo_variacion(v.id)", ...camposVariacionYProducto("v", "p")])})))
       order by v.id = $2 desc, v.sku limit 60`, [s.org.id, v, q, inactivos, parametroBusqueda(q)]);
  // Regla de inactivos (Fer): con algo escrito y la caja apagada, si ningún activo
  // coincide pero sí alguno inactivo, se muestran los inactivos igual.
  const buscarConRegla = async () => {
    const filas = await buscar(verInactivos(sp));
    return filas.length || !q || verInactivos(sp) ? filas : buscar(true);
  };
  const [variaciones, listas] = await Promise.all([
    q || v ? buscarConRegla() : Promise.resolve([] as Hallada[]),
    listasDePrecios(s.org.id),
  ]);
  const activas = listas.filter((l) => l.estado === "activa");
  // Con ?v= o una sola coincidencia, ya viene con 1 etiqueta.
  const porDefecto = (id: number) => (id === v || variaciones.length === 1 ? 1 : 0);

  return (
    <Pantalla titulo="Etiquetas" subtitulo="Para pegar en los productos y en las estanterías" ancho="max-w-2xl">
      <PestanasEtiquetas />
      <form className="flex flex-wrap items-center gap-2 mb-4">
        <input name="q" defaultValue={q} placeholder="SKU, título o código de barras" className={`${CAMPO} flex-1 text-base py-2.5`} autoFocus={!v} />
        <MostrarInactivos activo={verInactivos(sp)} />
        <button className={`${SUAVE} ${GRANDE}`}>Buscar</button>
      </form>

      {(q || v) && variaciones.length === 0 && <p className="text-sm text-[#5C6B76]">No encontré productos con eso.</p>}

      {variaciones.length > 0 && (
        <form action="/deposito/etiquetas/imprimir" target="_blank" className="space-y-4">
          <input type="hidden" name="tipo" value="productos" />
          <ul className="bg-white border border-[#E3E9F0] rounded-xl divide-y divide-[#E3E9F0]">
            {variaciones.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1 min-w-0">
                  <b className="break-all">{x.sku}</b> <span className="text-xs">{x.titulo}</span>
                  <span className="block text-[11px] text-[#5C6B76]">{x.codigo_barras ?? "sin código de barras: va el SKU"}</span>
                </span>
                <label className="shrink-0 text-right">
                  <span className="block text-[10px] text-[#5C6B76]">Etiquetas</span>
                  <CampoNumero name={`c_${x.id}`} valor={porDefecto(x.id)} tipo="entero" className={`${CAMPO} w-16 text-base`} />
                </label>
              </li>
            ))}
          </ul>

          <div className={`${CAJA} space-y-3`}>
            <ElegirFormato />
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="precio" value="1" className="h-5 w-5 accent-[#16577F]" disabled={!activas.length} />Con precio
              </label>
              <label className="flex-1 min-w-40">
                <span className={ETIQUETA}>De la lista</span>
                <select name="lista" className={`${CAMPO} w-full text-base py-2`} disabled={!activas.length}>
                  {activas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
            </div>
            {!activas.length && <p className="text-[11px] text-[#5C6B76]">No hay listas de precios activas: las etiquetas van sin precio.</p>}
          </div>
          <button className={`${PRIMARIO} ${GRANDE} w-full`}>Ver para imprimir</button>
        </form>
      )}
    </Pantalla>
  );
}
