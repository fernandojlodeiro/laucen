// Razones sociales (Configuración): los CUIT con los que opera la organización.
// Comparten el stock, el catálogo, los clientes y los proveedores; cada una
// lleva su ARCA, su facturación, su libro de IVA, sus cuentas corrientes y sus
// fondos. La principal factura todo lo que no sale de una cuenta de Mercado
// Libre con razón social propia (eso se elige en cada canal).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { cuitLegible } from "@/lib/cuit";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_RAZONES_SOCIALES, CONDICIONES_RS } from "./lista";
import { accionBorrarRazonSocial, accionCrearRazonSocial, accionGuardarRazonSocial, accionHacerPrincipal } from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/razones-sociales";
type SP = { q?: string; contiene?: string; editar?: string; p?: string; orden?: string; dir?: string; nuevo?: string; ok?: string; error?: string };
type Fila = {
  id: number; nombre: string | null; razon_social: string; cuit: string; condicion_iva: string; domicilio: string | null; iibb: string | null;
  inicio_actividades: string | null; punto_venta: number; ambiente: string; es_principal: boolean; conectada: boolean; canales: string | null;
};

const AYUDA = "block text-[10px] text-[#5C6B76] mt-0.5";

function Campos({ e }: { e?: Fila }) {
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-4 items-start">
      <label><span className={ETIQUETA}>Nombre corto</span>
        <input name="nombre" defaultValue={e?.nombre ?? ""} placeholder="Ej. Daitom" className={`${CAMPO} w-full`} />
        <span className={AYUDA}>Para reconocerla en los selectores.</span></label>
      <label className="col-span-2"><span className={ETIQUETA}>Razón social</span>
        <input name="razon_social" defaultValue={e?.razon_social ?? ""} className={`${CAMPO} w-full`} autoFocus />
        <span className={AYUDA}>Como figura en ARCA.</span></label>
      <label><span className={ETIQUETA}>CUIT</span>
        <input name="cuit" defaultValue={cuitLegible(e?.cuit)} maxLength={13} inputMode="numeric" placeholder="30-71234567-8" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Condición IVA</span>
        <select name="condicion_iva" defaultValue={e?.condicion_iva ?? "responsable_inscripto"} className={`${CAMPO} w-full`}>
          {Object.entries(CONDICIONES_RS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></label>
      <label className="col-span-2"><span className={ETIQUETA}>Domicilio comercial</span>
        <input name="domicilio" defaultValue={e?.domicilio ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Punto de venta</span>
        <CampoNumero name="punto_venta" valor={e?.punto_venta ?? 1} tipo="entero" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Ingresos Brutos</span>
        <input name="iibb" defaultValue={e?.iibb ?? ""} className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Inicio de actividades</span>
        <input type="date" name="inicio_actividades" defaultValue={e?.inicio_actividades ?? ""} className={`${CAMPO} w-full`} /></label>
    </div>
  );
}

export default async function RazonesSociales({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("empresa_config");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const editar = Number(sp.editar) || 0;
  const base = await LISTA_RAZONES_SOCIALES.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const filas = await consulta<Fila>(`
    select e.id::int, e.nombre, e.razon_social, e.cuit, e.condicion_iva, e.domicilio, e.iibb, to_char(e.inicio_actividades, 'YYYY-MM-DD') inicio_actividades,
           e.punto_venta, e.ambiente, e.es_principal,
           exists (select 1 from arca_credencial a where a.emisor_id = e.id and a.certificado is not null) conectada,
           (select string_agg(ca.nombre, ', ' order by ca.nombre) from canal ca where ca.emisor_id = e.id) canales
      from ${base.desde} where ${base.donde} order by ${base.orden}`, base.valores);
  const ordenadas = ordenarEnMemoria(filas, sp, {
    id: (e) => e.id, nombre: (e) => e.nombre ?? e.razon_social, cuit: (e) => e.cuit, iva: (e) => e.condicion_iva, pv: (e) => e.punto_venta,
    canales: (e) => e.canales,
  });
  const pagina = paginarEnMemoria(ordenadas, sp);
  const aqui = (extra: Record<string, string | number | null>) => url(BASE, { q: q || null, contiene: comienza ? null : "1", p: sp.p, orden: sp.orden, dir: sp.dir, ...extra });

  return (
    <Pantalla titulo="Razones sociales"
      subtitulo="Los CUIT con los que operás. Comparten stock, catálogo, clientes y proveedores; cada una lleva su ARCA, sus facturas, su libro de IVA, sus cuentas corrientes y sus fondos."
      acciones={<><AccionesExcel lista={LISTA_RAZONES_SOCIALES} org={s.org.id} /><BotonNuevo texto="Nueva razón social" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva razón social" sinBoton>
        <form action={accionCrearRazonSocial} className="grid gap-2">
          <Campos />
          <div><button className={PRIMARIO}>Crear</button></div>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por nombre, razón social o CUIT" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="id" n desc={false}>N.º</ThOrden><ThOrden col="nombre" porDefecto>Razón social</ThOrden><ThOrden col="cuit">CUIT</ThOrden>
              <ThOrden col="iva">Condición IVA</ThOrden><ThOrden col="pv" n>Pto. de venta</ThOrden><ThOrden col="canales">Cuentas de ML y canales</ThOrden>
              <th className="py-1.5 px-2 text-left font-semibold">ARCA</th><th />
            </tr>
          </thead>
          <tbody>
            {pagina.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>{q ? "No hay razones sociales con esa búsqueda." : "Todavía no cargaste ninguna razón social."}</td></tr>}
            {pagina.map((e) => editar === e.id ? (
              <tr key={e.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={8} className={TD}>
                  <form action={accionGuardarRazonSocial} className="grid gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <span className="text-[11px] font-semibold text-[#5C6B76]">Razón social N.º {e.id}</span>
                    <Campos e={e} />
                    <div className="flex gap-2 items-center">
                      <button className={VERDE}>Guardar</button>
                      <Link href={aqui({})} className={SUAVE} scroll={false}>Cancelar</Link>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={e.id} className={TR}>
                <td className={`${TDN} text-[#5C6B76]`}>{e.id}</td>
                <td className={TD}>
                  <span className="font-semibold">{e.nombre ?? e.razon_social}</span>
                  {e.es_principal && <span className="ml-1"><Estado texto="Principal" tono="azul" /></span>}
                  {e.nombre && e.nombre !== e.razon_social && <span className="block text-[11px] text-[#5C6B76]">{e.razon_social}</span>}
                </td>
                <td className={`${TD} whitespace-nowrap`}>{cuitLegible(e.cuit)}</td>
                <td className={TD}>{CONDICIONES_RS[e.condicion_iva] ?? e.condicion_iva}</td>
                <td className={TDN}>{e.punto_venta}</td>
                <td className={TD}>
                  {e.canales ?? <span className="text-[#5C6B76]">{e.es_principal ? "Todo lo que no tiene otra" : "Ninguno"}</span>}
                </td>
                <td className={TD}>
                  <Link href={url("/config/arca", { rs: e.id })} className="hover:underline">
                    {e.conectada ? <Estado texto="Conectada" tono="verde" /> : <Estado texto="Sin conectar" tono="amarillo" />}
                  </Link>
                </td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1 items-center">
                    {!e.es_principal && (
                      <form action={accionHacerPrincipal}><input type="hidden" name="id" value={e.id} /><button className={SUAVE}>Hacer principal</button></form>
                    )}
                    <Lapiz href={aqui({ editar: e.id })} />
                    {!e.es_principal && <TachoConfirmar accion={accionBorrarRazonSocial} campos={{ id: String(e.id) }} pregunta="¿Borrar?" />}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={ordenadas.length} />
      <p className="text-xs text-[#5C6B76] mt-3">
        A qué razón social va cada cuenta de Mercado Libre se elige en <Link href="/config/canales" className="font-bold underline">Canales</Link>.
        Lo que se vende por la tienda web, el local o el mayorista se factura con la principal.
      </p>
    </Pantalla>
  );
}
