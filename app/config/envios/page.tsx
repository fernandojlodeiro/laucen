// Métodos de envío de la tienda (valen para todas las tiendas de la
// organización): retiro en el local, tarifa fija, por provincia, a convenir,
// OCA a domicilio y a sucursal (cotizan con la cuenta de OCA, que se carga en
// /config/envios/oca). Andreani se ve deshabilitado hasta que exista su conexión.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { VERDE, SUAVE, PRIMARIO, DESPLEGABLE_CHICO, FLECHA } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { TIPOS_ENVIO, PROVINCIAS, type TipoEnvio } from "./comun";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_METODOS_ENVIO } from "./lista";
import { accionCrearEnvio, accionGuardarEnvio, accionActivarEnvio, accionBorrarEnvio } from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/envios";
type SP = { editar?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type Metodo = {
  id: number; tipo: TipoEnvio; nombre: string; activo: boolean; costo: number; gratis: number | null; tarifas: Record<string, number>;
  plazo: string | null; instrucciones: string | null; orden: number;
};

function SelectorTipo({ valor }: { valor?: string }) {
  return (
    <select name="tipo" defaultValue={valor ?? "retiro"} className={`${CAMPO} w-full`}>
      {Object.entries(TIPOS_ENVIO).map(([k, t]) => <option key={k} value={k} disabled={!t.disponible}>{t.texto}</option>)}
    </select>
  );
}

const pesos = (n: number | null) => (n == null ? "—" : formatear(n, "ARS"));

function costoTexto(m: Metodo) {
  if (m.tipo === "retiro") return "Sin cargo";
  if (m.tipo === "a_convenir") return "A convenir";
  if (m.tipo === "oca" || m.tipo === "oca_sucursal") return m.costo ? `Lo de OCA + ${pesos(m.costo)}` : "Lo que cotiza OCA";
  if (m.tipo === "por_provincia") {
    const provs = Object.keys(m.tarifas ?? {}).filter((k) => k !== "*").length;
    const resto = m.tarifas?.["*"] ?? m.costo;
    return `${provs} provincia${provs === 1 ? "" : "s"} · resto ${pesos(resto)}`;
  }
  return pesos(m.costo);
}

export default async function MetodosEnvio({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir };
  const base = await LISTA_METODOS_ENVIO.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const metodos = await consulta<Metodo>(`
    select id::int, tipo, nombre, activo, costo_ars::float costo, gratis_desde_ars::float gratis, tarifas, plazo, instrucciones, orden
      from ${base.desde} where ${base.donde} order by ${base.orden}`, base.valores);
  const vista = paginarEnMemoria(ordenarEnMemoria(metodos, sp, {
    nombre: (m) => m.nombre, tipo: (m) => TIPOS_ENVIO[m.tipo]?.texto ?? m.tipo, activo: (m) => (m.activo ? 1 : 0), costo: (m) => m.costo,
    gratis: (m) => m.gratis, plazo: (m) => m.plazo, instrucciones: (m) => m.instrucciones, orden: (m) => m.orden,
  }), sp);

  return (
    <Pantalla acciones={<><Link href="/config/envios/oca" className={SUAVE}>Cuenta de OCA</Link><AccionesExcel lista={LISTA_METODOS_ENVIO} org={s.org.id} /><BotonNuevo texto="Nuevo método de envío" /></>} titulo="Métodos de envío" subtitulo="Cómo le llega el pedido al comprador de la tienda web. Importes en pesos." ancho="max-w-6xl">
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo método de envío" sinBoton>
        <form action={accionCrearEnvio} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <label className="col-span-2"><span className={ETIQUETA}>Nombre que ve el comprador</span>
            <input name="nombre" placeholder="Ej. Envío a domicilio" className={`${CAMPO} w-full`} autoFocus /></label>
          <label className="col-span-2"><span className={ETIQUETA}>Tipo</span><SelectorTipo /></label>
          <label><span className={ETIQUETA}>Costo $</span><CampoNumero name="costo_ars" valor={null} tipo="pesos" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Gratis desde $</span><CampoNumero name="gratis_desde_ars" valor={null} tipo="pesos" placeholder="nunca" className={`${CAMPO} w-full`} /></label>
          <label className="col-span-2"><span className={ETIQUETA}>Plazo</span><input name="plazo" placeholder="24 a 72 h" className={`${CAMPO} w-full`} /></label>
          <label className="col-span-2 sm:col-span-3"><span className={ETIQUETA}>Instrucciones</span><input name="instrucciones" className={`${CAMPO} w-full`} /></label>
          <div><button className={PRIMARIO}>Crear</button></div>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar método de envío" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="nombre">Nombre</ThOrden><ThOrden col="tipo">Tipo</ThOrden><ThOrden col="activo">Activo</ThOrden><ThOrden col="costo" n>Costo</ThOrden>
              <ThOrden col="gratis" n>Gratis desde</ThOrden><ThOrden col="plazo">Plazo</ThOrden><ThOrden col="instrucciones">Instrucciones</ThOrden><ThOrden col="orden" n desc={false} porDefecto>Orden</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {metodos.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{q ? "Ningún método coincide." : "Todavía no hay métodos de envío. Agregá uno con «Nuevo método de envío» (ej. Retiro en el local)."}</td></tr>}
            {vista.map((m) => editar === m.id ? (
              <tr key={m.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={9} className={TD}>
                  <form action={accionGuardarEnvio} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-start">
                    <input type="hidden" name="id" value={m.id} />
                    <label className="col-span-2"><span className={ETIQUETA}>Nombre que ve el comprador</span>
                      <input name="nombre" defaultValue={m.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                    <label className="col-span-2"><span className={ETIQUETA}>Tipo</span><SelectorTipo valor={m.tipo} /></label>
                    <label><span className={ETIQUETA}>Costo $</span>
                      <CampoNumero name="costo_ars" valor={m.costo} tipo="pesos" className={`${CAMPO} w-full`} /></label>
                    <label><span className={ETIQUETA}>Gratis desde $</span>
                      <CampoNumero name="gratis_desde_ars" valor={m.gratis} tipo="pesos" placeholder="nunca" className={`${CAMPO} w-full`} /></label>
                    <label className="col-span-2"><span className={ETIQUETA}>Plazo</span>
                      <input name="plazo" defaultValue={m.plazo ?? ""} placeholder="24 a 72 h" className={`${CAMPO} w-full`} /></label>
                    <label className="col-span-2 sm:col-span-3"><span className={ETIQUETA}>Instrucciones</span>
                      <input name="instrucciones" defaultValue={m.instrucciones ?? ""} placeholder="Ej. Retirá por Av. Colón 1234, lun a vie de 9 a 18" className={`${CAMPO} w-full`} /></label>
                    <label><span className={ETIQUETA}>Orden</span>
                      <CampoNumero name="orden" valor={m.orden} tipo="entero" className={`${CAMPO} w-full`} /></label>
                    <details className="col-span-2 sm:col-span-6 group" open={m.tipo === "por_provincia"}>
                      <summary className={DESPLEGABLE_CHICO}>Tarifas por provincia (para el tipo &quot;Por provincia&quot;) <span className={FLECHA}>▾</span></summary>
                      <input type="hidden" name="tarifas_editadas" value="1" />
                      <p className="text-[11px] text-[#5C6B76] my-1">Vacía = usa la de &quot;Resto del país&quot; (y si ésa también está vacía, el costo de arriba).</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                        {PROVINCIAS.map((p, i) => (
                          <label key={p}><span className={ETIQUETA}>{p}</span>
                            <CampoNumero name={`tarifa_${i}`} valor={m.tarifas?.[p] ?? null} tipo="pesos" className={`${CAMPO} w-full`} /></label>
                        ))}
                        <label><span className={`${ETIQUETA} text-[#16577F]`}>Resto del país</span>
                          <CampoNumero name="tarifa_resto" valor={m.tarifas?.["*"] ?? null} tipo="pesos" className={`${CAMPO} w-full`} /></label>
                      </div>
                    </details>
                    <div className="col-span-2 sm:col-span-6 flex gap-2">
                      <button className={VERDE}>Guardar</button>
                      <Link href={url(BASE, filtros)} className={SUAVE} scroll={false}>Cancelar</Link>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={m.id} className={TR}>
                <td className={`${TD} font-semibold`}>{m.nombre}</td>
                <td className={TD}>{TIPOS_ENVIO[m.tipo]?.texto ?? m.tipo}</td>
                <td className={TD}><Interruptor accion={accionActivarEnvio} prendido={m.activo} campos={{ id: String(m.id) }} etiqueta={m.activo ? "Sí" : "No"}
                  deshabilitado={!m.activo && !TIPOS_ENVIO[m.tipo]?.disponible} /></td>
                <td className={TDN}>{costoTexto(m)}</td>
                <td className={TDN}>{m.tipo === "retiro" || m.tipo === "a_convenir" ? "—" : m.gratis == null ? "Nunca" : pesos(m.gratis)}</td>
                <td className={TD}>{m.plazo ?? "—"}</td>
                <td className={`${TD} text-[#5C6B76]`}>{m.instrucciones ?? "—"}</td>
                <td className={TDN}>{m.orden}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { ...filtros, editar: m.id })} />
                    <TachoConfirmar accion={accionBorrarEnvio} campos={{ id: String(m.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={metodos.length} />
      <p className="text-[11px] text-[#5C6B76] mt-1">Nace apagado. &quot;Por provincia&quot; se abre para cargar la tarifa de cada provincia. En los de OCA, el costo lo calcula OCA con el peso y las medidas del carrito; &quot;Costo $&quot; se le suma (embalaje, por ejemplo).</p>
    </Pantalla>
  );
}
