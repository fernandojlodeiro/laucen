// Listas de precios (orden 136, §5): arriba el ABM de listas; abajo la grilla
// de precios de la lista elegida (una fila por variación activa) con edición
// en fila, y la carga masiva por porcentaje ("Mayorista = Web − 25 %").
// Los precios se leen con precio_de() (la misma función que usa precioDe) y
// se guardan con guardarPrecio: nunca a mano.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { listasDePrecios } from "@/lib/precios";
import { enVista, hoyAR, type Moneda } from "@/lib/moneda";
import { formatearNumero, leerNumero } from "@/lib/numeros";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import FotosProducto from "@/app/componentes/FotosProducto";
import { leerOrden, leerPagina, ordenarEnMemoria, POR_PAGINA } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO, ETIQUETA, CAJA, patronBusqueda, coincideBusqueda,
} from "@/app/componentes/erp";
import { verInactivos } from "@/app/componentes/Inactivos";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_PRECIOS, LISTA_LISTAS_PRECIOS, DONDE_PRECIOS, valoresPrecios } from "./lista";
import { accionBorrarLista, accionCrearLista, accionGuardarLista, accionGuardarPrecio, accionMasivo } from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/catalogo/precios";

type SP = {
  lista?: string; editar?: string; precio?: string; q?: string; contiene?: string; ql?: string; qlcontiene?: string; p?: string; orden?: string; dir?: string; inactivos?: string; ok?: string; error?: string;
  // Carga masiva (paso 1: elegir; paso 2: confirmar).
  md?: string; mo?: string; ms?: string; mpct?: string; mr?: string;
};

type Fila = {
  id: number; producto_id: number; sku: string; titulo: string; precio_id: number | null; fotos: string[] | null;
  lista_ars: string | null; lista_usd: string | null; moneda_origen: Moneda | null; vigente: string | null;
  descuento: string; venta_ars: string | null; venta_usd: string | null;
  propio: boolean;
};

export default async function Precios({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ver");
  const sp = await searchParams;
  const listas = await listasDePrecios(s.org.id);
  const cuantos = await consulta<{ lista_id: number; n: number }>(
    `select lista_id::int, count(distinct variacion_id)::int n from precio where organizacion_id = $1 group by lista_id`, [s.org.id]);
  const nPrecios = new Map(cuantos.map((c) => [c.lista_id, c.n]));
  // Lista derivada: "se calcula desde" otra lista × coeficiente (lo resuelve precio_de).
  const derivadas = await consulta<{ id: number; base_lista_id: number | null; coeficiente: number | null }>(
    "select id::int, base_lista_id::int, coeficiente::float8 from lista_precios where organizacion_id = $1", [s.org.id]);
  const baseDe = new Map(derivadas.map((d) => [d.id, d]));
  const nombreLista = new Map(listas.map((l) => [l.id, l.nombre]));
  /** "= Web × 0,9" si la lista tiene base; vacío si no. */
  const formula = (lid: number) => {
    const d = baseDe.get(lid);
    return d?.base_lista_id ? `= ${nombreLista.get(d.base_lista_id) ?? "?"} × ${formatearNumero(d.coeficiente ?? 1, "decimal")}` : "";
  };
  // Puede ser base de `lid`: no ella misma, ni una que ya se calcula desde
  // otra (precio_de mira un solo nivel, y así tampoco hay ciclos).
  const puedeSerBase = (lid: number, bid: number) => bid !== lid && !baseDe.get(bid)?.base_lista_id;
  const esBaseDeOtra = (lid: number) => derivadas.some((d) => d.base_lista_id === lid);

  const editarLista = Number(sp.editar) || 0;
  const lista = listas.find((l) => l.id === Number(sp.lista)) ?? listas.find((l) => l.estado === "activa") ?? listas[0];
  const q = sp.q?.trim() || "";
  const comienza = sp.contiene !== "1";
  const cont = comienza ? null : "1";
  // Buscador de listas (arriba): otro parámetro, porque q es el de la grilla.
  const ql = sp.ql?.trim() || "";
  const comienzaL = sp.qlcontiene !== "1";
  const filtrosL = { ql: ql || null, qlcontiene: comienzaL ? null : "1" };
  // Las listas son pocas: se ordenan en memoria (sus columnas llevan "l_"; las de la grilla no).
  const listasVistas = ordenarEnMemoria(listas.filter((l) => coincideBusqueda(l.nombre, ql, comienzaL)), sp, {
    l_nombre: (l) => l.nombre, l_moneda: (l) => l.moneda_base, l_formula: (l) => formula(l.id), l_orden: (l) => l.orden,
    l_estado: (l) => l.estado, l_precios: (l) => nPrecios.get(l.id) ?? 0,
  });
  const { desde } = leerPagina(sp);
  const orden = { p: sp.p, orden: sp.orden, dir: sp.dir };
  const editarPrecio = Number(sp.precio) || 0;
  const inactivos = verInactivos(sp);
  const ina = inactivos ? "1" : null;
  // La dirección de esta vista, sin lo que abre una edición: a donde vuelven las acciones.
  const aqui = url(BASE, { lista: lista?.id, q, contiene: cont, inactivos: ina, ...filtrosL, ...orden });

  // La grilla: primero la página de variaciones y después precio_de() sólo
  // para esas 50. Ordenar por precio o descuento lo calcula para todas.
  let filas: Fila[] = [];
  let total = 0;
  if (lista) {
    // Los mismos filtros que el Excel ($1…$6, lista.tsx); el desplazamiento de la página va en $7.
    const donde = DONDE_PRECIOS;
    const porPrecio = ["lista", "descuento", "venta", "vigente"].includes(sp.orden ?? "");
    const ordenSql = leerOrden(sp, {
      sku: "v.sku", titulo: "coalesce(v.titulo, p.titulo)",
      lista: "pr.lista_ars", descuento: "descuento_efectivo($1, v.id)", venta: "pr.venta_ars", vigente: "pr.vigente_desde",
    }, "v.sku, v.id");
    const valores = [...valoresPrecios(s.org.id, lista.id, sp), desde];
    const campos = `v.id::int, v.producto_id::int, v.sku, titulo_variacion(v.id) titulo, pr.precio_id::int,
             pr.lista_ars, pr.lista_usd, pr.moneda_origen, to_char(pr.vigente_desde, 'DD/MM/YYYY') vigente,
             descuento_efectivo($1, v.id) descuento, pr.venta_ars, pr.venta_usd,
             coalesce((select x.lista_id = $2 from precio x where x.id = pr.precio_id), false) propio,
             (select array_agg(pf.url order by pf.orden, pf.id) from producto_foto pf where pf.producto_id = v.producto_id) fotos`;
    const [lasFilas, [n]] = await Promise.all([
      consulta<Fila>(porPrecio ? `
        select ${campos}
          from variacion v join producto p on p.id = v.producto_id
          left join lateral precio_de($1, v.id, $2, $3::date) pr on true
         where ${donde} order by ${ordenSql} limit ${POR_PAGINA} offset $7` : `
        with pagina as (
          select v.id from variacion v join producto p on p.id = v.producto_id
           where ${donde} order by ${ordenSql} limit ${POR_PAGINA} offset $7)
        select ${campos}
          from pagina pg join variacion v on v.id = pg.id join producto p on p.id = v.producto_id
          left join lateral precio_de($1, v.id, $2, $3::date) pr on true
         order by ${ordenSql}`, valores),
      // El conteo usa los mismos valores: las condiciones de $2, $3 y $7 sólo le dan tipo a esos parámetros.
      consulta<{ n: number }>(`select count(*)::int n from variacion v join producto p on p.id = v.producto_id where ${donde}
         and $2::bigint is not null and $3::date is not null and $7::int is not null`, valores),
    ]);
    filas = lasFilas;
    total = n?.n ?? 0;
  }

  // Carga masiva, paso 2: ya eligió destino, origen y porcentaje → resumen y confirmar.
  const md = listas.find((l) => l.id === Number(sp.md));
  const mo = listas.find((l) => l.id === Number(sp.mo));
  const mpct = leerNumero(sp.mpct);
  const mr = Number(sp.mr) || 0;
  const pctFirmado = mpct == null ? null : sp.ms === "+" ? mpct : -mpct;
  let enOrigen = 0;
  if (md && mo && pctFirmado != null) {
    const r = await consulta<{ n: number }>("select count(distinct variacion_id)::int n from precio where organizacion_id = $1 and lista_id = $2", [s.org.id, mo.id]);
    enOrigen = r[0]?.n ?? 0;
  }

  return (
    <Pantalla titulo="Listas de precios" subtitulo="El precio de lista (el tachado). El de venta resta el descuento de la variación, del producto o de la familia."
      acciones={<><AccionesExcel lista={LISTA_LISTAS_PRECIOS} org={s.org.id} /><BotonNuevo texto="Nueva lista" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nueva lista" sinBoton>
        <form action={accionCrearLista} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="volver" value={aqui} />
          <input name="nombre" placeholder="Nombre (ej. Mayorista)" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          <select name="moneda" defaultValue="ARS" className={CAMPO} aria-label="Moneda base">
            <option value="ARS">Pesos</option><option value="USD">Dólares</option>
          </select>
          <CampoNumero name="orden" valor={null} tipo="entero" placeholder="Orden" className={`${CAMPO} w-16`} />
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>

      {/* ── Listas ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={ql} comienza={comienzaL} placeholder="Buscar lista" parametro="ql" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="l_nombre">Lista</ThOrden><ThOrden col="l_moneda">Moneda base</ThOrden><ThOrden col="l_formula">Se calcula desde</ThOrden>
              <ThOrden col="l_orden" n desc={false}>Orden</ThOrden><ThOrden col="l_estado">Estado</ThOrden><ThOrden col="l_precios" n>Variaciones con precio</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {listasVistas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>{ql ? "Ninguna lista coincide." : "Todavía no hay listas. Agregá la primera con «Nueva lista» (ej. Mercado Libre, Web minorista, Mayorista, Local)."}</td></tr>}
            {listasVistas.map((l) => editarLista === l.id ? (
              <tr key={l.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={7} className={TD}>
                  <form action={accionGuardarLista} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="volver" value={url(BASE, { lista: l.id })} />
                    <input name="nombre" defaultValue={l.nombre} className={`${CAMPO} flex-1 min-w-40`} autoFocus />
                    <select name="moneda" defaultValue={l.moneda_base} className={CAMPO} aria-label="Moneda base">
                      <option value="ARS">Pesos</option><option value="USD">Dólares</option>
                    </select>
                    <label className="inline-flex items-center gap-1 text-[11px] text-[#5C6B76]">Se calcula desde
                      <select name="base_lista_id" defaultValue={baseDe.get(l.id)?.base_lista_id ?? ""} className={CAMPO} aria-label="Se calcula desde">
                        <option value="">Ninguna (precios propios)</option>
                        {listas.filter((b) => b.id !== l.id).map((b) => (
                          <option key={b.id} value={b.id} disabled={!puedeSerBase(l.id, b.id) || esBaseDeOtra(l.id)}>{b.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px] text-[#5C6B76]">×
                      <CampoNumero name="coeficiente" valor={baseDe.get(l.id)?.coeficiente ?? null} tipo="decimal" placeholder="0,90" className={`${CAMPO} w-20`} />
                    </label>
                    <CampoNumero name="orden" valor={l.orden} tipo="entero" className={`${CAMPO} w-16`} />
                    <select name="estado" defaultValue={l.estado} className={CAMPO} aria-label="Estado">
                      <option value="activa">Activa</option><option value="archivada">Archivada</option>
                    </select>
                    <button className={VERDE}>Guardar</button>
                    <Link href={url(BASE, { lista: l.id, ...filtrosL })} className={SUAVE}>Cancelar</Link>
                    <p className="w-full text-[10px] text-[#5C6B76]">
                      Con una lista de base, el precio es el de esa lista por el coeficiente (ej. 0,90 = 10 % menos). Un precio cargado a mano en esta lista gana sobre el calculado.
                      {esBaseDeOtra(l.id) && " Esta lista es base de otra: no puede calcularse a su vez desde una tercera."}
                    </p>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={l.id} className={`${TR} ${lista?.id === l.id ? "bg-[#EEF3F8]" : ""}`}>
                <td className={TD}>
                  <Link href={url(BASE, { lista: l.id, ...filtrosL })} className="font-semibold text-[#16577F] hover:underline">{l.nombre}</Link>
                  {lista?.id === l.id && <span className="ml-2 text-[10px] text-[#5C6B76]">(viendo abajo)</span>}
                </td>
                <td className={TD}>{l.moneda_base === "USD" ? "Dólares" : "Pesos"}</td>
                <td className={`${TD} text-[#5C6B76] whitespace-nowrap`}>{formula(l.id) || "—"}</td>
                <td className={TDN}>{l.orden}</td>
                <td className={TD}><Estado texto={l.estado === "activa" ? "Activa" : "Archivada"} tono={l.estado === "activa" ? "verde" : "gris"} /></td>
                <td className={TDN}><Link href={url(BASE, { lista: l.id, ...filtrosL })} className="text-[#16577F] hover:underline">{nPrecios.get(l.id) ?? 0}</Link></td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { lista: lista?.id, editar: l.id, ...filtrosL })} />
                    <TachoConfirmar accion={accionBorrarLista} campos={{ id: String(l.id) }} pregunta="¿Borrar la lista y sus precios?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Grilla de precios ── */}
      {lista && (
        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
            <h2 className="text-sm font-bold">Precios de “{lista.nombre}” <span className="font-normal text-[#5C6B76]">· se ven en {s.moneda === "USD" ? "dólares" : "pesos"}</span>
              {formula(lista.id) && <span className="font-normal text-[#5C6B76]"> · {formula(lista.id)}</span>}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <BuscadorVivo q={q} comienza={comienza} inactivos={inactivos} placeholder="Buscar SKU, título o código de barras" limpiar={["p", "precio"]} />
              <AccionesExcel lista={LISTA_PRECIOS} org={s.org.id} extra={{ lista: String(lista.id) }} />
            </div>
          </div>
          {formula(lista.id) && (
            <p className="text-[11px] text-[#5C6B76] mb-2">
              Esta lista se calcula: {lista.nombre} {formula(lista.id)}. Un precio cargado a mano acá gana sobre el calculado (los calculados dicen “calculado”).
            </p>
          )}
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <ThOrden col="sku" porDefecto>SKU</ThOrden><ThOrden col="titulo">Variación</ThOrden><ThOrden col="lista" n>Precio de lista</ThOrden>
                  <ThOrden col="descuento" n>Descuento</ThOrden><ThOrden col="venta" n>Precio de venta</ThOrden><ThOrden col="vigente" desc>Vigente desde</ThOrden>
                  <th className={TH}>Cargado en</th><th />
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>{q ? "Nada coincide con la búsqueda." : "No hay variaciones activas todavía."}</td></tr>}
                {filas.map((f) => editarPrecio === f.id ? (
                  <tr key={f.id} className={`${TR} bg-[#FAFBFC]`}>
                    <td className={TD}>{f.sku}</td>
                    <td className={TD}>{f.titulo}</td>
                    <td colSpan={6} className={TD}>
                      <form action={accionGuardarPrecio} className="flex flex-wrap items-center gap-2 justify-end">
                        <input type="hidden" name="lista" value={lista.id} />
                        <input type="hidden" name="variacion" value={f.id} />
                        <input type="hidden" name="volver" value={aqui} />
                        <CampoNumero name="importe" tipo={lista.moneda_base === "USD" ? "usd" : "pesos"}
                          valor={f.propio ? Number(lista.moneda_base === "USD" ? f.lista_usd : f.lista_ars) : null}
                          placeholder={f.precio_id && !f.propio ? `Calculado: ${formatearNumero(Number(lista.moneda_base === "USD" ? f.lista_usd : f.lista_ars), "pesos")}` : "Precio de lista"} className={`${CAMPO} w-32`} />
                        <select name="moneda" defaultValue={lista.moneda_base} className={CAMPO} aria-label="Moneda en que se carga">
                          <option value="ARS">Pesos</option><option value="USD">Dólares</option>
                        </select>
                        <button className={VERDE}>Guardar</button>
                        <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={f.id} className={TR}>
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={`/catalogo/productos/${f.producto_id}`} className="font-semibold text-[#16577F] hover:underline">{f.sku}</Link>{" "}
                      <FotosProducto fotos={f.fotos} titulo={f.titulo} />
                    </td>
                    <td className={TD}><Link href={`/catalogo/productos/${f.producto_id}`} className="hover:underline">{f.titulo}</Link></td>
                    <td className={TDN}>{f.precio_id ? <span className={Number(f.descuento) > 0 ? "line-through text-[#5C6B76]" : ""}>{enVista({ ars: f.lista_ars, usd: f.lista_usd }, s.moneda)}</span> : <span className="text-[#5C6B76]">sin precio</span>}</td>
                    <td className={TDN}>{Number(f.descuento) > 0 ? `${formatearNumero(Number(f.descuento), "pct")} %` : "—"}</td>
                    <td className={`${TDN} font-semibold`}>{f.precio_id ? enVista({ ars: f.venta_ars, usd: f.venta_usd }, s.moneda) : "—"}</td>
                    <td className={TD}>{f.vigente ?? "—"}</td>
                    <td className={TD}>
                      {f.moneda_origen ? (f.moneda_origen === "USD" ? "Dólares" : "Pesos") : "—"}
                      {f.precio_id && !f.propio && <span className="ml-1.5"><Estado texto="calculado" tono="azul" /></span>}
                    </td>
                    <td className={`${TD} text-right`}><Lapiz href={url(BASE, { lista: lista.id, q, contiene: cont, inactivos: ina, ...filtrosL, ...orden, precio: f.id })} etiqueta="Editar precio" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginado total={total} />
        </section>
      )}

      {/* ── Carga masiva por porcentaje ── */}
      {listas.length > 1 && (
        <section className={`${CAJA} mt-6`}>
          <h2 className="text-sm font-bold mb-1">Carga masiva por porcentaje</h2>
          <p className="text-[11px] text-[#5C6B76] mb-2">
            Carga desde hoy, en la lista destino, el precio de la lista origen más o menos un porcentaje (ej. “Mayorista = Web − 25 %”).
            Pisa los precios que la lista destino tenga cargados hoy.
          </p>
          {md && mo && pctFirmado != null ? (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span>
                <b>{md.nombre}</b> = <b>{mo.nombre}</b> {pctFirmado < 0 ? "−" : "+"} {formatearNumero(Math.abs(pctFirmado), "pct")} %
                {mr ? `, redondeado a ${mr.toLocaleString("es-AR")}` : ""} · va a cargar {enOrigen} precios.
              </span>
              <BotonConfirmar accion={accionMasivo} clase={PRIMARIO} texto="Cargar precios" pregunta={`¿Cargar ${enOrigen} precios en ${md.nombre}?`} corriendo="Cargando…"
                campos={{ destino: String(md.id), origen: String(mo.id), porcentaje: String(pctFirmado), redondeo: String(mr), volver: url(BASE, { lista: md.id }) }} />
              <Link href={url(BASE, { lista: lista?.id })} className={SUAVE}>Cancelar</Link>
            </div>
          ) : (
            <form action={BASE} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="lista" value={lista?.id ?? ""} />
              <label><span className={ETIQUETA}>Lista destino</span>
                <select name="md" className={CAMPO} defaultValue={listas.find((l) => l.id !== lista?.id)?.id}>
                  {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <span className="pb-2 text-sm">=</span>
              <label><span className={ETIQUETA}>Lista origen</span>
                <select name="mo" className={CAMPO} defaultValue={lista?.id}>
                  {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </label>
              <label><span className={ETIQUETA}>Más o menos</span>
                <select name="ms" className={CAMPO} defaultValue="-"><option value="-">− (menos)</option><option value="+">+ (más)</option></select>
              </label>
              <label><span className={ETIQUETA}>Porcentaje</span>
                <CampoNumero name="mpct" valor={null} tipo="pct" placeholder="25,0" className={`${CAMPO} w-20`} />
              </label>
              <label><span className={ETIQUETA}>Redondeo</span>
                <select name="mr" className={CAMPO} defaultValue="0">
                  <option value="0">Sin redondeo</option><option value="1">A 1</option><option value="10">A 10</option><option value="100">A 100</option>
                </select>
              </label>
              <button className={SUAVE}>Seguir</button>
            </form>
          )}
        </section>
      )}
    </Pantalla>
  );
}
