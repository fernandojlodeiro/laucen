// Medios de pago de la tienda (valen para todas las tiendas de la
// organización: canal_id null). Los cinco existen siempre: si falta alguno se
// crea apagado al abrir la pantalla. Las credenciales de Mercado Pago y
// Payway van aparte y nunca se muestran enteras.

import Link from "next/link";
import { consulta, enTransaccion } from "@/lib/erp/base";
import { VERDE, SUAVE } from "@/app/botones";
import { Interruptor } from "@/app/radar/Piezas";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Dato, BotonesFicha, editandoFicha, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { TIPOS_MEDIO, type TipoMedio } from "./comun";
import { accionActivarMedio, accionGuardarMedio, accionGuardarCredencial } from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/medios-pago";
type SP = { editar?: string; ok?: string; error?: string };
type Medio = { id: number; tipo: TipoMedio; nombre: string; activo: boolean; descuento_pct: number; instrucciones: string | null; orden: number; datos: Record<string, string> | null };

/** Crea apagados los medios que falten (con candado: dos pantallas abiertas a la vez no los duplican). */
async function asegurarMedios(org: string) {
  const tipos = Object.entries(TIPOS_MEDIO);
  await enTransaccion(async (c) => {
    await c.query("select pg_advisory_xact_lock(hashtext('medio_pago:' || $1))", [org]);
    await c.query(`
      insert into medio_pago (organizacion_id, canal_id, tipo, nombre, orden)
      select $1, null, t.tipo, t.nombre, t.orden from unnest($2::text[], $3::text[]) with ordinality t(tipo, nombre, orden)
       where not exists (select 1 from medio_pago m where m.organizacion_id = $1 and m.canal_id is null and m.tipo = t.tipo)`,
      [org, tipos.map(([k]) => k), tipos.map(([, v]) => v.nombre)]);
  });
}

/** "cargado (termina en …1234)" o "sin cargar": el secreto nunca entero. */
const mascara = (v?: string) => (v ? `cargado (termina en …${v.slice(-4)})` : "sin cargar");

export default async function MediosPago({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("medios_pago_ver");
  const sp = await searchParams;
  const editar = Number(sp.editar) || 0;
  await asegurarMedios(s.org.id);
  const medios = await consulta<Medio>(`
    select m.id::int, m.tipo, m.nombre, m.activo, m.descuento_pct::float, m.instrucciones, m.orden, c.datos
      from medio_pago m left join medio_pago_credencial c on c.medio_pago_id = m.id
     where m.organizacion_id = $1 and m.canal_id is null order by m.orden, m.id`, [s.org.id]);
  const mp = medios.find((m) => m.tipo === "mercadopago");
  const pw = medios.find((m) => m.tipo === "payway");
  const pct = (n: number) => `${n.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

  return (
    <Pantalla titulo="Medios de pago" subtitulo="Cómo puede pagar el comprador en la tienda web. Valen para todas las tiendas." ancho="max-w-5xl">
      <Avisos sp={sp} />
      <div className={`${CAJA_TABLA} mb-5`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Medio</th><th className={TH}>Activo</th><th className={THN}>Descuento</th><th className={TH}>Instrucciones para el comprador</th><th className={THN}>Orden</th><th /></tr>
          </thead>
          <tbody>
            {medios.map((m) => editar === m.id ? (
              <tr key={m.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={6} className={TD}>
                  <form action={accionGuardarMedio} className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_5rem] gap-2 items-start">
                    <input type="hidden" name="id" value={m.id} />
                    <label><span className={ETIQUETA}>Nombre que ve el comprador</span>
                      <input name="nombre" defaultValue={m.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                    <label><span className={ETIQUETA}>Descuento %</span>
                      <CampoNumero name="descuento_pct" valor={m.descuento_pct} tipo="pct" className={`${CAMPO} w-full`} /></label>
                    <label><span className={ETIQUETA}>Orden</span>
                      <CampoNumero name="orden" valor={m.orden} tipo="entero" className={`${CAMPO} w-full`} /></label>
                    <label className="sm:col-span-3"><span className={ETIQUETA}>Instrucciones (lo que ve el comprador al elegirlo)</span>
                      <textarea name="instrucciones" defaultValue={m.instrucciones ?? ""} rows={3} className={`${CAMPO} w-full`}
                        placeholder={m.tipo === "transferencia" ? "CBU: …\nAlias: …\nTitular: … · CUIT: …" : ""} /></label>
                    <p className="sm:col-span-3 text-[11px] text-[#5C6B76]">Descuento negativo = recargo (ej. -10 = 10 % más caro). {TIPOS_MEDIO[m.tipo].ayuda}</p>
                    <div className="sm:col-span-3 flex gap-2">
                      <button className={VERDE}>Guardar</button>
                      <Link href={BASE} className={SUAVE} scroll={false}>Cancelar</Link>
                    </div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={m.id} className={TR}>
                <td className={TD}><span className="font-semibold">{m.nombre}</span>
                  <span className="block text-[11px] text-[#5C6B76] max-w-xs">{TIPOS_MEDIO[m.tipo].ayuda}</span></td>
                <td className={TD}><Interruptor accion={accionActivarMedio} prendido={m.activo} campos={{ id: String(m.id) }} etiqueta={m.activo ? "Sí" : "No"} /></td>
                <td className={TDN}>{m.descuento_pct === 0 ? "—" : m.descuento_pct < 0 ? `recargo ${pct(-m.descuento_pct)}` : pct(m.descuento_pct)}</td>
                <td className={`${TD} whitespace-pre-wrap text-[#5C6B76]`}>{m.instrucciones ?? "—"}</td>
                <td className={TDN}>{m.orden}</td>
                <td className={`${TD} text-right`}><Lapiz href={`${BASE}?editar=${m.id}`} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold mb-2">Credenciales</h2>
      <p className="text-[11px] text-[#5C6B76] mb-2">Nunca se muestran enteras. Se cambian con el lápiz de cada una: escribí la nueva; un campo vacío deja la que estaba.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mp && (() => {
          const editando = editandoFicha(sp, "mercadopago");
          const cuerpo = (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold">Mercado Pago</h3>
                <span className="inline-flex gap-2">
                  <BotonesFicha editando={editando} ver={BASE} editar={`${BASE}?editar=mercadopago`} form="ficha-mercadopago" />
                </span>
              </div>
              <p className="text-[11px] text-[#5C6B76]">{TIPOS_MEDIO.mercadopago.ayuda}</p>
              {editando ? (
                <>
                  <label><span className={ETIQUETA}>Access token de producción · {mascara(mp.datos?.access_token)}</span>
                    <input name="access_token" autoComplete="off" placeholder="APP_USR-…" className={`${CAMPO} w-full font-mono`} autoFocus /></label>
                  <label><span className={ETIQUETA}>Public key · {mascara(mp.datos?.public_key)}</span>
                    <input name="public_key" autoComplete="off" placeholder="APP_USR-…" className={`${CAMPO} w-full font-mono`} /></label>
                </>
              ) : (
                <>
                  <Dato etiqueta="Access token de producción">{mascara(mp.datos?.access_token)}</Dato>
                  <Dato etiqueta="Public key">{mascara(mp.datos?.public_key)}</Dato>
                </>
              )}
            </>
          );
          return editando ? (
            <form id="ficha-mercadopago" action={accionGuardarCredencial} className={`${CAJA} grid gap-2 content-start`}>
              <input type="hidden" name="id" value={mp.id} />
              {cuerpo}
            </form>
          ) : <div className={`${CAJA} grid gap-2 content-start`}>{cuerpo}</div>;
        })()}
        {pw && (() => {
          const editando = editandoFicha(sp, "payway");
          const cuerpo = (
            <>
              <div className="col-span-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold">Payway (tarjetas)</h3>
                <span className="inline-flex gap-2">
                  <BotonesFicha editando={editando} ver={BASE} editar={`${BASE}?editar=payway`} form="ficha-payway" />
                </span>
              </div>
              <p className="col-span-2 text-[11px] text-[#5C6B76]">{TIPOS_MEDIO.payway.ayuda}</p>
              {editando ? (
                <>
                  <label className="col-span-2"><span className={ETIQUETA}>Llave pública · {mascara(pw.datos?.public_key)}</span>
                    <input name="public_key" autoComplete="off" className={`${CAMPO} w-full font-mono`} autoFocus /></label>
                  <label className="col-span-2"><span className={ETIQUETA}>Llave privada · {mascara(pw.datos?.private_key)}</span>
                    <input name="private_key" autoComplete="off" className={`${CAMPO} w-full font-mono`} /></label>
                  <label><span className={ETIQUETA}>Site id · {mascara(pw.datos?.site_id)}</span>
                    <input name="site_id" autoComplete="off" className={`${CAMPO} w-full font-mono`} /></label>
                  <label><span className={ETIQUETA}>Ambiente</span>
                    <select name="ambiente" defaultValue={pw.datos?.ambiente ?? "sandbox"} className={`${CAMPO} w-full`}>
                      <option value="sandbox">Prueba (sandbox)</option><option value="produccion">Producción</option>
                    </select></label>
                </>
              ) : (
                <>
                  <Dato etiqueta="Llave pública" className="col-span-2">{mascara(pw.datos?.public_key)}</Dato>
                  <Dato etiqueta="Llave privada" className="col-span-2">{mascara(pw.datos?.private_key)}</Dato>
                  <Dato etiqueta="Site id">{mascara(pw.datos?.site_id)}</Dato>
                  <Dato etiqueta="Ambiente">{pw.datos?.ambiente === "produccion" ? "Producción" : "Prueba (sandbox)"}</Dato>
                </>
              )}
            </>
          );
          return editando ? (
            <form id="ficha-payway" action={accionGuardarCredencial} className={`${CAJA} grid grid-cols-2 gap-2 content-start`}>
              <input type="hidden" name="id" value={pw.id} />
              {cuerpo}
            </form>
          ) : <div className={`${CAJA} grid grid-cols-2 gap-2 content-start`}>{cuerpo}</div>;
        })()}
      </div>
    </Pantalla>
  );
}
