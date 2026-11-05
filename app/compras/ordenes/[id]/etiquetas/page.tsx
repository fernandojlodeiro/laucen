// Etiquetas de las cajas de una orden de compra (Fer, 5/11): el código de la caja bien grande (M0226-34), su código de
// barras para escanearla en la recepción, y abajo, chico, lo que trae adentro. Se imprimen todas de un saque.
//   ?formato=a4 (dos por hoja A4) | termica (100 × 150 mm, una por etiqueta)

import Link from "next/link";
import { notFound } from "next/navigation";
import { codigoBarrasSvg } from "@/lib/deposito/etiquetas";
import { SUAVE } from "@/app/botones";
import { entrarErp } from "@/app/componentes/erp";
import BotonImprimir from "@/app/deposito/etiquetas/BotonImprimir";
import { cajasOrden, ordenCabecera } from "@/lib/compras/ordenes";

export const dynamic = "force-dynamic";

export default async function EtiquetasCajas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ formato?: string; caja?: string }> }) {
  const s = await entrarErp("compras_ver");
  const oid = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(oid) || oid <= 0) notFound();
  const o = await ordenCabecera(s.org.id, oid);
  if (!o) notFound();
  const termica = sp.formato === "termica";
  const todas = await cajasOrden(s.org.id, oid);
  const cajas = sp.caja ? todas.filter((k) => String(k.numero) === sp.caja) : todas;
  const svgs = new Map(cajas.map((k) => {
    try { return [k.id, codigoBarrasSvg(k.codigo, 18)] as const; } catch { return [k.id, ""] as const; }
  }));
  const hojas: (typeof cajas)[] = [];
  if (!termica) for (let i = 0; i < cajas.length; i += 2) hojas.push(cajas.slice(i, i + 2));

  return (
    <main className="p-4">
      <style>{`
        .caja { box-sizing: border-box; overflow: hidden; display: flex; flex-direction: column; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; }
        .caja .cod { font-size: 54pt; font-weight: 900; text-align: center; line-height: 1; letter-spacing: 1px; }
        .caja .sub { font-size: 11pt; text-align: center; margin-top: 2mm; }
        .caja .cb { height: 28mm; display: flex; align-items: center; justify-content: center; margin: 4mm 0; }
        .caja .cb svg { height: 100%; width: auto; max-width: 100%; }
        .caja .cont { font-size: 9pt; line-height: 1.25; columns: 2; column-gap: 6mm; }
        .hoja { width: 210mm; height: 297mm; display: grid; grid-template-rows: 1fr 1fr; background: #fff; margin: 0 0 6mm; border: 1px solid #ddd; }
        .hoja .caja { padding: 10mm 12mm; border-bottom: 1px dashed #bbb; }
        .termica .caja { width: 100mm; height: 150mm; padding: 5mm; margin: 0 0 4mm; border: 1px dashed #bbb; }
        .termica .caja .cod { font-size: 36pt; }
        .termica .caja .cont { columns: 1; font-size: 8pt; }
        @page { size: ${termica ? "100mm 150mm" : "A4"}; margin: 0; }
        @media print {
          header, footer, nav, .no-imprimir { display: none !important; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body > div, body > div > div, main { padding: 0 !important; margin: 0 !important; min-height: 0 !important; }
          .hoja { margin: 0; border: 0; page-break-after: always; break-after: page; }
          .termica .caja { margin: 0; border: 0; page-break-after: always; break-after: page; }
        }
      `}</style>
      <div className="no-imprimir flex flex-wrap items-center gap-2 mb-4">
        <BotonImprimir />
        <Link href={`/compras/ordenes/${oid}?ver=cajas`} className={`${SUAVE} text-base px-4 py-3`}>Volver</Link>
        <Link href={`?formato=${termica ? "a4" : "termica"}`} className={`${SUAVE} text-base px-4 py-3`}>{termica ? "Pasar a hoja A4 (2 por hoja)" : "Pasar a térmica 100 × 150 mm"}</Link>
        <span className="text-sm text-[#5C6B76]">{cajas.length} caja{cajas.length === 1 ? "" : "s"} de la orden {o.codigo}</span>
      </div>
      {cajas.length === 0 && <p className="no-imprimir text-sm text-[#5C6B76]">La orden no tiene packing list: subilo en la pestaña Cajas.</p>}
      {termica
        ? <div className="termica">{cajas.map((k) => <Caja key={k.id} k={k} svg={svgs.get(k.id) ?? ""} orden={o.codigo} />)}</div>
        : hojas.map((h, i) => <div key={i} className="hoja">{h.map((k) => <Caja key={k.id} k={k} svg={svgs.get(k.id) ?? ""} orden={o.codigo} />)}</div>)}
    </main>
  );
}

function Caja({ k, svg, orden }: { k: Awaited<ReturnType<typeof cajasOrden>>[number]; svg: string; orden: string }) {
  return (
    <div className="caja">
      <div className="cod">{k.codigo}</div>
      <div className="sub">Orden {orden} · caja {k.numero}{k.peso_kg ? ` · ${k.peso_kg} kg` : ""}</div>
      <div className="cb" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="cont">{k.items.map((i) => <div key={i.id}><b>{i.cantidad}</b> × {i.sku}</div>)}</div>
    </div>
  );
}
