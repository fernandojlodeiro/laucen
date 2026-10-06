// Planes de cuotas de la tienda: se cargan en una familia (y los heredan sus
// subfamilias y productos) o en un producto puntual. Sin planes propios =
// hereda (planes_cuotas null). Forma: lib/tienda/cuotas.ts.

import { parametroBusqueda, sqlBusqueda } from "@/lib/busqueda";
import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Lapiz, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, CAMPO } from "@/app/componentes/erp";
import { arbolFamilias } from "./familias";
import EditorPlanes from "./EditorPlanes";
import { accionGuardarPlanes, accionHeredarPlanes } from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/cuotas";
type SP = { editar?: string; q?: string; ok?: string; error?: string };
type Plan = { cuotas: number; interes_pct: number };

const limpiar = (x: unknown): Plan[] | null =>
  Array.isArray(x) && x.length ? x.map((p) => ({ cuotas: Number(p?.cuotas), interes_pct: Number(p?.interes_pct ?? 0) })).filter((p) => p.cuotas >= 1) : null;

/** "3, 6 y 12 sin interés · 18 con 20 %" */
function textoPlanes(planes: Plan[]): string {
  const y = (xs: number[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs.at(-1)}` : String(xs[0]));
  const sin = planes.filter((p) => p.interes_pct === 0).map((p) => p.cuotas);
  const con = planes.filter((p) => p.interes_pct !== 0).map((p) => `${p.cuotas} con ${p.interes_pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`);
  return [sin.length ? `${y(sin)} sin interés` : null, ...con].filter(Boolean).join(" · ");
}

export default async function Cuotas({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("reglas_ver");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const editar = sp.editar ?? "";
  const aqui = url(BASE, { q });

  // Familias: lo propio de cada una y lo que hereda de la más cercana hacia arriba.
  const familias = await arbolFamilias(s.org.id);
  const porId = new Map(familias.map((f) => [f.id, f]));
  const efectivo = (famId: number | null): { planes: Plan[]; de: string } | null => {
    for (let f = famId != null ? porId.get(famId) : undefined, n = 0; f && n < 25; f = f.padre_id != null ? porId.get(f.padre_id) : undefined, n++) {
      const p = limpiar(f.planes);
      if (p) return { planes: p, de: f.nombre };
    }
    return null;
  };

  const productos = await consulta<{ id: number; sku: string; titulo: string; familia_id: number | null; planes: unknown }>(
    q ? `select id::int, sku_base sku, titulo, familia_id::int, planes_cuotas planes from producto
          where organizacion_id = $1 and estado <> 'archivado'
            and ${sqlBusqueda("$2", ["id::text", "sku_base", "titulo", "descripcion", "marca", "modelo", "linea", "codigo_barras", "garantia",
              "condicion", "categoria_ml", "tipo", "estado",
              { de: "select 1 from variacion v where v.producto_id = producto.id", campos: ["v.sku", "v.titulo", "v.codigo_barras"] }])}
          order by planes_cuotas is null, titulo limit 40`
      : `select id::int, sku_base sku, titulo, familia_id::int, planes_cuotas planes from producto
          where organizacion_id = $1 and planes_cuotas is not null order by titulo limit 100`,
    q ? [s.org.id, parametroBusqueda(q)] : [s.org.id]);

  const Planes = ({ propios, hereda }: { propios: Plan[] | null; hereda: { planes: Plan[]; de: string } | null }) =>
    propios ? <span className="font-semibold">{textoPlanes(propios)}</span>
      : hereda ? <span className="text-[#5C6B76]">Hereda de {hereda.de}: {textoPlanes(hereda.planes)}</span>
      : <span className="text-[#5C6B76]">Sin cuotas (un pago)</span>;

  const Editor = ({ cual, propios }: { cual: string; propios: Plan[] | null }) => (
    <form action={accionGuardarPlanes} className="grid gap-2">
      <input type="hidden" name="cual" value={cual} />
      <input type="hidden" name="q" value={q} />
      <EditorPlanes planes={propios ?? []} />
      <div className="flex flex-wrap gap-2">
        <button className={VERDE}>Guardar</button>
        {propios && <button formAction={accionHeredarPlanes} className={SUAVE}>Sacar los propios (heredar)</button>}
        <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
      </div>
    </form>
  );

  return (
    <Pantalla titulo="Cuotas" subtitulo="Planes de cuotas de la tienda web, por familia o por producto. Lo que no tiene planes propios hereda los de su familia." ancho="max-w-5xl">
      <Avisos sp={sp} />
      <h2 className="text-sm font-bold mb-2">Por familia</h2>
      <div className={`${CAJA_TABLA} mb-6`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Familia</th><th className={TH}>Planes</th><th /></tr></thead>
          <tbody>
            {familias.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Todavía no hay familias.</td></tr>}
            {familias.map((f) => {
              const propios = limpiar(f.planes);
              const sangria = { paddingLeft: `${0.5 + f.nivel * 1.25}rem` };
              return editar === `f${f.id}` ? (
                <tr key={f.id} className={`${TR} bg-[#FAFBFC]`}>
                  <td className={`${TD} font-semibold align-top`} style={sangria}>{f.nombre}</td>
                  <td colSpan={2} className={TD}><Editor cual={`f${f.id}`} propios={propios} /></td>
                </tr>
              ) : (
                <tr key={f.id} className={TR}>
                  <td className={TD} style={sangria}>{f.nivel > 0 && <span className="text-[#9AA7B3]">└ </span>}{f.nombre}</td>
                  <td className={TD}><Planes propios={propios} hereda={propios ? null : efectivo(f.padre_id)} /></td>
                  <td className={`${TD} text-right`}><Lapiz href={url(BASE, { q, editar: `f${f.id}` })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2">Por producto</h2>
      <form action={BASE} className="flex gap-2 mb-2">
        <input name="q" defaultValue={q} placeholder="Buscar por SKU o título" className={`${CAMPO} flex-1 max-w-sm`} />
        <button className={SUAVE}>Buscar</button>
        {q && <Link href={BASE} className={SUAVE}>Limpiar</Link>}
      </form>
      <p className="text-[11px] text-[#5C6B76] mb-2">{q ? `Resultados para "${q}".` : "Productos con planes propios. Buscá uno para cargarle planes."}</p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={TH}>Planes</th><th /></tr></thead>
          <tbody>
            {productos.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>{q ? "No encontré productos." : "Ningún producto tiene planes propios."}</td></tr>}
            {productos.map((p) => {
              const propios = limpiar(p.planes);
              return editar === `p${p.id}` ? (
                <tr key={p.id} className={`${TR} bg-[#FAFBFC]`}>
                  <td className={`${TD} font-mono align-top`}>{p.sku}</td>
                  <td className={`${TD} align-top`}>{p.titulo}</td>
                  <td colSpan={2} className={TD}><Editor cual={`p${p.id}`} propios={propios} /></td>
                </tr>
              ) : (
                <tr key={p.id} className={TR}>
                  <td className={`${TD} font-mono whitespace-nowrap`}>{p.sku}</td>
                  <td className={TD}>{p.titulo}</td>
                  <td className={TD}><Planes propios={propios} hereda={propios ? null : efectivo(p.familia_id)} /></td>
                  <td className={`${TD} text-right`}><Lapiz href={url(BASE, { q, editar: `p${p.id}` })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
