// Piezas del costo de importación compartidas por la pestaña Costo del
// producto, las familias y los valores generales (lib/costo-importacion.ts).

import { formatearNumero } from "@/lib/numeros";
import CampoNumero from "@/app/componentes/CampoNumero";
import { Dato, TituloSeccion, BotonesFicha, CAMPO, ETIQUETA, CAJA } from "@/app/componentes/erp";
import {
  VIAS, PCT_FLETE, PCT_SUMAN, textoOrigen, CLAVES_GENERAL, GENERAL_POR_DEFECTO,
  type ClavePct, type Resuelto, type Valores, type Origen,
} from "@/lib/costo-importacion";
import { accionGuardarCostoGeneral } from "@/app/catalogo/familias/acciones";

export const pctTexto = (n: number | null | undefined) => (n == null ? "—" : `${formatearNumero(Number(n), "pct")} %`);

/** Lo que valdría el campo si se deja vacío (lo heredado), para la ayuda. */
function ayudaHereda(h: { valor: unknown; origen: Origen } | undefined, formato: (v: unknown) => string) {
  if (!h || h.valor == null) return "Vacío = sin cargar (0).";
  return `Vacío = hereda: ${formato(h.valor)} (${textoOrigen(h.origen)}).`;
}

/** Un porcentaje del costo: editando, el campo con lo que hereda de ayuda; en
 *  vista, el valor que rige y de dónde sale. */
export function CampoPctCosto({ k, titulo, editando, propio, rige, heredado }: {
  k: ClavePct; titulo: string; editando: boolean;
  propio: number | null | undefined;
  /** El que rige (propio o heredado), para la vista. */
  rige?: { valor: number | null; origen: Origen };
  /** El que regiría sin el propio, para la ayuda al editar. */
  heredado?: { valor: number | null; origen: Origen };
}) {
  if (editando) {
    return (
      <label>
        <span className={ETIQUETA}>{titulo} %</span>
        <CampoNumero name={k} valor={propio ?? null} tipo="pct" placeholder={heredado?.valor != null ? formatearNumero(heredado.valor, "pct") : ""} className={`${CAMPO} w-full`} />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">{ayudaHereda(heredado, (v) => pctTexto(v as number))}</span>
      </label>
    );
  }
  const r = rige ?? { valor: propio ?? null, origen: propio != null ? { tipo: "producto" as const } : null };
  return (
    <Dato etiqueta={`${titulo} %`} numero ayuda={r.valor != null && r.origen?.tipo !== "producto" ? textoOrigen(r.origen) : undefined}>
      {r.valor != null ? pctTexto(r.valor) : null}
    </Dato>
  );
}

/** La vía (avión / barco / courier): informativa por ahora. */
export function CampoVia({ editando, propio, rige, heredado }: {
  editando: boolean; propio: string | null | undefined;
  rige?: { valor: string | null; origen: Origen }; heredado?: { valor: string | null; origen: Origen };
}) {
  const nombre = (v: unknown) => VIAS[v as keyof typeof VIAS] ?? String(v);
  if (editando) {
    return (
      <label>
        <span className={ETIQUETA}>Vía</span>
        <select name="via" defaultValue={propio ?? ""} className={`${CAMPO} w-full`}>
          <option value="">{heredado?.valor ? `Hereda (${nombre(heredado.valor)})` : "Sin elegir"}</option>
          {Object.entries(VIAS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {heredado?.valor && <span className="block text-[10px] text-[#5C6B76] mt-0.5">Vacío = {textoOrigen(heredado.origen)}.</span>}
      </label>
    );
  }
  const r = rige ?? { valor: propio ?? null, origen: propio ? { tipo: "producto" as const } : null };
  return (
    <Dato etiqueta="Vía" ayuda={r.valor && r.origen?.tipo !== "producto" ? textoOrigen(r.origen) : "informativa por ahora"}>
      {r.valor ? nombre(r.valor) : null}
    </Dato>
  );
}

/** La NCM, con lo que hereda. */
export function CampoNcm({ editando, propio, rige, heredado, autoFocus = false }: {
  editando: boolean; propio: string | null | undefined;
  rige?: { valor: string | null; origen: Origen }; heredado?: { valor: string | null; origen: Origen }; autoFocus?: boolean;
}) {
  if (editando) {
    return (
      <label className="col-span-2">
        <span className={ETIQUETA}>NCM (posición arancelaria)</span>
        <input name="ncm" defaultValue={propio ?? ""} placeholder={heredado?.valor ?? "ej. 8516.79.90.990X"} className={`${CAMPO} w-full font-mono`} autoFocus={autoFocus} />
        {heredado?.valor && <span className="block text-[10px] text-[#5C6B76] mt-0.5">Vacío = hereda: {heredado.valor} ({textoOrigen(heredado.origen)}).</span>}
      </label>
    );
  }
  const r = rige ?? { valor: propio ?? null, origen: propio ? { tipo: "producto" as const } : null };
  return (
    <Dato etiqueta="NCM (posición arancelaria)" className="col-span-2" ayuda={r.valor && r.origen?.tipo !== "producto" ? textoOrigen(r.origen) : undefined}>
      {r.valor && <span className="font-mono">{r.valor}</span>}
    </Dato>
  );
}

/** Todos los campos del costo en una grilla: los de la pestaña Costo y los de
 *  una familia. `propios` = lo cargado en ese nivel; `rige` = lo resuelto;
 *  `heredado` = lo que regiría sin lo propio. */
export function CamposCosto({ editando, propios, rige, heredado, credito, autoFocus = false }: {
  editando: boolean; propios: Valores | null; rige?: Resuelto; heredado: Resuelto;
  credito: [ClavePct, string][]; autoFocus?: boolean;
}) {
  const pctDe = (k: ClavePct, t: string) => (
    <CampoPctCosto key={k} k={k} titulo={t} editando={editando} propio={propios?.[k]} rige={rige?.[k]} heredado={heredado[k]} />
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-start">
      <CampoNcm editando={editando} propio={propios?.ncm} rige={rige?.ncm} heredado={heredado.ncm} autoFocus={autoFocus} />
      <CampoVia editando={editando} propio={propios?.via} rige={rige?.via} heredado={heredado.via} />
      {PCT_FLETE.map(([k, t]) => pctDe(k, `${t} (sobre FOB)`))}
      <p className="col-span-2 sm:col-span-5 text-[11px] font-bold text-[#1E2A32] -mb-1">Se suman al costo (sobre CIF)</p>
      {PCT_SUMAN.map(([k, t]) => pctDe(k, t))}
      <p className="col-span-2 sm:col-span-5 text-[11px] font-bold text-[#1E2A32] -mb-1">Crédito fiscal y anticipos (no son costo; sobre CIF + derechos + estadística)</p>
      {credito.map(([k, t]) => pctDe(k, t))}
    </div>
  );
}

/** Los valores generales de importación de la organización, con su lápiz. */
export function CajaCostoGeneral({ general, editando, ver, editar }: {
  general: Valores; editando: boolean; ver: string; editar: string;
}) {
  const sinOrigen = (k: ClavePct) => ({ valor: GENERAL_POR_DEFECTO[k] ?? null, origen: GENERAL_POR_DEFECTO[k] != null ? { tipo: "general" as const } : null });
  const campos = (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-start">
      {CLAVES_GENERAL.map((k) => k === "via"
        ? <CampoVia key={k} editando={editando} propio={general.via} rige={{ valor: general.via ?? null, origen: general.via ? { tipo: "producto" } : null }} />
        : k === "ncm" ? null
        : <CampoPctCosto key={k} k={k} editando={editando}
            titulo={k === "flete_pct" ? "Flete (sobre FOB)" : k === "seguro_pct" ? "Seguro (sobre FOB)" : k === "despachante_pct" ? "Despachante (sobre CIF)" : "Depósito fiscal y otros (sobre CIF)"}
            propio={general[k]} rige={{ valor: general[k] ?? null, origen: general[k] != null ? { tipo: "producto" } : null }}
            heredado={sinOrigen(k)} />)}
    </div>
  );
  return (
    <section className={CAJA}>
      <TituloSeccion titulo="Valores generales de importación">
        <BotonesFicha editando={editando} ver={ver} editar={editar} form="costo-general" />
      </TituloSeccion>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Valen para todos los productos que no tengan el suyo ni lo hereden de su categoría. De entrada: seguro 1 %, despachante 1 % y depósito fiscal y otros 2 % (3 % del CIF).
      </p>
      {editando ? (
        <form id="costo-general" action={accionGuardarCostoGeneral}>
          <input type="hidden" name="volver" value={ver} />
          {campos}
        </form>
      ) : campos}
    </section>
  );
}
