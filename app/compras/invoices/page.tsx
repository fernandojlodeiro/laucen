// Invoices de compra (historial): subir los Excel de los proveedores del exterior y la lista de los cargados. Sólo
// estadística: no mueven stock ni costos. La ficha de cada uno (vista previa, correcciones, confirmar) está en [id].

import Link from "next/link";
import { leerOrden, paginarEnMemoria } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { TachoConfirmar, BotonConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import { VERDE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, Estado, BotonesFicha, Dato, TituloSeccion, editandoFicha, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { configInvoices, diaAr, listaInvoices, opcionesProveedores, ORDEN_INVOICES, VIAS } from "@/lib/compras/invoices";
import SubirInvoices from "./SubirInvoices";
import { accionBorrarInvoice, accionConfirmarListos, accionGuardarDemoras } from "./acciones";

export const dynamic = "force-dynamic";
// Leer varios Excel puede tardar.
export const maxDuration = 300;

type SP = { p?: string; orden?: string; dir?: string; ok?: string; error?: string; editar?: string };

export default async function Invoices({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const [todas, proveedores, cfg] = await Promise.all([
    listaInvoices(s.org.id, leerOrden(sp, ORDEN_INVOICES, "estado = 'confirmado', fecha desc nulls first, id desc")),
    opcionesProveedores(s.org.id), configInvoices(s.org.id),
  ]);
  const filas = paginarEnMemoria(todas, sp);
  const total = todas.length;
  const listos = todas.filter((f) => f.estado === "revisar" && f.fecha && !f.fecha_dudosa).length;
  const editandoDemoras = editandoFicha(sp, "demoras");
  const usd = (n: number) => `US$ ${formatearNumero(Math.round(n * 100) / 100, "decimal")}`;

  return (
    <Pantalla titulo="Invoices de compra" subtitulo="Historial de lo que se compró al exterior: fecha, cantidad y precio de cada producto. No mueve stock ni costos." ancho="max-w-6xl"
      acciones={listos > 0 ? <BotonConfirmar accion={accionConfirmarListos} campos={{}} clase={VERDE} texto={`Confirmar los ${listos} con fecha segura`}
        pregunta={`¿Confirmar los ${listos} invoices a revisar que tienen la fecha segura?`} corriendo="Confirmando…" /> : null}>
      <Avisos sp={sp} />
      <SubirInvoices organizacionId={s.org.id} proveedores={proveedores} proveedor={todas.find((f) => f.proveedor_id)?.proveedor_id ?? null} />

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="fecha" porDefecto>Fecha</ThOrden><ThOrden col="numero">Número</ThOrden><ThOrden col="archivo">Archivo</ThOrden>
              <ThOrden col="proveedor">Proveedor</ThOrden><th className={TH}>Vía</th>
              <ThOrden col="renglones" n>Renglones</ThOrden><ThOrden col="unidades" n>Unidades</ThOrden><ThOrden col="total" n>Total</ThOrden>
              <ThOrden col="estado">Estado</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>Todavía no se cargó ningún invoice.</td></tr>}
            {filas.map((f) => (
              <tr key={f.id} className={TR}>
                <td className={TDN}>
                  <Link href={`/compras/invoices/${f.id}`} className="hover:underline">{diaAr(f.fecha)}</Link>
                  {f.fecha_dudosa && <span className="ml-1 text-[#8a6100]" title="Día y mes se pueden leer al revés: revisala">⚠</span>}
                </td>
                <td className={TD}><Link href={`/compras/invoices/${f.id}`} className="font-semibold text-[#16577F] hover:underline">{f.numero ?? "—"}</Link></td>
                <td className={`${TD} text-[#5C6B76] max-w-[16rem] truncate`} title={f.archivo}>{f.archivo}</td>
                <td className={TD}>{f.proveedor_id ? <Link href={`/compras/proveedores?id=${f.proveedor_id}`} className="text-[#16577F] hover:underline">{f.proveedor}</Link> : "—"}</td>
                <td className={TD}>{VIAS[f.via]}{f.compra_courier ? ` · ${f.compra_courier}` : ""}</td>
                <td className={TDN}>
                  {formatearNumero(f.renglones, "entero")}
                  {f.sin_producto > 0 && <span className="block text-[10px] text-[#C03420]">{f.sin_producto} sin producto</span>}
                </td>
                <td className={TDN}>{formatearNumero(f.unidades, "entero")}</td>
                <td className={TDN}>{f.total_usd == null ? <span className="text-[#5C6B76]">sin precio</span> : usd(f.total_usd)}</td>
                <td className={TD}>{f.estado === "confirmado" ? <Estado texto="Confirmado" tono="verde" /> : <Estado texto="A revisar" tono="ambar" />}</td>
                <td className={`${TD} text-right`}>
                  <TachoConfirmar accion={accionBorrarInvoice} campos={{ id: String(f.id) }} pregunta="¿Borrar el invoice?" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />

      <section className="mt-6">
        <TituloSeccion titulo="Demora estimada de llegada">
          <BotonesFicha editando={editandoDemoras} ver="/compras/invoices" editar="/compras/invoices?editar=demoras" form="demoras" />
        </TituloSeccion>
        <form id="demoras" action={accionGuardarDemoras} className={`${CAJA} flex flex-wrap items-start gap-4`}>
          {editandoDemoras ? (
            <>
              <label className="w-40"><span className={ETIQUETA}>Por avión (días)</span><CampoNumero name="demora_avion" valor={cfg.demoraAvion} tipo="entero" className={`${CAMPO} w-full`} /></label>
              <label className="w-40"><span className={ETIQUETA}>Por barco (días)</span><CampoNumero name="demora_barco" valor={cfg.demoraBarco} tipo="entero" className={`${CAMPO} w-full`} /></label>
            </>
          ) : (
            <>
              <Dato etiqueta="Por avión (días)" numero className="w-40">{String(cfg.demoraAvion)}</Dato>
              <Dato etiqueta="Por barco (días)" numero className="w-40">{String(cfg.demoraBarco)}</Dato>
            </>
          )}
          <p className="flex-1 min-w-60 text-[11px] text-[#5C6B76] self-center">
            La fecha del invoice es la de emisión en el exterior. La llegada se estima sumándole estos días según cómo vino, y desde ahí se cuenta cuánto tardó en venderse cada compra.
          </p>
        </form>
      </section>
    </Pantalla>
  );
}
