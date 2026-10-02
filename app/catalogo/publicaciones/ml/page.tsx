// Vincular con Mercado Libre: las publicaciones traídas de ML (meli_item, una
// fila por item o por variación del item) y a qué variación de Laucen
// corresponde cada una. Lo vinculado queda en `publicacion`, que es lo que
// usan el stock, la pausa y los pedidos.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { formatear, tcDelDia } from "@/lib/moneda";
import { cuentasDe } from "@/lib/mercadolibre/api";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { TachoConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import {
  entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { accionTraerPublicaciones, accionVincular, accionCrearProducto, accionDesvincular } from "./acciones";

export const dynamic = "force-dynamic";
// Traer publicaciones puede tardar (hasta 4 minutos por vuelta).
export const maxDuration = 300;

const BASE = "/catalogo/publicaciones/ml";
const POR_PAGINA = 100;

type SP = { canal?: string; ver?: string; q?: string; pagina?: string; ok?: string; error?: string };
type Ver = "sin" | "vinc" | "todas";

type Fila = {
  item_id: string; variation_id: string; titulo: string | null; atributos: string | null; sku: string | null;
  precio: string | null; stock: number | null; vendidos: number | null; estado: string | null; tipo: string | null;
  logistica: string | null; permalink: string | null; foto: string | null; publicacion_id: number | null;
  variaciones: number; primera: boolean;
  variacion_id: number | null; var_sku: string | null; var_titulo: string | null; producto_id: number | null; disponible: number | null;
  inactivo: boolean;
};

const ESTADO_ML: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" | "azul" }> = {
  active: { texto: "Activa", tono: "verde" }, paused: { texto: "Pausada", tono: "amarillo" },
  closed: { texto: "Cerrada", tono: "gris" }, under_review: { texto: "En revisión", tono: "azul" },
};
const TIPO_ML: Record<string, string> = { gold_pro: "Premium", gold_special: "Clásica", free: "Gratuita" };
const LOGISTICA_ML: Record<string, string> = { fulfillment: "Full" };

export default async function VincularMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("publicaciones_ver");
  const sp = await searchParams;
  const org = s.org.id;

  // Los canales de ML con cuenta conectada.
  const cuentas = (await cuentasDe(org)).filter((c) => c.canalId != null);
  const canales = cuentas.length ? await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' and id = any($2::bigint[]) order by nombre",
    [org, cuentas.map((c) => c.canalId)]) : [];

  if (!canales.length) {
    return (
      <Pantalla titulo="Vincular con Mercado Libre" subtitulo="Cada publicación de Mercado Libre con su variación de Laucen" ancho="max-w-3xl">
        <Avisos sp={sp} />
        <div className={CAJA}>
          <p className="text-xs">Todavía no hay ninguna cuenta de Mercado Libre conectada a un canal.</p>
          <p className="text-xs text-[#5C6B76] mt-1">
            Primero conectá una cuenta en <Link href="/config/canales" className="text-[#16577F] underline">Configuración → Canales</Link>;
            después volvé acá para traer sus publicaciones.
          </p>
        </div>
      </Pantalla>
    );
  }

  const canal = canales.find((c) => c.id === Number(sp.canal)) ?? canales[0];
  const ver: Ver = sp.ver === "vinc" || sp.ver === "todas" ? sp.ver : "sin";
  const q = sp.q?.trim() || "";
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const aqui = url(BASE, { canal: canal.id, ver: ver === "sin" ? null : ver, q, pagina: pagina > 1 ? pagina : null });

  const resumen = (await consulta<{ total: number; vinculadas: number }>(`
    select count(*)::int total, count(publicacion_id)::int vinculadas
      from meli_item where organizacion_id = $1 and canal_id = $2`, [org, canal.id]))[0];

  const filtroVer = ver === "sin" ? "and mi.publicacion_id is null" : ver === "vinc" ? "and mi.publicacion_id is not null" : "";
  const filtroQ = "and ($3::text is null or mi.titulo ilike $3 or mi.sku ilike $3 or mi.item_id ilike $3)";
  const params = [org, canal.id, q ? `%${q}%` : null];
  const cantidad = (await consulta<{ n: number }>(
    `select count(*)::int n from meli_item mi where mi.organizacion_id = $1 and mi.canal_id = $2 ${filtroVer} ${filtroQ}`, params))[0].n;
  const paginas = Math.max(1, Math.ceil(cantidad / POR_PAGINA));

  const filas = await consulta<Fila>(`
    select mi.item_id, mi.variation_id, mi.titulo, mi.atributos, mi.sku, mi.precio, mi.stock, mi.vendidos, mi.estado, mi.tipo,
           mi.logistica, mi.permalink, mi.foto, mi.publicacion_id::int,
           mi.variaciones, mi.primera,
           v.id::int variacion_id, v.sku var_sku, case when v.id is null then null else titulo_variacion(v.id) end var_titulo,
           v.producto_id::int, coalesce((select pr.estado = 'archivado' from producto pr where pr.id = v.producto_id), false) inactivo,
           case when v.id is null then null else stock_disponible_canal($1, v.id, $2) end disponible
      from (
        -- Cuántas variaciones tiene el item y cuál es su primera fila sin
        -- vincular (ahí va "Crear producto"), antes de filtrar y paginar.
        select m.*, count(*) over (partition by m.item_id)::int variaciones,
               (row_number() over (partition by m.item_id order by m.publicacion_id is not null, m.variation_id) = 1) primera
          from meli_item m where m.organizacion_id = $1 and m.canal_id = $2
      ) mi
      left join publicacion pu on pu.id = mi.publicacion_id and pu.organizacion_id = $1
      left join variacion v on v.id = pu.variacion_id
     where mi.organizacion_id = $1 and mi.canal_id = $2 ${filtroVer} ${filtroQ}
     order by mi.titulo, mi.item_id, mi.variation_id
     limit ${POR_PAGINA} offset ${(pagina - 1) * POR_PAGINA}`, params);

  // ML da los precios en pesos; si el usuario mira en dólares, al TC del día.
  const tc = s.moneda === "USD" ? (await tcDelDia(org))?.venta ?? null : null;
  const precio = (p: string | null) => p == null ? "—" : tc ? formatear(Number(p) / tc, "USD") : formatear(p, "ARS");

  const n = (x: number) => x.toLocaleString("es-AR");
  const ir = (cambios: Record<string, string | number | null>) =>
    url(BASE, { canal: canal.id, ver: ver === "sin" ? null : ver, q, ...cambios });
  const pestanas: { ver: Ver; texto: string }[] = [
    { ver: "sin", texto: "Sin vincular" }, { ver: "vinc", texto: "Vinculadas" }, { ver: "todas", texto: "Todas" },
  ];

  return (
    <Pantalla titulo="Vincular con Mercado Libre" subtitulo="Cada publicación de Mercado Libre con su variación de Laucen">
      <Avisos sp={sp} />

      <div className="flex flex-wrap items-end gap-2 mb-3">
        <form action={BASE} className="flex items-end gap-2">
          <label><span className={ETIQUETA}>Canal de Mercado Libre</span>
            <select name="canal" defaultValue={canal.id} className={CAMPO}>
              {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
          {canales.length > 1 && <button className={SUAVE}>Ver</button>}
        </form>
        <form action={accionTraerPublicaciones} className="ml-auto">
          <input type="hidden" name="canal" value={canal.id} />
          <input type="hidden" name="volver" value={aqui} />
          <BotonEnviar clase={PRIMARIO} corriendo="Trayendo… (puede tardar unos minutos)">Traer publicaciones de ML</BotonEnviar>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 max-w-xl">
        <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Publicaciones</div><div className="text-lg font-bold tabular-nums text-right">{n(resumen.total)}</div></div>
        <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Vinculadas</div><div className="text-lg font-bold text-[#1F6E4A] tabular-nums text-right">{n(resumen.vinculadas)}</div></div>
        <div className={CAJA}><div className="text-[11px] text-[#5C6B76]">Sin vincular</div><div className="text-lg font-bold text-[#C03420] tabular-nums text-right">{n(resumen.total - resumen.vinculadas)}</div></div>
      </div>
      {resumen.total === 0 && (
        <p className="text-xs text-[#5C6B76] mb-3">Todavía no se trajo nada de este canal: apretá &quot;Traer publicaciones de ML&quot;.</p>
      )}

      <nav className="flex gap-1 border-b border-[#E3E9F0] mb-3">
        {pestanas.map((p) => (
          <Link key={p.ver} href={ir({ ver: p.ver === "sin" ? null : p.ver })}
            className={`px-3 py-2 text-xs font-bold -mb-px border-b-2 rounded-t-lg ${ver === p.ver ? "border-[#16577F] text-[#16577F] bg-white" : "border-transparent text-[#5C6B76] hover:text-[#16577F]"}`}>
            {p.texto}
          </Link>
        ))}
      </nav>

      <form action={BASE} className="flex flex-wrap items-end gap-2 mb-3">
        <input type="hidden" name="canal" value={canal.id} />
        {ver !== "sin" && <input type="hidden" name="ver" value={ver} />}
        <label><span className={ETIQUETA}>Buscar</span>
          <input name="q" defaultValue={q} placeholder="Título, SKU o MLA…" className={`${CAMPO} w-64`} /></label>
        <button className={SUAVE}>Buscar</button>
        {q && <Link href={ir({ q: null })} className={SUAVE}>Limpiar</Link>}
      </form>

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH} /><th className={TH}>Publicación</th><th className={TH}>SKU en ML</th><th className={THN}>Precio</th>
              <th className={THN}>Stock ML</th><th className={THN}>Vendidos</th><th className={TH}>Estado</th><th className={TH}>Tipo</th>
              <th className={TH}>Vinculación</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>
                {q ? "Nada coincide con la búsqueda." : ver === "sin" && resumen.total > 0 ? "No queda ninguna sin vincular." : "No hay publicaciones para mostrar."}
              </td></tr>
            )}
            {filas.map((f) => {
              const est = f.estado ? ESTADO_ML[f.estado] : null;
              const comunes = (
                <>
                  <input type="hidden" name="canal" value={canal.id} />
                  <input type="hidden" name="item_id" value={f.item_id} />
                  <input type="hidden" name="volver" value={aqui} />
                </>
              );
              return (
                <tr key={`${f.item_id}-${f.variation_id}`} className={TR}>
                  <td className={TD}>
                    {f.foto
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={f.foto} alt="" className="w-10 h-10 object-contain rounded border border-[#E3E9F0] bg-white" loading="lazy" />
                      : <div className="w-10 h-10 rounded border border-[#E3E9F0] bg-[#FAFBFC]" />}
                  </td>
                  <td className={`${TD} min-w-56`}>
                    <div className="font-semibold">{f.titulo ?? "—"}</div>
                    {f.atributos && <div className="text-[#5C6B76]">{f.atributos}</div>}
                    <div className="text-[10px] text-[#5C6B76]">
                      {f.permalink
                        ? <a href={f.permalink} target="_blank" rel="noopener noreferrer" className="text-[#16577F] underline">{f.item_id} ↗</a>
                        : f.item_id}
                      {f.logistica && LOGISTICA_ML[f.logistica] && <> · <Estado texto={LOGISTICA_ML[f.logistica]} tono="verde" /></>}
                    </div>
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>{f.sku ?? <span className="text-[#5C6B76]">—</span>}</td>
                  <td className={TDN}>{precio(f.precio)}</td>
                  <td className={TDN}>{f.stock ?? "—"}</td>
                  <td className={TDN}>{f.vendidos ?? "—"}</td>
                  <td className={TD}>{est ? <Estado texto={est.texto} tono={est.tono} /> : <Estado texto={f.estado ?? "—"} />}</td>
                  <td className={`${TD} whitespace-nowrap`}>{f.tipo ? TIPO_ML[f.tipo] ?? f.tipo : "—"}</td>
                  <td className={`${TD} min-w-72`}>
                    {f.publicacion_id ? (
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          {f.producto_id
                            ? <Link href={`/catalogo/productos/${f.producto_id}`} className="text-[#16577F] underline font-semibold">{f.var_sku}</Link>
                            : <span className="font-semibold">{f.var_sku}</span>}
                          {f.inactivo && <span className="ml-1.5"><Estado texto="Inactivo" /></span>}
                          <div className="text-[#5C6B76]">{f.var_titulo}</div>
                          <div className="text-[10px] text-[#5C6B76]">Disponible en Laucen para este canal: <span className="tabular-nums font-semibold text-[#1a2a36]">{f.disponible ?? 0}</span></div>
                        </div>
                        <TachoConfirmar accion={accionDesvincular} campos={{ publicacion: String(f.publicacion_id), volver: aqui }} pregunta="¿Desvincular?" />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <form action={accionVincular} className="flex items-center gap-1">
                          {comunes}
                          <input type="hidden" name="variation_id" value={f.variation_id} />
                          <input name="codigo" placeholder="SKU o código de barras de Laucen" aria-label="SKU o código de barras de Laucen"
                            className={`${CAMPO} flex-1 min-w-40`} />
                          <BotonEnviar clase={VERDE} corriendo="Vinculando…">Vincular</BotonEnviar>
                        </form>
                        {f.primera && (
                          <form action={accionCrearProducto}>
                            {comunes}
                            <BotonEnviar clase={SUAVE} corriendo="Creando…">
                              {f.variaciones > 1 ? `Crear producto con sus ${f.variaciones} variaciones` : "Crear producto"}
                            </BotonEnviar>
                          </form>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <nav className="flex items-center justify-end gap-2 mt-2 text-xs text-[#5C6B76]">
          <span>Página {pagina} de {paginas} · {n(cantidad)} filas</span>
          {pagina > 1 && <Link href={ir({ pagina: pagina - 1 > 1 ? pagina - 1 : null })} className={SUAVE}>← Anterior</Link>}
          {pagina < paginas && <Link href={ir({ pagina: pagina + 1 })} className={SUAVE}>Siguiente →</Link>}
        </nav>
      )}
      <p className="text-[11px] text-[#5C6B76] mt-2">
        Al traer, las publicaciones cuyo SKU en ML coincide con un SKU de Laucen se vinculan solas. Una publicación con variaciones
        tiene una fila por variación, y cada una se vincula por separado.
      </p>
    </Pantalla>
  );
}
