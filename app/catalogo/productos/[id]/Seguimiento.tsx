// La pestaña «Seguimiento» de la ficha del producto (pedido de Fer, 10/10;
// lib/seguimiento/): las publicaciones de la competencia que se siguen y, para
// elegir más, la búsqueda en Mercado Libre con «Seguir» al lado de cada una.

import { consulta } from "@/lib/erp/base";
import { formatear, type Moneda } from "@/lib/moneda";
import { ultimaBusqueda, configSeguimiento, enlaceDe, esPack, parecido, type PubEncontrada } from "@/lib/seguimiento";
import { CasillaViva } from "@/app/componentes/BuscadorVivo";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { TachoConfirmar } from "@/app/radar/Cliente";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { SUAVE, PRIMARIO } from "@/app/botones";
import { CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, Estado, TituloSeccion } from "@/app/componentes/erp";
import BuscarSeguimiento from "./BuscarSeguimiento";
import { accionSeguir, accionSeguirPorNumero, accionDejarDeSeguir, accionLeerSeguimiento } from "@/app/catalogo/productos/acciones-seguimiento";

type Seguida = {
  id: number; item_id: string; catalogo_id: string | null; titulo: string | null; foto: string | null; permalink: string | null;
  vendedor: string | null; tienda_oficial: boolean | null; precio: number | null; precio_original: number | null; moneda: string | null;
  estado: string | null; tipo_publicacion: string | null; cuotas: string | null; envio_gratis: boolean | null;
  leido_ts: Date | null; error: string | null; cambio: number | null;
};

const TIPOS: Record<string, string> = { gold_special: "Clásica", gold_pro: "Premium", gold_premium: "Premium", free: "Gratuita", gold: "Oro", silver: "Plata", bronze: "Bronce" };
const ESTADOS: Record<string, { t: string; tono: "verde" | "amarillo" | "gris" | "rojo" }> = {
  activa: { t: "Activa", tono: "verde" }, pausada: { t: "Pausada", tono: "amarillo" }, cerrada: { t: "Terminada", tono: "gris" },
  no_figura: { t: "No figura en el catálogo", tono: "amarillo" }, sin_dato: { t: "Sin leer todavía", tono: "gris" },
};

const enlaceMl = (p: { permalink: string | null; item_id?: string; itemId?: string }) => p.permalink ?? enlaceDe(p.item_id ?? p.itemId ?? "");

function Precio({ precio, original, moneda }: { precio: number | null; original: number | null; moneda: string | null }) {
  if (precio == null) return <span className="text-[#5C6B76]">—</span>;
  const m = (moneda === "USD" ? "USD" : "ARS") as Moneda;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      {original != null && original > precio && <span className="text-[10px] text-[#5C6B76] line-through">{formatear(original, m)}</span>}
      <b>{formatear(precio, m)}</b>
    </span>
  );
}

function hace(d: Date | null) {
  if (!d) return "nunca";
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  return dias <= 0 ? "hoy" : dias === 1 ? "ayer" : `hace ${dias} días`;
}

export default async function SeccionSeguimiento({ s, p, sp }: { s: { org: { id: string } }; p: { id: number; titulo: string }; sp: { packs?: string; propias?: string } }) {
  const [seguidas, busqueda, conf] = await Promise.all([
    consulta<Seguida>(`
      select sp.id::int, sp.item_id, sp.catalogo_id, sp.titulo, sp.foto, sp.permalink, sp.vendedor, sp.tienda_oficial, sp.precio::float8, sp.precio_original::float8,
             sp.moneda, sp.estado, sp.tipo_publicacion, sp.cuotas, sp.envio_gratis, sp.leido_ts, sp.error,
             -- Cuánto cambió el precio desde la lectura anterior.
             (select (sp.precio - l.precio)::float8 from seguimiento_lectura l where l.seguimiento_id = sp.id and l.precio is not null
               order by l.ts desc offset 1 limit 1) cambio
        from seguimiento_pub sp where sp.organizacion_id = $1 and sp.producto_id = $2
       order by sp.precio nulls last, sp.id`, [s.org.id, p.id]),
    ultimaBusqueda(s.org.id, p.id).catch(() => null),
    configSeguimiento(s.org.id),
  ]);
  const seguidosIds = new Set(seguidas.map((x) => x.item_id));
  // Los resultados: sin packs (si el nuestro no lo es) ni los nuestros, salvo que se pidan; los más parecidos al nuestro primero.
  const nuestroEsPack = esPack(p.titulo);
  const todos = (busqueda?.resultados ?? []).filter((r) => !r.esCatalogo)
    .map((r) => ({ ...r, pack: !nuestroEsPack && esPack(r.titulo), parecido: parecido(p.titulo, r.titulo) }));
  const packs = todos.filter((r) => r.pack).length, propias = todos.filter((r) => r.propia).length;
  const verPacks = sp.packs === "1", verPropias = sp.propias === "1";
  const resultados = todos.filter((r) => (verPacks || !r.pack) && (verPropias || !r.propia))
    .sort((a, b) => b.parecido - a.parecido || (a.precio ?? Infinity) - (b.precio ?? Infinity));
  const campos = { producto_id: String(p.id) };

  return (
    <div className="grid gap-4">
      <section className={CAJA}>
        <TituloSeccion titulo={`Publicaciones que seguís (${seguidas.length})`}>
          <BotonNuevo texto="Agregar por número" />
          {seguidas.length > 0 && (
            <BotonTarea accion={accionLeerSeguimiento} tipo={`seguimiento-leer-${p.id}`} clase={SUAVE} texto="Leer ahora" campos={campos}
              pregunta="¿Leerlas ahora? Las comunes cuestan (las de catálogo, no)" />
          )}
        </TituloSeccion>
        <AltaNueva texto="Agregar por número" sinBoton>
          <form action={accionSeguirPorNumero} className="grid gap-2">
            <input type="hidden" name="producto_id" value={p.id} />
            <textarea name="numeros" rows={3} placeholder={"https://articulo.mercadolibre.com.ar/MLA-1234567890-…\nMLA1234567890"} className={`${CAMPO} w-full`} autoFocus />
            <span className="flex items-center gap-2">
              <button className={PRIMARIO}>Agregar</button>
              <span className="text-[11px] text-[#5C6B76]">Links o números de publicación (MLA…), uno por renglón. Se leen con «Leer ahora» o en la próxima vuelta.</span>
            </span>
          </form>
        </AltaNueva>
        <p className="text-[11px] text-[#5C6B76] mb-2">
          Se vuelven a leer cada {conf.frecuenciaDias} día{conf.frecuenciaDias === 1 ? "" : "s"}, a la madrugada (Configuración › Seguimiento de publicaciones).
          Las de catálogo se leen gratis; las comunes, con un costo chico.
        </p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr><th className={TH}>Publicación</th><th className={TH}>Vendedor</th><th className={THN}>Precio</th><th className={TH}>Tipo</th>
                <th className={TH}>Envío</th><th className={TH}>Estado</th><th className={TH}>Leída</th><th /></tr>
            </thead>
            <tbody>
              {seguidas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>Todavía no seguís ninguna: buscalas abajo y tocá «Seguir», o agregalas por número.</td></tr>}
              {seguidas.map((x) => (
                <tr key={x.id} className={TR}>
                  <td className={TD}>
                    <span className="flex items-start gap-2">
                      <span className="h-10 w-10 shrink-0">{x.foto && <img src={x.foto} alt="" className="h-10 w-10 object-contain rounded bg-white" />}</span>
                      <span>
                        <a href={enlaceMl(x)} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{x.titulo ?? x.item_id} ↗</a>
                        <span className="block text-[10px] text-[#5C6B76] font-mono">{x.item_id}{x.catalogo_id && <> · 📖 Catálogo {x.catalogo_id}</>}</span>
                      </span>
                    </span>
                  </td>
                  <td className={TD}>{x.vendedor ?? "—"}{x.tienda_oficial && <span className="block text-[10px] text-[#1F6E4A]">Tienda oficial</span>}</td>
                  <td className={TDN}>
                    <Precio precio={x.precio} original={x.precio_original} moneda={x.moneda} />
                    {x.cambio != null && x.cambio !== 0 && (
                      <span className={`block text-[10px] ${x.cambio < 0 ? "text-[#C03420]" : "text-[#1F6E4A]"}`}>{x.cambio < 0 ? "▼" : "▲"} {formatear(Math.abs(x.cambio), "ARS")}</span>
                    )}
                  </td>
                  <td className={TD}>{x.tipo_publicacion ? TIPOS[x.tipo_publicacion] ?? x.tipo_publicacion : "—"}{x.cuotas && <span className="block text-[10px] text-[#5C6B76]">{x.cuotas}</span>}</td>
                  <td className={TD}>{x.envio_gratis ? "Gratis" : x.envio_gratis === false ? "A cargo" : "—"}</td>
                  <td className={TD}><Estado texto={ESTADOS[x.estado ?? "sin_dato"]?.t ?? x.estado ?? "—"} tono={ESTADOS[x.estado ?? "sin_dato"]?.tono ?? "gris"} /></td>
                  <td className={`${TD} whitespace-nowrap`}>{hace(x.leido_ts)}{x.error && <span className="block text-[10px] text-[#C03420] max-w-48 whitespace-normal">{x.error}</span>}</td>
                  <td className={`${TD} text-right`}>
                    <TachoConfirmar accion={accionDejarDeSeguir} campos={{ id: String(x.id), producto_id: String(p.id) }} pregunta="¿Dejar de seguirla?" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={CAJA}>
        <TituloSeccion titulo={`Buscar en Mercado Libre para seguir${busqueda ? ` (${resultados.length})` : ""}`} />
        <BuscarSeguimiento productoId={p.id} inicial={busqueda?.texto ?? p.titulo} />
        {busqueda && (
          <p className="text-[11px] text-[#5C6B76] mt-2">Última búsqueda: «{busqueda.texto}», {new Date(busqueda.ts).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })}. Volver a buscar cuesta de nuevo.</p>
        )}
        {busqueda && todos.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 mt-2 text-xs">
            <CasillaViva parametro="packs" activo={verPacks} etiqueta={`Mostrar también packs y varias unidades (${packs})`} />
            <CasillaViva parametro="propias" activo={verPropias} etiqueta={`Mostrar también las nuestras (${propias})`} />
            <span className="text-[11px] text-[#5C6B76]">Primero las que más se parecen al título del producto. Las de catálogo muestran a cada vendedor que compite.</span>
          </div>
        )}
        {busqueda && resultados.length > 0 && (
          <div className={`${CAJA_TABLA} mt-2`}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr><th className={TH}>Publicación</th><th className={TH}>Vendedor</th><th className={THN}>Precio</th><th className={TH}>Tipo y cuotas</th><th className={TH}>Envío</th><th /></tr>
              </thead>
              <tbody>
                {resultados.map((r: PubEncontrada & { pack: boolean }) => (
                  <tr key={r.itemId} className={`${TR} ${r.propia ? "bg-[#F7F9FB]" : ""}`}>
                    <td className={TD}>
                      <span className="flex items-start gap-2">
                        <span className="h-10 w-10 shrink-0">{r.foto && <img src={r.foto} alt="" className="h-10 w-10 object-contain rounded bg-white" />}</span>
                        <span>
                          <a href={enlaceMl({ permalink: r.permalink, itemId: r.itemId })} target="_blank" rel="noopener noreferrer" className="text-[#16577F] hover:underline">{r.titulo} ↗</a>
                          <span className="block text-[10px] text-[#5C6B76] font-mono">
                            {r.itemId}{r.catalogoId && " · 📖 Catálogo"}{r.publicidad && " · Publicidad"}{r.pack && " · Pack"}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={TD}>{r.vendedor ?? "—"}{r.tiendaOficial && <span className="block text-[10px] text-[#1F6E4A]">Tienda oficial</span>}</td>
                    <td className={TDN}><Precio precio={r.precio} original={r.precioOriginal} moneda={r.moneda} /></td>
                    <td className={`${TD} text-[11px]`}>{r.tipoPublicacion ? <b className="block">{TIPOS[r.tipoPublicacion] ?? r.tipoPublicacion}</b> : null}{r.cuotas ?? (r.tipoPublicacion ? null : "—")}</td>
                    <td className={TD}>{r.envioGratis ? "Gratis" : r.envioGratis === false ? "A cargo" : "—"}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      {r.propia ? <span className="text-[11px] text-[#5C6B76]">Nuestra</span>
                        : seguidosIds.has(r.itemId) ? <span className="text-[11px] text-[#1F6E4A] font-semibold">✓ Siguiendo</span>
                        : (
                          <form action={accionSeguir}>
                            <input type="hidden" name="producto_id" value={p.id} /><input type="hidden" name="item" value={r.itemId} />
                            <button className={SUAVE}>+ Seguir</button>
                          </form>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
