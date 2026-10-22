// Stock › Envíos a Full › Costos de Full (lib/full/costos.ts): las tarifas de Full por tamaño (lápiz
// por fila) y, por mes y cuenta, lo que cobró ML (almacenamiento, colecta, otros), lo estimado del
// mes que ML todavía no facturó y cuánto quedó repartido entre los productos.

import Link from "next/link";
import { SUAVE, VERDE } from "@/app/botones";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import CampoNumero from "@/app/componentes/CampoNumero";
import { entrarErp, Pantalla, Avisos, Lapiz, TituloSeccion, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO } from "@/app/componentes/erp";
import { formatear } from "@/lib/moneda";
import { fechaHora } from "@/app/ventas/formato";
import { tarifas, resumenPorMes, tarifasDistintas, ultimaLecturaCargos, TAMANOS, DIAS_STOCK_ANTIGUO } from "@/lib/full/costos";
import { PestanasFull } from "../piezas";
import { accionGuardarTarifa, accionLeerCargos } from "../acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; editar?: string };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesTexto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

export default async function CostosFull({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("full_ver");
  const sp = await searchParams;
  const [tars, meses, distintas, ultima] = await Promise.all([
    tarifas(s.org.id), resumenPorMes(s.org.id), tarifasDistintas(s.org.id), ultimaLecturaCargos(s.org.id),
  ]);
  const $ = (x: number | null | undefined) => (x ? formatear(x, "ARS") : "—");

  return (
    <Pantalla titulo="Envíos a Full" subtitulo="Lo que cuesta tener mercadería en Full: las tarifas y lo que cobró Mercado Libre."
      acciones={<BotonTarea accion={accionLeerCargos} tipo="full-cargos" texto="Leer cargos de ML ahora" clase={SUAVE} />}>
      <Avisos sp={sp} />
      <PestanasFull org={s.org.id} activa="costos" />

      {distintas.length > 0 && (
        <p role="alert" className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          Mercado Libre cobró almacenamiento a un precio que no coincide con ninguna tarifa cargada:{" "}
          {distintas.map((d) => `${formatear(d.por_unidad, "ARS")} por unidad y día en ${d.cuenta} (hasta el ${d.fecha.split("-").reverse().join("/")})`).join(" · ")}.
          Revisá las tarifas: puede que hayan cambiado.
        </p>
      )}

      <TituloSeccion titulo="Tarifas de Full" />
      <p className="text-[11px] text-[#5C6B76] mb-1">
        Las de la ayuda de Mercado Libre. El tamaño sale de las medidas y el peso del paquete. El stock antiguo se cobra por mes y por unidad
        desde los {DIAS_STOCK_ANTIGUO} días en Full, además del almacenamiento diario. Si Mercado Libre cambia una tarifa, corregila con el lápiz.
      </p>
      <div className={`${CAJA_TABLA} mb-5`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Tamaño</th><th className={TH}>Medidas</th><th className={THN}>Almacenamiento por unidad y día</th>
              <th className={THN}>Stock antiguo 4 a 6 meses</th><th className={THN}>6 a 12 meses</th><th className={THN}>Más de 12 meses</th>
              <th className={THN}>Retiro por unidad</th><th />
            </tr>
          </thead>
          <tbody>
            {tars.map((t) => sp.editar === t.tamano ? (
              <tr key={t.tamano} className={`${TR} bg-[#FAFBFC]`}>
                <td className={TD}><b>{TAMANOS[t.tamano].texto}</b></td>
                <td className={`${TD} text-[#5C6B76]`}>{TAMANOS[t.tamano].medidas}</td>
                {(["almacenamiento_dia", "antiguo_4_6", "antiguo_6_12", "antiguo_12", "retiro"] as const).map((k) => (
                  <td key={k} className={TDN}><CampoNumero name={k} valor={t[k]} tipo="pesos" form={`tarifa-${t.tamano}`} className={`${CAMPO} w-24`} /></td>
                ))}
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <form id={`tarifa-${t.tamano}`} action={accionGuardarTarifa} className="inline-flex gap-1">
                    <input type="hidden" name="tamano" value={t.tamano} />
                    <button className={VERDE}>Guardar</button>
                    <Link href="/stock/full/costos" className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={t.tamano} className={TR}>
                <td className={TD}><b>{TAMANOS[t.tamano].texto}</b></td>
                <td className={`${TD} text-[#5C6B76]`}>{TAMANOS[t.tamano].medidas}</td>
                <td className={TDN}>{formatear(t.almacenamiento_dia, "ARS")}</td>
                <td className={TDN}>{formatear(t.antiguo_4_6, "ARS")}</td>
                <td className={TDN}>{formatear(t.antiguo_6_12, "ARS")}</td>
                <td className={TDN}>{formatear(t.antiguo_12, "ARS")}</td>
                <td className={TDN}>{formatear(t.retiro, "ARS")}</td>
                <td className={`${TD} text-right`}><Lapiz href={`/stock/full/costos?editar=${t.tamano}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TituloSeccion titulo={`Por mes y cuenta (${meses.length})`} />
      <p className="text-[11px] text-[#5C6B76] mb-1">
        Lo cobrado sale de la facturación de Mercado Libre cuando cierra cada mes (se lee sola; última lectura: {ultima ? fechaHora(ultima) : "nunca"}).
        Mientras no cierra, el almacenamiento se estima con las unidades que hay en Full cada día por la tarifa de su tamaño.
        «Repartido en productos» es lo que quedó asignado a cada producto para la <Link href="/informes/rentabilidad" className="text-[#16577F] hover:underline">rentabilidad</Link>;
        lo cobrado de antes de que el sistema anotara el stock de Full no se puede repartir.
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Mes</th><th className={TH}>Cuenta</th><th className={THN}>Almacenamiento cobrado</th><th className={THN}>Colecta cobrada</th>
              <th className={THN}>Otros cargos</th><th className={THN}>Almacenamiento estimado</th><th className={THN}>Repartido en productos</th>
            </tr>
          </thead>
          <tbody>
            {meses.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Todavía no hay cargos de Full leídos ni stock en Full.</td></tr>}
            {meses.map((m) => (
              <tr key={`${m.canal_id}-${m.mes}`} className={TR} data-canal={m.canal_id}>
                <td className={TD}>{mesTexto(m.mes)}</td>
                <td className={TD}>{m.cuenta}</td>
                <td className={TDN}>{$(m.almacenamiento)}</td>
                <td className={TDN}>{$(m.colecta)}</td>
                <td className={TDN}>{$(m.otros)}</td>
                <td className={TDN}>{$(m.estimado)}</td>
                <td className={TDN}>{$(m.asignado + m.estimado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
