// Tienda web: lo que ve el comprador (nombre, dirección, colores, logo,
// banner, datos de contacto) de cada canal tipo web_minorista. Vive en
// canal.config; la lista de precios, el estado y los depósitos se cambian en
// Configuración → Canales. Abre en vista; se edita con el lápiz (?editar=t<id>).
// Abajo, los dominios propios de cada tienda (tienda_dominio, bitácora #281).

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { slugDe, type ConfigTienda } from "@/lib/tienda/tienda";
import { urlPanel } from "@/lib/tienda/dominios";
import { urlTiendaDe } from "@/lib/tienda/dominios-tienda";
import { hayLlaveVercel, type RegistroDns } from "@/lib/tienda/vercel";
import { tienePermiso } from "@/lib/permisos";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Estado, Dato, BotonesFicha, TituloSeccion, editandoFicha, CAMPO, ETIQUETA, CAJA,
  CAJA_TABLA, TABLA, THEAD, TH, TR, TD } from "@/app/componentes/erp";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { TachoConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import { COLORES_POR_DEFECTO } from "@/app/tienda/[slug]/tema";
import SubirImagen from "./SubirImagen";
import { accionCrearTienda, accionGuardarTienda } from "./acciones";
import { accionNuevoDominio, accionVerificarDominio, accionBorrarDominio } from "./dominios";

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

type Dominio = { id: number; canal_id: number; dominio: string; principal: boolean; estado: string; dns: RegistroDns[]; detalle: string | null; revisado: string | null };

const ESTADOS_DOMINIO: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" | "azul" }> = {
  sin_conectar: { texto: "Sin conectar a Vercel", tono: "gris" },
  esperando_dns: { texto: "Esperando DNS", tono: "amarillo" },
  verificado: { texto: "Verificado (falta el certificado)", tono: "azul" },
  con_certificado: { texto: "Con certificado: anda", tono: "verde" },
};

const ESTADOS: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" }> = {
  activo: { texto: "Activa: toma pedidos", tono: "verde" }, pausado: { texto: "Pausada: no toma pedidos", tono: "amarillo" },
};

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
    select id::int, canal_id::int, dominio, principal, estado, dns, detalle,
           to_char(revisado_ts at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') revisado
      from tienda_dominio where organizacion_id = $1 order by canal_id, principal desc, dominio`, [s.org.id]);
  const direcciones = new Map(await Promise.all(tiendas.map(async (t) =>
    [t.id, await urlTiendaDe(t.id, t.config?.slug || slugDe(t.nombre))] as const)));
  const puedeDominios = tienePermiso(s.permisos, "tienda_dominios");
  const llave = hayLlaveVercel();

  const VOLVER = "/config/tienda";
  // Con una sola tienda, el lápiz y "Grabar" van arriba a la derecha de la pantalla; con varias, en cada una.
  const botones = (id: number) => (
    <BotonesFicha editando={editandoFicha(sp, `t${id}`)} ver={VOLVER} editar={`${VOLVER}?editar=t${id}`} form={`ficha-t${id}`} />
  );

  return (
    <Pantalla titulo="Tienda web" subtitulo="Lo que ve el comprador en la tienda: nombre, dirección, colores y datos de contacto" ancho="max-w-4xl"
      acciones={tiendas.length === 1 ? botones(tiendas[0].id) : undefined}>
      <Avisos sp={sp} />
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
                <a href={direccion} target="_blank" rel="noopener" className="text-[#16577F] hover:underline break-all">{direccion}</a>
                {principal && !direccion.startsWith(`https://${principal}`) && <span className="block text-[11px] text-[#5C6B76] mt-0.5">Cuando {principal} tenga certificado, la dirección pasa a ser ésa (abajo, en Dominios).</span>}</div>
              <div><span className={ETIQUETA}>Estado</span><Estado texto={est.texto} tono={est.tono} />
                <Link href={`/config/canales?c=${t.id}`} className="block text-[11px] text-[#16577F] hover:underline mt-0.5">Cambiarlo en Canales</Link></div>
              <div><span className={ETIQUETA}>Lista de precios</span>{t.lista ?? <span className="text-[#C03420]">Sin lista</span>}
                <Link href={`/config/canales?c=${t.id}`} className="block text-[11px] text-[#16577F] hover:underline mt-0.5">Cambiarla en Configuración → Canales</Link></div>
              <div className="sm:col-span-2"><span className={ETIQUETA}>Feed para Meta (Facebook / Instagram)</span>
                <a href={`${direccion}/feed.xml`} target="_blank" rel="noopener" className="text-[#16577F] hover:underline break-all">{direccion}/feed.xml</a>
                <span className="block text-[11px] text-[#5C6B76]">Cargalo en Meta Commerce Manager como fuente de datos programada.</span></div>
              <div><span className={ETIQUETA}>Vende el stock de</span>{t.depositos ?? <span className="text-[#C03420]">Ningún depósito: elegilos en Canales</span>}</div>
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
                <Dato etiqueta="Productos sin stock">{c.sin_stock === "ocultar" ? "Ocultar" : "Mostrar (como \"sin stock\")"}</Dato>
                <Dato etiqueta="Logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.logo ? <img src={c.logo} alt="Logo" className="h-16 object-contain" /> : null}
                </Dato>
                <Dato etiqueta="Banner (la imagen grande de arriba)">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.banner ? <img src={c.banner} alt="Banner" className="h-24 object-contain" /> : null}
                </Dato>
                <Dato etiqueta="Banner 2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.banner_2 ? <img src={c.banner_2} alt="Banner 2" className="h-24 object-contain" /> : null}
                </Dato>
                <Dato etiqueta="Banner 3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.banner_3 ? <img src={c.banner_3} alt="Banner 3" className="h-24 object-contain" /> : null}
                </Dato>
                <Dato etiqueta="Bajada (el texto sobre el banner)" className="sm:col-span-2">{c.bajada}</Dato>
                <Dato etiqueta="Devoluciones (lo que ve el comprador en la ficha y en Ayuda)" largo className="sm:col-span-2">{c.devoluciones}</Dato>
                <Dato etiqueta="Garantía" largo className="sm:col-span-2">{c.garantia}</Dato>
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
              <div><span className={ETIQUETA}>Productos sin stock</span>
                <span className="flex gap-3 text-xs py-1.5">
                  <label className="inline-flex items-center gap-1"><input type="radio" name="sin_stock" value="mostrar" defaultChecked={c.sin_stock !== "ocultar"} /> Mostrar (como &quot;sin stock&quot;)</label>
                  <label className="inline-flex items-center gap-1"><input type="radio" name="sin_stock" value="ocultar" defaultChecked={c.sin_stock === "ocultar"} /> Ocultar</label>
                </span></div>
              <div><span className={ETIQUETA}>Logo</span>
                <SubirImagen name="logo" valor={c.logo ?? null} organizacionId={s.org.id} etiqueta="Logo" /></div>
              <div><span className={ETIQUETA}>Banner (la imagen grande de arriba)</span>
                <SubirImagen name="banner" valor={c.banner ?? null} organizacionId={s.org.id} etiqueta="Banner" alto="h-24" /></div>
              <div><span className={ETIQUETA}>Banner 2</span>
                <SubirImagen name="banner_2" valor={c.banner_2 ?? null} organizacionId={s.org.id} etiqueta="Banner 2" alto="h-24" /></div>
              <div><span className={ETIQUETA}>Banner 3</span>
                <SubirImagen name="banner_3" valor={c.banner_3 ?? null} organizacionId={s.org.id} etiqueta="Banner 3" alto="h-24" /></div>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Bajada (el texto sobre el banner)</span>
                <input name="bajada" defaultValue={c.bajada ?? ""} placeholder="Ej. Envíos a todo el país" className={`${CAMPO} w-full`} /></label>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Devoluciones (lo que ve el comprador en la ficha y en Ayuda)</span>
                <textarea name="devoluciones" rows={2} defaultValue={c.devoluciones ?? ""} placeholder="Ej. Tenés 30 días desde que lo recibís para devolverlo." className={`${CAMPO} w-full h-auto py-1.5`} /></label>
              <label className="sm:col-span-2"><span className={ETIQUETA}>Garantía</span>
                <textarea name="garantia" rows={2} defaultValue={c.garantia ?? ""} placeholder="Ej. 6 meses de garantía de fábrica." className={`${CAMPO} w-full h-auto py-1.5`} /></label>
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

            <div className="mt-6">
              <TituloSeccion titulo={`Dominios (${doms.length})`}>
                {puedeDominios && <BotonNuevo texto="Nuevo dominio" clave={`nuevo-dominio-${t.id}`} />}
              </TituloSeccion>
              {puedeDominios && (
                <AltaNueva texto="Nuevo dominio" clave={`nuevo-dominio-${t.id}`} sinBoton>
                  <form action={accionNuevoDominio} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end text-xs">
                    <input type="hidden" name="canal_id" value={t.id} />
                    <label><span className={ETIQUETA}>Dominio</span>
                      <input name="dominio" required autoFocus placeholder="mitienda.com.ar" className={`${CAMPO} w-full font-mono`} /></label>
                    <div><span className={ETIQUETA}>Tipo</span>
                      <span className="flex flex-wrap gap-3 py-1.5">
                        <label className="inline-flex items-center gap-1"><input type="radio" name="tipo" value="principal" defaultChecked={!principal} disabled={!!principal} /> Principal (abre la tienda)</label>
                        <label className="inline-flex items-center gap-1"><input type="radio" name="tipo" value="redirige" defaultChecked={!!principal} disabled={!principal} /> Redirige al principal</label>
                      </span></div>
                    <div><BotonEnviar clase={PRIMARIO} corriendo="Conectando…">Crear</BotonEnviar></div>
                  </form>
                  <p className="text-[11px] text-[#5C6B76] mt-2">
                    {principal ? <>Los demás dominios (www, otras marcas) redirigen a <b>{principal}</b>.</> : <>Primero el principal: es el que abre la tienda. Después, los que redirigen a él (www, otras marcas).</>}
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
                        return (
                          <tr key={d.id} className={TR}>
                            <td className={`${TD} font-mono`}><a href={`https://${d.dominio}`} target="_blank" rel="noopener" className="text-[#16577F] hover:underline">{d.dominio}</a></td>
                            <td className={TD}>{d.principal ? "Principal" : <>Redirige a <span className="font-mono">{principal ?? "—"}</span></>}</td>
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
                              {puedeDominios && (
                                <span className="flex items-center gap-1 justify-end">
                                  {d.estado !== "con_certificado" && (
                                    <form action={accionVerificarDominio}><input type="hidden" name="id" value={d.id} />
                                      <BotonEnviar clase={SUAVE} corriendo="Verificando…">Verificar</BotonEnviar></form>
                                  )}
                                  <TachoConfirmar accion={accionBorrarDominio} campos={{ id: String(d.id) }} pregunta="¿Borrar?" />
                                </span>
                              )}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        );
      })}
    </Pantalla>
  );
}
