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
import { una } from "@/lib/erp/base";
import { campanaPropiaDe, NOMBRE_CAMPANA_PROPIA } from "@/lib/precios-ml/campana-propia";
import { conEnvioGratisDeMas, envioGratisSacado } from "@/lib/precios-ml/envio-gratis";
import ElegirFamilia from "@/app/componentes/ElegirFamilia";
import { fechaHora } from "@/app/ventas/formato";
import { formatear } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import { paginarEnMemoria } from "@/lib/lista";
import { reglasCanal, heredadoExcepciones, excepcionesCanal, volumenCanal, alertasCanal, campanasBajoPisoCanal, sinCampanaCanal, type CanalMl, type Excepcion, type RangoVolumen } from "@/lib/precios-ml/datos";
import { PLANES, PLAN_INFO, descuentoComprador, type Plan, type ReglasPlan } from "@/lib/precios-ml/motor";
import { BarraPml, type VerPml } from "./comun";
import { BASE_PML, PREVIA, PLANES_PML, LISTA_EXCEPCIONES_ML, LISTA_VOLUMEN_ML, canalElegido, textoEscalones } from "./lista";
import {
  accionGuardarGeneral, accionCampanaPropia, accionGuardarExcepcion, accionBorrarExcepcion, accionGuardarVolumen, accionBorrarVolumen, accionReplicarVolumen, accionInterruptor, accionSacarCampanas, accionSacarEnvioGratis,
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
        : <Alertas org={s.org.id} canal={canal} aqui={aqui} />}
    </Pantalla>
  );
}

// ── Tachado y planes (lo general del canal) ─────────────────

async function General({ org, canal, editando, aqui }: { org: string; canal: CanalMl; editando: boolean; aqui: string }) {
  const propia = await campanaPropiaDe(org, canal.id);
  const [reglas, propios] = await Promise.all([reglasCanal(org, canal), una<{ n: number }>(`
    select count(distinct producto_id)::int n from (
      select producto_id from ml_regla_precio where organizacion_id = $1 and canal_id = $2 and nivel = 'producto' and ajuste_pct is not null
      union all select producto_id from ml_plan_config where organizacion_id = $1 and canal_id = $2 and nivel = 'producto' and ajuste_pct is not null) x`, [org, canal.id])]);
  const tachado = reglas.tachado.find((t) => t.nivel === "general")?.tachado_pct ?? 0;
  const campos = (clave: string) => ({ canal: String(canal.id), clave, volver: aqui });
  return (
    <div className="grid gap-4">
      <section className={CAJA}>
        <TituloSeccion titulo="Descuento que ve el comprador (general de la cuenta)" />
        {!editando ? (
          <Dato etiqueta="Descuento que ve el comprador %" numero className="max-w-[260px]"
            ayuda="El «% OFF» de la publicación en ML: se publica a un precio más alto (tachado) y una campaña la baja a la Clásica. 0 = sin descuento. ML lo muestra desde 5 %.">
            {pct(descuentoComprador(Number(tachado)))}
          </Dato>
        ) : null}
        <form id="ficha" action={accionGuardarGeneral}>
          <input type="hidden" name="canal" value={canal.id} /><input type="hidden" name="volver" value={aqui} />
          {editando && (
            <label className="block max-w-[260px] mb-3"><span className={ETIQUETA}>Descuento que ve el comprador %</span>
              <CampoNumero name="descuento_pct" valor={descuentoComprador(Number(tachado))} tipo="pct" className={`${CAMPO} w-full`} />
              <span className="block text-[10px] text-[#5C6B76] mt-0.5">El «% OFF» en ML. 0 = sin descuento; ML lo muestra desde 5 %.</span>
            </label>
          )}
        </form>
        <p className="text-[11px] text-[#5C6B76] mt-2">
          Es el descuento de toda la cuenta; una categoría o un producto puede tener otro en <Link href={url(BASE_PML, { canal: canal.id, ver: "excepciones" })} className="text-[#16577F] hover:underline">Excepciones</Link>.
          Qué planes de cuotas lleva cada producto y <b>quién gana</b> entre tus cuentas se configuran para todas las cuentas a la vez en{" "}
          <Link href={url(PLANES_PML, { canal: canal.id })} className="text-[#16577F] hover:underline">Planes de cuotas</Link>.
        </p>
      </section>

      <section className={CAJA}>
        {/* La campaña propia (Fer, 8/10): para que una publicación con descuento lo muestre aunque ML no le ofrezca campaña. */}
        <TituloSeccion titulo={`Campaña propia «${NOMBRE_CAMPANA_PROPIA}»`}>
          <BotonConfirmar accion={accionCampanaPropia} campos={{ canal: String(canal.id), volver: aqui }} clase={SUAVE}
            texto={propia ? "Renovar ahora" : "Crear en esta cuenta"} pregunta={`¿Crear en Mercado Libre la campaña «${NOMBRE_CAMPANA_PROPIA}» en ${canal.nombre}?`} corriendo="Creando…" />
          <BotonConfirmar accion={accionCampanaPropia} campos={{ canal: String(canal.id), todas: "1", volver: aqui }} clase={SUAVE}
            texto="Crear en todas las cuentas" pregunta={`¿Crear «${NOMBRE_CAMPANA_PROPIA}» en las cuentas que no la tienen?`} corriendo="Creando…" />
        </TituloSeccion>
        <p className="text-xs">
          {propia ? <>Vigente del {propia.desde.split("-").reverse().join("/")} al {propia.hasta.split("-").reverse().join("/")}.{canal.sincronizarPrecios ? " Se renueva sola unos días antes de vencer." : " Con «Sincronizar precios» apagado no se renueva sola: renovala con el botón antes de que venza."}</>
            : <span className="text-[#5C6B76]">Esta cuenta todavía no tiene campaña propia.</span>}
        </p>
        <p className="text-[11px] text-[#5C6B76] mt-1">
          Una publicación con descuento (publicada al tachado) que no está en ninguna campaña de Mercado Libre entra a esta campaña a su precio, así el comprador ve el descuento.
          Cuando Mercado Libre le ofrece una campaña suya que acepta ese precio, sale de la propia y pasa a la de Mercado Libre. Los cambios salen como siempre: con «Preparar cambios» en la vista previa, o solos con «Sincronizar precios».
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
          <Interruptor accion={accionInterruptor} prendido={canal.sacarEnvioGratis} campos={campos("sacar_envio_gratis")}
            etiqueta="Sacar el envío gratis a las publicaciones más baratas que el envío gratis"
            ayuda={canal.sacarEnvioGratis
              ? "Prendido: una vez por día Laucen revisa las publicaciones activas de esta cuenta y, a la que cuesta menos que el precio desde el que Mercado Libre da envío gratis y lo tiene puesto, se lo saca sola. Lo que sacó queda en la pestaña Alertas."
              : "Apagado: las que tienen envío gratis de más quedan en la pestaña Alertas, con un botón que prepara el lote."} />
        </div>
      </section>
    </div>
  );
}

// ── Excepciones por categoría o producto ────────────────────

/** «¿Quién gana?»: 0 o vacío = gana; si no, cuánto más cara va esta cuenta. */
function gana(a: number | null | undefined) {
  if (a == null) return <span className="text-[#5C6B76]">según el grupo</span>;
  return !a ? <Estado texto="Gana" tono="verde" /> : <span>no gana, +{formatearNumero(a, "pct")} %</span>;
}

const PLAN_CORTO = (p: Plan) => PLAN_INFO[p].corto;

const textoGana = (a: number) => (a === 0 ? "gana" : `no gana: +${formatearNumero(a, "pct")} %`);

/** Lo propio, o lo que hereda y de dónde (Fer, 8/10: «hereda, ¿de dónde?»). */
function resumenPlan(x: Excepcion["planes"][string] | undefined, h: { valor: number; de: string } | undefined): React.ReactNode {
  if (x && x.ajuste != null) return textoGana(x.ajuste);
  return <span className="text-[#5C6B76]" title="Vacío: toma lo de la categoría de arriba o lo general de la cuenta">hereda: {h ? `${textoGana(h.valor)} (${h.de})` : "—"}</span>;
}

function CamposExcepcion({ e }: { e?: Excepcion }) {
  return (
    <>
      <label><span className={ETIQUETA}>Descuento que ve el comprador %</span>
        <CampoNumero name="descuento_pct" valor={e?.tachado_pct != null ? descuentoComprador(e.tachado_pct) : null} tipo="pct" placeholder="hereda" className={`${CAMPO} w-full`} /></label>
      <label><span className={ETIQUETA}>Clásica: ¿gana? (si no, +%)</span>
        <CampoNumero name="clasica_ajuste" valor={e?.ajuste_pct ?? null} tipo="pct" placeholder="hereda" className={`${CAMPO} w-full`} />
        <span className="block text-[10px] text-[#5C6B76] mt-0.5">0 = gana · vacío = hereda</span></label>
      <span className="hidden sm:block" />
      {PLANES.map((p) => (
        <label key={p}><span className={ETIQUETA}>{PLAN_INFO[p].nombre}: ¿gana? (si no, +%)</span>
          <CampoNumero name={`${p}_ajuste`} valor={e?.planes[p]?.ajuste ?? null} tipo="pct" placeholder="hereda" className={`${CAMPO} w-full`} /></label>
      ))}
    </>
  );
}

async function Excepciones({ org, canal, sp, aqui }: { org: string; canal: CanalMl; sp: SP; aqui: string }) {
  const todas = await (LISTA_EXCEPCIONES_ML.filas!({ org, moneda: "ARS" }, sp) as Promise<Excepcion[]>);
  const vista = paginarEnMemoria(todas, sp);
  const heredado = await heredadoExcepciones(org, canal, vista);
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
            <tr><th className={TH}>Aplica a</th><th className={TH}>Categoría o producto</th><th className={THN}>Descuento</th>
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
                <td className={TDN}>{e.tachado_pct != null ? pct(descuentoComprador(e.tachado_pct))
                  : <span className="text-[#5C6B76]">hereda: {pct(descuentoComprador(heredado.get(e.clave)?.tachado.valor ?? 0))} ({heredado.get(e.clave)?.tachado.de})</span>}
                  <div className="text-[10px] text-[#5C6B76]">Clásica: {e.ajuste_pct != null ? textoGana(e.ajuste_pct) : `hereda: ${textoGana(heredado.get(e.clave)?.clasica.valor ?? 0)} (${heredado.get(e.clave)?.clasica.de})`}</div></td>
                {PLANES.map((p) => <td key={p} className={`${TD} text-[11px]`}>{resumenPlan(e.planes[p], heredado.get(e.clave)?.planes[p])}</td>)}
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

async function Alertas({ org, canal, aqui }: { org: string; canal: CanalMl; aqui: string }) {
  const [filas, bajo, sin, gratis, sacado] = await Promise.all([alertasCanal(org, canal.id), campanasBajoPisoCanal(org, canal.id), sinCampanaCanal(org, canal),
    conEnvioGratisDeMas(org, canal.id), envioGratisSacado(org, canal.id)]);
  const base = { canal: String(canal.id), volver: aqui };
  const umbral = formatear(gratis.umbral, "ARS");
  return (
    <>
      {/* Envío gratis de más (Fer, 10/10): una publicación más barata que el envío gratis no tiene por qué regalarlo. */}
      <TituloSeccion titulo={`Con envío gratis y menos de ${umbral} (${gratis.filas.length})`}>
        {gratis.filas.length > 1 && <BotonConfirmar accion={accionSacarEnvioGratis} campos={base} clase={SUAVE} texto="Sacar a todas"
          pregunta={`¿Preparar un lote que les saca el envío gratis a las ${gratis.filas.length}?`} corriendo="Preparando…" />}
      </TituloSeccion>
      <div className={`${CAJA_TABLA} mb-1`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={TH}>Publicación</th><th className={THN}>Paga el comprador</th><th /></tr></thead>
          <tbody>
            {gratis.filas.length === 0 && <tr><td colSpan={5} className={`${TD} text-[#5C6B76]`}>Ninguna: las publicaciones de menos de {umbral} no tienen envío gratis.</td></tr>}
            {gratis.filas.map((f) => (
              <tr key={f.itemId} className={TR}>
                <td className={TD}>{f.productoId ? <Link href={`/catalogo/productos/${f.productoId}`} className="font-mono text-[#16577F] hover:underline">{f.sku}</Link> : "—"}</td>
                <td className={TD}>{f.titulo}</td>
                <td className={TD}><Link href={url("/catalogo/publicaciones", { canal: canal.id, q: f.itemId })} className="font-mono text-[#16577F] hover:underline">{f.itemId}</Link></td>
                <td className={TDN}>{formatear(f.precio, "ARS")}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <BotonConfirmar accion={accionSacarEnvioGratis} campos={{ ...base, item: f.itemId }} clase={SUAVE} texto="Sacar el envío gratis"
                    pregunta="¿Preparar el lote?" corriendo="Preparando…" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sacado.length > 0 && (
        <div className={`${CAJA_TABLA} mb-1`}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Envío gratis sacado (últimos 7 días)</th><th className={TH}>Publicación</th><th className={TH}>Cómo</th><th className={TH}>Resultado</th></tr></thead>
            <tbody>
              {sacado.map((x, i) => (
                <tr key={`${x.itemId}-${i}`} className={TR}>
                  <td className={TD}>{fechaHora(x.ts)}</td>
                  <td className={TD}><Link href={url("/catalogo/publicaciones", { canal: canal.id, q: x.itemId })} className="font-mono text-[#16577F] hover:underline">{x.itemId}</Link></td>
                  <td className={TD}>{x.origen === "automatico" ? "Solo (interruptor prendido)" : "Con tu clic"}</td>
                  <td className={TD}>{x.estado === "ok" ? <Estado texto="Sacado" tono="verde" /> : x.estado === "error" ? <span className="text-[#C03420]">{x.error ?? "Error"}</span> : <Estado texto={x.estado === "preparado" ? "Esperando tu clic" : "En camino"} tono="amarillo" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-[#5C6B76] mb-4">
        Publicaciones activas que cuestan menos que el precio desde el que Mercado Libre da envío gratis ({umbral}, se toma solo de los costos de Mercado Libre) y lo tienen puesto: lo paga el vendedor sin necesidad.
        Laucen lo revisa una vez por día. Con el interruptor «Sacar el envío gratis…» de la pestaña Descuento prendido, se lo saca sola; si no, el botón arma un lote en la <Link href="/config/canales/cola?ver=lotes" className="text-[#16577F] hover:underline">cola de Mercado Libre</Link> que sale con tu clic.
      </p>

      <TituloSeccion titulo={`Campañas debajo del piso (${bajo.length})`}>
        {bajo.length > 1 && <BotonConfirmar accion={accionSacarCampanas} campos={base} clase={SUAVE} texto="Sacar de todas"
          pregunta={`¿Preparar un lote que saca las ${bajo.length}?`} corriendo="Preparando…" />}
      </TituloSeccion>
      <div className={`${CAJA_TABLA} mb-1`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={TH}>Publicación</th><th className={TH}>Campaña</th>
            <th className={THN}>Con la campaña</th><th className={THN}>Piso</th><th className={THN}>Debajo</th><th /></tr></thead>
          <tbody>
            {bajo.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>Ninguna: todas las campañas en curso respetan el piso.</td></tr>}
            {bajo.map((f) => (
              <tr key={`${f.itemId}|${f.campanaId}`} className={TR}>
                <td className={TD}><Link href={`/catalogo/productos/${f.productoId}`} className="font-mono text-[#16577F] hover:underline">{f.sku}</Link></td>
                <td className={TD}>{f.titulo}</td>
                <td className={TD}><Link href={url("/catalogo/publicaciones", { canal: canal.id, q: f.itemId })} className="font-mono text-[#16577F] hover:underline">{f.itemId}</Link>
                  <div className="text-[10px] text-[#5C6B76]">{f.plan === "clasica" ? "Clásica" : PLAN_INFO[f.plan as Plan]?.corto ?? f.plan ?? ""}</div></td>
                <td className={TD}>{f.nombre ?? f.tipo}<div className="text-[10px] text-[#5C6B76]">{f.propia ? "propia (el precio lo pusiste vos)" : "de ML (cuenta sólo lo que ponés vos)"}</div></td>
                <td className={TDN}>{formatear(f.precio, "ARS")}</td>
                <td className={TDN}>{formatear(Math.round(f.piso), "ARS")}</td>
                <td className={`${TDN} text-[#C03420]`}>−{formatearNumero(Math.round((1 - f.precio / f.piso) * 1000) / 10, "pct")} %</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <BotonConfirmar accion={accionSacarCampanas} campos={{ ...base, clave: `${f.itemId}|${f.campanaId}` }} clase={SUAVE} texto="Sacar de la campaña"
                    pregunta="¿Preparar el lote?" corriendo="Preparando…" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mb-4">
        El piso es el precio que da el esquema para esa publicación (la Clásica de la cuenta, o el precio de su plan). En una campaña propia cuenta su precio; en una de ML («Potencia tus ventas»), sólo lo que ponés vos: el precio sin descuento menos tu parte (la de ML no sale de tu bolsillo).
        «Sacar de la campaña» no la saca ya: arma un lote en la <Link href="/config/canales/cola?ver=lotes" className="text-[#16577F] hover:underline">cola de Mercado Libre</Link> que sale con tu clic.
      </p>

      <TituloSeccion titulo={`Sin campaña hace más de 24 horas (${sin.length})`} />
      <div className={`${CAJA_TABLA} mb-1`}>
        <table className={TABLA}>
          <thead className={THEAD}><tr><th className={TH}>SKU</th><th className={TH}>Producto</th><th className={TH}>Publicación</th>
            <th className={THN}>Publicada a</th><th className={THN}>Sin campaña desde</th><th className={THN}>Hace</th></tr></thead>
          <tbody>
            {sin.length === 0 && <tr><td colSpan={6} className={`${TD} text-[#5C6B76]`}>Ninguna: todas las publicaciones con descuento están en alguna campaña (o salieron hace menos de 24 horas).</td></tr>}
            {sin.map((f) => (
              <tr key={f.publicacionId} className={TR}>
                <td className={TD}><Link href={`/catalogo/productos/${f.productoId}`} className="font-mono text-[#16577F] hover:underline">{f.sku}</Link></td>
                <td className={TD}>{f.titulo}</td>
                <td className={TD}><Link href={url("/catalogo/publicaciones", { canal: canal.id, q: f.itemId })} className="font-mono text-[#16577F] hover:underline">{f.itemId}</Link>
                  <div className="text-[10px] text-[#5C6B76]">{f.plan === "clasica" ? "Clásica" : PLAN_INFO[f.plan as Plan]?.nombre ?? f.plan ?? ""}</div></td>
                <td className={TDN}>{f.precio != null ? formatear(f.precio, "ARS") : "—"}</td>
                <td className={TDN}>{fechaHora(f.desde)}</td>
                <td className={`${TDN} ${f.horas >= 72 ? "text-[#C03420] font-semibold" : ""}`}>{f.horas >= 48 ? `${Math.floor(f.horas / 24)} días` : `${f.horas} h`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[#5C6B76] mb-4">
        Publicaciones con descuento (tachado) que no están en ninguna campaña: siguen publicadas al precio tachado —Laucen nunca las baja a la Clásica, porque después de una venta Mercado Libre puede no dejar volver a subirlo—, pero así casi no venden.
        Laucen lee cada hora las campañas que ofrece Mercado Libre y, si la cuenta tiene «Sincronizar precios» prendido, la mete sola en la primera que acepte su precio. Si no, prepará los cambios desde la <Link href={url(PREVIA, { canal: canal.id })} className="text-[#16577F] hover:underline">vista previa</Link>.
      </p>

      <TituloSeccion titulo={`Destacados que dejaron de ganar (${filas.length})`} />
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
