// La página para imprimir etiquetas (de producto o de ubicación). El marco
// del sistema la envuelve como a todas, así que al imprimir se esconde con
// CSS (@media print) y la hoja queda sólo con las etiquetas:
// - térmica: una etiqueta de 50×25 mm por hoja;
// - A4: grilla de 3×8 (70×37 mm cada una).
// ?tipo=productos&c_<variacion>=<cantidad>&formato=termica|a4&precio=1&lista=<id>
// ?tipo=ubicaciones&d=<deposito>&u=<ubicacion>…|todas=1&formato=…

import Link from "next/link";
import { consulta, una } from "@/lib/erp/base";
import { formatear, type Moneda } from "@/lib/moneda";
import { leerNumero } from "@/lib/numeros";
import { codigoBarrasSvg } from "@/lib/deposito/etiquetas";
import { SUAVE } from "@/app/botones";
import { entrarErp } from "@/app/componentes/erp";
import BotonImprimir from "../BotonImprimir";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type Etiqueta = { clave: string; titulo?: string; sku?: string; grande?: string; codigo: string; precio?: string };

const MAXIMO = 1000;
const POR_HOJA = 24;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const varios = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function Imprimir({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("etiquetas_ver");
  const sp = await searchParams;
  const a4 = uno(sp.formato) === "a4";
  const ubic = uno(sp.tipo) === "ubicaciones";
  const etiquetas: Etiqueta[] = [];
  let aviso: string | null = null;

  if (ubic) {
    const dep = Number(uno(sp.d)) || 0;
    const todas = uno(sp.todas) === "1";
    const ids = varios(sp.u).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const filas = await consulta<{ id: number; codigo: string; descripcion: string | null }>(`
      select id::int, codigo, descripcion from ubicacion
       where organizacion_id = $1 and deposito_id = $2 and estado = 'activa' and ($3 or id = any($4::bigint[]))
       order by orden_recorrido, codigo`, [s.org.id, dep, todas, ids]);
    for (const u of filas) etiquetas.push({ clave: `u${u.id}`, grande: u.codigo, codigo: u.codigo });
  } else {
    // Las cantidades llegan como c_<id de variación>.
    const pedidas = new Map<number, number>();
    for (const [k, v] of Object.entries(sp)) {
      const m = /^c_(\d+)$/.exec(k);
      const n = Math.trunc(leerNumero(uno(v)) ?? 0);
      if (m && n > 0) pedidas.set(Number(m[1]), n);
    }
    const listaId = uno(sp.precio) === "1" ? Number(uno(sp.lista)) || 0 : 0;
    const lista = listaId ? await una<{ id: number; moneda_base: Moneda }>(
      "select id::int, moneda_base from lista_precios where id = $1 and organizacion_id = $2", [listaId, s.org.id]) : null;
    const filas = pedidas.size ? await consulta<{ id: number; sku: string; titulo: string; codigo_barras: string | null; venta_ars: string | null; venta_usd: string | null }>(`
      select v.id::int, v.sku, titulo_variacion(v.id) titulo, v.codigo_barras, pr.venta_ars, pr.venta_usd
        from variacion v left join lateral (select * from precio_de($1, v.id, $3)) pr on $3::bigint is not null
       where v.organizacion_id = $1 and v.id = any($2::bigint[]) order by v.sku`, [s.org.id, [...pedidas.keys()], lista?.id ?? null]) : [];
    for (const v of filas) {
      const precio = lista ? (lista.moneda_base === "USD" ? v.venta_usd : v.venta_ars) : null;
      for (let i = 0; i < pedidas.get(v.id)!; i++) {
        etiquetas.push({
          clave: `v${v.id}-${i}`, titulo: v.titulo, sku: v.sku, codigo: v.codigo_barras ?? v.sku,
          precio: lista ? (precio != null ? formatear(precio, lista.moneda_base) : "sin precio") : undefined,
        });
      }
    }
  }
  if (etiquetas.length > MAXIMO) {
    aviso = `Son ${etiquetas.length} etiquetas: van las primeras ${MAXIMO}.`;
    etiquetas.length = MAXIMO;
  }

  // El SVG de cada código, uno solo por código distinto.
  const svgs = new Map<string, string>();
  for (const e of etiquetas) if (!svgs.has(e.codigo)) {
    try { svgs.set(e.codigo, codigoBarrasSvg(e.codigo)); } catch { svgs.set(e.codigo, ""); }
  }
  const hojas: Etiqueta[][] = [];
  if (a4) for (let i = 0; i < etiquetas.length; i += POR_HOJA) hojas.push(etiquetas.slice(i, i + POR_HOJA));
  const volver = ubic ? "/deposito/etiquetas/ubicaciones" : "/deposito/etiquetas";

  return (
    <main className="p-4">
      <style>{`
        .etq { box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; background: #fff; color: #000;
               font-family: Arial, Helvetica, sans-serif; }
        .etq .tit { font-size: 7pt; line-height: 1.15; max-height: 2.3em; overflow: hidden; display: -webkit-box;
                    -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .etq .sku { font-size: 7pt; font-weight: bold; }
        .etq .cb { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
        .etq .cb svg { width: 100%; height: 100%; }
        .etq .pre { font-size: 10pt; font-weight: bold; text-align: right; }
        .etq .grande { font-size: 16pt; font-weight: 900; text-align: center; line-height: 1; }
        .termica .etq { width: 50mm; height: 25mm; padding: 1.2mm 1.8mm; margin: 0 0 4mm; border: 1px dashed #bbb; }
        .hoja { width: 210mm; height: 297mm; display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 37.125mm;
                background: #fff; margin: 0 0 6mm; border: 1px solid #ddd; }
        .hoja .etq { padding: 3mm 4mm; border: 1px dashed #ddd; }
        .hoja .etq .tit, .hoja .etq .sku { font-size: 8.5pt; }
        .hoja .etq .pre { font-size: 13pt; }
        .hoja .etq .grande { font-size: 26pt; }
        @page { size: ${a4 ? "A4" : "50mm 25mm"}; margin: 0; }
        @media print {
          header, footer, nav, .no-imprimir { display: none !important; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body > div, body > div > div, main { padding: 0 !important; margin: 0 !important; min-height: 0 !important; }
          .termica .etq { margin: 0; border: 0; page-break-after: always; break-after: page; }
          .hoja { margin: 0; border: 0; page-break-after: always; break-after: page; }
          .hoja .etq { border: 0; }
        }
      `}</style>

      <div className="no-imprimir flex flex-wrap items-center gap-2 mb-4">
        <BotonImprimir />
        <Link href={volver} className={`${SUAVE} text-base px-4 py-3`}>Volver</Link>
        <span className="text-sm text-[#5C6B76]">
          {etiquetas.length} etiqueta{etiquetas.length === 1 ? "" : "s"} · {a4 ? `hoja A4 de 3×8 (${hojas.length} hoja${hojas.length === 1 ? "" : "s"})` : "térmica 50×25 mm"}
        </span>
        {aviso && <span className="text-sm text-[#8a6100]">{aviso}</span>}
        {!a4 && <p className="w-full text-[11px] text-[#5C6B76]">En el diálogo de impresión elegí la impresora térmica, tamaño 50×25 mm y márgenes "ninguno".</p>}
      </div>

      {etiquetas.length === 0 && <p className="no-imprimir text-sm text-[#5C6B76]">No elegiste ninguna etiqueta. Volvé y poné cuántas querés.</p>}

      {a4
        ? hojas.map((h, i) => <div key={i} className="hoja">{h.map((e) => <UnaEtiqueta key={e.clave} e={e} svg={svgs.get(e.codigo) ?? ""} />)}</div>)
        : <div className="termica">{etiquetas.map((e) => <UnaEtiqueta key={e.clave} e={e} svg={svgs.get(e.codigo) ?? ""} />)}</div>}
    </main>
  );
}

function UnaEtiqueta({ e, svg }: { e: Etiqueta; svg: string }) {
  return (
    <div className="etq">
      {e.grande ? <div className="grande">{e.grande}</div> : <div className="tit">{e.titulo}</div>}
      {e.sku && <div className="sku">{e.sku}</div>}
      <div className="cb" dangerouslySetInnerHTML={{ __html: svg }} />
      {e.precio && <div className="pre">{e.precio}</div>}
    </div>
  );
}
