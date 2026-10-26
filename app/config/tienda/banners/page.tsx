// Banners de la tienda: las imágenes grandes de arriba de la portada, todas las
// que se quieran, en dos familias (clara y oscura) que se turnan cada 12 horas
// y cada semana invierten cuál va primero (lib/tienda/banners.ts). Cada banner
// es para todas las marcas de la tienda o para una sola, y puede llevar un link.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { entrarErp, Pantalla, Avisos, Lapiz, CAJA, CAJA_TABLA, TABLA, THEAD, TH, TR, TD, TDN, CAMPO, ETIQUETA, url } from "@/app/componentes/erp";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import Pestanas from "@/app/componentes/Pestanas";
import { TachoConfirmar, BotonEnviar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { bannersDe, destinosDeBanner, turnoDeBanners, FAMILIAS, esFamilia, type FamiliaBanner } from "@/lib/tienda/banners";
import SubirImagen from "../SubirImagen";
import SubirVarias from "./SubirVarias";
import FiltroDonde from "./FiltroDonde";
import { accionAgregarBanners, accionGuardarBanner, accionActivarBanner, accionBorrarBanner, accionMoverBanner } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { canal?: string; familia?: string; donde?: string; editar?: string; nuevo?: string; ok?: string; error?: string };
const FLECHA = "inline-block text-xs leading-none rounded-lg px-2 py-1.5 bg-white border border-[#E3E9F0] text-[#16577F] disabled:opacity-30";
const MINIATURA = "h-12 aspect-[3/1] object-cover rounded border border-[#E3E9F0] bg-[#FAFBFC]";
const hora = (d: Date) => d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "long", hour: "2-digit", minute: "2-digit" });

export default async function BannersTienda({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("tienda_config");
  const sp = await searchParams;
  const tiendas = await consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 and tipo = 'web_minorista' and estado <> 'archivado' order by id", [s.org.id]);
  const tienda = tiendas.find((t) => t.id === Number(sp.canal)) ?? tiendas[0];
  const [todos, destinos] = tienda ? await Promise.all([bannersDe(s.org.id, tienda.id), destinosDeBanner(s.org.id, tienda.id)]) : [[], []];
  const turno = turnoDeBanners();
  const familia: FamiliaBanner = esFamilia(sp.familia) ? sp.familia : turno.familia;
  const otra: FamiliaBanner = turno.familia === "clara" ? "oscura" : "clara";
  const donde = destinos.find((d) => String(d.id) === sp.donde)?.id ?? null;
  // Los de la familia elegida; con "Se ven en", los de esa tienda más los de todas.
  const filas = todos.filter((b) => b.familia === familia && (donde == null || b.dominio_id == null || b.dominio_id === donde));
  const nombreDestino = (id: number | null) => id == null ? "Todas" : destinos.find((d) => d.id === id)?.nombre ?? "—";
  const base = { canal: tiendas.length > 1 ? tienda?.id : null, familia: esFamilia(sp.familia) ? sp.familia : null, donde: donde ?? null };
  const aca = (extra: Record<string, string | number | null> = {}) => url("/config/tienda/banners", { ...base, ...extra });
  // Para que cada acción vuelva a esta misma vista.
  const vuelta = <><input type="hidden" name="_canal" value={base.canal ?? ""} /><input type="hidden" name="_familia" value={base.familia ?? ""} /><input type="hidden" name="_donde" value={base.donde ?? ""} /></>;
  const camposVuelta = { _canal: String(base.canal ?? ""), _familia: base.familia ?? "", _donde: String(base.donde ?? "") };
  const editando = Number(sp.editar) || 0;
  const elegirDestino = (props: { name: string; valor: number | null; form?: string }) => (
    <select name={props.name} defaultValue={props.valor ?? ""} form={props.form} className={`${CAMPO} w-full`}>
      <option value="">Todas las tiendas</option>
      {destinos.map((d) => <option key={d.id} value={d.id}>{d.nombre}{d.principal ? " (principal)" : ""} · {d.dominio}</option>)}
    </select>
  );

  return (
    <Pantalla titulo="Banners de la tienda" subtitulo="Las imágenes grandes de arriba de la portada: dos familias que se turnan cada 12 horas" ancho="max-w-5xl"
      acciones={tienda && <BotonNuevo texto="Nuevo banner" />}>
      <Avisos sp={sp} />
      {!tienda ? (
        <div className={CAJA}><p className="text-xs">Todavía no hay una tienda web. Creala en <Link href="/config/tienda" className="text-[#16577F] underline">Configuración → Tienda web</Link>.</p></div>
      ) : (
        <>
          <AltaNueva texto="Nuevo banner" sinBoton>
            <form action={accionAgregarBanners} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start text-xs">
              <input type="hidden" name="canal_id" value={tienda.id} />{vuelta}
              <div className="sm:col-span-3"><span className={ETIQUETA}>Imágenes (podés elegir varias: cada una queda como un banner)</span>
                <SubirVarias name="imagen" organizacionId={s.org.id} />
                <span className="block text-[11px] text-[#5C6B76] mt-1">Para la compu, 1920 × 420 (se ve entera, a todo el ancho). Para el celular, 1200 × 400, en «Imagen para el celular» al editar el banner (sin ella, el celular usa la misma). El último cuarto de abajo, sin texto: se funde con el fondo y la primera fila de productos sube encima.</span></div>
              <label><span className={ETIQUETA}>Familia</span>
                <select name="familia" defaultValue={familia} className={`${CAMPO} w-full`}>
                  {(Object.keys(FAMILIAS) as FamiliaBanner[]).map((f) => <option key={f} value={f}>{FAMILIAS[f]}</option>)}
                </select></label>
              <label><span className={ETIQUETA}>Se ve en</span>{elegirDestino({ name: "dominio_id", valor: donde })}</label>
              <label><span className={ETIQUETA}>Link (vacío: no lleva a ningún lado)</span>
                <input name="link" placeholder="/buscar?ofertas=1 o https://…" className={`${CAMPO} w-full`} /></label>
              <div className="sm:col-span-3"><BotonEnviar clase={PRIMARIO} corriendo="Agregando…">Agregar banners</BotonEnviar></div>
            </form>
          </AltaNueva>

          {tiendas.length > 1 && (
            <div className="flex gap-2 mb-3 text-xs">
              {tiendas.map((t) => <Link key={t.id} href={`/config/tienda/banners?canal=${t.id}`} className={`rounded-lg border px-3 py-1.5 ${t.id === tienda.id ? "bg-[#16577F] text-white border-[#16577F]" : "bg-white border-[#E3E9F0]"}`}>{t.nombre}</Link>)}
            </div>
          )}

          <div className={`${CAJA} text-xs mb-4`}>
            Ahora se ve la familia <b>{FAMILIAS[turno.familia]}</b>, hasta el {hora(turno.hasta)} h; después, la <b>{FAMILIAS[otra]}</b>.
            <span className="block text-[11px] text-[#5C6B76] mt-0.5">Se turnan a las 0 y a las 12 (hora argentina). Cada lunes se invierte cuál va a la mañana y cuál a la tarde. Si a la del turno no le queda ningún banner activo para esa tienda, se ve la otra.</span>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-2">
            <Pestanas className="mb-0 grow" items={(Object.keys(FAMILIAS) as FamiliaBanner[]).map((f) => ({
              href: aca({ familia: f, editar: null }), activa: f === familia, clave: f,
              texto: <>{FAMILIAS[f]}{f === turno.familia && <span className="ml-1 font-normal text-[#167655]">· al aire</span>}</>,
              cuenta: todos.filter((b) => b.familia === f && (donde == null || b.dominio_id == null || b.dominio_id === donde)).length,
            }))} />
            {destinos.length > 0 && <div className="pb-1"><FiltroDonde clase={CAMPO} valor={donde ? String(donde) : ""} opciones={destinos.map((d) => ({ valor: String(d.id), texto: `${d.nombre}${d.principal ? " (principal)" : ""}` }))} /></div>}
          </div>

          <div className={`${CAJA_TABLA} rounded-tl-none`}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH} title="Orden en que pasan">N.º</th>
                  <th className={TH}>Imagen</th>
                  <th className={TH} title="Imagen para el celular (vacía: la misma)">Celular</th>
                  <th className={TH}>Se ve en</th>
                  <th className={TH}>Link</th>
                  <th className={TH}>Activo</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>
                    Sin banners en la familia {FAMILIAS[familia]}{donde ? " para esa tienda" : ""}. En su turno se ve la otra familia{todos.length ? "" : " (y sin ninguna, la portada muestra el nombre y la bajada de la tienda)"}.
                  </td></tr>
                )}
                {filas.map((b, i) => {
                  const form = `banner-${b.id}`;
                  if (b.id === editando) return (
                    <tr key={b.id} className={`${TR} align-top bg-[#FAFBFC]`}>
                      <td className={`${TDN} text-[#5C6B76]`}>
                        <form id={form} action={accionGuardarBanner}><input type="hidden" name="id" value={b.id} />{vuelta}</form>{i + 1}
                      </td>
                      <td className={`${TD} min-w-52`}><SubirImagen name="imagen" valor={b.imagen} organizacionId={s.org.id} etiqueta="Imagen" alto="h-12" form={form} /></td>
                      <td className={`${TD} min-w-52`}><SubirImagen name="imagen_celular" valor={b.imagen_celular} organizacionId={s.org.id} etiqueta="Imagen para el celular" alto="h-12" form={form} /></td>
                      <td className={`${TD} w-56 space-y-1`}>
                        {elegirDestino({ name: "dominio_id", valor: b.dominio_id, form })}
                        <label className="block"><span className={ETIQUETA}>Familia</span>
                          <select name="familia" defaultValue={b.familia} form={form} className={`${CAMPO} w-full`}>
                            {(Object.keys(FAMILIAS) as FamiliaBanner[]).map((f) => <option key={f} value={f}>{FAMILIAS[f]}</option>)}
                          </select></label>
                      </td>
                      <td className={TD}><input name="link" form={form} defaultValue={b.link ?? ""} placeholder="/buscar?ofertas=1 o https://…" className={`${CAMPO} w-full min-w-48`} /></td>
                      <td className={TD} />
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <span className="inline-flex gap-1">
                          <button form={form} className={PRIMARIO}>Grabar</button>
                          <Link href={aca()} scroll={false} className={SUAVE}>Cancelar</Link>
                        </span>
                      </td>
                    </tr>
                  );
                  return (
                    <tr key={b.id} className={`${TR} ${b.activo ? "" : "opacity-60"}`}>
                      <td className={`${TDN} text-[#5C6B76]`}>{i + 1}</td>
                      <td className={TD}>
                        <a href={b.imagen} target="_blank" rel="noreferrer" title="Ver la imagen entera ↗">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.imagen} alt="" className={MINIATURA} />
                        </a>
                      </td>
                      <td className={TD}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {b.imagen_celular ? <img src={b.imagen_celular} alt="" className={MINIATURA} /> : <span className="text-[#5C6B76]">La misma</span>}
                      </td>
                      <td className={TD}>{nombreDestino(b.dominio_id)}</td>
                      <td className={`${TD} max-w-56 truncate`} title={b.link ?? undefined}>
                        {b.link ? b.link.startsWith("/") ? b.link : <a href={b.link} target="_blank" rel="noreferrer" className="text-[#16577F]">{b.link.replace(/^https?:\/\//, "")} ↗</a>
                          : <span className="text-[#5C6B76]">Sin link</span>}
                      </td>
                      <td className={TD}>
                        <Interruptor compacto accion={accionActivarBanner} prendido={b.activo} campos={{ id: String(b.id), ...camposVuelta }} etiqueta={b.activo ? "Sí" : "No"} />
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <span className="inline-flex items-center gap-1">
                          {(["-1", "1"] as const).map((paso) => (
                            <form key={paso} action={accionMoverBanner} className="inline">
                              <input type="hidden" name="id" value={b.id} /><input type="hidden" name="paso" value={paso} />{vuelta}
                              <button className={FLECHA} disabled={paso === "-1" ? i === 0 : i === filas.length - 1} aria-label={paso === "-1" ? "Subir" : "Bajar"} title={paso === "-1" ? "Subir un lugar" : "Bajar un lugar"}>{paso === "-1" ? "▲" : "▼"}</button>
                            </form>
                          ))}
                          <Lapiz href={aca({ editar: b.id })} />
                          <TachoConfirmar accion={accionBorrarBanner} campos={{ id: String(b.id), ...camposVuelta }} pregunta="¿Borrar?" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {donde != null && filas.length > 1 && <p className="text-[11px] text-[#5C6B76] mt-1">Con «Se ven en» elegido, ▲ ▼ mueven el banner entre todos los de la familia (también los que no se ven en esa tienda).</p>}
        </>
      )}
    </Pantalla>
  );
}
