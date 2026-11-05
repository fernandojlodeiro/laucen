// Órdenes de compra al exterior: una por cada llegada (aéreo A, marítimo M o courier C). Se crean subiendo el Excel del
// proveedor. La ficha de cada una (renglones, cajas, publicar en preventa, recibir) está en [id].

import Link from "next/link";
import { leerOrden, paginarEnMemoria } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, coincideBusqueda } from "@/app/componentes/erp";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { formatearNumero } from "@/lib/numeros";
import { diaAr, opcionesProveedores } from "@/lib/compras/invoices";
import { ESTADOS_ORDEN, listaOrdenes, ORDEN_ORDENES, TONO_ESTADO, VIAS_ORDEN } from "@/lib/compras/ordenes";
import SubirOrden from "./SubirOrden";
import { accionBorrarOrden } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type SP = { p?: string; orden?: string; dir?: string; ok?: string; error?: string; q?: string; contiene?: string; estado?: string };

export default async function Ordenes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("compras_ver");
  const sp = await searchParams;
  const [todas, proveedores] = await Promise.all([
    listaOrdenes(s.org.id, leerOrden(sp, ORDEN_ORDENES, "estado = 'recibida', anio desc, codigo desc"), { estado: sp.estado }),
    opcionesProveedores(s.org.id),
  ]);
  const comienza = sp.contiene !== "1";
  const filtradas = sp.q ? todas.filter((o) => coincideBusqueda([o.codigo, o.proveedor, o.archivo], sp.q!, comienza)) : todas;
  const filas = paginarEnMemoria(filtradas, sp);
  const usd = (n: number) => `US$ ${formatearNumero(Math.round(n * 100) / 100, "decimal")}`;

  return (
    <Pantalla titulo="Órdenes de compra al exterior" subtitulo="Lo que viene en camino: una orden por cada llegada. Cuenta como mercadería entrante desde que se confirma." ancho="max-w-6xl">
      <Avisos sp={sp} />
      <SubirOrden organizacionId={s.org.id} proveedores={proveedores} proveedor={todas.find((f) => f.proveedor_id)?.proveedor_id ?? null} />
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="w-72"><BuscadorVivo q={sp.q ?? ""} comienza={comienza} placeholder="Código, proveedor o archivo…" /></div>
        <FiltroVivo parametro="estado" valor={sp.estado ?? ""} etiqueta="Estado">
          <option value="">Todos</option>
          {Object.entries(ESTADOS_ORDEN).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
        </FiltroVivo>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="codigo" porDefecto>Orden</ThOrden><ThOrden col="estado">Estado</ThOrden><ThOrden col="llegada" title="Fecha de arribo para la web">Arribo</ThOrden>
              <th className={TH} title="Preventa: dónde se ofrece">Preventa</th>
              <ThOrden col="proveedor">Proveedor</ThOrden><ThOrden col="unidades" n>Unid.</ThOrden><ThOrden col="total" n>Total</ThOrden><ThOrden col="cajas" n>Cajas</ThOrden>
              <ThOrden col="fecha">Fecha</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>{todas.length ? "Ninguna orden con eso." : "Todavía no se cargó ninguna orden: subí el Excel del proveedor arriba."}</td></tr>}
            {filas.map((o) => (
              <tr key={o.id} className={TR}>
                <td className={TD}>
                  <Link href={`/compras/ordenes/${o.id}`} className="font-bold font-mono text-[#16577F] hover:underline">{o.codigo}</Link>
                  <span className="block text-[10px] text-[#5C6B76]">{VIAS_ORDEN[o.via].texto}</span>
                </td>
                <td className={TD}><Estado texto={ESTADOS_ORDEN[o.estado]} tono={TONO_ESTADO[o.estado]} /></td>
                <td className={`${TD} whitespace-nowrap`}>{diaAr(o.llegada)}{o.llegada_ml && o.llegada_ml !== o.llegada && <span className="block text-[10px] text-[#5C6B76]">ML: {diaAr(o.llegada_ml)}</span>}</td>
                <td className={`${TD} whitespace-nowrap`}>
                  {o.publicar_web && <Estado texto="Web" tono="verde" />} {o.publicar_ml && <Estado texto="ML" tono="amarillo" />}
                  {o.prevendido > 0 && <span className="block text-[10px] text-[#5C6B76]">{o.prevendido} prevendidas</span>}
                </td>
                <td className={TD}>{o.proveedor_id ? <Link href={`/compras/proveedores?id=${o.proveedor_id}`} className="text-[#16577F] hover:underline">{o.proveedor}</Link> : "—"}</td>
                <td className={TDN}>{formatearNumero(o.unidades, "entero")}{o.sin_producto > 0 && <span className="block text-[10px] text-[#C03420]">{o.sin_producto} sin producto</span>}</td>
                <td className={TDN}>{o.total_usd == null ? "—" : usd(o.total_usd)}</td>
                <td className={TDN}>{o.cajas ? formatearNumero(o.cajas, "entero") : "—"}</td>
                <td className={`${TD} whitespace-nowrap`}>{diaAr(o.fecha)}</td>
                <td className={`${TD} text-right`}>
                  {o.estado === "borrador" && <TachoConfirmar accion={accionBorrarOrden} campos={{ id: String(o.id) }} pregunta={`¿Borrar la orden ${o.codigo}?`} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filtradas.length} />
    </Pantalla>
  );
}
