// Ventas › Publicidad en Mercado Libre (orden 596, Fer 12/10): Laucen no maneja la publicidad, la VIGILA. Lee todos
// los días lo que gasta y vende cada campaña y cada anuncio de cada cuenta (lib/publicidad/lectura.ts), lo cruza con el
// tope que se acepta pagar por venta y da un veredicto por producto (SKU), sumando sus publicaciones: SEGUIR, BAJAR,
// CORTAR o SUBIR, con la cuenta a la vista (lib/publicidad/veredicto.ts). Los cambios los hace Fer en el panel de
// Mercado Libre (cada campaña tiene su enlace): la API de publicidad sólo deja leer.

import Link from "next/link";
import { Fragment } from "react";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import Pestanas from "@/app/componentes/Pestanas";
import CampoNumero from "@/app/componentes/CampoNumero";
import FotosProducto from "@/app/componentes/FotosProducto";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { Paginado, ThOrden } from "@/app/componentes/Lista";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { SUAVE, PRIMARIO, VERDE } from "@/app/botones";
import {
  entrarErp, Pantalla, Avisos, BotonesFicha, Dato, Estado, Lapiz, editandoFicha, url,
  CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { consulta, una } from "@/lib/erp/base";
import { paginarEnMemoria } from "@/lib/lista";
import { ordenarFilas, camposDe, type Fila } from "@/lib/listas/tipos";
import { formatearNumero } from "@/lib/numeros";
import { configPublicidad, CAMPOS_NUM } from "@/lib/publicidad/config";
import { anunciantesDe } from "@/lib/publicidad/lectura";
import { enlaceCampana, enlacePanelPublicidad } from "@/lib/publicidad/panel";
import type { FilaProducto } from "@/lib/publicidad/veredicto";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { BASE_PUBLICIDAD as BASE, ESTADOS_CAMPANA, LISTA_PUBLICIDAD, LISTA_PUB_CAMPANAS, VEREDICTOS, campanas, productosFiltrados } from "./lista";
import { accionBorrarTope, accionCrearTope, accionGuardarConfigPublicidad, accionGuardarTope, accionLeerPublicidad } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type SP = Record<string, string | undefined>;

const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${formatearNumero(n, "pct")} %`);
const entero = (n: number | null | undefined) => (n == null ? "—" : formatearNumero(n, "entero"));
const TONO = { verde: "verde", amarillo: "amarillo", rojo: "rojo", gris: "gris" } as const;
const FONDO: Record<string, string> = { rojo: "bg-[#FDF1EF]", amarillo: "bg-[#FFFBEF]", verde: "", gris: "" };

export default async function Publicidad({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("publicidad_ver");
  const sp = await searchParams;
  const ver = ["campanas", "topes", "config"].includes(sp.ver ?? "") ? sp.ver! : "productos";
  const ctx = { org: s.org.id, moneda: s.moneda };
  const [cfg, anunciantes, todos, camps, topes, lectura, canales] = await Promise.all([
    configPublicidad(s.org.id), anunciantesDe(s.org.id), productosFiltrados(s.org.id, {}),
    campanas(s.org.id, (await configPublicidad(s.org.id)).ventanaDias),
    consulta<{ n: number }>("select count(*)::int n from pub_tope where organizacion_id = $1", [s.org.id]),
    una<{ fin_ts: Date | null; error: string | null }>("select fin_ts, error from pub_lectura where organizacion_id = $1 and fin_ts is not null order by id desc limit 1", [s.org.id]),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' order by nombre", [s.org.id]),
  ]);
  const cuantos = (v: string) => todos.filter((f) => f.veredicto === v).length;
  const activas = camps.filter((c) => c.estado === "active");
  const ML_SUBE = camps.filter((c) => c.estado === "active" && c.presupuesto_automatico);

  return (
    <Pantalla titulo="Publicidad en Mercado Libre"
      subtitulo={`Lo que gasta y vende la publicidad de cada cuenta y qué hacer con cada producto. Se lee de Mercado Libre cada ${cfg.leerCadaHoras} horas${lectura?.fin_ts ? ` (última: ${new Date(lectura.fin_ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })})` : ""}. Los cambios se hacen en el panel de Mercado Libre.`}
      acciones={
        <span className="inline-flex flex-wrap items-center gap-2">
          {ver === "productos" && <AccionesExcel lista={LISTA_PUBLICIDAD} org={s.org.id} />}
          {ver === "campanas" && <AccionesExcel lista={LISTA_PUB_CAMPANAS} org={s.org.id} />}
          {ver === "topes" && <BotonNuevo texto="Nueva excepción" />}
          {ver === "config" && <BotonesFicha editando={editandoFicha(sp)} ver={`${BASE}?ver=config`} editar={`${BASE}?ver=config&editar=ficha`} />}
          <BotonTarea accion={accionLeerPublicidad} tipo="publicidad" clase={SUAVE} texto="Leer ahora de Mercado Libre" />
        </span>
      }>
      <Avisos sp={sp} />
      {lectura?.error && <p className="text-xs text-[#C03420] bg-[#FDF1EF] rounded-lg px-3 py-2 mb-3">La última lectura tuvo problemas: {lectura.error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-4">
        <Resumen texto="CORTAR" n={cuantos("cortar")} tono="rojo" href={url(BASE, { veredicto: "cortar" })} />
        <Resumen texto="BAJAR" n={cuantos("bajar")} tono="amarillo" href={url(BASE, { veredicto: "bajar" })} />
        <Resumen texto="SEGUIR" n={cuantos("seguir")} tono="verde" href={url(BASE, { veredicto: "seguir" })} />
        <Resumen texto="SUBIR" n={cuantos("subir")} tono="verde" href={url(BASE, { veredicto: "subir" })} />
        <Resumen texto="Campañas activas" n={activas.length} tono="azul" href={url(BASE, { ver: "campanas" })} />
        <Resumen texto={`Gastado (${cfg.ventanaDias} días)`} valor={pesos(todos.reduce((a, f) => a + f.costo, 0))} tono="gris" />
      </div>
      {ML_SUBE.length > 0 && (
        <p className="text-xs font-bold text-[#C03420] bg-[#FDF1EF] border border-[#EFD3CE] rounded-lg px-3 py-2 mb-3">
          ⚠ Mercado Libre sube el presupuesto solo en {ML_SUBE.map((c) => `${c.nombre} (${c.canal})`).join(", ")}: el gasto puede pasar el presupuesto cargado.
        </p>
      )}

      <Pestanas items={[
        { href: url(BASE, {}), texto: "Por producto", cuenta: todos.length, activa: ver === "productos" },
        { href: url(BASE, { ver: "campanas" }), texto: "Campañas", cuenta: camps.length, activa: ver === "campanas" },
        { href: url(BASE, { ver: "topes" }), texto: "Excepciones al tope", cuenta: topes[0]?.n ?? 0, activa: ver === "topes" },
        { href: url(BASE, { ver: "config" }), texto: "Configuración", activa: ver === "config" },
      ]} />

      {ver === "productos" && <Productos sp={sp} ctx={ctx} canales={canales} cfgVentas={cfg.ventas} ventana={cfg.ventanaDias} />}
      {ver === "campanas" && <Campanas filas={camps} anunciantes={anunciantes} ventana={cfg.ventanaDias} />}
      {ver === "topes" && <Topes org={s.org.id} sp={sp} general={cfg.pctMax} />}
      {ver === "config" && <Configuracion sp={sp} cfg={cfg} />}
    </Pantalla>
  );
}

function Resumen({ texto, n, valor, tono, href }: { texto: string; n?: number; valor?: string; tono: "rojo" | "amarillo" | "verde" | "azul" | "gris"; href?: string }) {
  const c = { rojo: "text-[#C03420]", amarillo: "text-[#8a6100]", verde: "text-[#1F6E4A]", azul: "text-[#16577F]", gris: "text-[#2B3A45]" }[tono];
  const cuerpo = <><span className="block text-[11px] font-semibold text-[#5C6B76]">{texto}</span><span className={`block text-lg font-bold tabular-nums text-right ${c}`}>{valor ?? entero(n ?? 0)}</span></>;
  return href ? <Link href={href} className={`${CAJA} block hover:border-[#16577F]`}>{cuerpo}</Link> : <div className={CAJA}>{cuerpo}</div>;
}

async function Productos({ sp, ctx, canales, cfgVentas, ventana }: { sp: SP; ctx: { org: string; moneda: "ARS" | "USD" }; canales: { id: number; nombre: string }[]; cfgVentas: string; ventana: number }) {
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const campos = await camposDe(LISTA_PUBLICIDAD, ctx);
  const filtradas = ordenarFilas(campos, (await productosFiltrados(ctx.org, sp)) as unknown as Fila[], sp) as unknown as FilaProducto[];
  const filas = paginarEnMemoria(filtradas, sp);
  const abierto = sp.abrir ?? null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar SKU, producto o MLA" limpiar={["p", "abrir"]} />
        <FiltroVivo parametro="veredicto" valor={sp.veredicto ?? ""} etiqueta="Veredicto" limpiar={["p"]}>
          <option value="">Todos los veredictos</option>
          {Object.entries(VEREDICTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="canal" valor={sp.canal ?? ""} etiqueta="Cuenta" limpiar={["p"]}>
          <option value="">Todas las cuentas</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
      </div>
      <p className="text-[11px] text-[#5C6B76] mb-2">
        Últimos {ventana} días. «Ventas por publicidad» son las que Mercado Libre atribuye al anuncio ({cfgVentas === "totales" ? "directas e indirectas" : "sólo directas: compró lo que tocó en el anuncio"});
        son las que cuentan para el veredicto. «Ventas totales» son todas las del producto en Laucen (todos los canales), sólo para comparar.
        Tocá un producto para ver cada publicación.
      </p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="veredicto">Veredicto</ThOrden>
              <ThOrden col="sku">Producto</ThOrden>
              <ThOrden col="costo" n>Gastado</ThOrden>
              <ThOrden col="clics" n>Clics</ThOrden>
              <ThOrden col="ventas" n>Ventas por publicidad</ThOrden>
              <ThOrden col="ventasTotales" n>Ventas totales</ThOrden>
              <ThOrden col="porVenta" n>Publicidad por venta</ThOrden>
              <ThOrden col="pctPorVenta" n>% del precio</ThOrden>
              <ThOrden col="pctMax" n>Tope</ThOrden>
              <th className={TH}>Por qué</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={10} className={`${TD} text-[#5C6B76]`}>{q || sp.veredicto || sp.canal ? "Ningún producto coincide." : "No hay gasto de publicidad en los días que se miran (o todavía no se leyó: «Leer ahora de Mercado Libre»)."}</td></tr>}
            {filas.map((f) => (
              <Fragment key={f.clave}>
                <tr className={`${TR} ${FONDO[f.color]}`}>
                  <td className={TD}><Estado texto={VEREDICTOS[f.veredicto]} tono={TONO[f.color]} /></td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      <FotosProducto fotos={f.fotos} titulo={f.titulo} />
                      {f.productoId
                        ? <Link href={`/catalogo/productos/${f.productoId}`} className="font-mono text-[#16577F] hover:underline whitespace-nowrap">{f.sku}</Link>
                        : <span className="font-mono whitespace-nowrap" title="La publicación no está vinculada a un producto de Laucen">{f.clave}</span>}
                    </span>{" "}
                    <Link href={url(BASE, { ...sp, abrir: abierto === f.clave ? null : f.clave })} scroll={false} className="text-[#2B3A45] hover:underline">{f.titulo}</Link>
                    <span className="text-[#5C6B76]"> · {f.publicaciones.length} {f.publicaciones.length === 1 ? "publicación" : "publicaciones"} {abierto === f.clave ? "▲" : "▼"}</span>
                  </td>
                  <td className={TDN}>{pesos(f.costo)}</td>
                  <td className={TDN}>{entero(f.clics)}</td>
                  <td className={TDN}>{entero(f.ventas)}</td>
                  <td className={TDN}>{entero(f.ventasTotales)}</td>
                  <td className={TDN}>{pesos(f.porVenta)}</td>
                  <td className={TDN}>{pct(f.pctPorVenta)}</td>
                  <td className={TDN} title={`Tope ${f.origenTope}`}>{pct(f.pctMax)}{f.origenTope !== "general" && <span className="text-[#5C6B76]">*</span>}</td>
                  <td className={`${TD} text-[11px] text-[#5C6B76] min-w-80`}>{f.motivo}</td>
                </tr>
                {abierto === f.clave && (
                  <tr className={TR}>
                    <td colSpan={10} className="bg-[#FAFBFC] px-4 py-2">
                      <Detalle f={f} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={filtradas.length} />
    </>
  );
}

function Detalle({ f }: { f: FilaProducto }) {
  return (
    <>
      <div className="flex flex-wrap gap-3 mb-2">
        <Dato etiqueta="Precio promedio" numero className="w-36">{pesos(f.precio)}</Dato>
        <Dato etiqueta="Costo del producto" numero className="w-36">{pesos(f.costoUnit)}</Dato>
        <Dato etiqueta={`Tope por venta (${pct(f.pctMax)}, ${f.origenTope})`} numero className="w-56">{pesos(f.topePorVenta)}</Dato>
        <Dato etiqueta="Gastado de más" numero className="w-36">{pesos(f.deMas)}</Dato>
        <Dato etiqueta="Corte sin ventas" numero className="w-36">{pesos(f.topeSinVentas)}</Dato>
        <Dato etiqueta="Impresiones" numero className="w-32">{entero(f.impresiones)}</Dato>
        <Dato etiqueta="Ventas directas / indirectas" numero className="w-44">{`${entero(f.udsDir)} / ${entero(f.udsInd)}`}</Dato>
      </div>
      <table className={TABLA}>
        <thead className={THEAD}>
          <tr>
            <th className={TH}>Publicación</th><th className={TH}>Cuenta</th><th className={TH}>Estado</th><th className={THN}>Precio</th>
            <th className={THN}>Gastado</th><th className={THN}>Clics</th><th className={THN}>Ventas directas</th><th className={THN}>Indirectas</th>
            <th className={THN}>Vendido directo</th><th className={TH}>Campaña</th>
          </tr>
        </thead>
        <tbody>
          {f.publicaciones.map((p) => (
            <tr key={p.itemId} className={TR} data-canal={p.canalId}>
              <td className={TD}>
                <Link href={historialPublicacion(p.itemId)} className="font-mono text-[#16577F] hover:underline">{p.itemId}</Link>{" "}
                <a href={enlaceMl(p.itemId, p.permalink)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a>
                <span className="block text-[11px] text-[#5C6B76]">{p.titulo}</span>
              </td>
              <td className={TD}>{p.canal}</td>
              <td className={TD}>{p.estado === "active" ? "Activo" : p.estado === "paused" ? "Pausado" : p.estado ?? "—"}</td>
              <td className={TDN}>{pesos(p.precio)}</td>
              <td className={TDN}>{pesos(p.costo)}</td>
              <td className={TDN}>{entero(p.clics)}</td>
              <td className={TDN}>{entero(p.udsDir)}</td>
              <td className={TDN}>{entero(p.udsInd)}</td>
              <td className={TDN}>{pesos(p.montoDir)}</td>
              <td className={TD}>{p.campanaId ? <a href={enlaceCampana(p.campanaId)} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline whitespace-nowrap">Abrir en Mercado Libre ↗</a> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Campanas({ filas, anunciantes, ventana }: { filas: Fila[]; anunciantes: Awaited<ReturnType<typeof anunciantesDe>>; ventana: number }) {
  const sin = anunciantes.filter((a) => a.leido && !a.anuncianteId);
  return (
    <>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Cuenta</th><th className={TH}>Campaña</th><th className={TH}>Estado</th>
              <th className={THN}>Presupuesto diario</th><th className={THN}>El que usa ML hoy</th><th className={TH}>ML sube el presupuesto solo</th>
              <th className={THN}>ROAS objetivo</th><th className={THN}>Gastado ({ventana} días)</th><th className={THN}>Ventas directas</th>
              <th className={THN}>Vendido directo</th><th className={THN}>Anuncios</th><th className={TH} />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={12} className={`${TD} text-[#5C6B76]`}>Todavía no se leyó ninguna campaña: «Leer ahora de Mercado Libre».</td></tr>}
            {filas.map((c) => (
              <tr key={c.id} className={TR} data-canal={c.canal_id}>
                <td className={TD}>{c.canal}</td>
                <td className={TD}>{c.nombre}</td>
                <td className={TD}><Estado texto={ESTADOS_CAMPANA[c.estado] ?? c.estado ?? "—"} tono={c.estado === "active" ? "verde" : "gris"} /></td>
                <td className={TDN}>{pesos(c.presupuesto)}</td>
                <td className={TDN}>{pesos(c.presupuesto_diario)}{c.presupuesto_diario != null && c.presupuesto != null && c.presupuesto_diario !== c.presupuesto && <span className="block text-[10px] text-[#C03420]">distinto del cargado</span>}</td>
                <td className={TD}>{c.presupuesto_automatico == null ? "ML no lo informa" : c.presupuesto_automatico ? <Estado texto="Sí: ML lo sube" tono="rojo" /> : "No"}</td>
                <td className={TDN}>{c.roas_objetivo != null ? `${formatearNumero(c.roas_objetivo, "decimal")}x` : "—"}</td>
                <td className={TDN}>{pesos(c.costo)}</td>
                <td className={TDN}>{entero(c.ventas)}</td>
                <td className={TDN}>{pesos(c.monto)}</td>
                <td className={TDN}>{c.anuncios ? <Link href={url(BASE, { canal: c.canal_id })} className="text-[#16577F] hover:underline">{entero(c.anuncios)}</Link> : 0}</td>
                <td className={TD}><a href={enlaceCampana(c.id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline whitespace-nowrap">Abrir en Mercado Libre ↗</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-2">
        «ML sube el presupuesto solo» es lo que Mercado Libre informa como presupuesto automático. Los interruptores «Ajuste de presupuesto periódico» y
        «para fechas especiales» del panel no los informa la API por separado: revisalos en el panel.
        {sin.length > 0 && <> Sin publicidad (nunca usaron): {sin.map((a) => a.nickname).join(", ")}.</>}
        {" "}Para crear una campaña: <a href={enlacePanelPublicidad()} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">panel de publicidad de Mercado Libre ↗</a>.
      </p>
    </>
  );
}

async function Topes({ org, sp, general }: { org: string; sp: SP; general: number }) {
  const editar = Number(sp.editar) || 0;
  const filas = await consulta<{ id: number; producto_id: number | null; sku: string | null; producto: string | null; familia_id: number | null; familia: string | null; pct_max: number; nota: string | null }>(`
    select t.id::int, t.producto_id::int, pr.sku_base sku, pr.titulo producto, t.familia_id::int, f.nombre familia, t.pct_max::float, t.nota
      from pub_tope t left join producto pr on pr.id = t.producto_id left join familia f on f.id = t.familia_id
     where t.organizacion_id = $1 order by (t.producto_id is null), coalesce(pr.sku_base, f.nombre)`, [org]);
  return (
    <>
      <p className="text-xs text-[#5C6B76] mb-3">
        El tope general es {pct(general)} del precio por venta (pestaña Configuración). Acá se pisa para un producto o para una familia (vale también para sus
        subfamilias). Si un producto tiene la suya y su familia otra, gana la del producto.
      </p>
      <AltaNueva texto="Nueva excepción" sinBoton>
        <form action={accionCrearTope} className="flex flex-wrap items-end gap-3">
          <label className="w-40"><span className={ETIQUETA}>SKU del producto</span><input name="sku" className={`${CAMPO} w-full font-mono`} placeholder="SKU00499" /></label>
          <span className="text-xs text-[#5C6B76] pb-2">o</span>
          <label className="w-72"><span className={ETIQUETA}>Familia</span><ElegirFamilia name="familia_id" vacio="Ninguna" /></label>
          <label className="w-36"><span className={ETIQUETA}>Tope (% del precio)</span><CampoNumero name="pct_max" valor={null} tipo="pct" className={`${CAMPO} w-full`} /></label>
          <label className="flex-1 min-w-48"><span className={ETIQUETA}>Nota</span><input name="nota" className={`${CAMPO} w-full`} /></label>
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Producto o familia</th><th className={THN}>Tope</th><th className={TH}>Nota</th><th /></tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className={`${TD} text-[#5C6B76]`}>No hay excepciones: todos usan el tope general.</td></tr>}
            {filas.map((t) => {
              const quien = t.producto_id
                ? <><Link href={`/catalogo/productos/${t.producto_id}`} className="font-mono text-[#16577F] hover:underline">{t.sku}</Link> <span className="text-[#5C6B76]">{t.producto}</span></>
                : <>Familia <Link href={url("/catalogo/productos", { familia: t.familia_id })} className="text-[#16577F] hover:underline">{t.familia}</Link></>;
              return editar === t.id ? (
                <tr key={t.id} className={`${TR} bg-[#FAFBFC]`}>
                  <td className={TD}>{quien}</td>
                  <td colSpan={3} className={TD}>
                    <form action={accionGuardarTope} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <CampoNumero name="pct_max" valor={t.pct_max} tipo="pct" className={CAMPO} />
                      <input name="nota" defaultValue={t.nota ?? ""} className={`${CAMPO} flex-1 min-w-40`} />
                      <button className={VERDE}>Grabar</button>
                      <Link href={url(BASE, { ver: "topes" })} className={SUAVE}>Cancelar</Link>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={t.id} className={TR}>
                  <td className={TD}>{quien}</td>
                  <td className={TDN}>{pct(t.pct_max)}</td>
                  <td className={TD}>{t.nota ?? ""}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-1">
                      <Lapiz href={url(BASE, { ver: "topes", editar: t.id })} />
                      <TachoConfirmar accion={accionBorrarTope} campos={{ id: String(t.id) }} pregunta="¿Borrar?" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Configuracion({ sp, cfg }: { sp: SP; cfg: Awaited<ReturnType<typeof configPublicidad>> }) {
  const editando = editandoFicha(sp);
  const valor = (k: (typeof CAMPOS_NUM)[number]) => Number(cfg[k.clave]);
  const textoVentas = cfg.ventas === "totales" ? "Directas e indirectas" : "Sólo directas";
  const textoCanal = { windows: "Aviso de Windows / celular", panel: "Cartel en Para hacer", ambos: "Las dos cosas" }[cfg.avisoCanal];
  return (
    <form id="ficha" action={accionGuardarConfigPublicidad} className={`${CAJA} max-w-4xl`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {CAMPOS_NUM.map((k) => (
          <div key={k.clave} className="flex items-start gap-3">
            {editando ? (
              <label className="w-full"><span className={ETIQUETA}>{k.rotulo}</span>
                <CampoNumero name={k.clave} valor={valor(k)} tipo={k.tipo === "pesos" ? "pesos" : k.tipo === "entero" ? "entero" : "decimal"} className={CAMPO} />
                <span className="block text-[10px] text-[#5C6B76] mt-0.5">{k.ayuda}</span></label>
            ) : (
              <Dato etiqueta={k.rotulo} numero ayuda={k.ayuda} className="w-full">{k.tipo === "pesos" ? pesos(valor(k)) : formatearNumero(valor(k), k.tipo === "entero" ? "entero" : "decimal")}</Dato>
            )}
          </div>
        ))}
        {editando ? (
          <>
            <label><span className={ETIQUETA}>Qué ventas cuentan para el veredicto</span>
              <select name="ventas" defaultValue={cfg.ventas} className={CAMPO}>
                <option value="directas">Sólo directas (compró lo que tocó en el anuncio)</option>
                <option value="totales">Directas e indirectas (compró otra cosa después del anuncio)</option>
              </select></label>
            <label><span className={ETIQUETA}>Cómo avisar cuando un producto pasa a CORTAR</span>
              <select name="avisoCanal" defaultValue={cfg.avisoCanal} className={CAMPO}>
                <option value="ambos">Aviso de Windows / celular y cartel en Para hacer</option>
                <option value="windows">Sólo aviso de Windows / celular</option>
                <option value="panel">Sólo cartel en Para hacer</option>
              </select></label>
          </>
        ) : (
          <>
            <Dato etiqueta="Qué ventas cuentan para el veredicto">{textoVentas}</Dato>
            <Dato etiqueta="Cómo avisar cuando un producto pasa a CORTAR">{textoCanal}</Dato>
          </>
        )}
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-3">
        Ejemplo con estos valores: un producto de $ 100.000 puede gastar hasta {pesos(100000 * cfg.pctMax / 100)} de publicidad por venta. Si gasta
        {" "}{pesos(100000 * cfg.pctMax / 100 * cfg.topeVentas)} sin vender nada, pasa a CORTAR.
      </p>
    </form>
  );
}
