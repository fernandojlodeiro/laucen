// Precios en Mercado Libre (Fer, 3/10): las reglas de cada cuenta (canal).
// La Clásica es el único precio que pone Fer; de ella salen el tachado, el
// precio de cada plan de cuotas (con la comisión real de la categoría y un
// margen extra) y el descuento por volumen. Todo general → categoría →
// producto. Los cambios se ven en la vista previa y salen a ML sólo con el
// clic de Fer (o con "Sincronizar precios" prendido).

import Link from "next/link";
import { VERDE, SUAVE, PRIMARIO } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { Paginado } from "@/app/componentes/Lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, Dato, TituloSeccion, BotonesFicha, editandoFicha, url,
  CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA,
} from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import { fechaHora } from "@/app/ventas/formato";
import { formatear } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import { paginarEnMemoria } from "@/lib/lista";
import { comisionesMl, reglasCanal, excepcionesCanal, volumenCanal, alertasCanal, type CanalMl, type Excepcion, type RangoVolumen } from "@/lib/precios-ml/datos";
import { PLANES, PLAN_INFO, precioPlan, descuentoComprador, type Plan, type ReglasPlan } from "@/lib/precios-ml/motor";
import { BarraPml, type VerPml } from "./comun";
import { BASE_PML, PREVIA, LISTA_EXCEPCIONES_ML, LISTA_VOLUMEN_ML, canalElegido, textoEscalones } from "./lista";
import {
  accionGuardarGeneral, accionGuardarExcepcion, accionBorrarExcepcion, accionGuardarVolumen, accionBorrarVolumen, accionReplicarVolumen, accionInterruptor,
} from "./acciones";

export const dynamic = "force-dynamic";

type SP = { canal?: string; ver?: string; editar?: string; nuevo?: string; q?: string; contiene?: string; p?: string; ok?: string; error?: string };

const pesos = (v: number | null | undefined) => (v == null ? null : formatear(v, "ARS"));
const pct = (v: number | null | undefined) => (v == null ? null : `${formatearNumero(v, "pct")} %`);

export default async function PreciosMl({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("precios_ml_ver");
  const sp = await searchParams;
  const { canales, canal } = await canalElegido(s.org.id, sp);
  if (!canal) {
    return (
      <Pantalla titulo="Precios en Mercado Libre">
        <p className="text-xs text-[#5C6B76]">Todavía no hay ningún canal de Mercado Libre. Crealo en <Link href="/config/canales" className="text-[#16577F] hover:underline">Configuración → Canales</Link> y conectale la cuenta.</p>
      </Pantalla>
    );
  }
  const ver: VerPml = sp.ver === "excepciones" || sp.ver === "volumen" || sp.ver === "alertas" ? sp.ver : "general";
  const aqui = url(BASE_PML, { canal: canal.id, ver: ver === "general" ? null : ver, q: sp.q, contiene: sp.contiene, p: sp.p });
  const editando = editandoFicha(sp);
  const extra = { canal: String(canal.id) };

  const acciones = ver === "general"
    ? <><Link href={url(PREVIA, { canal: canal.id })} className={SUAVE}>Vista previa</Link>
        <BotonesFicha editando={editando} ver={url(BASE_PML, { canal: canal.id })} editar={url(BASE_PML, { canal: canal.id, editar: "ficha" })} /></>
    : ver === "excepciones" ? <><AccionesExcel lista={LISTA_EXCEPCIONES_ML} org={s.org.id} extra={extra} /><BotonNuevo texto="Nueva excepción" /></>
    : ver === "volumen" ? <><AccionesExcel lista={LISTA_VOLUMEN_ML} org={s.org.id} extra={extra} /><BotonNuevo texto="Nuevo rango" /></>
    : undefined;

  return (
    <Pantalla titulo="Precios en Mercado Libre" acciones={acciones}
      subtitulo="La Clásica es el único precio que ponés vos; de ella salen el tachado, el precio de cada plan de cuotas y el descuento por volumen. Todo por cuenta y, adentro, general → categoría → producto (gana lo más específico).">
      <Avisos sp={sp} />
      <BarraPml org={s.org.id} canales={canales} canal={canal} ver={ver} />
      {ver === "general" ? <General org={s.org.id} canal={canal} editando={editando} aqui={aqui} />
        : ver === "excepciones" ? <Excepciones org={s.org.id} canal={canal} sp={sp} aqui={aqui} />
        : ver === "volumen" ? <Volumen org={s.org.id} canal={canal} sp={sp} aqui={aqui} />
        : <Alertas org={s.org.id} canal={canal} />}
    </Pantalla>
  );
}

// ── Tachado y planes (lo general del canal) ─────────────────

async function General({ org, canal, editando, aqui }: { org: string; canal: CanalMl; editando: boolean; aqui: string }) {
  const [reglas, com] = await Promise.all([reglasCanal(org, canal), comisionesMl()]);
  const tachado = reglas.tachado.find((t) => t.nivel === "general")?.tachado_pct ?? 0;
  const ajusteClasica = reglas.tachado.find((t) => t.nivel === "general")?.ajuste_pct ?? null;
  const plan = (p: Plan): Partial<ReglasPlan> => reglas.planes.find((x) => x.nivel === "general" && x.plan === p) ?? {};
  const g = com.general;
  const ejemplo = 10_000;
  const campos = (clave: string) => ({ canal: String(canal.id), clave, volver: aqui });
  return (
    <div className="grid gap-4">
      <section className={CAJA}>
        <TituloSeccion titulo="Tachado y planes de cuotas (general de la cuenta)" />
        {!editando ? (
          <Dato etiqueta="Tachado %" numero className="max-w-[220px]"
            ayuda="La publicación va a Clásica + este %; una campaña la baja a la Clásica al día siguiente. ML pide al menos 5 % de descuento (un tachado de 5,3 % o más).">
            {pct(tachado)}{Number(tachado) > 0 ? ` (el comprador ve −${formatearNumero(descuentoComprador(Number(tachado)), "pct")} %)` : ""}
          </Dato>
        ) : null}
        <form id="ficha" action={accionGuardarGeneral}>
          <input type="hidden" name="canal" value={canal.id} /><input type="hidden" name="volver" value={aqui} />
          {editando && (
            <label className="block max-w-[220px] mb-3"><span className={ETIQUETA}>Tachado %</span>
              <CampoNumero name="tachado_pct" valor={tachado} tipo="pct" className={`${CAMPO} w-full`} />
              <span className="block text-[10px] text-[#5C6B76] mt-0.5">Clásica + este %. ML pide ≥ 5 % de descuento (tachado de 5,3 % o más).
                {Number(tachado) > 0 && <> Hoy {pct(tachado)} = el comprador ve −{formatearNumero(descuentoComprador(Number(tachado)), "pct")} %.</>}</span>
            </label>
          )}
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Plan</th><th className={TH}>Activo</th><th className={THN}>Desde una Clásica de</th><th className={THN}>Margen extra</th>
                  <th className={THN}>Cuotas que ve el comprador</th><th className={THN}>¿Gana? (si no, +%)</th><th className={THN}>Comisión (promedio)</th><th className={THN}>Con una Clásica de {formatear(ejemplo, "ARS")}</th>
                </tr>
              </thead>
              <tbody>
                <tr className={TR}>
                  <td className={TD}>{PLAN_INFO.clasica.nombre}</td><td className={TD}><Estado texto="Siempre" tono="verde" /></td>
                  <td className={TDN}>—</td><td className={TDN}>—</td><td className={TDN}>—</td>
                  <td className={editando ? TD : TDN}>{editando
                    ? <CampoNumero name="clasica_ajuste" valor={ajusteClasica} tipo="pct" placeholder="0 = gana" className={`${CAMPO} w-20`} />
                    : gana(ajusteClasica)}</td>
                  <td className={TDN}>{pct(g.clasica)}</td>
                  <td className={TDN}>{formatear(ejemplo, "ARS")} (tachado {formatear(Math.round(ejemplo * (1 + Number(tachado) / 100)), "ARS")})</td>
                </tr>
                {PLANES.map((p) => {
                  const r = plan(p);
                  return (
                    <tr key={p} className={TR}>
                      <td className={TD}>{PLAN_INFO[p].nombre}</td>
                      {editando ? (
                        <>
                          <td className={TD}><input type="checkbox" name={`${p}_activo`} defaultChecked={!!r.activo} aria-label={`${PLAN_INFO[p].nombre} activo`} className="h-4 w-4 accent-[#16577F]" /></td>
                          <td className={TD}><CampoNumero name={`${p}_min`} valor={r.precio_minimo ?? null} tipo="pesos" placeholder="sin mínimo" className={`${CAMPO} w-28`} /></td>
                          <td className={TD}><CampoNumero name={`${p}_margen`} valor={r.margen_pct ?? null} tipo="pct" placeholder="0" className={`${CAMPO} w-20`} /></td>
                          <td className={TD}><CampoNumero name={`${p}_cuotas`} valor={r.cuotas_visibles ?? null} tipo="entero" placeholder={String(PLAN_INFO[p].cuotas)} className={`${CAMPO} w-16`} /></td>
                          <td className={TD}><CampoNumero name={`${p}_ajuste`} valor={r.ajuste_pct ?? null} tipo="pct" placeholder="0 = gana" className={`${CAMPO} w-20`} /></td>
                        </>
                      ) : (
                        <>
                          <td className={TD}>{r.activo ? <Estado texto="Sí" tono="verde" /> : <Estado texto="No" />}</td>
                          <td className={TDN}>{pesos(r.precio_minimo) ?? "sin mínimo"}</td>
                          <td className={TDN}>{pct(r.margen_pct) ?? "0 %"}</td>
                          <td className={TDN}>{r.cuotas_visibles ?? PLAN_INFO[p].cuotas}</td>
                          <td className={TDN}>{gana(r.ajuste_pct)}</td>
                        </>
                      )}
                      <td className={TDN}>{pct(g[p])}</td>
                      <td className={TDN}>{formatear(Math.round(precioPlan(ejemplo, g.clasica, g[p], Number(r.margen_pct ?? 0)) * (1 + Number(r.ajuste_pct ?? 0) / 100)), "ARS")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
        <p className="text-[11px] text-[#5C6B76] mt-2">
          Precio de cada plan = Clásica × (1 − comisión de la Clásica) ÷ (1 − comisión del plan) × (1 + margen extra): deja lo mismo que la Clásica más el margen.
          La comisión es la real de la categoría de cada publicación (la releva Costos ML todos los días: {com.porCategoria.size} categorías); si una no está, el promedio de arriba.
          Entre los planes activos, el que mejor cierra con el precio para ganar de ML queda <b>destacado</b>: va a ese precio y en las mismas campañas que la Clásica (recuadro «En cuotas»); los demás quedan a su precio.
          Si dos planes se ven con las mismas cuotas, la vista previa avisa (manda lo que ve el comprador).
          <b> ¿Gana?</b>: entre tus cuentas, una sola «gana» cada precio (la Clásica y cada plan) y las demás van un % más caras para no competir entre ellas (0 o vacío = gana; 3 = no gana, va 3 % arriba). Se puede cambiar por categoría o producto en Excepciones.
        </p>
      </section>

      <section className={CAJA}>
        <TituloSeccion titulo="Interruptores de la cuenta" />
        <div className="grid gap-3">
          <Interruptor accion={accionInterruptor} prendido={canal.sincronizarPrecios} campos={campos("sincronizar_precios")}
            etiqueta="Sincronizar precios: Laucen manda solo los precios a esta cuenta"
            ayuda={canal.sincronizarPrecios
              ? "Prendido: cuando cambia la Clásica, el stock o una regla, se recalcula y va a la cola de ML sin esperar tu clic (las publicaciones nuevas de planes siempre esperan tu clic)."
              : "Apagado (así arranca): nada sale solo. Los cambios se preparan en la vista previa y salen cuando apretás «Mandar a Mercado Libre»."} />
          <Interruptor accion={accionInterruptor} prendido={canal.leerPrecioGanar} campos={campos("leer_precio_ganar")}
            etiqueta="Leer el precio para ganar y las campañas"
            ayuda="Sólo lectura: cada 6 horas el precio para ganar de las publicaciones de catálogo (cada hora las destacadas, con alerta si dejan de ganar) y cada 12 horas las campañas de cada publicación." />
          <Interruptor accion={accionInterruptor} prendido={canal.reglaStock} campos={campos("volumen_regla_stock")}
            etiqueta="Descuento por volumen: un escalón sólo si hay stock para su cantidad" />
        </div>
      </section>
    </div>
  );
}

// ── Excepciones por categoría o producto ────────────────────

/** «¿Quién gana?»: 0 o vacío = gana; si no, cuánto más cara va esta cuenta. */
function gana(a: number | null | undefined) {
  return !a ? <Estado texto="Gana" tono="verde" /> : <span>no gana, +{formatearNumero(a, "pct")} %</span>;
}

const PLAN_CORTO = (p: Plan) => PLAN_INFO[p].corto;

function resumenPlan(x: Excepcion["planes"][string] | undefined): string {
  if (!x || (x.activo == null && x.min == null && x.margen == null && x.ajuste == null)) return "hereda";
  const partes = [x.activo == null ? null : x.activo ? "activo" : "apagado", x.min != null ? `desde ${formatear(x.min, "ARS")}` : null, x.margen != null ? `margen ${formatearNumero(x.margen, "pct")} %` : null,
    x.ajuste == null ? null : x.ajuste === 0 ? "gana" : `no gana: +${formatearNumero(x.ajuste, "pct")} %`];
  return partes.filter(Boolean).join(" · ");
}

function CamposExcepcion({ e }: { e?: Excepcion }) {
  return (
    <>
      <label><span className={ETIQUETA}>Tachado %</span>
        <CampoNumero name="tachado_pct" valor={e?.tachado_pct ?? null} tipo="pct" placeholder="hereda" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Clásica: ¿gana? (si no, +%)</span>
        <CampoNumero name="clasica_ajuste" valor={e?.ajuste_pct ?? null} tipo="pct" placeholder="hereda" className={`${CAMPO} w-full`} />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">0 = gana · vacío = hereda</span></label>
      <span className="hidden sm:block" />
      {PLANES.map((p) => (
        <fieldset key={p} className="border border-[#E3E9F0] rounded-lg p-2 grid grid-cols-2 gap-1.5">
          <legend className="text-[11px] font-semibold text-[#5C6B76] px-1">{PLAN_INFO[p].nombre}</legend>
          <label><span className={ETIQUETA}>Activo</span>
            <select name={`${p}_activo`} defaultValue={e?.planes[p]?.activo == null ? "" : e.planes[p].activo ? "si" : "no"} className={`${CAMPO} w-full`}>
              <option value="">Hereda</option><option value="si">Sí</option><option value="no">No</option>
            </select></label>
          <label><span className={ETIQUETA}>Desde Clásica</span>
            <CampoNumero name={`${p}_min`} valor={e?.planes[p]?.min ?? null} tipo="pesos" placeholder="hereda" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>Margen %</span>
            <CampoNumero name={`${p}_margen`} valor={e?.planes[p]?.margen ?? null} tipo="pct" placeholder="hereda" className={`${CAMPO} w-full`} /></label>
          <label><span className={ETIQUETA}>¿Gana? (si no, +%)</span>
            <CampoNumero name={`${p}_ajuste`} valor={e?.planes[p]?.ajuste ?? null} tipo="pct" placeholder="hereda" className={`${CAMPO} w-full`} /></label>
        </fieldset>
      ))}
    </>
  );
}

async function Excepciones({ org, canal, sp, aqui }: { org: string; canal: CanalMl; sp: SP; aqui: string }) {
  const todas = await (LISTA_EXCEPCIONES_ML.filas!({ org, moneda: "ARS" }, sp) as Promise<Excepcion[]>);
  const vista = paginarEnMemoria(todas, sp);
  const total = sp.q ? (await excepcionesCanal(org, canal.id)).length : todas.length;
  const base = { canal: String(canal.id), volver: aqui };
  return (
    <>
      <AltaNueva texto="Nueva excepción" sinBoton>
        <form action={accionGuardarExcepcion} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
          <input type="hidden" name="canal" value={canal.id} /><input type="hidden" name="volver" value={aqui} />
          <label><span className={ETIQUETA}>Aplica a</span>
            <select name="nivel" defaultValue="familia" className={`${CAMPO} w-full`}><option value="familia">Una categoría (y sus subcategorías)</option><option value="producto">Un producto</option></select></label>
          <div><span className={ETIQUETA}>Categoría</span><ElegirFamilia name="familia_id" vacio="Elegí la categoría" /></div>
          <label><span className={ETIQUETA}>o el SKU del producto</span><input name="sku" className={`${CAMPO} w-full font-mono`} placeholder="Si aplica a un producto" /></label>
          <CamposExcepcion />
          <div className="sm:col-span-3"><button className={PRIMARIO}>Crear</button></div>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={sp.q ?? ""} comienza={sp.contiene !== "1"} placeholder="Buscar categoría o SKU" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr><th className={TH}>Aplica a</th><th className={TH}>Categoría o producto</th><th className={THN}>Tachado</th>
              {PLANES.map((p) => <th key={p} className={TH}>{PLAN_CORTO(p)}</th>)}<th /></tr>
          </thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>{sp.q ? "Ninguna coincide." : `Sin excepciones: todo ${canal.nombre} usa lo general.`}</td></tr>}
            {vista.map((e) => sp.editar === e.clave ? (
              <tr key={e.clave} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={8} className={TD}>
                  <p className="text-xs font-bold mb-2">{e.nivel === "familia" ? "Categoría" : "Producto"} {e.sku ? `${e.sku} · ` : ""}{e.nombre}</p>
                  <form action={accionGuardarExcepcion} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
                    <input type="hidden" name="canal" value={canal.id} /><input type="hidden" name="volver" value={aqui} /><input type="hidden" name="excepcion" value={e.clave} />
                    <CamposExcepcion e={e} />
                    <div className="sm:col-span-3 flex gap-2"><button className={VERDE}>Guardar</button><Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link></div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={e.clave} className={TR}>
                <td className={TD}>{e.nivel === "familia" ? "Categoría" : "Producto"}</td>
                <td className={TD}>
                  {e.nivel === "familia"
                    ? <Link href={url("/catalogo/productos", { familia: e.familia_id })} className="text-[#16577F] hover:underline">{e.nombre}</Link>
                    : <><Link href={`/catalogo/productos/${e.producto_id}`} className="font-mono text-[#16577F] hover:underline">{e.sku}</Link> {e.nombre}</>}
                </td>
                <td className={TDN}>{e.tachado_pct != null ? <>{pct(e.tachado_pct)}{e.tachado_pct > 0 && <div className="text-[10px] text-[#5C6B76]">comprador −{formatearNumero(descuentoComprador(e.tachado_pct), "pct")} %</div>}</> : <span className="text-[#5C6B76]">hereda</span>}
                  {e.ajuste_pct != null && <div className="text-[10px] text-[#5C6B76]">Clásica: {e.ajuste_pct === 0 ? "gana" : `no gana, +${formatearNumero(e.ajuste_pct, "pct")} %`}</div>}</td>
                {PLANES.map((p) => <td key={p} className={`${TD} text-[11px]`}>{resumenPlan(e.planes[p])}</td>)}
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE_PML, { canal: canal.id, ver: "excepciones", q: sp.q, contiene: sp.contiene, p: sp.p, editar: e.clave })} />
                    <TachoConfirmar accion={accionBorrarExcepcion} campos={{ ...base, excepcion: e.clave }} pregunta="¿Borrar? Vuelve a heredar" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={todas.length} />
      <p className="text-[11px] text-[#5C6B76] mt-1">
        {total.toLocaleString("es-AR")} excepciones en {canal.nombre}. Vacío = hereda de la categoría de arriba (o de lo general). Una categoría vale también para sus subcategorías; un producto gana a su categoría.
      </p>
    </>
  );
}

// ── Descuento por volumen ───────────────────────────────────

function CamposVolumen({ r }: { r?: RangoVolumen }) {
  const esc = r?.escalones ?? [];
  return (
    <>
      <label><span className={ETIQUETA}>Clásica desde</span><CampoNumero name="desde" valor={r?.desde_precio ?? 0} tipo="pesos" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Clásica hasta</span><CampoNumero name="hasta" valor={r?.hasta_precio ?? null} tipo="pesos" placeholder="sin tope" className={`${CAMPO} w-full`} /></label>
      <label className="flex items-center gap-1.5 text-xs pt-4">
        <input type="checkbox" name="sin_descuento" defaultChecked={r?.sin_descuento ?? false} className="h-4 w-4 accent-[#16577F]" /> Sin descuento por volumen
      </label>
      <div className="sm:col-span-3 grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <fieldset key={i} className="border border-[#E3E9F0] rounded-lg p-1.5 grid grid-cols-2 gap-1">
            <legend className="text-[10px] font-semibold text-[#5C6B76] px-1">Escalón {i}</legend>
            <label><span className={ETIQUETA}>Desde u.</span><CampoNumero name={`cant${i}`} valor={esc[i - 1]?.cantidad ?? null} tipo="entero" className={`${CAMPO} w-full`} /></label>
            <label><span className={ETIQUETA}>% off</span><CampoNumero name={`pct${i}`} valor={esc[i - 1]?.pct ?? null} tipo="pct" className={`${CAMPO} w-full`} /></label>
          </fieldset>
        ))}
      </div>
    </>
  );
}

async function Volumen({ org, canal, sp, aqui }: { org: string; canal: CanalMl; sp: SP; aqui: string }) {
  const rangos = await volumenCanal(org, canal.id);
  const vista = paginarEnMemoria(rangos, sp);
  const editar = Number(sp.editar) || 0;
  const base = { canal: String(canal.id), volver: aqui };
  return (
    <>
      <AltaNueva texto="Nuevo rango" sinBoton>
        <form action={accionGuardarVolumen} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
          <input type="hidden" name="canal" value={canal.id} /><input type="hidden" name="volver" value={aqui} />
          <label><span className={ETIQUETA}>Aplica a</span>
            <select name="nivel" defaultValue="general" className={`${CAMPO} w-full`}>
              <option value="general">Toda la cuenta (general)</option><option value="familia">Una categoría (excepción)</option><option value="producto">Un producto (excepción)</option>
            </select></label>
          <div><span className={ETIQUETA}>Categoría</span><ElegirFamilia name="familia_id" vacio="Si aplica a una categoría" /></div>
          <label><span className={ETIQUETA}>o el SKU del producto</span><input name="sku" className={`${CAMPO} w-full font-mono`} placeholder="Si aplica a un producto" /></label>
          <CamposVolumen />
          <div className="sm:col-span-3"><button className={PRIMARIO}>Crear</button></div>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="max-w-xl">
          <Interruptor accion={accionInterruptor} prendido={canal.reglaStock} campos={{ ...base, clave: "volumen_regla_stock" }}
            etiqueta="Un escalón sólo si hay stock para su cantidad" />
        </div>
        <BotonConfirmar accion={accionReplicarVolumen} campos={base} clase={SUAVE} texto="Replicar en las demás cuentas"
          pregunta="¿Copiar esta tabla a las otras cuentas (reemplaza la suya)?" corriendo="Copiando…" />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>Aplica a</th><th className={THN}>Clásica desde</th><th className={THN}>Clásica hasta</th><th className={TH}>Escalones</th><th /></tr></thead>
          <tbody>
            {vista.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>Sin descuento por volumen en {canal.nombre}. Cargá un rango con «Nuevo rango».</td></tr>}
            {vista.map((r) => editar === r.id ? (
              <tr key={r.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={5} className={TD}>
                  <form action={accionGuardarVolumen} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-start">
                    <input type="hidden" name="canal" value={canal.id} /><input type="hidden" name="volver" value={aqui} /><input type="hidden" name="id" value={r.id} />
                    <CamposVolumen r={r} />
                    <div className="sm:col-span-3 flex gap-2"><button className={VERDE}>Guardar</button><Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link></div>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={r.id} className={TR}>
                <td className={TD}>{r.nivel === "general" ? "General"
                  : r.nivel === "familia" ? <>Categoría <Link href={url("/catalogo/productos", { familia: r.familia_id })} className="text-[#16577F] hover:underline">{r.nombre}</Link></>
                  : <>Producto <Link href={`/catalogo/productos/${r.producto_id}`} className="font-mono text-[#16577F] hover:underline">{r.sku}</Link></>}</td>
                <td className={TDN}>{formatear(r.desde_precio, "ARS")}</td>
                <td className={TDN}>{r.hasta_precio != null ? formatear(r.hasta_precio, "ARS") : "sin tope"}</td>
                <td className={TD}>{r.sin_descuento ? <Estado texto="Sin descuento" /> : textoEscalones(r.escalones)}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE_PML, { canal: canal.id, ver: "volumen", p: sp.p, editar: r.id })} />
                    <TachoConfirmar accion={accionBorrarVolumen} campos={{ ...base, id: String(r.id) }} pregunta="¿Borrar?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={rangos.length} />
      <p className="text-[11px] text-[#5C6B76] mt-1">
        Por rango de Clásica, hasta 5 escalones (desde tantas unidades, tanto % menos sobre lo que paga el comprador). Una categoría o un producto con filas propias manda entero (o «sin descuento»).
        En ML va como precio por cantidad de cada publicación. El de la tienda web va aparte (más adelante); el mayorista es una lista sin condiciones.
      </p>
    </>
  );
}

// ── Alertas ─────────────────────────────────────────────────

async function Alertas({ org, canal }: { org: string; canal: CanalMl }) {
  const filas = await alertasCanal(org, canal.id);
  return (
    <>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={TH}>Plan destacado</th><th className={TH}>Publicación</th><th className={THN}>Precio elegido</th><th className={TH}>Qué pasa</th><th className={THN}>Leído</th></tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={7} className={`${TD} text-[#5C6B76]`}>Sin alertas: los destacados siguen ganando (o todavía no hay destacados elegidos).</td></tr>}
            {filas.map((f) => (
              <tr key={f.variacion_id} className={TR}>
                <td className={TD}><Link href={`/catalogo/productos/${f.producto_id}`} className="font-mono text-[#16577F] hover:underline">{f.sku}</Link></td>
                <td className={TD}>{f.titulo}</td>
                <td className={TD}>{PLAN_INFO[f.plan as Plan]?.corto ?? f.plan}</td>
                <td className={TD}><Link href={url("/catalogo/publicaciones", { canal: canal.id, q: f.item_id })} className="font-mono text-[#16577F] hover:underline">{f.item_id}</Link></td>
                <td className={TDN}>{formatear(f.precio, "ARS")}</td>
                <td className={`${TD} text-[#C03420]`}>{f.alerta}</td>
                <td className={TDN}>{f.verificado_ts ? fechaHora(f.verificado_ts) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mt-1">
        Laucen lee cada hora el precio para ganar de los destacados. Si uno dejó de ganar, revisalo en la <Link href={url(PREVIA, { canal: canal.id, rol: "destacado" })} className="text-[#16577F] hover:underline">vista previa</Link> y prepará los cambios.
      </p>
    </>
  );
}
