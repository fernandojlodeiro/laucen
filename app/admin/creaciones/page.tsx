import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { orgRequerida } from "@/lib/tenancy";
import { consulta } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { PLAN_INFO } from "@/lib/precios-ml/motor";
import { DESCUENTO_CLASICA, MARGEN_PLAN, propuestaPrueba } from "@/lib/mercadolibre/prueba-planes";
import { enlaceMl, historialPublicacion } from "@/app/informes/cambios-publicaciones/formato";
import { SUAVE, PRIMARIO } from "@/app/botones";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { accionPrepararPruebaPlanes, accionRevisarCatalogo, accionPrepararCatalogo } from "./actions";
import { filasCatalogo, sePuedePedir, textoEstadoCatalogo, textoMotivoCatalogo } from "@/lib/mercadolibre/catalogo-entrada";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const metadata = { title: "Creaciones en ML", robots: { index: false, follow: false } };

// Lo contrario de Limpieza (Fer, 7/10): publicaciones que se crean en Mercado
// Libre de a tandas, con un botón que muestra antes todo lo que se va a crear y
// deja los lotes en la cola esperando el clic. Sólo Fer.

const CAJA = "bg-white border border-[#E3E9F0] rounded-xl p-4 space-y-3";
const pesos = (x: number) => `$ ${formatearNumero(x, "entero")}`;
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Creaciones({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  const sp = await searchParams;
  const org = (await orgRequerida()).id;
  const [{ filas, estimada }, catalogo] = await Promise.all([propuestaPrueba(org), filasCatalogo(org)]);
  const pueden = catalogo.filter(sePuedePedir).length;
  const faltan = filas.filter((f) => !f.existe).length;
  // Cómo quedaron los lotes de esta prueba en la cola.
  const enCola = await consulta<{ item_id: string; canal: string; estado: string; lote: number | null; error: string | null; respuesta: { id?: string; otras?: string[] } | null; ts: string }>(`
    select q.item_id, c.nombre canal, q.estado, q.lote_id::int lote, q.ultimo_error error, q.respuesta, coalesce(q.enviado_ts, q.creado_ts) ts
      from ml_cola q join canal c on c.id = q.canal_id
     where q.organizacion_id = $1 and q.tipo = 'crear' and q.item_id like 'prueba:%' order by q.id desc limit 20`, [org]);
  const ESTADO: Record<string, string> = { preparado: "Preparado, falta tu clic", pendiente: "En la cola", enviando: "Mandándose", ok: "Creada", error: "Con error", descartado: "Descartado" };

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <h1 className="text-xl font-bold text-[#16577F]">Creaciones en ML</h1>
      <p className="text-sm text-[#5C6B76]">Publicaciones que se crean en Mercado Libre por tandas. Nada sale sin tu clic en la cola.</p>

      {sp.ok && <p className="text-sm bg-[#E8F5EE] border border-[#BFE3CF] rounded-lg p-3 text-[#167655]">{sp.ok}</p>}
      {sp.error && <p className="text-sm bg-[#FDF0EE] border border-[#EFD3CE] rounded-lg p-3 text-[#C03420]">{sp.error}</p>}

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Prueba de planes de cuotas en cada cuenta</h2>
        <p className="text-sm text-[#5C6B76]">
          Mercado Libre no le muestra al comprador las cuotas del nombre del plan, y depende del vendedor (en .BAIRES la Premium 3x se ve
          «6 cuotas» y la 12x «18 cuotas»). Para saber qué muestra cada cuenta, en cada una se publica una notebook distinta con los tres
          planes que más convienen: <b>Clásica</b>, <b>Premium 3x</b> y <b>Premium 12x</b>. Cada una copia nuestra publicación común de
          .BAIRES (título, fotos, características, garantía y descripción). Cada plan es una publicación propia (las de cuotas, Premium con la marca
          del plan); Mercado Libre las junta en el mismo producto y comparten el stock. Precio de cada plan: deja lo mismo que la Clásica después de su comisión, más
          {" "}{MARGEN_PLAN["3x_campaign"]} % (3x) o {MARGEN_PLAN["12x_campaign"]} % (12x). Salen publicadas al <b>tachado</b> del modelo (el mismo en sus tres planes: con la campaña, la Clásica muestra {DESCUENTO_CLASICA} % de descuento);
          después, al meterlas en campaña, cada una baja al precio de «Con la campaña».
          {estimada && " (Comisión estimada: Costos ML todavía no relevó la categoría.)"}
        </p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Cuenta</th><th className={TH}>SKU</th><th className={TH}>Plan</th><th className={THN}>Se publica a (tachado)</th><th className={THN}>Con la campaña</th><th className={THN}>Descuento</th><th className={THN}>Comisión</th><th className={THN}>Stock</th><th className={TH}>Copia de</th><th className={TH}>Qué pasa</th></tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={`${f.cuenta}-${f.plan}`} className={TR}>
                  <td className={TD}>{f.cuenta}</td>
                  <td className={`${TD} font-mono`}>{f.sku}</td>
                  <td className={TD}>{f.plan === "clasica" ? "Clásica" : `Premium ${f.plan.replace("_campaign", "")}`} <span className="text-[10px] text-[#5C6B76]">({PLAN_INFO[f.plan].corto} por nombre)</span></td>
                  <td className={TDN}>{pesos(f.tachado)}</td>
                  <td className={TDN}>{pesos(f.precio)}</td>
                  <td className={TDN}>{formatearNumero(100 * (1 - f.precio / f.tachado), "pct")} %</td>
                  <td className={TDN}>{formatearNumero(f.comision, "pct")} %</td>
                  <td className={TDN}>{formatearNumero(f.stock, "entero")}</td>
                  <td className={`${TD} font-mono whitespace-nowrap`}><Link href={historialPublicacion(f.origen)} className="text-[#16577F] hover:underline">{f.origen}</Link> <a href={enlaceMl(f.origen)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a></td>
                  <td className={TD}>{f.existe
                    ? <>Ya existe: <Link href={historialPublicacion(f.existe)} className="text-[#16577F] hover:underline font-mono">{f.existe}</Link> <a href={enlaceMl(f.existe)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a></>
                    : <span className="text-[#167655] font-semibold">Se crea</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {faltan > 0
            ? <BotonTarea accion={accionPrepararPruebaPlanes} tipo="prueba-planes-ml" clase={PRIMARIO} texto={`Preparar ${faltan} publicaciones`} />
            : <span className="text-sm text-[#167655]">Ya están todas creadas.</span>}
          <Link href="/config/canales/cola?ver=lotes" className={SUAVE}>Ir a la Cola de Mercado Libre</Link>
        </div>
        <p className="text-xs text-[#5C6B76]">
          El botón comprueba cada alta con Mercado Libre (no publica nada) y deja un lote por cuenta en la cola, «Preparado, falta tu clic».
          Lo que Mercado Libre rechaza no entra y te dice por qué. Después de mandarlas, mirá en cada publicación cuántas cuotas muestra
          Mercado Libre y anotalo en <Link href="/catalogo/precios-ml" className="underline">Precios en Mercado Libre</Link> (cuotas que ve el comprador).
        </p>
        {enCola.length > 0 && (
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={THN}>Lote</th><th className={TH}>Cuenta</th><th className={TH}>Prueba</th><th className={TH}>Estado</th><th className={TH}>Publicaciones creadas</th><th className={TH}>Cuándo</th></tr></thead>
              <tbody>
                {enCola.map((q) => (
                  <tr key={`${q.item_id}-${q.ts}`} className={TR}>
                    <td className={TDN}>{q.lote ? <Link href={`/config/canales/cola?ver=lotes&lote=${q.lote}`} className="text-[#16577F] hover:underline">{q.lote}</Link> : "—"}</td>
                    <td className={TD}>{q.canal}</td>
                    <td className={`${TD} font-mono`}>{q.item_id.replace("prueba:", "").replace(":", " · ")}</td>
                    <td className={TD}>{ESTADO[q.estado] ?? q.estado}{q.error && <span className="block text-[11px] text-[#C03420]">{q.error}</span>}</td>
                    <td className={`${TD} font-mono`}>{[q.respuesta?.id, ...(q.respuesta?.otras ?? [])].filter((x): x is string => !!x).map((id) => (
                      <span key={id} className="mr-2 whitespace-nowrap"><Link href={historialPublicacion(id)} className="text-[#16577F] hover:underline">{id}</Link> <a href={enlaceMl(id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a></span>
                    ))}</td>
                    <td className={TDN}>{fechaHora(q.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={CAJA}>
        <h2 className="font-bold text-[#16577F]">Catálogo: ¿pueden entrar a competir?</h2>
        <p className="text-sm text-[#5C6B76]">
          Las publicaciones comunes (no de catálogo) de estas notebooks, en todas las cuentas. <b>«Revisar catálogo»</b> le pregunta a
          Mercado Libre, una por una, si puede entrar a competir en el catálogo y contra qué producto; para los modelos sin producto conocido, lo
          busca en el catálogo por su código de barras (sólo lee, no cambia nada; corre de fondo). Las que Mercado Libre no tiene asociadas pero
          tienen un producto conocido (de otra publicación nuestra del mismo modelo, o encontrado por código de barras) se pueden <b>intentar</b>:
          Mercado Libre puede rechazarlas, y el motivo queda en la cola.
          <b> «Preparar entrada al catálogo»</b> deja en la cola, un lote por cuenta, las que pueden entrar: Mercado Libre crea la publicación
          de catálogo, que comparte el stock con la común. No sale nada hasta tu clic en la cola. Las publicaciones nuevas de la prueba
          aparecen acá cuando Laucen las trae de Mercado Libre.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <BotonTarea accion={accionRevisarCatalogo} tipo="catalogo-ml" clase={SUAVE} texto="Revisar catálogo (sólo lectura)" />
          {pueden > 0 && <BotonTarea accion={accionPrepararCatalogo} tipo="catalogo-ml" clase={PRIMARIO} texto={`Preparar entrada al catálogo (${pueden})`} />}
        </div>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Cuenta</th><th className={TH}>SKU</th><th className={TH}>Publicación</th><th className={TH}>Tipo</th><th className={TH}>Producto de catálogo</th><th className={TH}>Qué dice ML</th><th className={TH}>Leído</th></tr>
            </thead>
            <tbody>
              {catalogo.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>No hay publicaciones comunes de estas notebooks.</td></tr>}
              {catalogo.map((f) => (
                <tr key={`${f.canal}-${f.item_id}`} className={TR}>
                  <td className={TD}>{f.cuenta}</td>
                  <td className={`${TD} font-mono`}>{f.sku}</td>
                  <td className={`${TD} font-mono whitespace-nowrap`}><Link href={historialPublicacion(f.item_id)} className="text-[#16577F] hover:underline">{f.item_id}</Link> <a href={enlaceMl(f.item_id)} target="_blank" rel="noopener noreferrer" className="text-[#16577F]">↗</a></td>
                  <td className={TD}>{f.tipo === "gold_special" ? "Clásica" : f.tipo === "gold_pro" ? "Premium" : f.tipo}</td>
                  <td className={TD}>
                    <span className="font-mono">{f.catalog_product_id ?? (f.sugerido ? f.sugerido : "—")}</span>
                    {!f.catalog_product_id && f.sugerido && <span className="block text-[11px] text-[#5C6B76]">por {f.sugerido_como}{f.sugerido_nombre ? `: ${f.sugerido_nombre}` : ""}</span>}
                  </td>
                  <td className={TD}>
                    <span className={f.estado === "READY_FOR_OPTIN" ? "text-[#167655] font-semibold" : ""}>{f.estado ? textoEstadoCatalogo(f.estado) : "Sin revisar"}</span>
                    {f.pedido && <span className="block text-[11px] text-[#16577F]">Entrada pedida (ver la cola)</span>}
                    {!f.pedido && f.estado === "CATALOG_PRODUCT_ID_NULL" && f.sugerido && <span className="block text-[11px] text-[#8a6100]">Se puede intentar con el producto conocido</span>}
                    {textoMotivoCatalogo(f.motivo) && <span className="block text-[11px] text-[#5C6B76]">{textoMotivoCatalogo(f.motivo)}</span>}
                  </td>
                  <td className={TDN}>{f.leido ? fechaHora(f.leido) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
