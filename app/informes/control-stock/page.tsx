// Informe: control de stock (lib/informes/control-stock.ts). Arriba la situación de hoy por cantidad de stock y lo que
// está «En búsqueda»; abajo lo que pasó en el período: por día, por persona y cada control.

import Link from "next/link";
import RangoFechas from "@/app/componentes/RangoFechas";
import Pestanas from "@/app/componentes/Pestanas";
import FotosProducto from "@/app/componentes/FotosProducto";
import TituloCorto from "@/app/componentes/TituloCorto";
import { CasillaViva } from "@/app/componentes/BuscadorVivo";
import { Paginado } from "@/app/componentes/Lista";
import { entrarErp, Pantalla, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion, Estado, url } from "@/app/componentes/erp";
import { formatearNumero } from "@/lib/numeros";
import { leerPagina, POR_PAGINA } from "@/lib/lista";
import { RESULTADOS, DIAS_CONTROL, type Resultado } from "@/lib/deposito/control";
import {
  leerFiltroControl, situacionActual, enBusquedaAhora, resumenPeriodo, cuentasPorResultado, controlesDelPeriodo, type Resumen,
} from "@/lib/informes/control-stock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = Record<string, string | undefined>;
const BASE = "/informes/control-stock";
const pesos = (n: number) => `$ ${formatearNumero(Math.round(n), "pesos")}`;
const entero = (n: number) => formatearNumero(n, "entero");
const TONO: Record<Resultado, "verde" | "rojo" | "ambar" | "azul"> = { ok: "verde", faltante: "rojo", a_buscar: "ambar", sobrante: "azul" };

export default async function InformeControlStock({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("informes_stock_ver");
  const sp = await searchParams;
  const f = leerFiltroControl(sp);
  const pagina = leerPagina(sp);
  const [bandas, busqueda, porDia, porPersona, cuentas, controles] = await Promise.all([
    situacionActual(s.org.id, f),
    enBusquedaAhora(s.org.id),
    resumenPeriodo(s.org.id, f, "dia"),
    resumenPeriodo(s.org.id, f, "persona"),
    cuentasPorResultado(s.org.id, f),
    controlesDelPeriodo(s.org.id, f, { desde: pagina.desde, cuantos: POR_PAGINA }),
  ]);
  const tot = bandas.reduce((t, b) => ({ productos: t.productos + b.productos, lugares: t.lugares + b.lugares, al_dia: t.al_dia + b.al_dia,
    pendientes: t.pendientes + b.pendientes, por_ingreso: t.por_ingreso + b.por_ingreso, valor: t.valor + b.valor }),
    { productos: 0, lugares: 0, al_dia: 0, pendientes: 0, por_ingreso: 0, valor: 0 });
  const filtrosCola = { lugar: sp.lugar ?? null, ml: sp.ml ?? null };
  const periodo = { desde: f.desde, hasta: f.hasta, ...filtrosCola };
  const totalDetalle = f.resultado ? cuentas[f.resultado] : cuentas.todos;

  return (
    <Pantalla titulo="Control de stock"
      subtitulo={<>Cuánto del stock se controló en el depósito y qué se encontró. Un «lugar» es un producto en una ubicación; está al día si se controló en los últimos {DIAS_CONTROL} días y no le entró mercadería después. Montos a precio de venta.</>}>
      <div className="flex flex-wrap gap-x-4 mb-2">
        <CasillaViva parametro="lugar" activo={f.sinLugar} tildadaDeEntrada etiqueta="Sin GENERAL ni A UBICAR" />
        <CasillaViva parametro="ml" activo={f.soloMl} tildadaDeEntrada etiqueta="Sólo con publicación activa en Mercado Libre" />
      </div>

      <TituloSeccion titulo="Situación de hoy" />
      <div className={`${CAJA_TABLA} mb-3`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH} title="Unidades del producto en los depósitos que venden">Stock</th>
              <th className={THN} title="Productos (variaciones) con ese stock">Productos</th>
              <th className={THN} title="Producto en una ubicación: lo que se controla de a uno">Lugares</th>
              <th className={THN} title={`Controlados en los últimos ${DIAS_CONTROL} días y sin mercadería que haya entrado después`}>Al día</th>
              <th className={THN}>% al día</th>
              <th className={THN} title="Falta controlarlos">Pend.</th>
              <th className={THN} title="Pendientes porque les entró mercadería después del último control">Por ingreso</th>
              <th className={THN} title="Stock por precio de venta">Valor</th>
            </tr>
          </thead>
          <tbody>
            {bandas.map((b) => (
              <tr key={b.orden} className={TR}>
                <td className={TD}>{b.banda} {b.orden === 1 ? "unidad" : "unidades"}</td>
                <td className={TDN}>{entero(b.productos)}</td><td className={TDN}>{entero(b.lugares)}</td>
                <td className={TDN}>{entero(b.al_dia)}</td>
                <td className={TDN}>{b.lugares ? `${formatearNumero(Math.round((b.al_dia / b.lugares) * 1000) / 10, "pct")} %` : "—"}</td>
                <td className={TDN}>{entero(b.pendientes)}</td><td className={TDN}>{entero(b.por_ingreso)}</td>
                <td className={TDN}>{pesos(b.valor)}</td>
              </tr>
            ))}
            {bandas.length === 0 && <tr className={TR}><td className={TD} colSpan={8}>No hay stock para controlar con estos filtros.</td></tr>}
            {bandas.length > 1 && (
              <tr className={`${TR} font-bold`}>
                <td className={TD}>Total</td>
                <td className={TDN}>{entero(tot.productos)}</td><td className={TDN}>{entero(tot.lugares)}</td><td className={TDN}>{entero(tot.al_dia)}</td>
                <td className={TDN}>{tot.lugares ? `${formatearNumero(Math.round((tot.al_dia / tot.lugares) * 1000) / 10, "pct")} %` : "—"}</td>
                <td className={TDN}><Link href={url("/deposito/control", filtrosCola)} className="hover:underline text-[#16577F]">{entero(tot.pendientes)}</Link></td>
                <td className={TDN}>{entero(tot.por_ingreso)}</td><td className={TDN}>{pesos(tot.valor)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
        <Link href="/deposito/control/a-buscar" className={`${CAJA} hover:border-[#16577F]`}>
          <p className="text-[11px] text-[#5C6B76]">En búsqueda ahora</p>
          <p className="text-xl font-bold tabular-nums">{entero(busqueda.controles)} <span className="text-xs font-normal">({entero(busqueda.unidades)} u.)</span></p>
          <p className="text-xs tabular-nums">{pesos(busqueda.valor)}</p>
        </Link>
      </div>

      <TituloSeccion titulo="Lo que pasó en el período" />
      <div className="mb-3"><RangoFechas desde={f.desde} hasta={f.hasta} limpiar={["p"]} /></div>
      <TablaResumen titulo="Por día" filas={porDia} />
      <TablaResumen titulo="Por persona" filas={porPersona} enlace={(r) => url(BASE, { ...periodo, persona: r.clave || null })} />

      <TituloSeccion titulo={`Controles${f.persona ? ` de ${porPersona.find((p) => p.clave === f.persona)?.nombre ?? "una persona"}` : ""}`}>
        {f.persona && <Link href={url(BASE, { ...periodo, resultado: f.resultado })} className="text-xs rounded-lg border border-[#E3E9F0] bg-white px-2 py-1 text-[#16577F]">Ver de todas las personas</Link>}
      </TituloSeccion>
      <Pestanas chica items={[
        { href: url(BASE, { ...periodo, persona: f.persona }), texto: "Todos", cuenta: cuentas.todos, activa: !f.resultado },
        ...(Object.keys(RESULTADOS) as Resultado[]).map((r) => ({ href: url(BASE, { ...periodo, persona: f.persona, resultado: r }), texto: RESULTADOS[r], cuenta: cuentas[r], activa: f.resultado === r })),
      ]} className="mb-0" />
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Producto</th><th className={TH}>Resultado</th><th className={TH} title="Depósito y ubicación">Ubic.</th>
              <th className={THN} title="Lo que decía el sistema">Sist.</th><th className={THN} title="Lo que se vio">Vistas</th>
              <th className={THN} title="Unidades descontadas, pasadas a En búsqueda o sumadas">Dif.</th>
              <th className={THN} title="Diferencia por precio de venta">Valor</th>
              <th className={TH}>Cuándo</th><th className={TH}>Quién</th>
            </tr>
          </thead>
          <tbody>
            {controles.map((c) => (
              <tr key={c.id} className={TR}>
                <td className={TD}>
                  <span className="flex items-start gap-2">
                    <FotosProducto fotos={c.fotos} titulo={c.titulo} />
                    <span className="max-w-80">
                      <Link href={`/catalogo/productos/${c.producto_id}`} className="font-semibold text-[#16577F] hover:underline">{c.sku}</Link>
                      <TituloCorto titulo={c.titulo} />
                    </span>
                  </span>
                </td>
                <td className={TD}>
                  <Estado texto={RESULTADOS[c.resultado]} tono={TONO[c.resultado]} />
                  {c.resultado === "a_buscar" && (
                    <span className="block text-[11px] text-[#5C6B76]">
                      {c.buscando ? <Link href="/deposito/control/a-buscar" className="underline">sin resolver</Link>
                        : `${c.resuelto}: ${c.aparecieron ? `aparecieron ${c.aparecieron}` : "no apareció"}${c.aparecieron && c.aparecieron < c.diferencia ? `, faltan ${c.diferencia - c.aparecieron}` : ""}`}
                    </span>
                  )}
                </td>
                <td className={`${TD} whitespace-nowrap`}>{c.codigo}<span className="block text-[11px] text-[#5C6B76]">{c.deposito}</span></td>
                <td className={TDN}>{c.sistema}</td><td className={TDN}>{c.contado}</td>
                <td className={TDN}>{c.diferencia || "—"}</td>
                <td className={TDN}>{c.diferencia && c.valor != null ? pesos(c.valor) : "—"}</td>
                <td className={`${TD} whitespace-nowrap`}>{c.fecha}</td>
                <td className={TD}>{c.persona ?? "—"}</td>
              </tr>
            ))}
            {controles.length === 0 && <tr className={TR}><td className={TD} colSpan={9}>No hay controles en el período.</td></tr>}
          </tbody>
        </table>
      </div>
      <Paginado total={totalDetalle} />
    </Pantalla>
  );
}

function TablaResumen({ titulo, filas, enlace }: { titulo: string; filas: Resumen[]; enlace?: (r: Resumen) => string }) {
  const t = filas.reduce((a, r) => {
    const x = { ...a };
    for (const k of Object.keys(a) as (keyof typeof a)[]) x[k] = a[k] + (r[k] as number);
    return x;
  }, { controles: 0, ok: 0, faltantes: 0, faltantes_u: 0, faltantes_valor: 0, a_buscar: 0, a_buscar_u: 0, a_buscar_valor: 0, sobrantes: 0, sobrantes_u: 0, aparecieron_u: 0, perdidas_u: 0, perdidas_valor: 0 });
  const fila = (r: Omit<Resumen, "clave" | "nombre">) => (
    <>
      <td className={TDN}>{entero(r.controles)}</td><td className={TDN}>{entero(r.ok)}</td>
      <td className={TDN}>{entero(r.faltantes)}</td><td className={TDN}>{entero(r.faltantes_u)}</td><td className={TDN}>{pesos(r.faltantes_valor)}</td>
      <td className={TDN}>{entero(r.a_buscar)}</td><td className={TDN}>{entero(r.a_buscar_u)}</td><td className={TDN}>{pesos(r.a_buscar_valor)}</td>
      <td className={TDN}>{entero(r.sobrantes_u)}</td>
      <td className={TDN}>{entero(r.aparecieron_u)}</td><td className={TDN}>{entero(r.perdidas_u)}</td><td className={TDN}>{pesos(r.perdidas_valor)}</td>
    </>
  );
  return (
    <>
      <p className="text-xs font-bold text-[#5C6B76] mb-1">{titulo}</p>
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>{titulo === "Por día" ? "Día" : "Persona"}</th>
              <th className={THN} title="Controles hechos">Contr.</th><th className={THN} title="Estaban">Está</th>
              <th className={THN} title="Controles con faltante (se descontó)">No está</th><th className={THN} title="Unidades descontadas">u.</th><th className={THN} title="Valor descontado">$</th>
              <th className={THN} title="Controles que quedaron a buscar">A buscar</th><th className={THN} title="Unidades pasadas a En búsqueda">u.</th><th className={THN} title="Valor pasado a En búsqueda">$</th>
              <th className={THN} title="Unidades de más que se sumaron">Sobr. u.</th>
              <th className={THN} title="Unidades a buscar que aparecieron (el día que se resolvieron)">Aparec. u.</th>
              <th className={THN} title="Unidades a buscar que no aparecieron y se descontaron">No aparec. u.</th><th className={THN} title="Valor de las que no aparecieron">$</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.clave} className={TR}>
                <td className={`${TD} whitespace-nowrap`}>{enlace ? <Link href={enlace(r)} className="text-[#16577F] hover:underline">{r.nombre}</Link> : r.nombre}</td>
                {fila(r)}
              </tr>
            ))}
            {filas.length === 0 && <tr className={TR}><td className={TD} colSpan={13}>Nada en el período.</td></tr>}
            {filas.length > 1 && <tr className={`${TR} font-bold`}><td className={TD}>Total</td>{fila(t)}</tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
