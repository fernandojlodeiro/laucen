// Configuración › Tienda web › Publicidad: Google Ads, Meta y TikTok (lib/tienda/publicidad.ts y
// lib/tienda/feed.ts). Por dominio, las etiquetas que miden las ventas (cada una con su
// interruptor); por tienda, los catálogos de productos: sus direcciones, cuántos salen y cuántos
// quedan afuera, los grupos de campaña por categoría y lo que no va.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { tiendaDelCanal } from "@/lib/tienda/tienda";
import { conMarca, urlTienda } from "@/lib/tienda/dominios-tienda";
import { publicidadDe } from "@/lib/tienda/publicidad";
import { catalogoPublicidad, configFeedDe, PLATAFORMAS } from "@/lib/tienda/feed";
import { formatearNumero } from "@/lib/numeros";
import { entrarErp, Pantalla, Avisos, BotonesFicha, TituloSeccion, editandoFicha, Dato, CAJA, TABLA, TD, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { Interruptor } from "@/app/radar/Piezas";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { TachoConfirmar } from "@/app/radar/Cliente";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import { PRIMARIO } from "@/app/botones";
import { accionActivarPlataforma, accionExcluirProducto, accionGuardarFeed, accionGuardarPublicidad, accionQuitarProducto, accionQuitarReglaFamilia, accionReglaFamilia } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { canal?: string; editar?: string; nuevo?: string; ok?: string; error?: string };
const BASE = "/config/tienda/publicidad";
const n = (x: number) => formatearNumero(x, "entero");
const GRUPOS = ["notebooks", "impresoras_3d", "componentes", "otros"];

export default async function Publicidad({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const tiendas = await consulta<{ id: number; nombre: string; feed: unknown }>(
    "select id::int, nombre, config -> 'publicidad_feed' feed from canal where organizacion_id = $1 and tipo = 'web_minorista' and estado <> 'archivado' order by id", [s.org.id]);
  const tienda = tiendas.find((t) => t.id === Number(sp.canal)) ?? tiendas[0];
  if (!tienda) {
    return (
      <Pantalla titulo="Publicidad" ancho="max-w-4xl">
        <div className={CAJA}><p className="text-xs">Todavía no hay una tienda web. Creala en <Link href="/config/tienda" className="text-[#16577F] underline">Configuración › Tienda web</Link>.</p></div>
      </Pantalla>
    );
  }
  const aqui = `${BASE}?canal=${tienda.id}`;
  const t = (await tiendaDelCanal(s.org.id, tienda.id))!;
  // Los dominios que abren la tienda (el principal y los de otra marca); los que redirigen no miden nada.
  const dominios = await consulta<{ id: number; dominio: string; principal: boolean; marca: string | null; publicidad: unknown }>(`
    select id::int, dominio, principal, marca ->> 'nombre' marca, publicidad from tienda_dominio
     where organizacion_id = $1 and canal_id = $2 and (principal or marca ->> 'nombre' is not null) order by principal desc, dominio`, [s.org.id, tienda.id]);
  const conf = configFeedDe(tienda.feed);
  const [reglas, productos] = await Promise.all([
    consulta<{ familia_id: number; nombre: string; grupo: string | null; excluida: boolean }>(`
      select r.familia_id::int, f.nombre, r.grupo, r.excluida from tienda_feed_familia r join familia f on f.id = r.familia_id
       where r.organizacion_id = $1 and r.canal_id = $2 order by r.excluida, r.grupo, f.nombre`, [s.org.id, tienda.id]),
    consulta<{ id: number; titulo: string; sku_base: string }>(`
      select p.id::int, p.titulo, p.sku_base from tienda_feed_producto x join producto p on p.id = x.producto_id
       where x.organizacion_id = $1 and x.canal_id = $2 order by p.titulo`, [s.org.id, tienda.id]),
  ]);
  // Cuántos productos salen en el catálogo (los mismos para las tres plataformas) y por qué quedan afuera.
  const principal = dominios.find((d) => d.principal) ?? dominios[0];
  const tPrincipal = principal ? await conMarca(t, principal.dominio) : t;
  const base = principal ? `https://${principal.dominio}` : await urlTienda(t);
  const resumen = await catalogoPublicidad(tPrincipal, base, "google");
  const editandoFeed = editandoFicha(sp, "feed");
  const grupos = reglas.filter((r) => !r.excluida), excluidas = reglas.filter((r) => r.excluida);

  return (
    <Pantalla titulo="Publicidad" subtitulo="Google, Meta y TikTok: cómo se mide cada venta y los catálogos de productos para los anuncios" ancho="max-w-4xl">
      <Avisos sp={sp} />
      {tiendas.length > 1 && (
        <div className="flex gap-2 mb-3 text-xs">
          {tiendas.map((x) => <Link key={x.id} href={`${BASE}?canal=${x.id}`} className={`rounded-lg border px-3 py-1.5 ${x.id === tienda.id ? "bg-[#16577F] text-white border-[#16577F]" : "bg-white border-[#E3E9F0]"}`}>{x.nombre}</Link>)}
        </div>
      )}

      <section className="mb-6">
        <TituloSeccion titulo="Medición de ventas, por dominio" />
        <p className="text-[11px] text-[#5C6B76] mb-2">
          Con una plataforma prendida, su etiqueta va en todas las páginas de ese dominio y le avisa cuando alguien mira un producto, lo agrega al carrito,
          empieza a pagar y compra (con el valor y el SKU de cada producto). Así la plataforma sabe qué anuncio terminó en una venta. Una compra cuenta una sola vez.
        </p>
        {dominios.length === 0 && <div className={`${CAJA} text-xs text-[#5C6B76]`}>La tienda no tiene dominio propio: cargalo en <Link href="/config/tienda" className="text-[#16577F] underline">Configuración › Tienda web</Link>.</div>}
        <div className="space-y-3">
          {dominios.map((d) => {
            const p = publicidadDe(d.publicidad);
            const editando = editandoFicha(sp, `d${d.id}`);
            const form = `ficha-d${d.id}`;
            const llave = (plataforma: "google" | "meta" | "tiktok", activo: boolean, nombre: string) => (
              <Interruptor accion={accionActivarPlataforma} prendido={activo} compacto
                campos={{ dominio_id: String(d.id), canal_id: String(tienda.id), plataforma }} etiqueta={`${nombre}: ${activo ? "prendido" : "apagado"}`} />
            );
            return (
              <div key={d.id} className={CAJA}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-sm font-semibold font-mono">{d.dominio} <span className="font-sans font-normal text-[11px] text-[#5C6B76]">{d.principal ? "principal" : `otra marca: ${d.marca}`}</span></p>
                  <BotonesFicha editando={editando} ver={aqui} editar={`${aqui}&editar=d${d.id}`} form={form} />
                </div>
                {/* Los interruptores son formularios propios: los campos se atan a éste con form={form}. */}
                <form id={form} action={accionGuardarPublicidad} className="hidden">
                  <input type="hidden" name="dominio_id" value={d.id} />
                  <input type="hidden" name="canal_id" value={tienda.id} />
                </form>
                <div className="grid grid-cols-1 gap-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start border-b border-[#EEF1F4] pb-3">
                    <div className="pt-1">{llave("google", p.google.activo, "Google")}</div>
                    {editando ? <>
                      <label><span className={ETIQUETA}>ID de la etiqueta de Google</span><input form={form} name="tag_id" defaultValue={p.google.tag_id ?? ""} placeholder="AW-123456789" className={`${CAMPO} w-full font-mono`} /></label>
                      <label><span className={ETIQUETA}>Etiqueta de conversión (compra)</span><input form={form} name="conversion_label" defaultValue={p.google.conversion_label ?? ""} placeholder="AbC-D_efG-h12_34-567" className={`${CAMPO} w-full font-mono`} /></label>
                      <label><span className={ETIQUETA}>ID de Google Analytics (opcional)</span><input form={form} name="ga4_id" defaultValue={p.google.ga4_id ?? ""} placeholder="G-ABC123XYZ" className={`${CAMPO} w-full font-mono`} /></label>
                    </> : <>
                      <Dato etiqueta="ID de la etiqueta de Google">{p.google.tag_id}</Dato>
                      <Dato etiqueta="Etiqueta de conversión (compra)">{p.google.conversion_label}</Dato>
                      <Dato etiqueta="ID de Google Analytics">{p.google.ga4_id}</Dato>
                    </>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start border-b border-[#EEF1F4] pb-3">
                    <div className="pt-1">{llave("meta", p.meta.activo, "Meta")}</div>
                    {editando
                      ? <label><span className={ETIQUETA}>ID del píxel de Meta</span><input form={form} name="meta_pixel" defaultValue={p.meta.pixel_id ?? ""} placeholder="1234567890123456" inputMode="numeric" className={`${CAMPO} w-full font-mono`} /></label>
                      : <Dato etiqueta="ID del píxel de Meta">{p.meta.pixel_id}</Dato>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-start border-b border-[#EEF1F4] pb-3">
                    <div className="pt-1">{llave("tiktok", p.tiktok.activo, "TikTok")}</div>
                    {editando
                      ? <label><span className={ETIQUETA}>ID del píxel de TikTok</span><input form={form} name="tiktok_pixel" defaultValue={p.tiktok.pixel_id ?? ""} placeholder="C1ABC2DEF3GH4IJ5KL6M" className={`${CAMPO} w-full font-mono`} /></label>
                      : <Dato etiqueta="ID del píxel de TikTok">{p.tiktok.pixel_id}</Dato>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-start gap-2">
                      <input form={form} type="checkbox" name="contar_al_crear" value="1" defaultChecked={p.contar_al_crear} disabled={!editando} className="mt-0.5" />
                      <span>Con transferencia o efectivo, la venta cuenta al hacer el pedido
                        <span className="block text-[10px] text-[#5C6B76]">Si no, cuenta recién cuando el pedido se marca pagado (y la plataforma no se entera si el comprador no vuelve a abrir su pedido). Con tarjeta y Mercado Pago, siempre cuenta al aprobarse el pago.</span></span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input form={form} type="checkbox" name="datos_comprador" value="1" defaultChecked={p.datos_comprador} disabled={!editando} className="mt-0.5" />
                      <span>Mandar el mail y el teléfono del comprador con la compra
                        <span className="block text-[10px] text-[#5C6B76]">Google y TikTok los usan (cifrados) para reconocer ventas que si no se pierden («conversiones mejoradas»).</span></span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-6">
        <TituloSeccion titulo="Catálogos de productos">
          <BotonesFicha editando={editandoFeed} ver={aqui} editar={`${aqui}&editar=feed`} form="ficha-feed" />
        </TituloSeccion>
        <p className="text-[11px] text-[#5C6B76] mb-2">
          Cada plataforma lee su catálogo de una dirección fija, con el precio y el stock al día. Se cargan una vez: en Google Merchant Center, en el
          Administrador de ventas de Meta y en el Catálogo de TikTok, como «fuente programada» o «feed por URL». A Google va sólo el precio que paga el
          comprador (sin el tachado, que Google pide comprobar); a Meta y TikTok, el tachado y el precio con descuento.
        </p>
        <div className={`${CAJA} space-y-3 text-xs`}>
          {dominios.length > 0 ? dominios.map((d) => (
            <div key={d.id} className="space-y-1">
              {dominios.length > 1 && <p className="font-semibold">{d.dominio}</p>}
              {PLATAFORMAS.map((x) => (
                <label key={x.clave} className="flex flex-wrap items-center gap-2">
                  <span className="w-48 text-[#5C6B76]">{x.nombre}</span>
                  <input readOnly value={`https://${d.dominio}/feeds/${x.clave}.xml`} className={`${CAMPO} flex-1 min-w-[240px] font-mono`} aria-label={`Catálogo para ${x.nombre} en ${d.dominio}`} />
                </label>
              ))}
            </div>
          )) : <p className="text-[#5C6B76]">Los catálogos necesitan un dominio propio.</p>}
          <p className="border-t border-[#EEF1F4] pt-2">
            <b>{n(resumen.salen)}</b> productos salen en el catálogo.
            {" "}Quedan afuera: {`${n(resumen.afuera.sin_stock)} sin stock`}, {n(resumen.afuera.sin_foto)} sin foto y {n(resumen.afuera.excluido)} excluidos (abajo). Los que no tienen precio no se publican en ningún lado.
          </p>
          <form id="ficha-feed" action={accionGuardarFeed} className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-[#EEF1F4] pt-2">
            <input type="hidden" name="canal_id" value={tienda.id} />
            {editandoFeed ? <>
              <label><span className={ETIQUETA}>Bandas de precio (para separar campañas)</span>
                <input name="bandas" defaultValue={conf.bandas.map(n).join(" ")} placeholder="33.000 300.000" className={`${CAMPO} w-full`} />
                <span className="block text-[10px] text-[#5C6B76] mt-0.5">Montos separados por espacio. Cada producto lleva su banda («&lt;33.000», «33.000-300.000», «&gt;300.000»).</span></label>
            </> : <>
              <Dato etiqueta="Bandas de precio">{conf.bandas.length ? conf.bandas.map(n).join(" · ") : null}</Dato>
              <Dato etiqueta="Los productos sin stock">Nunca van al catálogo</Dato>
            </>}
          </form>
        </div>
      </section>

      <section className="mb-6">
        <TituloSeccion titulo={`Grupos de campaña por categoría (${grupos.length})`}>
          <BotonNuevo texto="Agregar categoría" clave="grupo" />
        </TituloSeccion>
        <p className="text-[11px] text-[#5C6B76] mb-2">Cada producto lleva el grupo de su categoría (o de la más cercana hacia arriba que tenga uno); sin grupo, «otros». Sirve para armar una campaña por grupo.</p>
        <AltaNueva texto="Agregar categoría" clave="grupo" sinBoton>
          <form action={accionReglaFamilia} className="flex flex-wrap items-end gap-2 text-xs">
            <input type="hidden" name="canal_id" value={tienda.id} />
            <label className="w-72"><ElegirFamilia name="familia_id" vacio="Elegí la categoría…" /></label>
            <label className="w-48"><span className={ETIQUETA}>Grupo</span>
              <input name="grupo" list="grupos-campana" required placeholder="notebooks" className={`${CAMPO} w-full`} />
              <datalist id="grupos-campana">{[...new Set([...GRUPOS, ...grupos.map((g) => g.grupo!)])].map((g) => <option key={g} value={g} />)}</datalist></label>
            <button className={PRIMARIO}>Agregar</button>
          </form>
        </AltaNueva>
        <div className="bg-white border border-[#E3E9F0] rounded-xl overflow-x-auto">
          <table className={TABLA}>
            <tbody>
              {grupos.length === 0 && <tr><td className={`${TD} text-[#5C6B76]`}>Ninguna: todos los productos van como «otros».</td></tr>}
              {grupos.map((g) => (
                <tr key={g.familia_id} className="border-t border-[#EEF1F4] first:border-t-0">
                  <td className={TD}>{g.nombre}</td>
                  <td className={`${TD} font-mono`}>{g.grupo}</td>
                  <td className={`${TD} text-right`}><TachoConfirmar accion={accionQuitarReglaFamilia} campos={{ canal_id: String(tienda.id), familia_id: String(g.familia_id) }} pregunta="¿Sacar el grupo?" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-6">
        <TituloSeccion titulo={`No van al catálogo (${excluidas.length + productos.length})`}>
          <BotonNuevo texto="Agregar" clave="excluir" />
        </TituloSeccion>
        <p className="text-[11px] text-[#5C6B76] mb-2">Categorías (con sus subcategorías) o productos que no se anuncian: por ejemplo, los de precio muy bajo. Se siguen vendiendo en la tienda.</p>
        <AltaNueva texto="Agregar" clave="excluir" sinBoton>
          <div className="flex flex-wrap items-end gap-6 text-xs">
            <form action={accionReglaFamilia} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="canal_id" value={tienda.id} />
              <input type="hidden" name="excluir" value="1" />
              <label className="w-72"><ElegirFamilia name="familia_id" vacio="Elegí la categoría…" /></label>
              <button className={PRIMARIO}>Sacar la categoría</button>
            </form>
            <form action={accionExcluirProducto} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="canal_id" value={tienda.id} />
              <label className="w-48"><span className={ETIQUETA}>SKU del producto</span><input name="codigo" required className={`${CAMPO} w-full font-mono`} /></label>
              <button className={PRIMARIO}>Sacar el producto</button>
            </form>
          </div>
        </AltaNueva>
        <div className="bg-white border border-[#E3E9F0] rounded-xl overflow-x-auto">
          <table className={TABLA}>
            <tbody>
              {excluidas.length + productos.length === 0 && <tr><td className={`${TD} text-[#5C6B76]`}>Ninguno: van todos los productos con precio, foto y stock.</td></tr>}
              {excluidas.map((f) => (
                <tr key={`f${f.familia_id}`} className="border-t border-[#EEF1F4] first:border-t-0">
                  <td className={TD}>Categoría: {f.nombre}</td>
                  <td className={`${TD} text-right`}><TachoConfirmar accion={accionQuitarReglaFamilia} campos={{ canal_id: String(tienda.id), familia_id: String(f.familia_id) }} pregunta="¿Que vuelva al catálogo?" /></td>
                </tr>
              ))}
              {productos.map((p) => (
                <tr key={`p${p.id}`} className="border-t border-[#EEF1F4] first:border-t-0">
                  <td className={TD}><span className="font-mono">{p.sku_base}</span> · {p.titulo}</td>
                  <td className={`${TD} text-right`}><TachoConfirmar accion={accionQuitarProducto} campos={{ canal_id: String(tienda.id), producto_id: String(p.id) }} pregunta="¿Que vuelva al catálogo?" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Pantalla>
  );
}
