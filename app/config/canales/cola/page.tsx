// La cola de Mercado Libre (lib/mercadolibre/cola.ts): lo que espera salir,
// lo enviado y lo que dio error, de todas las cuentas; los lotes preparados
// que esperan el clic de Fer ("Mandar a Mercado Libre") y el resumen de la
// barrida nocturna de cada cuenta.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada, leerPagina } from "@/lib/lista";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { SUAVE, VERDE, APAGAR } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import Pestanas from "@/app/componentes/Pestanas";
import {
  entrarErp, Pantalla, Avisos, Estado, TituloSeccion, url, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN,
} from "@/app/componentes/erp";
import { fechaHora } from "@/app/ventas/formato";
import { AccionesExcel } from "@/app/listas/piezas";
import { camposDe, ordenDe } from "@/lib/listas/tipos";
import { LISTA_COLA, PESTANAS_COLA, CONDICION_COLA, filtrosCola, type PestanaCola } from "./lista";
import { TIPOS_COLA, ORIGENES_COLA, ESTADOS_COLA, TONO_COLA, describirCambio, describirAntes } from "./formato";
import { accionReintentarErrores, accionDescartar, accionMandarLote, accionDescartarLote } from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/canales/cola";

type SP = { ver?: string; canal?: string; tipo?: string; origen?: string; q?: string; contiene?: string; lote?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };
type Ver = PestanaCola | "lotes" | "barridas";

type Fila = {
  id: number; creado_ts: Date; canal_id: number; canal: string; item_id: string; variation_id: string; sku: string | null; producto_id: number | null;
  tipo: string; payload: Record<string, unknown>; antes: Record<string, unknown> | null; origen: string; estado: string; intentos: number;
  reemplazos: number; proximo_intento_ts: Date; enviado_ts: Date | null; ultimo_error: string | null; lote_id: number | null; prioridad: number;
};

export default async function ColaMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("canales_ver");
  const sp = await searchParams;
  const ver: Ver = sp.ver === "lotes" || sp.ver === "barridas" ? sp.ver : filtrosCola(sp).ver;
  const f = filtrosCola(sp);
  const ctx = { org: s.org.id, moneda: s.moneda };

  const canales = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' order by nombre", [s.org.id]);
  const [cuenta] = await consulta<Record<PestanaCola | "lotes" | "barridas", number>>(`
    select ${PESTANAS_COLA.map(([k]) => `(select count(*) from ml_cola q where q.organizacion_id = $1 and ${CONDICION_COLA[k]})::int ${k}`).join(", ")},
           (select count(*) from ml_lote where organizacion_id = $1 and estado = 'preparado')::int lotes,
           (select count(*) from ml_barrida where organizacion_id = $1)::int barridas`, [s.org.id]);
  const filtros = { canal: f.canal || null, tipo: f.tipo || null, origen: f.origen || null, q: f.q || null, contiene: f.comienza ? null : "1" };
  const aqui = url(BASE, { ver: ver === "pendientes" ? null : ver, ...filtros, lote: sp.lote, p: sp.p, orden: sp.orden, dir: sp.dir });

  return (
    <Pantalla titulo="Cola de Mercado Libre"
      subtitulo="Todo lo que Laucen manda a Mercado Libre pasa por acá: se reintenta solo, respeta los límites de ML y queda registrado qué se mandó, cuándo y con qué resultado."
      acciones={ver !== "lotes" && ver !== "barridas" ? <AccionesExcel lista={LISTA_COLA} org={s.org.id} /> : undefined}>
      <Avisos sp={sp} />
      <Pestanas className="mb-3" items={[
        ...PESTANAS_COLA.map(([k, texto]) => ({
          clave: k, texto, activa: ver === k, cuenta: cuenta?.[k] ?? 0,
          href: url(BASE, { ver: k === "pendientes" ? null : k, ...filtros }),
        })),
        { clave: "lotes", texto: "Lotes preparados", activa: ver === "lotes", cuenta: cuenta?.lotes ?? 0, href: url(BASE, { ver: "lotes" }) },
        { clave: "barridas", texto: "Barridas nocturnas", activa: ver === "barridas", cuenta: cuenta?.barridas ?? 0, href: url(BASE, { ver: "barridas" }) },
      ]} />
      {ver === "lotes" ? <Lotes org={s.org.id} sp={sp} aqui={aqui} />
        : ver === "barridas" ? <Barridas org={s.org.id} sp={sp} />
        : <Cola ctx={ctx} sp={sp} ver={ver} canales={canales} aqui={aqui} filtros={filtros} />}
    </Pantalla>
  );
}

async function Cola({ ctx, sp, ver, canales, aqui, filtros }: {
  ctx: { org: string; moneda: Awaited<ReturnType<typeof entrarErp>>["moneda"] }; sp: SP; ver: PestanaCola;
  canales: { id: number; nombre: string }[]; aqui: string; filtros: Record<string, string | number | null>;
}) {
  const f = filtrosCola(sp);
  const base = await LISTA_COLA.consulta!(ctx, sp);
  const campos = await camposDe(LISTA_COLA, ctx);
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `q.id::int, q.creado_ts, q.canal_id::int, ca.nombre canal, q.item_id, q.variation_id, v.sku, v.producto_id::int, q.tipo, q.payload, q.antes,
             q.origen, q.estado, q.intentos, q.reemplazos, q.proximo_intento_ts, q.enviado_ts, q.ultimo_error, q.lote_id::int, q.prioridad`,
    desde: base.desde, donde: base.donde, orden: ordenDe(campos, sp, base.orden),
  }, base.valores, sp);
  const verF = ver === "pendientes" ? null : ver;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={f.q} comienza={f.comienza} placeholder="Buscar por publicación (MLA…) o SKU" />
        <FiltroVivo parametro="canal" valor={f.canal ? String(f.canal) : ""} etiqueta="Canal">
          <option value="">Todas las cuentas</option>
          {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="tipo" valor={f.tipo} etiqueta="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_COLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
        <FiltroVivo parametro="origen" valor={f.origen} etiqueta="Origen">
          <option value="">Todos los orígenes</option>
          {Object.entries(ORIGENES_COLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
        {ver === "errores" && total > 0 && (
          <span className="ml-auto">
            <BotonConfirmar accion={accionReintentarErrores} campos={{ canal: f.canal ? String(f.canal) : "", volver: aqui }} clase={SUAVE}
              texto={f.canal ? "Reintentar los errores de esta cuenta" : "Reintentar errores"} pregunta="¿Volver a mandarlos?" corriendo="…" />
          </span>
        )}
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="id" n>N.º</ThOrden><ThOrden col="creado" n porDefecto={ver !== "pendientes"}>Creado</ThOrden><ThOrden col="canal">Canal</ThOrden>
              <ThOrden col="item">Publicación</ThOrden><ThOrden col="sku">SKU</ThOrden><ThOrden col="tipo">Tipo</ThOrden>
              <th className={TH}>Antes → después</th><ThOrden col="origen">Origen</ThOrden><ThOrden col="estado">Estado</ThOrden>
              <ThOrden col="intentos" n>Intentos</ThOrden>
              {ver === "pendientes" ? <ThOrden col="proximo" n>Sale</ThOrden> : <ThOrden col="enviado" n>Enviado</ThOrden>}
              <ThOrden col="error">Problema</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={13} className={`${TD} text-[#5C6B76]`}>
                {f.q || f.canal || f.tipo || f.origen ? "Nada coincide con el filtro." : ver === "pendientes" ? "No hay nada esperando: todo lo que había se mandó." : "No hay nada acá."}
              </td></tr>
            )}
            {filas.map((x) => (
              <tr key={x.id} className={TR}>
                <td className={TDN}>{x.id}</td>
                <td className={TDN}>{fechaHora(x.creado_ts)}</td>
                <td className={TD}><Link href={url(BASE, { ver: verF, ...filtros, canal: x.canal_id })} className="hover:text-[#16577F] hover:underline">{x.canal}</Link></td>
                <td className={`${TD} font-mono whitespace-nowrap`}>
                  {x.item_id.startsWith("cbte:") ? <Link href={`/administracion/facturacion/${x.item_id.slice(5)}`} className="text-[#16577F] hover:underline">Comprobante {x.item_id.slice(5)}</Link>
                    : x.item_id.startsWith("reclamo:") ? <Link href={`/ventas/reclamos/ml/${x.item_id.slice(8)}`} className="text-[#16577F] hover:underline">Reclamo {x.item_id.slice(8)}</Link>
                    : x.item_id ? <Link href={url("/catalogo/publicaciones", { canal: x.canal_id, q: x.item_id })} className="text-[#16577F] hover:underline">{x.item_id}</Link> : "—"}
                  {x.variation_id && <div className="text-[10px] text-[#5C6B76]">var. {x.variation_id}</div>}
                </td>
                <td className={TD}>{x.producto_id ? <Link href={`/catalogo/productos/${x.producto_id}`} className="text-[#16577F] hover:underline">{x.sku}</Link> : x.sku ?? "—"}</td>
                <td className={TD}>{TIPOS_COLA[x.tipo] ?? x.tipo}{x.lote_id && <div className="text-[10px]"><Link href={url(BASE, { ver: "lotes", lote: x.lote_id })} className="text-[#16577F] hover:underline">lote {x.lote_id}</Link></div>}</td>
                <td className={TD}>
                  <span className="text-[#5C6B76]">{describirAntes(x.antes)}</span> → <b>{describirCambio(x.tipo, x.payload)}</b>
                  {x.prioridad >= 100 && <span className="ml-1"><Estado texto="Urgente" tono="rojo" /></span>}
                  {x.reemplazos > 0 && <div className="text-[10px] text-[#5C6B76]">reemplazó {x.reemplazos} cambio{x.reemplazos === 1 ? "" : "s"} anterior{x.reemplazos === 1 ? "" : "es"}</div>}
                </td>
                <td className={TD}>{ORIGENES_COLA[x.origen] ?? x.origen}</td>
                <td className={TD}><Estado texto={ESTADOS_COLA[x.estado] ?? x.estado} tono={TONO_COLA[x.estado] ?? "gris"} /></td>
                <td className={TDN}>{x.intentos}</td>
                <td className={TDN}>{ver === "pendientes" ? (x.proximo_intento_ts > new Date() ? fechaHora(x.proximo_intento_ts) : "ya") : x.enviado_ts ? fechaHora(x.enviado_ts) : "—"}</td>
                <td className={`${TD} text-[11px] ${x.estado === "error" ? "text-[#C03420]" : "text-[#5C6B76]"}`}>{x.ultimo_error ?? ""}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    {x.estado === "error" && (
                      <BotonConfirmar accion={accionReintentarErrores} campos={{ id: String(x.id), volver: aqui }} clase={SUAVE} texto="Reintentar" pregunta="¿Mandarlo de nuevo?" corriendo="…" />
                    )}
                    {(x.estado === "pendiente" || x.estado === "error") && (
                      <BotonConfirmar accion={accionDescartar} campos={{ id: String(x.id), volver: aqui }} clase={APAGAR} texto="Descartar" pregunta="¿No mandarlo?" corriendo="…" />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
      <p className="text-[11px] text-[#5C6B76] mt-1">
        Sale primero lo urgente (pausar por falta de stock) y después por orden de llegada. Si llega un cambio nuevo de la misma publicación antes de salir, reemplaza al anterior (sólo importa el último). Lo que ML corta por exceso de pedidos o falla de su lado se reintenta solo, cada vez más espaciado; después de 6 intentos queda «Con error».
      </p>
    </>
  );
}

async function Lotes({ org, sp, aqui }: { org: string; sp: SP; aqui: string }) {
  const lotes = await consulta<{ id: number; descripcion: string; canal: string | null; estado: string; creado_ts: Date; enviado_ts: Date | null; cambios: number; ok: number; errores: number }>(`
    select l.id::int, l.descripcion, c.nombre canal, l.estado, l.creado_ts, l.enviado_ts,
           (select count(*) from ml_cola q where q.lote_id = l.id)::int cambios,
           (select count(*) from ml_cola q where q.lote_id = l.id and q.estado = 'ok')::int ok,
           (select count(*) from ml_cola q where q.lote_id = l.id and q.estado = 'error')::int errores
      from ml_lote l left join canal c on c.id = l.canal_id
     where l.organizacion_id = $1 and (l.estado = 'preparado' or l.creado_ts > now() - interval '30 days')
     order by (l.estado = 'preparado') desc, l.creado_ts desc limit 100`, [org]);
  const elegido = lotes.find((l) => l.id === Number(sp.lote)) ?? lotes.find((l) => l.estado === "preparado") ?? null;
  const { desde } = leerPagina(sp);
  const detalle = elegido ? await consulta<Fila>(`
    select q.id::int, q.creado_ts, q.canal_id::int, ca.nombre canal, q.item_id, q.variation_id, v.sku, v.producto_id::int, q.tipo, q.payload, q.antes,
           q.origen, q.estado, q.intentos, q.reemplazos, q.proximo_intento_ts, q.enviado_ts, q.ultimo_error, q.lote_id::int, q.prioridad
      from ml_cola q join canal ca on ca.id = q.canal_id left join publicacion pu on pu.id = q.publicacion_id left join variacion v on v.id = pu.variacion_id
     where q.lote_id = $1 order by q.id limit 50 offset ${desde}`, [elegido.id]) : [];
  const estadoLote = (e: string) => e === "preparado" ? <Estado texto="Preparado, falta tu clic" tono="amarillo" /> : e === "enviado" ? <Estado texto="Mandado" tono="verde" /> : <Estado texto="Descartado" />;
  return (
    <div className="grid gap-4">
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={THN}>N.º</th><th className={TH}>Qué cambia</th><th className={TH}>Canal</th><th className={THN}>Cambios</th><th className={TH}>Estado</th><th className={THN}>Preparado</th><th className={THN}>Mandado</th></tr></thead>
          <tbody>
            {lotes.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>No hay lotes. Cuando se prepare un cambio en Mercado Libre (por ejemplo desde el chat), aparece acá y sale recién cuando apretás «Mandar a Mercado Libre».</td></tr>}
            {lotes.map((l) => (
              <tr key={l.id} className={`${TR} ${elegido?.id === l.id ? "bg-[#EEF3F8]" : ""}`}>
                <td className={TDN}><Link href={url(BASE, { ver: "lotes", lote: l.id })} className="font-semibold text-[#16577F] hover:underline">{l.id}</Link></td>
                <td className={TD}><Link href={url(BASE, { ver: "lotes", lote: l.id })} className="hover:text-[#16577F] hover:underline">{l.descripcion}</Link></td>
                <td className={TD}>{l.canal ?? "Varias cuentas"}</td>
                <td className={TDN}><Link href={url(BASE, { ver: "lotes", lote: l.id })} className="hover:underline">{l.cambios}</Link>
                  {l.estado === "enviado" && <div className="text-[10px] text-[#5C6B76]">{l.ok} enviados{l.errores ? ` · ${l.errores} con error` : ""}</div>}</td>
                <td className={TD}>{estadoLote(l.estado)}</td>
                <td className={TDN}>{fechaHora(l.creado_ts)}</td>
                <td className={TDN}>{l.enviado_ts ? fechaHora(l.enviado_ts) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {elegido && (
        <section className={CAJA}>
          <TituloSeccion titulo={<>Lote {elegido.id}: {elegido.descripcion}</>}>
            {elegido.estado === "preparado" && (
              <>
                <BotonConfirmar accion={accionDescartarLote} campos={{ lote: String(elegido.id), volver: aqui }} clase={APAGAR} texto="Descartar lote" pregunta="¿Descartarlo sin mandar nada?" corriendo="…" />
                <BotonConfirmar accion={accionMandarLote} campos={{ lote: String(elegido.id), volver: aqui }} clase={VERDE}
                  texto="Mandar a Mercado Libre" pregunta={`¿Mandar los ${elegido.cambios} cambios a Mercado Libre?`} corriendo="Mandando…" />
              </>
            )}
          </TituloSeccion>
          <p className="text-[11px] text-[#5C6B76] mb-2">{elegido.estado === "preparado"
            ? "Nada de esto salió todavía. Revisá qué cambia en cada publicación y apretá «Mandar a Mercado Libre»."
            : "El resultado de cada cambio está en su fila."}</p>
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Publicación</th><th className={TH}>SKU</th><th className={TH}>Tipo</th><th className={TH}>Antes</th><th className={TH}>Después</th><th className={TH}>Estado</th><th className={TH}>Problema</th></tr></thead>
              <tbody>
                {detalle.map((x) => (
                  <tr key={x.id} className={TR}>
                    <td className={`${TD} font-mono whitespace-nowrap`}>
                      {x.item_id.startsWith("cbte:") ? <Link href={`/administracion/facturacion/${x.item_id.slice(5)}`} className="text-[#16577F] hover:underline">Comprobante {x.item_id.slice(5)}</Link>
                    : x.item_id.startsWith("reclamo:") ? <Link href={`/ventas/reclamos/ml/${x.item_id.slice(8)}`} className="text-[#16577F] hover:underline">Reclamo {x.item_id.slice(8)}</Link>
                    : x.item_id ? <Link href={url("/catalogo/publicaciones", { canal: x.canal_id, q: x.item_id })} className="text-[#16577F] hover:underline">{x.item_id}</Link> : "nueva"}
                      {x.variation_id && <div className="text-[10px] text-[#5C6B76]">var. {x.variation_id}</div>}
                    </td>
                    <td className={TD}>{x.producto_id ? <Link href={`/catalogo/productos/${x.producto_id}`} className="text-[#16577F] hover:underline">{x.sku}</Link> : x.sku ?? "—"}</td>
                    <td className={TD}>{TIPOS_COLA[x.tipo] ?? x.tipo}</td>
                    <td className={`${TD} text-[#5C6B76]`}>{describirAntes(x.antes)}</td>
                    <td className={TD}><b>{describirCambio(x.tipo, x.payload)}</b></td>
                    <td className={TD}><Estado texto={ESTADOS_COLA[x.estado] ?? x.estado} tono={TONO_COLA[x.estado] ?? "gris"} /></td>
                    <td className={`${TD} text-[11px] text-[#C03420]`}>{x.ultimo_error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginado total={elegido.cambios} />
        </section>
      )}
    </div>
  );
}

async function Barridas({ org, sp }: { org: string; sp: SP }) {
  const ultimas = await consulta<{ canal: string; noche: string; fase: string; revisadas: number; diferencias: number; encoladas: number; pausas: number; errores: number; terminada_ts: Date | null; detalle: string[] }>(`
    select distinct on (b.canal_id) c.nombre canal, to_char(b.noche, 'DD/MM/YYYY') noche, b.fase, b.revisadas, b.diferencias, b.encoladas, b.pausas, b.errores, b.terminada_ts, b.detalle
      from ml_barrida b join canal c on c.id = b.canal_id where b.organizacion_id = $1 order by b.canal_id, b.noche desc`, [org]);
  const { filas: historia, total } = await consultaPaginada<{ id: number; canal: string; noche: string; fase: string; revisadas: number; diferencias: number; encoladas: number; pausas: number; errores: number; iniciada_ts: Date; terminada_ts: Date | null }>({
    campos: "b.id::int, c.nombre canal, to_char(b.noche, 'DD/MM/YYYY') noche, b.fase, b.revisadas, b.diferencias, b.encoladas, b.pausas, b.errores, b.iniciada_ts, b.terminada_ts",
    desde: "ml_barrida b join canal c on c.id = b.canal_id", donde: "b.organizacion_id = $1", orden: "b.noche desc, c.nombre",
  }, [org], sp);
  const FASE: Record<string, string> = { ids: "Leyendo la lista", items: "Leyendo publicaciones", comparar: "Comparando", terminada: "Terminada", error: "No pudo terminar" };
  return (
    <div className="grid gap-4">
      <p className="text-[11px] text-[#5C6B76]">
        Todas las noches, de 2 a 5, Laucen lee de Mercado Libre el estado real de todas las publicaciones de cada cuenta con «Laucen manda el stock» prendido (de a una cuenta), lo compara con lo que debería ser y encola las diferencias (las pausas primero). Así nada queda perdido aunque un aviso no haya llegado.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {ultimas.length === 0 && <p className="text-xs text-[#5C6B76]">Todavía no corrió ninguna barrida.</p>}
        {ultimas.map((b) => (
          <section key={b.canal} className={CAJA}>
            <h2 className="text-sm font-bold mb-1">{b.canal} <span className="font-normal text-[#5C6B76]">· noche del {b.noche}</span></h2>
            <p className="text-xs"><Estado texto={FASE[b.fase] ?? b.fase} tono={b.fase === "terminada" ? "verde" : b.fase === "error" ? "rojo" : "azul"} />
              {b.terminada_ts && <span className="ml-2 text-[#5C6B76]">terminó {fechaHora(b.terminada_ts)}</span>}</p>
            <p className="text-xs mt-1 tabular-nums">{b.revisadas.toLocaleString("es-AR")} revisadas · {b.diferencias.toLocaleString("es-AR")} diferencias · {b.encoladas.toLocaleString("es-AR")} encoladas ({b.pausas.toLocaleString("es-AR")} pausas) · {b.errores.toLocaleString("es-AR")} errores</p>
            {b.detalle?.length > 0 && <p className="text-[11px] text-[#C03420] mt-1">{b.detalle.slice(-3).join(" · ")}</p>}
          </section>
        ))}
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={THN}>Noche</th><th className={TH}>Canal</th><th className={TH}>Estado</th><th className={THN}>Revisadas</th><th className={THN}>Diferencias</th><th className={THN}>Encoladas</th><th className={THN}>Pausas</th><th className={THN}>Errores</th><th className={THN}>Empezó</th><th className={THN}>Terminó</th></tr></thead>
          <tbody>
            {historia.map((b) => (
              <tr key={b.id} className={TR}>
                <td className={TDN}>{b.noche}</td><td className={TD}>{b.canal}</td><td className={TD}>{FASE[b.fase] ?? b.fase}</td>
                <td className={TDN}>{b.revisadas.toLocaleString("es-AR")}</td><td className={TDN}>{b.diferencias.toLocaleString("es-AR")}</td>
                <td className={TDN}>{b.encoladas.toLocaleString("es-AR")}</td><td className={TDN}>{b.pausas.toLocaleString("es-AR")}</td><td className={TDN}>{b.errores.toLocaleString("es-AR")}</td>
                <td className={TDN}>{fechaHora(b.iniciada_ts)}</td><td className={TDN}>{b.terminada_ts ? fechaHora(b.terminada_ts) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </div>
  );
}
