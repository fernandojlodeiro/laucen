// Vista previa de un archivo de "Mis Comprobantes – Recibidos" de ARCA: cada
// comprobante con su proveedor (por CUIT; "nuevo" si no está), sus importes y
// su estado contra lo ya cargado; arriba, la cuenta de gasto de cada
// proveedor (se recuerda; sin cuenta recordada hay que elegirla), con "Nueva
// cuenta" para crear una de egreso ahí mismo (quien tiene Contabilidad).
// "Importar" (arriba a la derecha) registra las nuevas y marca "validadas con
// ARCA" las que ya estaban cargadas e iguales; las distintas van a "Diferencias".

import Link from "next/link";
import { notFound } from "next/navigation";
import { VERDE } from "@/app/botones";
import Pestanas from "@/app/componentes/Pestanas";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { entrarErp, Pantalla, Avisos, Estado, TituloSeccion, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { cuitLegible } from "@/lib/cuit";
import { tienePermiso } from "@/lib/permisos";
import { cuentasImputables, proximoCodigoCuenta } from "@/lib/administracion/contabilidad";
import { vistaPrevia, contarEstados, ESTADOS_CBTE, type EstadoCbte, type FilaPrevia } from "@/lib/administracion/arca-mc";
import { accionImportarArca, accionCrearCuentaArca } from "../acciones";
import NuevaCuenta from "./NuevaCuenta";

export const dynamic = "force-dynamic";

const plata = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaAr = (f: string) => f.split("-").reverse().join("/");
const VER: { k: "" | EstadoCbte; texto: string }[] = [
  { k: "", texto: "Todos" }, { k: "nueva", texto: "Nuevas" }, { k: "ya_cargada", texto: "Ya cargadas" },
  { k: "distinta", texto: "Diferencias" }, { k: "error", texto: "Con error" }, { k: "repetida", texto: "Repetidas" },
];

export default async function VistaPreviaArca({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ver?: string; elegidas?: string; ok?: string; error?: string }> }) {
  const s = await entrarErp("compras_ver");
  const { id } = await params;
  const sp = await searchParams;
  const v = await vistaPrevia(s.org.id, Number(id) || 0);
  if (!v) notFound();
  const cuentas = await cuentasImputables(s.org.id);
  const orden = [...cuentas.filter((c) => c.tipo === "egreso"), ...cuentas.filter((c) => c.tipo !== "egreso")];
  // Lo elegido antes de crear una cuenta (vuelve en ?elegidas=CUIT:id,…).
  const validas = new Set(cuentas.map((c) => c.id));
  const elegidas = new Map((sp.elegidas ?? "").split(",").map((x) => x.split(":")).filter(([cuit, c]) => /^\d{11}$/.test(cuit ?? "") && validas.has(Number(c))).map(([cuit, c]) => [cuit, Number(c)]));
  // Crear una cuenta desde acá pide además el permiso de Contabilidad.
  const puedeCrear = tienePermiso(s.permisos, "contabilidad_ver");
  const sugerida = puedeCrear ? await proximoCodigoCuenta(s.org.id, "egreso") : null;
  const n = contarEstados(v.filas);
  const ver = VER.some((x) => x.k === sp.ver) ? (sp.ver as EstadoCbte) : "";
  const filas = ver ? v.filas.filter((f) => f.estado === ver) : v.filas;
  const base = `/compras/facturas/arca/${v.lote.id}`;
  const conElegidas = sp.elegidas || null;
  const importado = v.lote.estado === "importado";
  const aValidar = v.filas.filter((f) => f.estado === "ya_cargada" && !f.validada).length;
  const textoBoton = [n.nueva > 0 && `importar ${n.nueva} nueva${n.nueva === 1 ? "" : "s"}`, aValidar > 0 && `validar ${aValidar} cargada${aValidar === 1 ? "" : "s"}`].filter(Boolean).join(" y ");

  return (
    <Pantalla titulo="Importar de ARCA (Mis Comprobantes)" camino={[{ texto: "Importar de ARCA" }]}
      subtitulo={<>{v.lote.archivo} · {v.lote.emisor && <>a nombre de {v.lote.emisor} · </>}{v.filas.length} comprobante{v.filas.length === 1 ? "" : "s"} · columnas {v.lote.version === "nueva" ? "con IVA por alícuota" : "con el IVA en un solo número (se deduce la alícuota)"}</>}
      acciones={textoBoton ? <button type="submit" form="importar" className={VERDE}>{textoBoton.replace(/^./, (x) => x.toUpperCase())}</button> : undefined}>
      <Avisos sp={sp} />
      {v.lote.resultado && (
        <div className={`${CAJA} mb-3 text-xs`}>
          <b>Última importación de este archivo:</b> {v.lote.resultado.cargadas} cargadas · {v.lote.resultado.yaEstaban} ya estaban
          {(v.lote.resultado.validadas ?? 0) > 0 && <> · {v.lote.resultado.validadas} validadas con ARCA</>}
          {v.lote.resultado.distintas > 0 && <> · {v.lote.resultado.distintas} con diferencias (no se tocaron: corregilas)</>}
          {v.lote.resultado.proveedoresNuevos > 0 && <> · {v.lote.resultado.proveedoresNuevos} proveedores nuevos</>}
          {v.lote.resultado.errores.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-[#C03420]">{v.lote.resultado.errores.map((e, i) => <li key={i}>{e}</li>)}</ul>
          )}
        </div>
      )}
      {v.lote.errores.length > 0 && (
        <div className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          <b>Renglones que no se pudieron leer ({v.lote.errores.length}):</b>
          <ul className="list-disc pl-5">{v.lote.errores.slice(0, 30).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {!importado && !textoBoton && <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#EEF7F1] text-[#1F6E4A]">No hay nada nuevo para importar ni para validar: todo lo del archivo ya está cargado y validado.</p>}
      {n.distinta > 0 && <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">Hay {n.distinta} comprobante{n.distinta === 1 ? "" : "s"} cargado{n.distinta === 1 ? "" : "s"} distinto{n.distinta === 1 ? "" : "s"} de lo que dice ARCA: mirá la pestaña «Diferencias», corregilos en su factura y volvé a subir el archivo.</p>}

      <div className="mb-4">
        <TituloSeccion titulo="Cuenta de gasto de cada proveedor">{sugerida && <BotonNuevo texto="Nueva cuenta" />}</TituloSeccion>
        <p className="text-[11px] text-[#5C6B76] mb-2">Adónde va el neto de sus facturas en la contabilidad. Queda recordada en el proveedor para la próxima vez; el que no tiene una recordada y trae comprobantes nuevos, hay que elegírsela. En las facturas B y C el total entero es gasto (no hay crédito fiscal).</p>
        {sugerida && (
          <AltaNueva texto="Nueva cuenta" sinBoton className="mb-2">
            {/* Los campos son del formulario "importar" (atributo form): la acción recibe también lo elegido abajo. */}
            <NuevaCuenta accion={accionCrearCuentaArca}>
              <label><span className={ETIQUETA}>Código</span><input name="codigo" form="importar" defaultValue={sugerida.codigo} className={`${CAMPO} w-24`} /></label>
              <label className="flex-1 min-w-48"><span className={ETIQUETA}>Nombre</span><input name="nombre" form="importar" placeholder="Ej. Publicidad" className={`${CAMPO} w-full`} autoFocus /></label>
              {/* Para qué proveedores de este archivo queda elegida (Fer, 22/10): varios a la vez, tildando. */}
              <fieldset className="w-full">
                <span className={ETIQUETA}>Queda elegida para (los proveedores de este archivo; tildá los que van a esta cuenta)</span>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-xs max-h-48 overflow-auto rounded-lg border border-[#E3E9F0] bg-white p-2">
                  {v.proveedores.map((p) => (
                    <label key={p.cuit} className="flex items-center gap-1.5">
                      <input type="checkbox" name="para" value={p.cuit} form="importar" className="h-4 w-4" />
                      <span className="truncate" title={p.nombre}>{p.nombre}</span>
                      <span className="text-[10px] text-[#5C6B76] whitespace-nowrap">({p.nuevas})</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </NuevaCuenta>
            <p className="text-[11px] text-[#5C6B76] mt-1">
              Se crea como cuenta de egreso imputable{sugerida.madre ? <>, bajo <b>{sugerida.madre.codigo} {sugerida.madre.nombre}</b> (la cuenta madre sale del código)</> : null}.
              El código viene sugerido (el próximo libre de egreso) y se puede cambiar.
            </p>
          </AltaNueva>
        )}
      <form id="importar" action={accionImportarArca}>
        <input type="hidden" name="lote" value={v.lote.id} />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Proveedor</th><th className={TH}>CUIT</th><th className={THN}>Nuevas</th><th className={TH}>Cuenta de gasto</th></tr></thead>
            <tbody>
              {v.proveedores.map((p) => (
                <tr key={p.cuit} className={TR}>
                  <td className={TD}>
                    {p.proveedorId ? <Link href={url("/compras/proveedores", { id: p.proveedorId })} className="text-[#16577F] hover:underline">{p.nombre}</Link> : <>{p.nombre} <Estado texto="Nuevo: se crea al importar" tono="azul" /></>}
                    {p.mercadoLibre && <span className="ml-1"><Estado texto="Mercado Libre" tono="amarillo" /></span>}
                  </td>
                  <td className={`${TD} font-mono whitespace-nowrap`}>{cuitLegible(p.cuit)}</td>
                  <td className={TDN}>{p.nuevas}</td>
                  <td className={TD}>
                    {/* La clave con el valor: al volver de crear una cuenta, el desplegable toma lo elegido. */}
                    <select key={elegidas.get(p.cuit) ?? p.cuentaId ?? "nada"} name={`cuenta_${p.cuit}`} defaultValue={elegidas.get(p.cuit) ?? p.cuentaId ?? ""} required={p.nuevas > 0}
                      className={`${CAMPO} w-full max-w-xs ${p.nuevas > 0 && !(elegidas.get(p.cuit) ?? p.cuentaId) ? "border-[#E0A100]" : ""}`}>
                      <option value="">Elegí la cuenta…</option>
                      {orden.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </form>
      </div>

      <Pestanas items={VER.filter((x) => !x.k || n[x.k] > 0 || x.k === "nueva").map((x) => ({
        clave: x.k || "todos", texto: x.texto, activa: ver === x.k, href: url(base, { ver: x.k || null, elegidas: conElegidas }), cuenta: x.k ? n[x.k] : v.filas.length,
      }))} />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Fecha</th><th className={TH}>Proveedor</th><th className={TH}>Comprobante</th>
              <th className={THN}>Neto gravado</th><th className={THN}>IVA</th><th className={THN}>No gravado / exento</th>
              <th className={THN}>Percepciones / otros</th><th className={THN}>Total</th><th className={TH}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>Nada en esta pestaña.</td></tr>}
            {filas.map((f, i) => <Fila key={i} f={f} />)}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}

function Fila({ f }: { f: FilaPrevia }) {
  const c = f.c;
  const s = c.nc ? -1 : 1;
  const mon = c.moneda === "USD" ? "US$ " : "";
  const e = ESTADOS_CBTE[f.estado];
  const bc = c.letra === "B" || c.letra === "C";
  const otros = c.percepcionIva + c.percepcionIibb + f.armada.otrosImpuestos;
  return (
    <tr className={TR}>
      <td className={`${TD} whitespace-nowrap`}>{fechaAr(c.fecha)}</td>
      <td className={TD}>
        {f.proveedorId ? <Link href={url("/compras/proveedores", { id: f.proveedorId })} className="text-[#16577F] hover:underline">{f.proveedor}</Link> : <>{f.proveedor} <span className="text-[10px] text-[#16577F]">(nuevo)</span></>}
        <span className="block text-[10px] text-[#5C6B76] font-mono">{cuitLegible(c.cuit)}</span>
      </td>
      <td className={`${TD} whitespace-nowrap`}>
        {f.facturaId ? <Link href={`/compras/facturas/${f.facturaId}`} className="text-[#16577F] hover:underline">{c.tipoTexto}</Link> : c.tipoTexto}
        <span className="block font-mono text-[11px]">{String(c.puntoVenta).padStart(5, "0")}-{String(c.numero).padStart(8, "0")}{c.numeroHasta ? ` a ${c.numeroHasta}` : ""}</span>
      </td>
      <td className={TDN}>
        {bc ? <span className="text-[#5C6B76]" title="Sin crédito fiscal: el total entero es gasto">—</span> : `${mon}${plata(s * c.netoGravado)}`}
        {!bc && c.alicuotas.length > 1 && <span className="block text-[10px] text-[#5C6B76]">{c.alicuotas.map((a) => `${a.pct.toLocaleString("es-AR")} %: ${plata(a.neto)}`).join(" · ")}</span>}
      </td>
      <td className={TDN}>
        {bc ? "—" : `${mon}${plata(s * c.iva)}`}
        {!bc && c.alicuotas.length === 1 && c.alicuotas[0].iva > 0 && <span className="block text-[10px] text-[#5C6B76]">{c.alicuotas[0].pct.toLocaleString("es-AR")} %</span>}
      </td>
      <td className={TDN}>{bc || !(c.noGravado + c.exento) ? "—" : `${mon}${plata(s * (c.noGravado + c.exento))}`}</td>
      <td className={TDN}>
        {bc || !otros ? "—" : `${mon}${plata(s * otros)}`}
        {!bc && (c.percepcionIva > 0 || c.percepcionIibb > 0) && <span className="block text-[10px] text-[#5C6B76]">{[c.percepcionIva > 0 && `IVA ${plata(c.percepcionIva)}`, c.percepcionIibb > 0 && `IIBB ${plata(c.percepcionIibb)}`].filter(Boolean).join(" · ")}</span>}
      </td>
      <td className={`${TDN} font-semibold`}>
        {mon}{plata(s * c.total)}
        {c.moneda === "USD" && <span className="block text-[10px] font-normal text-[#5C6B76]">TC {c.cotizacion.toLocaleString("es-AR")}</span>}
      </td>
      <td className={TD}>
        <Estado texto={e.texto} tono={e.tono} />
        {f.motivo && <span className="block text-[10px] text-[#5C6B76] max-w-[16rem]">{f.motivo}</span>}
        {f.aviso && f.estado === "nueva" && <span className="block text-[10px] text-[#8a6100] max-w-[16rem]">{f.aviso}</span>}
      </td>
    </tr>
  );
}
