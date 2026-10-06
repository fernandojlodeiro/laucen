// Publicar en Mercado Libre un producto que no está publicado.
// Dos caminos, en pestañas (?ver=):
//   · Catálogo de Mercado Libre (lo de siempre): el producto de catálogo que es el
//     mismo, con la marca controlada (lib/mercadolibre/catalogo-similar.ts);
//     ?catalogo= abre el formulario para publicar ahí.
//   · Tus publicaciones (?ver=propias): una publicación de las cuentas de Fer para
//     copiar (lib/mercadolibre/publicar-similar.ts); ?item= abre el borrador.
//   · Nueva desde Laucen (?ver=nueva, ?cat= otra categoría): desde cero, con los datos
//     del producto y lo que propone la IA (lib/mercadolibre/publicar-nueva.ts).
// En los dos, "Preparar publicación" lo comprueba con ML y queda esperando el clic en la cola.

import Link from "next/link";
import { notFound } from "next/navigation";
import { una, motivoErp } from "@/lib/erp/base";
import { formatearNumero } from "@/lib/numeros";
import { PRIMARIO, SUAVE } from "@/app/botones";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import Pestanas from "@/app/componentes/Pestanas";
import { entrarErp, Pantalla, Avisos, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { parecidas, armarBorrador, ESTADOS_ML, TIPOS_PUBLICACION, CONDICIONES, type Parecida } from "@/lib/mercadolibre/publicar-similar";
import { buscarEnCatalogo, armarBorradorCatalogo, TEXTO_MARCA, TIPOS_GARANTIA, type ProductoCatalogo } from "@/lib/mercadolibre/catalogo-similar";
import type { Juicio } from "@/lib/mercadolibre/juez-similar";
import Borrador from "./Borrador";
import BorradorCatalogo from "./BorradorCatalogo";
import BorradorNueva from "./BorradorNueva";
import { armarBorradorNueva, type BorradorNueva as DatosNueva } from "@/lib/mercadolibre/publicar-nueva";

export const dynamic = "force-dynamic";

type SP = { q?: string; ver?: string; item?: string; catalogo?: string; cat?: string; ok?: string; error?: string };

const TONO: Record<string, "verde" | "gris" | "amarillo" | "rojo" | "azul" | "ambar"> = { active: "verde", paused: "amarillo", closed: "gris", inactive: "gris", under_review: "rojo" };
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(n, "pesos")}`);

function Veredicto({ j }: { j: Juicio | null }) {
  if (!j) return <span className="text-[11px] text-[#5C6B76]">—</span>;
  return (
    <span title={j.motivo}>
      <Estado texto={j.veredicto === "mismo" ? "El mismo" : j.veredicto === "parecido" ? "Parecido" : "Distinto"} tono={j.veredicto === "mismo" ? "verde" : j.veredicto === "parecido" ? "amarillo" : "gris"} />
      {j.motivo && <span className="block text-[11px] text-[#5C6B76] mt-0.5 max-w-56">{j.motivo}</span>}
    </span>
  );
}

export default async function PublicarEnMl({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const s = await entrarErp("publicaciones_ver");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const p = await una<{ id: number; sku_base: string; titulo: string; marca: string | null; no_publicable: boolean }>(
    "select id::int, sku_base, titulo, marca, no_publicable from producto where organizacion_id = $1 and id = $2", [s.org.id, pid]);
  if (!p) notFound();
  const base = `/catalogo/productos/${p.id}/publicar-ml`;
  const camino = [{ texto: p.sku_base, href: `/catalogo/productos/${p.id}` }, { texto: "Publicar en Mercado Libre", href: base }];
  const titulo = `Publicar ${p.sku_base} en Mercado Libre`;
  const q = sp.q?.trim() || null;
  const propias = sp.ver === "propias";
  const nueva = sp.ver === "nueva";

  if (p.no_publicable) {
    return (
      <Pantalla titulo={titulo} camino={camino}>
        <p className="text-sm text-[#5C6B76]">Este producto está marcado como <b>No publicable</b> (insumo o parte de otro): no va a Mercado Libre. Si sí se vende solo, apagá la marca en la pestaña <Link className="underline" href={`/catalogo/productos/${p.id}?seccion=publicaciones`}>Publicaciones</Link> de su ficha.</p>
      </Pantalla>
    );
  }

  // Elegido un producto de catálogo: el formulario para publicar ahí.
  let errorElegido: string | null = null;
  const catalogo = sp.catalogo && /^MLA\d+$/.test(sp.catalogo) ? sp.catalogo : null;
  if (catalogo) {
    try {
      const b = await armarBorradorCatalogo(s.org.id, p.id, catalogo);
      return (
        <Pantalla titulo={titulo} camino={[...camino, { texto: catalogo }]}
          subtitulo={<>En el catálogo: <a href={b.producto.permalink} target="_blank" rel="noreferrer" className="underline">{b.producto.nombre} ↗</a>. Al preparar se comprueba con Mercado Libre y queda esperando tu clic en la cola.</>}
          acciones={<>
            <Link href={url(base, { q })} className={SUAVE}>Elegir otro</Link>
            {b.producto.estadoMarca !== "ajena" && <button form="publicar" className={PRIMARIO}>Preparar publicación</button>}
          </>}>
          <Avisos sp={sp} />
          {!b.cuentas.length
            ? <p className="text-sm text-[#C03420]">No hay ninguna cuenta de Mercado Libre conectada.</p>
            : <BorradorCatalogo productoId={p.id} b={b} tipos={TIPOS_PUBLICACION} garantias={TIPOS_GARANTIA} textoMarca={TEXTO_MARCA[b.producto.estadoMarca]} />}
        </Pantalla>
      );
    } catch (e) { errorElegido = motivoErp(e); }
  }

  // Elegida una publicación propia: el borrador de la copia.
  const item = sp.item && /^MLA\d+$/.test(sp.item) ? sp.item : null;
  if (item) {
    try {
      const b = await armarBorrador(s.org.id, p.id, item);
      return (
        <Pantalla titulo={titulo} camino={[...camino, { texto: item }]}
          subtitulo={<>Copia de <a href={b.origen.permalink ?? "#"} target="_blank" rel="noreferrer" className="underline">{item} ↗</a> ({b.origen.cuenta}, {ESTADOS_ML[b.origen.estado ?? ""] ?? b.origen.estado}). Cambiá lo que quieras: al preparar se comprueba con Mercado Libre y queda esperando tu clic en la cola.</>}
          acciones={<>
            <Link href={url(base, { ver: "propias", q })} className={SUAVE}>Elegir otra</Link>
            <button form="publicar" className={PRIMARIO}>Preparar publicación</button>
          </>}>
          <Avisos sp={sp} />
          {!b.cuentas.length
            ? <p className="text-sm text-[#C03420]">No hay ninguna cuenta de Mercado Libre conectada.</p>
            : <Borrador productoId={p.id} b={b} tipos={TIPOS_PUBLICACION} condiciones={CONDICIONES} />}
        </Pantalla>
      );
    } catch (e) { errorElegido = motivoErp(e); }
  }

  // Sin elegir: las dos búsquedas (las pestañas muestran cuántas hay en cada una) y, en su pestaña, la nueva.
  const cat_ = sp.cat && /^MLA\d+$/.test(sp.cat) ? sp.cat : null;
  const [nuevaR, cat, prop] = await Promise.all([
    nueva ? armarBorradorNueva(s.org.id, p.id, cat_).then((b) => ({ b, error: null as string | null }), (e) => ({ b: null as DatosNueva | null, error: motivoErp(e) })) : null,
    buscarEnCatalogo(s.org.id, p.id, q).then((r) => ({ ...r, error: null as string | null }), (e) => ({ lista: [] as ProductoCatalogo[], conJuez: true, error: motivoErp(e) })),
    parecidas(s.org.id, p.id, q).then((r) => ({ ...r, error: null as string | null }), (e) => ({ lista: [] as Parecida[], conJuez: true, error: motivoErp(e) })),
  ]);
  const actual = nueva ? { error: nuevaR?.error ?? null, conJuez: true } : propias ? prop : cat;
  return (
    <Pantalla titulo={titulo} camino={camino} subtitulo={<>{p.titulo}{p.marca ? ` · marca ${p.marca}` : ""}</>}
      acciones={nueva && nuevaR?.b?.categoria ? <button form="publicar" className={PRIMARIO}>Preparar publicación</button> : undefined}>
      <Avisos sp={{ ...sp, error: errorElegido ?? actual.error ?? sp.error }} />
      {!nueva && (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <div className="w-full sm:w-[28rem]"><BuscadorVivo q={q ?? ""} comienza={false} sinComienza placeholder={`Otras palabras (si no, busca por: ${p.titulo})`} /></div>
        </div>
      )}
      <Pestanas items={[
        { clave: "catalogo", texto: "Catálogo de Mercado Libre", cuenta: cat.lista.length, activa: !propias, href: url(base, { q }) },
        { clave: "propias", texto: "Tus publicaciones", cuenta: prop.lista.length, activa: propias, href: url(base, { ver: "propias", q }) },
        // Un formulario: sin cuenta (AGENTS.md).
        { clave: "nueva", texto: "Nueva desde Laucen", activa: nueva, href: url(base, { ver: "nueva" }) },
      ]} />
      {!actual.conJuez && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">No se pudo pedir a la IA que revise cuáles son el mismo producto: se muestran por parecido de palabras.</p>
      )}
      {nueva
        ? nuevaR?.b && (nuevaR.b.cuentas.length
          ? <BorradorNueva key={nuevaR.b.categoria?.id ?? "-"} productoId={p.id} b={nuevaR.b} tipos={TIPOS_PUBLICACION} condiciones={CONDICIONES} garantias={TIPOS_GARANTIA} />
          : <p className="text-sm text-[#C03420]">No hay ninguna cuenta de Mercado Libre conectada.</p>)
        : propias ? <ListaPropias lista={prop.lista} base={base} q={q} /> : <ListaCatalogo lista={cat.lista} base={base} q={q} />}
    </Pantalla>
  );
}

function ListaCatalogo({ lista, base, q }: { lista: ProductoCatalogo[]; base: string; q: string | null }) {
  return (
    <>
      <p className="text-[11px] text-[#5C6B76] mb-2">Productos del catálogo de Mercado Libre que pueden ser el mismo (los que la IA ve como otro producto no se muestran). Sólo se puede publicar en uno de <b>marca nuestra</b> o <b>genérica</b>: con la marca de otro, no.</p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}></th><th className={TH}>Producto de catálogo</th><th className={TH}>Marca</th><th className={TH}>¿Es el mismo?</th>
              <th className={THN}>Precio que gana</th><th className={THN}>Vendedores</th><th className={TH}></th></tr>
          </thead>
          <tbody>
            {lista.map((x) => (
              <tr key={x.id} className={TR}>
                <td className={TD}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {x.foto ? <img src={x.foto} alt="" className="w-12 h-12 object-contain bg-white" /> : null}
                </td>
                <td className={TD}>
                  <div>{x.nombre}</div>
                  <div className="text-[11px] text-[#5C6B76]"><a href={x.permalink} target="_blank" rel="noreferrer" className="underline">{x.id} ↗</a>{x.modelo ? ` · modelo ${x.modelo}` : ""}</div>
                </td>
                <td className={TD}>
                  <div>{x.marca ?? "—"}</div>
                  <Estado texto={TEXTO_MARCA[x.estadoMarca]} tono={x.estadoMarca === "ajena" ? "rojo" : x.estadoMarca === "sin_dato" ? "amarillo" : "verde"} />
                </td>
                <td className={TD}><Veredicto j={x.juicio} /></td>
                <td className={TDN}>{pesos(x.precioGanador)}</td>
                <td className={TDN}>{x.vendedores ?? "—"}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  {x.estadoMarca === "ajena"
                    ? <span className="text-[11px] text-[#C03420]">No se puede</span>
                    : <Link href={url(base, { q, catalogo: x.id })} className={PRIMARIO}>Publicar en éste</Link>}
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td className="p-3 text-[#5C6B76]" colSpan={7}>No hay en el catálogo de Mercado Libre un producto que sea el mismo. Probá con otras palabras o mirá en la pestaña Tus publicaciones.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ListaPropias({ lista, base, q }: { lista: Parecida[]; base: string; q: string | null }) {
  return (
    <>
      <p className="text-[11px] text-[#5C6B76] mb-2">Tus publicaciones guardadas en Laucen, de todas las cuentas y en cualquier estado (también las cerradas y pausadas), que pueden ser el mismo producto. Se copian con todos sus datos y los cambiás antes de mandarla.</p>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}></th><th className={TH}>Publicación</th><th className={TH}>Cuenta</th><th className={TH}>Estado</th><th className={TH}>SKU</th>
              <th className={THN}>Precio</th><th className={THN}>Vendidos</th><th className={TH}>¿Es el mismo?</th><th className={TH}></th></tr>
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
                    {x.permalink ? <a href={x.permalink} target="_blank" rel="noreferrer" className="underline">{x.item_id} ↗</a> : x.item_id}
                    {x.actualizado ? ` · leída el ${x.actualizado}` : ""}
                  </div>
                </td>
                <td className={TD}>{x.cuenta}</td>
                <td className={TD}><Estado texto={ESTADOS_ML[x.estado ?? ""] ?? x.estado ?? "—"} tono={TONO[x.estado ?? ""] ?? "gris"} /></td>
                <td className={`${TD} font-mono whitespace-nowrap`}>{x.sku ?? "—"}</td>
                <td className={TDN}>{pesos(x.precio)}</td>
                <td className={TDN}>{x.vendidos != null ? formatearNumero(x.vendidos, "entero") : "—"}</td>
                <td className={TD}><Veredicto j={x.juicio} /></td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  {x.noSirve
                    ? <span className="text-[11px] text-[#5C6B76]">No sirve: {x.noSirve}</span>
                    : <Link href={url(base, { ver: "propias", q, item: x.item_id })} className={PRIMARIO}>Copiar ésta</Link>}
                </td>
              </tr>
            ))}
            {!lista.length && <tr><td className="p-3 text-[#5C6B76]" colSpan={9}>No hay ninguna publicación tuya que sea el mismo producto. Probá con otras palabras en el buscador.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
