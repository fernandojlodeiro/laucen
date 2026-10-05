// Publicar en Mercado Libre un producto que no está publicado, copiando una
// publicación parecida de las cuentas de Fer (lib/mercadolibre/publicar-similar.ts).
// Sin ?item: la lista de parecidas (por SKU y por palabras del título; se puede
// buscar con otras palabras). Con ?item: el borrador para cambiar todo y
// "Preparar publicación" (queda esperando el clic en la cola de ML).

import Link from "next/link";
import { notFound } from "next/navigation";
import { una, motivoErp } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { PRIMARIO, SUAVE } from "@/app/botones";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import { entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { parecidas, armarBorrador, ESTADOS_ML, TIPOS_PUBLICACION, MISMO_SKU, SKU_PARECIDO, CONDICIONES, type Borrador as DatosBorrador } from "@/lib/mercadolibre/publicar-similar";
import Borrador from "./Borrador";

export const dynamic = "force-dynamic";

type SP = { q?: string; item?: string; ok?: string; error?: string };

const TONO: Record<string, "verde" | "gris" | "amarillo" | "rojo" | "azul" | "ambar"> = { active: "verde", paused: "amarillo", closed: "gris", inactive: "gris", under_review: "rojo" };

export default async function PublicarEnMl({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("publicaciones_ver");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const p = await una<{ id: number; sku_base: string; titulo: string }>(
    "select id::int, sku_base, titulo from producto where organizacion_id = $1 and id = $2", [s.org.id, pid]);
  if (!p) notFound();
  const base = `/catalogo/productos/${p.id}/publicar-ml`;
  const camino = [{ texto: p.sku_base, href: `/catalogo/productos/${p.id}` }, { texto: "Publicar en Mercado Libre", href: base }];

  // Con una publicación elegida: el borrador.
  const item = sp.item && /^MLA\d+$/.test(sp.item) ? sp.item : null;
  let borrador: DatosBorrador | null = null, errorBorrador: string | null = null;
  if (item) {
    try { borrador = await armarBorrador(s.org.id, p.id, item); } catch (e) { errorBorrador = motivoErp(e); }
  }
  if (borrador) {
    return (
      <Pantalla titulo={`Publicar ${p.sku_base} en Mercado Libre`} camino={[...camino, { texto: item! }]}
        subtitulo={<>Copia de <a href={borrador.origen.permalink ?? "#"} target="_blank" rel="noreferrer" className="underline">{item}</a> ({borrador.origen.cuenta}, {ESTADOS_ML[borrador.origen.estado ?? ""] ?? borrador.origen.estado}). Cambiá lo que quieras: al preparar se comprueba con Mercado Libre y queda esperando tu clic en la cola.</>}
        acciones={<>
          <Link href={url(base, { q: sp.q ?? null })} className={SUAVE}>Elegir otra</Link>
          <button form="publicar" className={PRIMARIO}>Preparar publicación</button>
        </>}>
        <Avisos sp={sp} />
        {!borrador.cuentas.length
          ? <p className="text-sm text-[#C03420]">No hay ninguna cuenta de Mercado Libre conectada.</p>
          : <Borrador productoId={p.id} b={borrador} tipos={TIPOS_PUBLICACION} condiciones={CONDICIONES} />}
      </Pantalla>
    );
  }

  // Sin elegir: las parecidas.
  const q = sp.q?.trim() || null;
  const lista = await parecidas(s.org.id, p.id, q);
  return (
    <Pantalla titulo={`Publicar ${p.sku_base} en Mercado Libre`} camino={camino}
      subtitulo={<>{p.titulo}. Elegí una publicación parecida de tus cuentas para copiarla: después cambiás lo que quieras antes de mandarla.</>}>
      <Avisos sp={{ ...sp, error: errorBorrador ?? sp.error }} />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="w-full sm:w-[28rem]"><BuscadorVivo q={q ?? ""} comienza={false} sinComienza placeholder={`Otras palabras (si no, busca por: ${p.titulo})`} /></div>
        <span className="text-[11px] text-[#5C6B76]">Busca en todas tus publicaciones guardadas en Laucen, de las cinco cuentas y en cualquier estado (también las cerradas y pausadas). Primero las del mismo SKU.</span>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}></th><th className={TH}>Publicación</th><th className={TH}>Cuenta</th><th className={TH}>Estado</th><th className={TH}>SKU</th>
              <th className={THN}>Precio</th><th className={THN}>Vendidos</th><th className={THN}>Parecido</th><th className={TH}></th></tr>
          </thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.item_id} className={`${TR} ${x.noSirve ? "opacity-60" : ""}`}>
                <td className={TD}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {x.foto ? <img src={x.foto} alt="" className="w-12 h-12 object-contain bg-white" /> : null}
                </td>
                <td className={TD}>
                  <div>{x.titulo}</div>
                  <div className="text-[11px] text-[#5C6B76]">
                    {x.permalink ? <a href={x.permalink} target="_blank" rel="noreferrer" className="underline">{x.item_id}</a> : x.item_id}
                    {x.actualizado ? ` · leída el ${x.actualizado}` : ""}
                  </div>
                </td>
                <td className={TD}>{x.cuenta}</td>
                <td className={TD}><Estado texto={ESTADOS_ML[x.estado ?? ""] ?? x.estado ?? "—"} tono={TONO[x.estado ?? ""] ?? "gris"} /></td>
                <td className={`${TD} font-mono whitespace-nowrap`}>{x.sku ?? "—"}</td>
                <td className={TDN}>{x.precio != null ? `$ ${formatearNumero(x.precio, "pesos")}` : "—"}</td>
                <td className={TDN}>{x.vendidos != null ? formatearNumero(x.vendidos, "entero") : "—"}</td>
                <td className={TDN}>{x.puntaje >= MISMO_SKU ? "Mismo SKU" : x.puntaje >= SKU_PARECIDO ? "SKU parecido" : `${x.puntaje} %`}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  {x.noSirve
                    ? <span className="text-[11px] text-[#5C6B76]">No sirve: {x.noSirve}</span>
                    : <Link href={url(base, { q, item: x.item_id })} className={PRIMARIO}>Copiar ésta</Link>}
                </td>
              </tr>
            ))}
            {!lista.length && (
              <tr><td className="p-3 text-[#5C6B76]" colSpan={9}>No hay ninguna publicación parecida en tus cuentas. Probá con otras palabras en el buscador.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
