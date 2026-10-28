// Tienda web: lo que ve el comprador (nombre, dirección, colores, logo,
// datos de contacto; los banners, en ./banners) de cada canal tipo web_minorista. Vive en
// canal.config; la lista de precios, el estado y los depósitos se cambian en
// Configuración → Canales. Abre en vista; se edita con el lápiz (?editar=t<id>).
// Abajo, los dominios propios de cada tienda (tienda_dominio, bitácora #281).

import { Fragment } from "react";
import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { slugDe, type ConfigTienda } from "@/lib/tienda/tienda";
import { urlPanel } from "@/lib/tienda/dominios";
import { urlTiendaDe, type Marca } from "@/lib/tienda/dominios-tienda";
import { hayLlaveVercel, type RegistroDns } from "@/lib/tienda/vercel";
import { tienePermiso } from "@/lib/permisos";
import { PRIMARIO, SUAVE, VERDE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Estado, Dato, BotonesFicha, TituloSeccion, editandoFicha, Lapiz, CAMPO, ETIQUETA, CAJA,
  CAJA_TABLA, TABLA, THEAD, TH, TR, TD } from "@/app/componentes/erp";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { TachoConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import { COLORES_POR_DEFECTO } from "@/app/tienda/[slug]/tema";
import SubirImagen from "./SubirImagen";
import { accionCrearTienda, accionGuardarTienda } from "./acciones";
import { Interruptor } from "@/app/radar/Piezas";
import { accionNuevoDominio, accionVerificarDominio, accionBorrarDominio, accionGuardarDominio, accionCanonicalDominio } from "./dominios";
import { accionGuardarTurnstile } from "./antibot";

export const dynamic = "force-dynamic";

type SP = { editar?: string; ok?: string; error?: string };

// Los colores de la tienda (app/tienda/[slug]/tema.ts): cada uno es una variable CSS.
const COLORES: { clave: "color_marca" | "color_marca_texto" | "color_boton" | "color_verde" | "color_fondo"; nombre: string; ayuda: string; defecto: string }[] = [
  { clave: "color_marca", nombre: "Color de la marca", ayuda: "La franja de arriba", defecto: COLORES_POR_DEFECTO.marca },
  { clave: "color_marca_texto", nombre: "Texto sobre la marca", ayuda: "Links e íconos de la franja", defecto: COLORES_POR_DEFECTO.marcaTexto },
  { clave: "color_boton", nombre: "Botones y links", ayuda: "\"Comprar ahora\", links, elegido", defecto: COLORES_POR_DEFECTO.boton },
  { clave: "color_verde", nombre: "Ofertas y envío gratis", ayuda: "% OFF, cuotas sin interés, envío gratis", defecto: COLORES_POR_DEFECTO.verde },
  { clave: "color_fondo", nombre: "Fondo de la página", ayuda: "Detrás de las tarjetas", defecto: COLORES_POR_DEFECTO.fondo },
];

type Dominio = { id: number; canal_id: number; dominio: string; principal: boolean; canonical_principal: boolean | null; estado: string; dns: RegistroDns[]; detalle: string | null; revisado: string | null;
  marca: Marca | null; redirige_a_id: number | null };

const ESTADOS_DOMINIO: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" | "azul" }> = {
  sin_conectar: { texto: "Sin conectar a Vercel", tono: "gris" },
  esperando_dns: { texto: "Esperando DNS", tono: "amarillo" },
  verificado: { texto: "Verificado (falta el certificado)", tono: "azul" },
  con_certificado: { texto: "Con certificado: anda", tono: "verde" },
};

const ESTADOS: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" }> = {
  activo: { texto: "Activa: toma pedidos", tono: "verde" }, pausado: { texto: "Pausada: no toma pedidos", tono: "amarillo" },
};

/** Los datos de una marca (dominio de "otra marca"): nombre, logo, colores de la franja y mail (los banners, en Banners de la tienda). */
function CamposMarca({ m, org }: { m: Marca | null; org: string }) {
  const color = (k: "color_marca" | "color_marca_texto", nombre: string, defecto: string) => (
    <div><span className={ETIQUETA}>{nombre}</span>
      <label className="inline-flex items-center gap-2 text-xs">
        <input type="checkbox" name={`marca_${k}_usar`} defaultChecked={!!m?.[k]} /> Propio:
        <input type="color" name={`marca_${k}`} defaultValue={m?.[k] ?? defecto} className="h-7 w-12 rounded border border-[#E3E9F0] align-middle" />
      </label>
      <span className="block text-[11px] text-[#5C6B76]">Sin tildar, el de la tienda.</span></div>
  );
  return (
    <>
      <label><span className={ETIQUETA}>Nombre de la marca</span>
        <input name="marca_nombre" defaultValue={m?.nombre ?? ""} placeholder="Tienda Virtual" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Mail (vacío: el de la tienda con este dominio)</span>
        <input name="marca_email" type="email" defaultValue={m?.email ?? ""} className={`${CAMPO} w-full`} /></label>
      <div><span className={ETIQUETA}>Logo (sin logo: el nombre escrito)</span>
        <SubirImagen name="marca_logo" valor={m?.logo ?? null} organizacionId={org} etiqueta="Logo" /></div>
      {color("color_marca", "Color de la franja", COLORES_POR_DEFECTO.marca)}
      {color("color_marca_texto", "Texto sobre la franja", COLORES_POR_DEFECTO.marcaTexto)}
    </>
  );
}

export default async function ConfigTiendaPantalla({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const base = urlPanel();
  const tiendas = await consulta<{ id: number; nombre: string; estado: string; config: ConfigTienda; lista: string | null; depositos: string | null }>(`
    select c.id::int, c.nombre, c.estado, c.config, l.nombre lista,
           (select string_agg(d.nombre, ', ' order by cd.prioridad, d.nombre) from canal_deposito cd join deposito d on d.id = cd.deposito_id
             where cd.canal_id = c.id) depositos
      from canal c left join lista_precios l on l.id = c.lista_precios_id
     where c.organizacion_id = $1 and c.tipo = 'web_minorista' and c.estado <> 'archivado' order by c.id`, [s.org.id]);

  const dominios = await consulta<Dominio>(`
    select id::int, canal_id::int, dominio, principal, estado, dns, detalle, marca, redirige_a_id::int, canonical_principal,
           to_char(revisado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') revisado
      from tienda_dominio where organizacion_id = $1 order by canal_id, principal desc, dominio`, [s.org.id]);
  const direcciones = new Map(await Promise.all(tiendas.map(async (t) =>
    [t.id, await urlTiendaDe(t.id, t.config?.slug || slugDe(t.nombre))] as const)));
  const puedeDominios = tienePermiso(s.permisos, "tienda_dominios");
  // Antibot (lib/tienda/antibot.ts): intentos frenados en la semana y si hay Turnstile.
  const [frenados, turnstile] = await Promise.all([
    consulta<{ resultado: string; n: number }>(`select resultado, count(*)::int n from tienda_intento
      where organizacion_id = $1 and creado_ts > now() - interval '7 days' and resultado <> 'ok' group by resultado order by 2 desc`, [s.org.id]),
    consulta<{ site_key: string | null; hay_secreta: boolean }>("select site_key, secret_key is not null hay_secreta from tienda_antibot where organizacion_id = $1", [s.org.id]),
  ]);
  const ts = turnstile[0];
  const llave = hayLlaveVercel();

  const VOLVER = "/config/tienda";
  // Con una sola tienda, el lápiz y "Grabar" van arriba a la derecha de la pantalla; con varias, en cada una.
  const botones = (id: number) => (
    <BotonesFicha editando={editandoFicha(sp, `t${id}`)} ver={VOLVER} editar={`${VOLVER}?editar=t${id}`} form={`ficha-t${id}`} />
  );

  return (
    <Pantalla titulo="Tienda web" subtitulo="Lo que ve el comprador en la tienda: nombre, dirección, colores y datos de contacto" ancho="max-w-4xl"
      acciones={tiendas.length === 1 ? botones(tiendas[0].id) : undefined}>
      <Avisos sp={sp} flotante />
      {tiendas.length === 0 && (
        <div className={CAJA}>
          <p className="text-xs mb-2">Todavía no hay ninguna tienda web (un canal tipo Web minorista).</p>
          <form action={accionCrearTienda}><button className={PRIMARIO}>Crear la tienda web</button></form>
          <p className="text-[11px] text-[#5C6B76] mt-1">Se crea pausada, con la lista de precios &quot;Web minorista&quot; si existe.</p>
        </div>
      )}
      {tiendas.map((t) => {
        const c = t.config ?? {};
        const slug = c.slug || slugDe(t.nombre);
        const doms = dominios.filter((d) => d.canal_id === t.id);
        const principal = doms.find((d) => d.principal)?.dominio ?? null;
        const direccion = direcciones.get(t.id)!;
        const est = ESTADOS[t.estado] ?? { texto: t.estado, tono: "gris" as const };
        const editando = editandoFicha(sp, `t${t.id}`);
        return (
          <section key={t.id} className="mb-6">
            {tiendas.length > 1 && <TituloSeccion titulo={t.nombre}>{botones(t.id)}</TituloSeccion>}
            <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 text-xs`}>
              <div><span className={ETIQUETA}>Dirección de la tienda</span>
                <a href={direccion} target="_blank" rel="noopener" className="text-[#16577F] hover:underline break-all">{direccion} ↗</a>
                {principal && !direccion.startsWith(`https://${principal}`) && <span className="block text-[11px] text-[#5C6B76] mt-0.5">Cuando {principal} tenga certificado, la dirección pasa a ser ésa (abajo, en Dominios).</span>}</div>
              <div><span className={ETIQUETA}>Estado</span><Estado texto={est.texto} tono={est.tono} />
                <Link href={`/config/canales?c=${t.id}`} className="block text-[11px] text-[#16577F] hover:underline mt-0.5">Cambiarlo en Canales</Link></div>
              <div><span className={ETIQUETA}>Lista de precios</span>{t.lista ?? <span className="text-[#C03420]">Sin lista</span>}
                <Link href={`/config/canales?c=${t.id}`} className="block text-[11px] text-[#16577F] hover:underline mt-0.5">Cambiarla en Configuración → Canales</Link></div>
              <div className="sm:col-span-2"><span className={ETIQUETA}>Feed para Meta (Facebook / Instagram)</span>
                <a href={`${direccion}/feed.xml`} target="_blank" rel="noopener" className="text-[#16577F] hover:underline break-all">{direccion}/feed.xml ↗</a>
                <span className="block text-[11px] text-[#5C6B76]">Los catálogos de Google, Meta y TikTok y la medición de ventas: <Link href="/config/tienda/medicion" className="text-[#16577F] hover:underline">Publicidad</Link>.</span></div>
              <div><span className={ETIQUETA}>Vende el stock de</span>{t.depositos ?? <span className="text-[#C03420]">Ningún depósito: elegilos en Canales</span>}</div>
            </div>

            <div className="mb-4">
              <TituloSeccion titulo={`Dominios (${doms.length})`}>
                {puedeDominios && <BotonNuevo texto="Nuevo dominio" clave={`nuevo-dominio-${t.id}`} />}
              </TituloSeccion>
              {puedeDominios && (
                <AltaNueva texto="Nuevo dominio" clave={`nuevo-dominio-${t.id}`} sinBoton>
                  <form action={accionNuevoDominio} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end text-xs">
                    <input type="hidden" name="canal_id" value={t.id} />
                    <label><span className={ETIQUETA}>Dominio</span>
                      <input name="dominio" required autoFocus placeholder="mitienda.com.ar" className={`${CAMPO} w-full font-mono`} /></label>
                    <div className="sm:col-span-2"><span className={ETIQUETA}>Tipo</span>
                      <span className="flex flex-wrap gap-3 py-1.5">
                        <label className="inline-flex items-center gap-1"><input type="radio" name="tipo" value="principal" defaultChecked={!principal} disabled={!!principal} /> Principal (abre la tienda)</label>
                        <label className="inline-flex items-center gap-1"><input type="radio" name="tipo" value="marca" disabled={!principal} /> Otra marca (abre la tienda con otro nombre)</label>
                        <label className="inline-flex items-center gap-1"><input type="radio" name="tipo" value="redirige" defaultChecked={!!principal} disabled={!principal} /> Redirige</label>
                      </span></div>
                    {principal && <>
                      <label><span className={ETIQUETA}>Si redirige: a</span>
                        <select name="redirige_a_id" defaultValue="" className={`${CAMPO} w-full font-mono`}>
                          <option value="">{principal} (el principal)</option>
                          {doms.filter((d) => d.marca?.nombre).map((d) => <option key={d.id} value={d.id}>{d.dominio} ({d.marca!.nombre})</option>)}
                        </select></label>
                      <label><span className={ETIQUETA}>Si es otra marca: su nombre</span>
                        <input name="marca_nombre" placeholder="Tienda Virtual" className={`${CAMPO} w-full`} /></label>
                    </>}
                    <div><BotonEnviar clase={PRIMARIO} corriendo="Conectando…">Crear</BotonEnviar></div>
                  </form>
                  <p className="text-[11px] text-[#5C6B76] mt-2">
                    {principal ? <>Otra marca abre la misma tienda (productos, precios, stock y pedidos) con su nombre y su logo; el logo y los colores se cargan después con el lápiz (los banners, en Configuración › Banners de la tienda). Los que redirigen (www) van al principal o a una marca.</> : <>Primero el principal: es el que abre la tienda. Después, las otras marcas y los que redirigen (www).</>}
                    {" "}Al crearlo, Laucen lo agrega en Vercel y te muestra los registros DNS que hay que cargar.
                  </p>
                </AltaNueva>
              )}
              {!llave && puedeDominios && (
                <p className="text-[11px] text-[#8a6100] mb-2">Falta la llave de Vercel: los dominios quedan anotados, pero no se conectan hasta que esté.</p>
              )}
              {doms.length === 0 ? (
                <p className={`${CAJA} text-xs text-[#5C6B76]`}>Sin dominio propio: la tienda abre en {base}/tienda/{slug}.</p>
              ) : (
                <div className={CAJA_TABLA}>
                  <table className={TABLA}>
                    <thead className={THEAD}><tr>
                      <th className={TH}>Dominio</th><th className={TH}>Tipo</th><th className={TH}>Estado</th>
                      <th className={TH}>Registros DNS a cargar</th><th className={TH}>Revisado</th><th className={TH}></th>
                    </tr></thead>
                    <tbody>
                      {doms.map((d) => {
                        const e = ESTADOS_DOMINIO[d.estado] ?? { texto: d.estado, tono: "gris" as const };
                        const editandoDom = puedeDominios && !d.principal && editandoFicha(sp, `dom${d.id}`);
                        const destino = doms.find((x) => x.id === d.redirige_a_id && (x.principal || x.marca?.nombre))?.dominio ?? principal;
                        return (<Fragment key={d.id}>
                          <tr className={TR}>
                            <td className={`${TD} font-mono`}><a href={`https://${d.dominio}`} target="_blank" rel="noopener" className="text-[#16577F] hover:underline">{d.dominio} ↗</a></td>
                            <td className={TD}>{d.principal ? "Principal" : d.marca?.nombre
                              ? <><span className="inline-flex items-center gap-1.5">Otra marca: <b>{d.marca.nombre}</b>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  {d.marca.logo && <img src={d.marca.logo} alt="" className="h-5 max-w-16 object-contain" />}</span>
                                  <div className="mt-1">
                                    <Interruptor accion={accionCanonicalDominio} prendido={d.canonical_principal ?? true} campos={{ id: String(d.id) }} compacto deshabilitado={!puedeDominios}
                                      etiqueta={(d.canonical_principal ?? true) ? `Para Google es ${principal ?? "el principal"}` : "Para Google es un sitio aparte"} />
                                  </div></>
                              : <>Redirige a <span className="font-mono">{destino ?? "—"}</span></>}</td>
                            <td className={TD}><Estado texto={e.texto} tono={e.tono} />
                              {d.detalle && <span className="block text-[11px] text-[#C03420] mt-0.5">{d.detalle}</span>}</td>
                            <td className={TD}>
                              {d.estado === "con_certificado" || d.dns.length === 0 ? <span className="text-[#5C6B76]">—</span> : (
                                <ul className="space-y-0.5">
                                  {d.dns.map((r, i) => (
                                    <li key={i} className="font-mono text-[11px]"><b>{r.tipo}</b> {r.nombre} → <span className="break-all">{r.valor}</span></li>
                                  ))}
                                </ul>
                              )}</td>
                            <td className={`${TD} whitespace-nowrap`}>{d.revisado ?? "—"}</td>
                            <td className={`${TD} whitespace-nowrap`}>
                              {puedeDominios && (editandoDom ? (
                                <span className="flex items-center gap-1 justify-end">
                                  <button type="submit" form={`dom-${d.id}`} className={VERDE}>Grabar</button>
                                  <Link href={VOLVER} className={SUAVE} scroll={false}>Cancelar</Link>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 justify-end">
                                  {!d.principal && <Lapiz href={`${VOLVER}?editar=dom${d.id}`} etiqueta="Cambiar el dominio" />}
                                  {d.estado !== "con_certificado" && (
                                    <form action={accionVerificarDominio}><input type="hidden" name="id" value={d.id} />
                                      <BotonEnviar clase={SUAVE} corriendo="Verificando…">Verificar</BotonEnviar></form>
                                  )}
                                  <TachoConfirmar accion={accionBorrarDominio} campos={{ id: String(d.id) }} pregunta="¿Borrar?" />
                                </span>
                              ))}</td>
                          </tr>
                          {editandoDom && (
                            <tr className={TR}><td colSpan={6} className={`${TD} bg-[#F7F9FB]`}>
                              {/* Con "Redirige a" elegido, los datos de la marca se esconden (Fer, 28/10: los cargaba en el www, que redirige, y se ignoraban). */}
                              <form id={`dom-${d.id}`} action={accionGuardarDominio}
                                className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start text-xs [&:has(input[value=redirige]:checked)_.campos-marca]:hidden [&:has(input[value=redirige]:checked)_.aviso-redirige]:block">
                                <input type="hidden" name="id" value={d.id} />
                                <div className="sm:col-span-3"><span className={ETIQUETA}>Tipo</span>
                                  <span className="flex flex-wrap gap-3 py-1.5">
                                    <label className="inline-flex items-center gap-1"><input type="radio" name="tipo" value="marca" defaultChecked={!!d.marca?.nombre} /> Otra marca (abre la tienda con estos datos)</label>
                                    <label className="inline-flex items-center gap-1"><input type="radio" name="tipo" value="redirige" defaultChecked={!d.marca?.nombre} /> Redirige a</label>
                                    <select name="redirige_a_id" defaultValue={d.redirige_a_id ?? ""} className={`${CAMPO} font-mono`}>
                                      <option value="">{principal} (el principal)</option>
                                      {doms.filter((x) => x.id !== d.id && x.marca?.nombre).map((x) => <option key={x.id} value={x.id}>{x.dominio} ({x.marca!.nombre})</option>)}
                                    </select>
                                  </span></div>
                                <p className="aviso-redirige hidden sm:col-span-3 text-[11px] text-[#5C6B76]">
                                  Un dominio que redirige no tiene nombre, logo ni mail propios: muestra los del dominio al que va. Para cambiarlos, usá el lápiz de ese dominio.</p>
                                <div className="campos-marca contents"><CamposMarca m={d.marca} org={s.org.id} /></div>
                              </form>
                              <p className="text-[11px] text-[#5C6B76] mt-2">Como otra marca, el dominio muestra la misma tienda (productos, precios, stock, carrito y pedidos) con este nombre y logo (colores y mail: los propios si los cargás; si no, los de la tienda, con el mail en este dominio); los pagos y los links de seguimiento vuelven a este dominio. Lo demás (textos de ayuda, devoluciones, WhatsApp, dirección) es el de la tienda.</p>
                            </td></tr>
                          )}
                        </Fragment>);
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!editando ? (
              <div className={`${CAJA} grid grid-cols-1 sm:grid-cols-2 gap-3 items-start`}>
                <Dato etiqueta="Nombre que ve el comprador">{c.nombre ?? t.nombre}</Dato>
                <Dato etiqueta="Dirección (slug)"><span className="font-mono">{slug}</span></Dato>
                {COLORES.map((k) => (
                  <Dato key={k.clave} etiqueta={k.nombre}>
                    <span className="inline-flex items-center gap-2"><span className="inline-block h-4 w-8 rounded border border-[#E3E9F0]" style={{ background: c[k.clave] ?? k.defecto }} />
                      <span className="font-mono">{c[k.clave] ?? k.defecto}</span>{!c[k.clave] && <span className="text-[#5C6B76]">(el de siempre)</span>}</span>
                  </Dato>
                ))}
                <Dato etiqueta="Productos sin stock">Nunca se muestran (tampoco los inactivos ni los sin precio)</Dato>
                <Dato etiqueta="Logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.logo ? <img src={c.logo} alt="Logo" className="h-16 object-contain" /> : null}
                </Dato>
                <Dato etiqueta="Bajada (el texto de la portada sin banners)" className="sm:col-span-2">{c.bajada}</Dato>
                <Dato etiqueta="Devoluciones (lo que ve el comprador en la ficha y en Ayuda)" largo className="sm:col-span-2">{c.devoluciones}</Dato>
                <Dato etiqueta="Garantía" largo className="sm:col-span-2">{c.garantia}</Dato>
                <Dato etiqueta="Sobre nosotros (lo que ve el comprador en la página «Sobre nosotros»)" largo className="sm:col-span-2">{c.sobre_nosotros}</Dato>
                <Dato etiqueta="WhatsApp">{c.whatsapp}</Dato>
                <Dato etiqueta="Mail">{c.email}</Dato>
                <Dato etiqueta="Dirección del local">{c.direccion}</Dato>
                <Dato etiqueta="Horario">{c.horario}</Dato>
              </div>
            ) : (
            <form id={`ficha-t${t.id}`} action={accionGuardarTienda} className={`${CAJA} grid grid-cols-1 sm:grid-cols-2 gap-3 items-start`}>
              <input type="hidden" name="canal_id" value={t.id} />
              <label><span className={ETIQUETA}>Nombre que ve el comprador</span>
                <input name="nombre" autoFocus defaultValue={c.nombre ?? t.nombre} className={`${CAMPO} w-full`} /></label>
              <label><span className={ETIQUETA}>Dirección (slug)</span>
                <input name="slug" defaultValue={slug} className={`${CAMPO} w-full font-mono`} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
                <span className="block text-[11px] text-[#5C6B76] mt-0.5">Minúsculas, números y guiones: queda {base}/tienda/<b>{slug}</b></span></label>
              {COLORES.map((k) => (
                <label key={k.clave}><span className={ETIQUETA}>{k.nombre}</span>
                  <input type="color" name={k.clave} defaultValue={c[k.clave] ?? k.defecto} className="h-8 w-14 rounded border border-[#E3E9F0] align-middle" />
                  <span className="ml-2 text-[11px] text-[#5C6B76]">{k.ayuda} · el de siempre: <span className="font-mono">{k.defecto}</span></span></label>
              ))}
              {/* Regla fija de la web (Fer, 25/10): sin opción que la apague. */}
              <div><span className={ETIQUETA}>Productos sin stock</span>
                <span className="block text-xs py-1.5 text-[#5C6B76]">Nunca se muestran (tampoco los inactivos ni los sin precio).</span></div>
              <div><span className={ETIQUETA}>Logo</span>
                <SubirImagen name="logo" valor={c.logo ?? null} organizacionId={s.org.id} etiqueta="Logo" /></div>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Bajada (el texto de la portada sin banners)</span>
                <input name="bajada" defaultValue={c.bajada ?? ""} placeholder="Ej. Envíos a todo el país" className={`${CAMPO} w-full`} /></label>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Devoluciones (lo que ve el comprador en la ficha y en Ayuda)</span>
                <textarea name="devoluciones" rows={2} defaultValue={c.devoluciones ?? ""} placeholder="Ej. Tenés 30 días desde que lo recibís para devolverlo." className={`${CAMPO} w-full h-auto py-1.5`} /></label>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Garantía</span>
                <textarea name="garantia" rows={2} defaultValue={c.garantia ?? ""} placeholder="Ej. 6 meses de garantía de fábrica." className={`${CAMPO} w-full h-auto py-1.5`} /></label>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Sobre nosotros (lo que ve el comprador en la página «Sobre nosotros»)</span>
                <textarea name="sobre_nosotros" rows={4} defaultValue={c.sobre_nosotros ?? ""} placeholder="Quiénes son, desde cuándo, qué venden. Sin texto, se muestra una presentación general con los datos de la tienda." className={`${CAMPO} w-full h-auto py-1.5`} /></label>
              <label><span className={ETIQUETA}>WhatsApp</span>
                <input name="whatsapp" defaultValue={c.whatsapp ?? ""} inputMode="numeric" placeholder="5493511234567" className={`${CAMPO} w-full`} />
                <span className="block text-[11px] text-[#5C6B76] mt-0.5">Formato internacional, sin + ni espacios: 54 9, la característica sin 0 y el número sin 15.</span></label>
              <label><span className={ETIQUETA}>Mail</span>
                <input name="email" type="email" defaultValue={c.email ?? ""} className={`${CAMPO} w-full`} /></label>
              <label><span className={ETIQUETA}>Dirección del local</span>
                <input name="direccion" defaultValue={c.direccion ?? ""} className={`${CAMPO} w-full`} /></label>
              <label><span className={ETIQUETA}>Horario</span>
                <input name="horario" defaultValue={c.horario ?? ""} placeholder="Lun a vie de 9 a 18" className={`${CAMPO} w-full`} /></label>
            </form>
            )}

          </section>
        );
      })}

      {tiendas.length > 0 && (
        <section className="mb-6">
          <TituloSeccion titulo="Protección contra bots" />
          <div className={`${CAJA} text-xs space-y-3`}>
            <p className="text-[#5C6B76]">El pago (checkout), el ingreso y la creación de cuenta tienen un campo trampa que una persona no ve, un tiempo mínimo para completarlos y un tope de intentos por conexión. Con las claves de Cloudflare Turnstile se suma su verificación (casi siempre invisible).</p>
            <p><b>Frenados en los últimos 7 días:</b>{" "}
              {frenados.length ? frenados.map((f) => `${f.n} ${({ trampa: "llenaron el campo trampa", muy_rapido: "demasiado rápidos", vencido: "página vencida", turnstile: "no pasaron Turnstile", tope_ip: "pasaron el tope por conexión" } as Record<string, string>)[f.resultado] ?? f.resultado}`).join(" · ") : "ninguno"}</p>
            <form action={accionGuardarTurnstile} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label><span className={ETIQUETA}>Turnstile: clave del sitio (Site Key)</span>
                <input name="site_key" defaultValue={ts?.site_key ?? ""} className={`${CAMPO} w-full font-mono`} /></label>
              <label><span className={ETIQUETA}>Clave secreta (Secret Key)</span>
                <input name="secret_key" type="password" autoComplete="off" placeholder={ts?.hay_secreta ? "Cargada (vacío = no se cambia)" : "Sin cargar"} className={`${CAMPO} w-full font-mono`} /></label>
              <span className="flex gap-2">
                <BotonEnviar clase={PRIMARIO} corriendo="Grabando…">Grabar claves</BotonEnviar>
                {ts?.site_key && <button name="quitar" value="1" className={SUAVE}>Apagar Turnstile</button>}
              </span>
            </form>
            <p className="text-[11px] text-[#5C6B76]">Estado: {ts?.site_key && ts.hay_secreta ? <span className="text-[#167655] font-semibold">Turnstile prendido</span> : "sin Turnstile"}. Las claves se crean en Cloudflare › Turnstile, con los dominios de la tienda.</p>
          </div>
        </section>
      )}
    </Pantalla>
  );
}
