// Tablero de Mercado Libre: todas las cuentas conectadas en una pantalla,
// una columna por cuenta y una de totales. Arriba la reputación con los
// colores de ML y lo que la afecta (reclamos, entregas demoradas,
// cancelaciones); después las publicaciones; después lo que hay para
// atender hoy (etiquetas, pedidos, envíos, preguntas, mensajes, reclamos,
// devoluciones); y al pie las alertas del catálogo. Cada número lleva a la
// pantalla donde se resuelve, ya filtrada por la cuenta.

import Link from "next/link";
import { formatear } from "@/lib/moneda";
import { SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, url, CAJA } from "@/app/componentes/erp";
import { cuentasTablero, metricasPorCanal, alertasCatalogo, gruposNoMl, sumar, type CuentaTablero, type Metricas } from "@/lib/mercadolibre/tablero";
import { actualizarReputaciones, nivelDe, NIVELES_REPUTACION, LIDER, type Metrica } from "@/lib/mercadolibre/reputacion";
import { accionActualizarReputacion } from "./acciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tablero de Mercado Libre" };

type SP = { ok?: string; error?: string };

const n = (x: number) => x.toLocaleString("es-AR");
const haceCuanto = (d: Date | string | null) => {
  if (!d) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60_000));
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
};
const periodo = (p: string | null) => (!p ? "" : p === "historic" ? "histórico" : /^(\d+) days?$/.test(p) ? `${p.split(" ")[0]} días` : p);

type Tono = "alerta" | "ok" | "neutro";
/** Un número del tablero: el principal en grande (rojo si hay algo para atender), el total chico y, si hay, un enlace. */
function Celda({ valor, de, href, tono = "alerta", nota }: { valor: number | string; de?: number | string; href?: string | null; tono?: Tono; nota?: string | null }) {
  const color = tono === "neutro" ? "" : tono === "alerta" ? (Number(valor) > 0 ? "text-[#C03420]" : "text-[#1F6E4A]") : "text-[#1F6E4A]";
  const cuerpo = (
    <>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{typeof valor === "number" ? n(valor) : valor}</span>
      {de !== undefined && <span className="ml-1 text-[11px] text-[#5C6B76] tabular-nums">de {typeof de === "number" ? n(de) : de}</span>}
      {nota && <span className="block text-[9px] text-[#5C6B76] leading-[11px] break-words">{nota}</span>}
    </>
  );
  return href ? <Link href={href} className="block hover:bg-[#EEF3F8] rounded-md px-1 -mx-1">{cuerpo}</Link> : <div>{cuerpo}</div>;
}

function Termometro({ nivel }: { nivel: string | null }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {NIVELES_REPUTACION.map((x) => (
        <span key={x.id} className="h-1.5 w-3 first:rounded-l last:rounded-r" style={{ background: x.color, opacity: x.id === nivel ? 1 : 0.22 }} />
      ))}
    </div>
  );
}

function CeldaReputacion({ c }: { c: CuentaTablero }) {
  const r = c.reputacion;
  if (!r) return <span className="text-[11px] text-[#5C6B76]">Sin leer todavía</span>;
  const nivel = nivelDe(r.nivel);
  return (
    <div className="grid gap-1">
      <Termometro nivel={r.nivel} />
      <div className="flex flex-wrap items-center gap-1">
        {nivel
          ? <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ background: nivel.color, color: nivel.tinta }}>{nivel.texto}</span>
          : <span className="rounded bg-[#E3E9F0] px-1.5 py-0.5 text-[11px] font-bold text-[#5C6B76]">Sin reputación todavía</span>}
        {r.lider && <span className="rounded bg-[#EEF3F8] px-1.5 py-0.5 text-[11px] font-bold text-[#16577F]">{LIDER[r.lider] ?? r.lider}</span>}
      </div>
    </div>
  );
}

/** Una métrica de reputación: cuántos en el período que ML cuenta y qué porcentaje es. */
function CeldaMetrica({ m, titulo }: { m: Metrica | null; titulo: string }) {
  if (!m) return <span className="text-[11px] text-[#5C6B76]" title={titulo}>—</span>;
  return <Celda valor={m.valor} tono="neutro" nota={`${(m.tasa * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} % · ${periodo(m.periodo)}`} />;
}

/** Una columna del tablero: una cuenta de ML, la tienda web o "el resto" (los canales que no son de ML). */
type Col = { clave: string; titulo: string; sub: string; href: string | null; cuenta: CuentaTablero | null; canal: number | null; ids: number[] };

type Fila = {
  titulo: string; ayuda?: string;
  celda: (c: Col, m: Metricas) => React.ReactNode;
  total?: (t: Metricas, cols: Col[]) => React.ReactNode;
};

const NA = <span className="text-[11px] text-[#9AA7B3]" title="No aplica a este canal">—</span>;
/** Para las filas que sólo existen en una cuenta de ML (reputación, publicaciones, preguntas…). */
const soloMl = (f: (c: CuentaTablero, m: Metricas) => React.ReactNode) => (c: Col, m: Metricas) => (c.cuenta ? f(c.cuenta, m) : NA);

export default async function TableroMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tablero_ml_ver");
  const sp = await searchParams;
  const org = s.org.id;

  // La reputación se vuelve a leer sola si tiene más de una hora (un tope de 8 s: si ML demora, se muestra lo guardado).
  await Promise.race([actualizarReputaciones(org).catch(() => 0), new Promise((ok) => setTimeout(ok, 8000))]);

  const cuentas = await cuentasTablero(org);
  const grupos = await gruposNoMl(org);
  const [porCanal, porCanalNoMl, catalogo] = await Promise.all([
    metricasPorCanal(org, cuentas.map((c) => c.canalId)),
    metricasPorCanal(org, [...grupos.web, ...grupos.otros], { soloMl: false }),
    alertasCatalogo(org),
  ]);
  const columnas: Col[] = [
    ...cuentas.map((c): Col => ({ clave: `ml${c.cuentaId}`, titulo: c.apodo ?? c.canal, sub: `${c.canal}${c.razonSocial ? ` · ${c.razonSocial}` : ""}`,
      href: url("/config/canales", { c: c.canalId }), cuenta: c, canal: c.canalId, ids: [c.canalId] })),
    { clave: "web", titulo: "Web", sub: "Tienda web (minorista y mayorista)", href: "/config/tienda", cuenta: null, canal: grupos.web.length === 1 ? grupos.web[0] : null, ids: grupos.web },
    { clave: "otros", titulo: "Otros", sub: "Local, pedidos manuales y el resto", href: "/config/canales", cuenta: null, canal: grupos.otros.length === 1 ? grupos.otros[0] : null, ids: grupos.otros },
  ];
  const mapa = new Map([...porCanal, ...porCanalNoMl]);
  const M = (c: Col) => sumar(c.ids.map((i) => mapa.get(i)).filter((x): x is Metricas => !!x));
  const total = sumar(columnas.map(M));
  // Las pantallas filtran por UN canal: un grupo con varios canales enlaza a la lista completa.
  const enlace = (base: string, c: Col, extra: Record<string, string | number | null> = {}) => url(base, { ...extra, canal: c.canal });

  const fecha = cuentas.map((c) => c.reputacionTs).filter(Boolean).sort().at(-1) ?? null;
  const pub = (c: CuentaTablero, ver: string) => url("/catalogo/publicaciones/ml", { canal: c.canalId, ver });
  const suma = (cs: Col[], f: (c: CuentaTablero) => number) => cs.reduce((a, c) => a + (c.cuenta ? f(c.cuenta) : 0), 0);

  const secciones: { titulo: string; sub?: string; filas: Fila[] }[] = [
    {
      titulo: "Reputación", sub: "Lo que informa Mercado Libre; cada dato cuenta el período que figura.",
      filas: [
        { titulo: "Color de la reputación", celda: soloMl((c) => <CeldaReputacion c={c} />) },
        { titulo: "Reclamos que afectan la reputación", celda: soloMl((c) => <CeldaMetrica m={c.reputacion?.reclamos ?? null} titulo="reclamos" />),
          total: (_t, cs) => <Celda valor={suma(cs, (c) => c.reputacion?.reclamos?.valor ?? 0)} tono="neutro" /> },
        { titulo: "Entregas demoradas", ayuda: "Despachos fuera del plazo de manipulación",
          celda: soloMl((c) => <CeldaMetrica m={c.reputacion?.demoras ?? null} titulo="demoras" />),
          total: (_t, cs) => <Celda valor={suma(cs, (c) => c.reputacion?.demoras?.valor ?? 0)} tono="neutro" /> },
        { titulo: "Cancelaciones", celda: soloMl((c) => <CeldaMetrica m={c.reputacion?.cancelaciones ?? null} titulo="cancelaciones" />),
          total: (_t, cs) => <Celda valor={suma(cs, (c) => c.reputacion?.cancelaciones?.valor ?? 0)} tono="neutro" /> },
        { titulo: "Ventas completadas", celda: soloMl((c) => c.reputacion?.ventas ? <Celda valor={c.reputacion.ventas.completadas} tono="neutro" nota={periodo(c.reputacion.ventas.periodo)} /> : "—"),
          total: (_t, cs) => <Celda valor={suma(cs, (c) => c.reputacion?.ventas?.completadas ?? 0)} tono="neutro" /> },
        { titulo: "Calificaciones positivas", celda: soloMl((c) => c.reputacion?.calificaciones
          ? <Celda valor={`${Math.round(c.reputacion.calificaciones.positivas * 100)} %`} tono="neutro" nota={`${Math.round(c.reputacion.calificaciones.negativas * 100)} % negativas`} /> : "—") },
      ],
    },
    {
      titulo: "Publicaciones",
      filas: [
        { titulo: "Activas", celda: soloMl((c, m) => <Celda valor={m.publicaciones.activas} de={m.publicaciones.total} tono="ok" href={pub(c, "activas")} />),
          total: (t) => <Celda valor={t.publicaciones.activas} de={t.publicaciones.total} tono="ok" /> },
        { titulo: "Pausadas", celda: soloMl((c, m) => <Celda valor={m.publicaciones.pausadas} tono="neutro" href={pub(c, "pausadas")} />),
          total: (t) => <Celda valor={t.publicaciones.pausadas} tono="neutro" /> },
        { titulo: "Con cuestiones para resolver", ayuda: "En revisión, inactivas o con el pago pendiente: ML las frena hasta que se corrija algo",
          celda: soloMl((c, m) => <Celda valor={m.publicaciones.conCuestiones} href={pub(c, "revision")} />), total: (t) => <Celda valor={t.publicaciones.conCuestiones} /> },
        { titulo: "Sin producto asociado", ayuda: "Publicaciones de ML que todavía no están vinculadas a un producto de Laucen (su stock no se sincroniza)",
          celda: soloMl((c, m) => <Celda valor={m.publicaciones.sinProducto} de={m.publicaciones.total} href={pub(c, "sin")} nota={m.publicaciones.sinProductoActivas ? `${n(m.publicaciones.sinProductoActivas)} activas` : null} />),
          total: (t) => <Celda valor={t.publicaciones.sinProducto} de={t.publicaciones.total} nota={t.publicaciones.sinProductoActivas ? `${n(t.publicaciones.sinProductoActivas)} activas` : null} /> },
      ],
    },
    {
      titulo: "Para hacer hoy", sub: "Lo que espera tu atención; el número chico es el total de esa clase.",
      filas: [
        { titulo: "Etiquetas para imprimir", ayuda: "Envíos por despachar con la etiqueta todavía sin imprimir",
          celda: (c, m) => <Celda valor={m.etiquetas.sinImprimir} de={m.etiquetas.porDespachar} href={enlace("/ventas/envios", c)} nota={m.etiquetas.vencidos ? `${n(m.etiquetas.vencidos)} para hoy o vencidos` : null} />,
          total: (t) => <Celda valor={t.etiquetas.sinImprimir} de={t.etiquetas.porDespachar} href="/ventas/envios" nota={t.etiquetas.vencidos ? `${n(t.etiquetas.vencidos)} para hoy o vencidos` : null} /> },
        { titulo: "Pedidos para preparar", celda: (c, m) => <Celda valor={m.pedidosParaPreparar} href={enlace("/ventas/pedidos", c)} />,
          total: (t) => <Celda valor={t.pedidosParaPreparar} href="/ventas/pedidos" /> },
        { titulo: "Pedidos en camino", celda: (c, m) => <Celda valor={m.enCamino} tono="neutro" href={enlace("/ventas/envios", c, { ver: "camino" })} />,
          total: (t) => <Celda valor={t.enCamino} tono="neutro" href="/ventas/envios?ver=camino" /> },
        { titulo: "Preguntas para responder", celda: soloMl((c, m) => <Celda valor={m.preguntas.sinResponder} de={m.preguntas.total} href={url("/ventas/preguntas", { canal: c.canalId })} nota={m.preguntas.masVieja ? `la más vieja, ${haceCuanto(m.preguntas.masVieja)}` : null} />),
          total: (t) => <Celda valor={t.preguntas.sinResponder} de={t.preguntas.total} href="/ventas/preguntas" /> },
        { titulo: "Mensajes para responder", ayuda: "Conversaciones de posventa con mensajes sin leer",
          celda: soloMl((c, m) => <Celda valor={m.mensajes.sinLeer} de={m.mensajes.total} href={url("/ventas/preguntas", { ver: "mensajes", canal: c.canalId })} />),
          total: (t) => <Celda valor={t.mensajes.sinLeer} de={t.mensajes.total} href="/ventas/preguntas?ver=mensajes" /> },
        { titulo: "Reclamos para atender", ayuda: "Abiertos; el chico es el total de reclamos. Debajo, los que esperan tu respuesta",
          celda: (c, m) => <Celda valor={m.reclamos.abiertos} de={m.reclamos.total} href={enlace("/ventas/reclamos", c, { ver: "abiertos" })}
            nota={m.reclamos.abiertos ? [`${n(m.reclamos.esperanRespuesta)} esperan tu respuesta`, m.reclamos.urgentes ? `${n(m.reclamos.urgentes)} vencen en 24 h` : null, m.reclamos.enMediacion ? `${n(m.reclamos.enMediacion)} en mediación` : null].filter(Boolean).join(" · ") : null} />,
          total: (t) => <Celda valor={t.reclamos.abiertos} de={t.reclamos.total} href="/ventas/reclamos" nota={t.reclamos.abiertos ? `${n(t.reclamos.esperanRespuesta)} esperan tu respuesta` : null} /> },
        { titulo: "Devoluciones", ayuda: "Abiertas; debajo, las que ya vienen en camino",
          celda: (c, m) => <Celda valor={m.devoluciones.abiertas} de={m.devoluciones.total} href={enlace("/ventas/reclamos", c, { ver: "camino" })} nota={m.devoluciones.enCamino ? `${n(m.devoluciones.enCamino)} en camino` : null} />,
          total: (t) => <Celda valor={t.devoluciones.abiertas} de={t.devoluciones.total} href="/ventas/reclamos?ver=camino" nota={t.devoluciones.enCamino ? `${n(t.devoluciones.enCamino)} en camino` : null} /> },
      ],
    },
    {
      titulo: "Movimiento y salud",
      filas: [
        { titulo: "Ventas de hoy", celda: (_c, m) => <Celda valor={m.ventas.hoy} tono="neutro" nota={formatear(m.ventas.hoyArs, "ARS")} />,
          total: (t) => <Celda valor={t.ventas.hoy} tono="neutro" nota={formatear(t.ventas.hoyArs, "ARS")} /> },
        { titulo: "Ventas de los últimos 7 días", celda: (_c, m) => <Celda valor={m.ventas.sieteDias} tono="neutro" nota={formatear(m.ventas.sieteDiasArs, "ARS")} />,
          total: (t) => <Celda valor={t.ventas.sieteDias} tono="neutro" nota={formatear(t.ventas.sieteDiasArs, "ARS")} /> },
        { titulo: "Cola de ML con error", ayuda: "Cambios que Laucen quiso mandar a ML y no pudo",
          celda: soloMl((c, m) => <Celda valor={m.cola.errores} href={url("/config/canales/cola", { ver: "errores", canal: c.canalId })} nota={m.cola.preparados ? `${n(m.cola.preparados)} lotes esperan tu clic` : null} />),
          total: (t) => <Celda valor={t.cola.errores} href="/config/canales/cola?ver=errores" nota={t.cola.preparados ? `${n(t.cola.preparados)} lotes esperan tu clic` : null} /> },
        { titulo: "Conexión", celda: soloMl((c) => (
          <div className="grid gap-0.5">
            <Estado texto={c.estado === "activa" ? "Conectada" : "Desconectada"} tono={c.estado === "activa" ? "verde" : "rojo"} />
            {c.estado !== "activa" && <Link href={url("/config/canales", { c: c.canalId })} className="text-[11px] text-[#16577F] hover:underline">Volver a conectar</Link>}
            {c.ultimoError && <span className="text-[10px] text-[#C03420] leading-3">{c.ultimoError.slice(0, 80)}</span>}
          </div>)) },
      ],
    },
  ];

  return (
    <Pantalla titulo="Tablero de Mercado Libre" ancho="max-w-[1700px]"
      subtitulo={<>Todas tus cuentas, la web y el resto en una pantalla · reputación leída {haceCuanto(fecha)}</>}
      acciones={<form action={accionActualizarReputacion}><BotonEnviar clase={SUAVE} corriendo="Preguntando a Mercado Libre…">Actualizar reputación</BotonEnviar></form>}>
      <Avisos sp={sp} />
      {cuentas.length === 0 && (
        <div className={`${CAJA} mb-3`}>
          <p className="text-xs">Todavía no hay ninguna cuenta de Mercado Libre conectada a un canal. Conectala en <Link href="/config/canales" className="text-[#16577F] underline">Configuración → Canales</Link>.</p>
        </div>
      )}
      <div className="bg-white border border-[#E3E9F0] rounded-xl overflow-x-auto">
        <table className="w-auto text-[10px] border-collapse">
          <thead className="bg-[#FAFBFC] border-b border-[#E3E9F0] sticky top-0 z-10">
            <tr>
              <th className="py-1 px-1.5 text-left w-32 min-w-28" />
              {columnas.map((c) => (
                <th key={c.clave} className="py-1 px-1.5 text-left align-top w-[5.5rem] min-w-[5.5rem] max-w-[5.5rem] border-l border-[#E3E9F0]">
                  {c.href ? <Link href={c.href} className="font-bold text-xs text-[#16577F] hover:underline break-words">{c.titulo}</Link> : <span className="font-bold text-xs">{c.titulo}</span>}
                  <span className="block text-[9px] font-normal text-[#5C6B76] leading-[11px] break-words">{c.sub}</span>
                </th>
              ))}
              <th className="py-1 px-1.5 text-left align-top w-[5.5rem] min-w-[5.5rem] border-l-2 border-[#E3E9F0] bg-[#F3F6F9] font-bold text-xs">Total</th>
            </tr>
          </thead>
          {secciones.map((sec) => (
            <tbody key={sec.titulo}>
              <tr className="bg-[#EEF3F8]">
                <td colSpan={columnas.length + 2} className="py-0.5 px-1.5 font-bold text-[#16577F]">
                  {sec.titulo}{sec.sub && <span className="ml-2 font-normal text-[10px] text-[#5C6B76]">{sec.sub}</span>}
                </td>
              </tr>
              {sec.filas.map((f) => (
                <tr key={f.titulo} className="border-t border-[#EEF1F4] align-top">
                  <th scope="row" className="py-1 px-1.5 text-left font-semibold" title={f.ayuda}>
                    {f.titulo}{f.ayuda && <span className="ml-0.5 font-normal text-[#9AA7B3] cursor-help">ⓘ</span>}
                  </th>
                  {columnas.map((c) => <td key={c.clave} className="py-1 px-1.5 border-l border-[#EEF1F4] max-w-[5.5rem]">{f.celda(c, M(c))}</td>)}
                  <td className="py-1 px-1.5 border-l-2 border-[#E3E9F0] bg-[#F9FAFB]">{f.total ? f.total(total, columnas) : ""}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <h2 className="text-sm font-bold mt-6 mb-2">Alertas del catálogo <span className="font-normal text-[11px] text-[#5C6B76]">(no son de una cuenta en particular)</span></h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={CAJA}>
          <div className="text-xs font-semibold">Productos con stock disponible y sin publicación activa en Mercado Libre</div>
          <p className="text-[11px] text-[#5C6B76]">Mercadería parada: hay unidades y no se está vendiendo por ML.</p>
          <div className="mt-1"><Celda valor={catalogo.sinPublicar} de={catalogo.productosActivos} href="/catalogo/productos?sinpublicar=1" /></div>
        </div>
        <div className={CAJA}>
          <div className="text-xs font-semibold">Productos de la tienda web sin fotos</div>
          <p className="text-[11px] text-[#5C6B76]">Activos, con precio en la tienda y ninguna foto cargada.</p>
          <div className="mt-1"><Celda valor={catalogo.sinFotos} de={catalogo.productosActivos} href="/catalogo/productos?sinfotos=1" /></div>
        </div>
      </div>
    </Pantalla>
  );
}
