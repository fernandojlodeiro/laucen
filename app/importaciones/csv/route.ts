// Exporta a CSV lo mismo que muestra Buscar, con el mismo filtro (sin el
// tope de filas de la pantalla, hasta TOPE). Separador ; y coma decimal:
// así lo abre bien el Excel en castellano.

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { asegurarEsquemaArca } from "@/lib/arca/esquema";
import { leerFiltro, periodosCargados } from "@/lib/arca/filtro";
import { VIAS, items, nombre, rankingImportadores, rankingNcm, rankingPaises, referencias, serieMensual } from "@/lib/arca/consultas";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TOPE = 100_000;

function celda(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  const t = Array.isArray(v) ? v.join(", ") : String(v);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export async function GET(req: NextRequest) {
  await asegurarEsquemaArca();
  const sesion = await sesionActual();
  if (!sesion || !tienePermiso(sesion.permisos, "importaciones_ver")) {
    return new NextResponse("Sin permiso", { status: 403 });
  }
  const org = sesion.org.id;
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const f = leerFiltro(sp);
  const periodos = await periodosCargados();
  f.desde ??= periodos.at(-1);
  f.hasta ??= periodos.at(-1);
  const orden = sp.o ?? "fob";
  const refs = await referencias();
  const vista = sp.ver ?? "importadores";

  let cab: string[] = [];
  let filas: unknown[][] = [];
  if (vista === "ncm") {
    const r = await rankingNcm(f, org, orden, TOPE);
    cab = ["ncm", "descripcion", "fob_usd", "pct_del_total", "cantidad", "items", "importadores"];
    filas = r.filas.map((x) => [x.ncm, x.descripcion, x.fob, x.pct, x.cantidad, x.items, x.importadores]);
  } else if (vista === "paises") {
    const r = await rankingPaises(f, org);
    cab = ["pais_codigo", "pais", "fob_usd", "pct_del_total", "cantidad", "items", "importadores"];
    filas = r.map((x) => [x.pais, nombre(refs.pais, x.pais), x.fob, x.pct, x.cantidad, x.items, x.importadores]);
  } else if (vista === "serie") {
    const r = await serieMensual(f, org);
    cab = ["periodo", "fob_usd", "cantidad", "items", "importadores", ...VIAS.map((v) => `fob_${v.clave}`), "fob_otros"];
    filas = r.map((x) => [x.periodo, x.fob, x.cantidad, x.items, x.importadores, ...VIAS.map((v) => x.porVia[v.clave]), x.porVia.otros]);
  } else if (vista === "items") {
    const r = await items(f, org, TOPE);
    cab = ["periodo", "destinacion", "item", "aduana", "importador", "importador_completo", "ncm", "pais_origen", "pais_procedencia",
      "transporte", "unidad", "cantidad", "fob_usd", "fob_unitario", "ncm_sim", "arancel_pct_min", "arancel_pct_max", "iva_pct", "iva_origen", "estadistica_pct", "marcas", "codigos_articulo", "kg_netos", "cif_usd", "fecha"];
    filas = r.filas.map((x) => [x.periodo, x.destinacion, x.num_item, x.aduana, x.importador, x.importador_completo, x.ncm,
      nombre(refs.pais, x.pais_origen), nombre(refs.pais, x.pais_procedencia), nombre(refs.transporte, x.transporte),
      nombre(refs.unidad, x.unidad), x.cantidad, x.fob_item, x.fob_unit, x.ncm_sim,
      x.arancel_min, x.arancel_max, x.iva_pct, x.iva_por_defecto ? "por defecto (revisar)" : "deducido", x.estadistica_pct, x.marcas, x.codigos_articulo, x.kg_netos, x.usd_cif, x.fecha]);
  } else {
    const r = await rankingImportadores(f, org, orden, TOPE);
    cab = ["importador", "fob_usd", "pct_del_total", "cantidad", "items", "ncm_distintas", "transporte_principal"];
    filas = r.filas.map((x) => [x.importador, x.fob, x.pct, x.cantidad, x.items, x.ncms, nombre(refs.transporte, x.via)]);
  }

  const texto = "﻿" + [cab, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
  const archivo = `importaciones_${vista}_${f.desde}-${f.hasta}.csv`;
  return new NextResponse(texto, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${archivo}"`,
    },
  });
}
