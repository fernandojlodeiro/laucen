// La ficha de una declaración jurada: los importes (leídos por la IA o cargados a mano; se corrigen con el lápiz),
// el PDF para ver o bajar y el control contra lo cargado en Laucen ese mes.

import Link from "next/link";
import { notFound } from "next/navigation";
import { SUAVE } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import {
  entrarErp, Pantalla, Avisos, BotonesFicha, Dato, TituloSeccion, editandoFicha, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { una } from "@/lib/erp/base";
import { datosDe, IMPUESTOS, type DatosIva, type DatosIibb, type DatosMunicipal } from "@/lib/impuestos/ddjj-leer";
import { ddjjPorId, controlDdjj } from "@/lib/impuestos/posicion";
import { CODIGOS_JURISDICCION, nombreJurisdiccion } from "@/lib/impuestos/jurisdicciones";
import { accionCorregirDdjj, accionBorrarDdjj } from "../acciones";
import TablaDiferencias from "../TablaDiferencias";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "/administracion/impuestos";
const n2 = (x: number) => x.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CAMPOS_IVA: [keyof DatosIva, string][] = [
  ["debito", "Débito fiscal"], ["credito", "Crédito fiscal"], ["saldo_tecnico_anterior", "Saldo técnico a favor del mes anterior"],
  ["saldo_tecnico_favor", "Saldo técnico a favor que queda"], ["pagos_a_cuenta", "Retenciones, percepciones y pagos a cuenta"],
  ["saldo_libre_anterior", "Libre disponibilidad a favor del mes anterior"], ["saldo_libre_favor", "Libre disponibilidad a favor que queda"], ["a_pagar", "A pagar"],
];
const CAMPOS_MUN: [string, string][] = [
  ["base", "Base imponible"], ["alicuota", "Alícuota %"], ["determinado", "Contribución determinada"], ["minimo", "Mínimo"],
  ["retenciones", "Retenciones y percepciones"], ["saldo_anterior", "Saldo a favor anterior"], ["a_pagar", "A pagar"], ["a_favor", "A favor"],
];
const CAMPOS_JUR: [string, string, string][] = [
  ["coeficiente", "Coef.", "Coeficiente unificado"], ["alicuota", "Alíc.", "Alícuota %"], ["base", "Base", "Base imponible atribuida"],
  ["determinado", "Determ.", "Impuesto determinado"], ["retenciones", "Ret.", "Retenciones"], ["percepciones", "Percep.", "Percepciones"],
  ["percepciones_aduaneras", "Aduana", "Percepciones aduaneras"], ["recaudaciones_bancarias", "Recaud.", "Recaudaciones bancarias y SIRTAC"],
  ["saldo_anterior", "Saldo ant.", "Saldo a favor del mes anterior"], ["a_pagar", "A pagar", "Saldo a pagar"], ["a_favor", "A favor", "Saldo a favor"],
];

export default async function FichaDdjj({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string; ok?: string; error?: string }> }) {
  const s = await entrarErp("impuestos_ver");
  const { id } = await params;
  const sp = await searchParams;
  const d = await ddjjPorId(s.org.id, Number(id) || 0);
  if (!d) notFound();
  const rs = await una<{ nombre: string }>("select coalesce(nombre, razon_social) nombre from emisor where id = $1", [d.emisor_id]);
  const editando = editandoFicha(sp);
  const ruta = `${BASE}/${d.id}`;
  const { diferencias } = await controlDdjj(s.org.id, d);
  const mes = d.periodo.split("-").reverse().join("/");

  return (
    <Pantalla titulo={`${IMPUESTOS[d.impuesto]} · ${mes}${d.rectificativa ? ` · rectificativa ${d.rectificativa}` : ""}`}
      subtitulo={rs?.nombre}
      camino={[{ texto: `Declaración ${mes}` }]}
      acciones={<>
        {d.archivo && <a href={`${ruta}/pdf`} target="_blank" rel="noreferrer" className={SUAVE}>Ver el PDF</a>}
        {d.archivo && <a href={`${ruta}/pdf?bajar=1`} className={SUAVE}>Bajar el PDF</a>}
        <BotonesFicha editando={editando} ver={ruta} editar={`${ruta}?editar=ficha`} />
        {!editando && <TachoConfirmar accion={accionBorrarDdjj} campos={{ id: String(d.id), rs: String(d.emisor_id) }} pregunta="¿Borrar la declaración?" />}
      </>}>
      <Avisos sp={sp} />
      <form id="ficha" action={accionCorregirDdjj} className={`${CAJA} mb-4`}>
        <input type="hidden" name="id" value={d.id} />
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          {editando
            ? <label><span className={ETIQUETA}>Presentada el</span><input type="date" name="fecha_presentacion" defaultValue={d.fecha_presentacion ?? ""} className={`${CAMPO} w-full`} /></label>
            : <Dato etiqueta="Presentada el">{d.fecha_presentacion?.split("-").reverse().join("/")}</Dato>}
          {editando
            ? <label className="sm:col-span-2"><span className={ETIQUETA}>Notas</span><input name="notas" defaultValue={d.notas ?? ""} className={`${CAMPO} w-full`} /></label>
            : <Dato etiqueta="Notas" className="sm:col-span-2">{d.notas}</Dato>}
        </div>
        {d.impuesto === "iva" && <Campos campos={CAMPOS_IVA} valores={datosDe("iva", d.datos) as DatosIva} editando={editando} />}
        {d.impuesto === "municipal" && <Campos campos={CAMPOS_MUN} valores={conSaldoPartido(datosDe("municipal", d.datos) as DatosMunicipal)} editando={editando} />}
        {d.impuesto === "iibb" && <Jurisdicciones datos={datosDe("iibb", d.datos) as DatosIibb} editando={editando} />}
      </form>

      <TituloSeccion titulo={diferencias.length ? `Diferencias con lo cargado en Laucen (${diferencias.length})` : "Control contra lo cargado en Laucen"} />
      {diferencias.length
        ? <TablaDiferencias difs={diferencias} />
        : <p className="text-xs rounded-lg px-3 py-2 bg-[#EEF7F1] text-[#1F6E4A]">Coincide con lo cargado en Laucen ese mes y con la declaración del mes anterior.</p>}
      <p className="text-[11px] text-[#5C6B76] mt-2">
        Se compara con los <Link href={`/administracion/libros-iva?mes=${d.periodo}&rs=${d.emisor_id}`} className="text-[#16577F] hover:underline">libros de IVA de ese mes</Link>,
        las percepciones de las facturas de compra y los despachos, lo que descontó Mercado Pago y el saldo que dejó la declaración del mes anterior.
      </p>
    </Pantalla>
  );
}

const conSaldoPartido = (m: DatosMunicipal) => ({ ...m, a_pagar: Math.max(0, m.saldo), a_favor: Math.max(0, -m.saldo) });

function Campos({ campos, valores, editando }: { campos: [string, string][]; valores: Record<string, unknown>; editando: boolean }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {campos.map(([k, t]) => editando
        ? <label key={k}><span className={ETIQUETA}>{t}</span><CampoNumero name={k} valor={Number(valores[k] ?? 0)} tipo={k === "alicuota" ? "decimal" : "pesos"} className={CAMPO} /></label>
        : <Dato key={k} etiqueta={t} numero>{n2(Number(valores[k] ?? 0))}</Dato>)}
    </div>
  );
}

function Jurisdicciones({ datos, editando }: { datos: DatosIibb; editando: boolean }) {
  const libres = CODIGOS_JURISDICCION.filter((c) => !datos.jurisdicciones.some((j) => j.codigo === c));
  return (
    <>
      <div className="mb-3 max-w-xs">
        {editando
          ? <label><span className={ETIQUETA}>Base imponible total</span><CampoNumero name="base_total" valor={datos.base_total} tipo="pesos" className={CAMPO} /></label>
          : <Dato etiqueta="Base imponible total" numero>{n2(datos.base_total)}</Dato>}
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Provincia</th>{CAMPOS_JUR.map(([k, t, largo]) => <th key={k} className={THN} title={largo}>{t}</th>)}</tr>
          </thead>
          <tbody>
            {datos.jurisdicciones.map((j) => {
              const v: Record<string, number> = { ...j, a_pagar: Math.max(0, j.saldo), a_favor: Math.max(0, -j.saldo) };
              return (
                <tr key={j.codigo} className={TR}>
                  <td className={`${TD} whitespace-nowrap`}>{nombreJurisdiccion(j.codigo)}{editando && <input type="hidden" name="jur" value={j.codigo} />}</td>
                  {CAMPOS_JUR.map(([k]) => (
                    <td key={k} className={TDN}>
                      {editando
                        ? <input name={`j${j.codigo}_${k}`} defaultValue={k === "coeficiente" ? String(v[k]).replace(".", ",") : v[k].toLocaleString("es-AR", { maximumFractionDigits: 2 })} className={`${CAMPO} w-24 text-right`} />
                        : k === "coeficiente" ? v[k].toLocaleString("es-AR", { maximumFractionDigits: 8 }) : k === "alicuota" ? `${v[k].toLocaleString("es-AR")} %` : n2(v[k])}
                    </td>
                  ))}
                </tr>
              );
            })}
            {datos.jurisdicciones.length === 0 && <tr className={TR}><td colSpan={CAMPOS_JUR.length + 1} className={`${TD} text-[#5C6B76]`}>Sin provincias.{editando ? " Agregá una abajo y apretá «Grabar»." : ""}</td></tr>}
          </tbody>
        </table>
      </div>
      {editando && (
        <label className="block mt-2 max-w-xs"><span className={ETIQUETA}>Agregar una provincia (se agrega al grabar)</span>
          <ElegirDeLista name="jur_nueva" opciones={libres.map((c) => ({ id: c, texto: nombreJurisdiccion(c) }))} vacio="Ninguna" /></label>
      )}
    </>
  );
}
