// Canales de venta (orden 136, §6): cada uno con su lista de precios, los
// depósitos desde los que vende (el stock disponible del canal es la suma de
// ellos), la llave con que otro sistema llama a la API (pedidos y catálogo) y,
// si es de Mercado Libre, si su cuenta está conectada. Las llaves no se
// muestran nunca (sólo si tiene o no); la recién generada, una sola vez.

import Link from "next/link";
import { PALETA_CANALES, NOMBRE_COLOR } from "@/lib/canales/colores";
import { cookies } from "next/headers";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE, PRIMARIO, APAGAR } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { ordenarEnMemoria, paginarEnMemoria } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, TituloSeccion, BotonesFicha, Dato, editandoFicha, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { emisoresDe } from "@/lib/arca/facturar";
import InterruptorConfirmar from "./InterruptorConfirmar";
import { accionSincronizarStock, accionSubirFacturas, accionSincronizarPrecios } from "./acciones-ml";
import { sembrarEjemploCanales, canalesDeEjemplo } from "./ejemplo";
import CuentaMl from "./CuentaMl";
import CuentaMp from "./CuentaMp";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_CANALES } from "./lista";
import {
  accionAgregarDeposito, accionBorrarCanal, accionCrearCanal, accionGenerarToken, accionGuardarCanal,
  accionPrioridadDeposito, accionQuitarDeposito, accionRevocarToken, accionGuardarTextosCanal,
} from "./acciones";
import { textosCanal } from "@/lib/canales/textos";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BASE = "/config/canales";

const TIPOS: Record<string, string> = {
  mercadolibre: "Mercado Libre", web_minorista: "Web minorista", web_mayorista: "Web mayorista",
  local: "Local", historico: "Histórico", otro: "Otro",
};
const ESTADOS: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" }> = {
  activo: { texto: "Activo", tono: "verde" }, pausado: { texto: "Pausado", tono: "amarillo" }, archivado: { texto: "Archivado", tono: "gris" },
};

type SP = { c?: string; editar?: string; dep?: string; q?: string; contiene?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

export default async function Canales({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("canales_ver");
  const sp = await searchParams;
  await sembrarEjemploCanales(s.org.id);
  const deEjemplo = await canalesDeEjemplo(s.org.id);
  const editar = Number(sp.editar) || 0;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const filtros = { q: q || null, contiene: comienza ? null : "1" };

  const base = await LISTA_CANALES.consulta!({ org: s.org.id, moneda: s.moneda }, sp);
  const canales = await consulta<{
    id: number; nombre: string; tipo: string; lista_id: number | null; lista: string | null; estado: string;
    umbral: number | null; tiene_llave: boolean; depositos: string | null; ml: string | null; apodo: string | null; emisor_id: number | null; emisor: string | null;
    sincroniza: boolean; sube_facturas: boolean; precios: boolean; color: string | null; orden_copia: number | null;
  }>(`
    select c.id::int, c.nombre, c.color, c.tipo, c.lista_precios_id::int lista_id, l.nombre lista, c.estado, c.umbral_pausa_default umbral,
           c.config ? 'token' tiene_llave,
           (select string_agg(d.nombre, ', ' order by cd.prioridad, d.nombre) from canal_deposito cd join deposito d on d.id = cd.deposito_id
             where cd.canal_id = c.id) depositos,
           (select mc.estado from meli_cuenta mc where mc.canal_id = c.id) ml,
           (select mc.nickname from meli_cuenta mc where mc.canal_id = c.id) apodo,
           c.emisor_id::int, (select coalesce(e.nombre, e.razon_social) from emisor e where e.id = c.emisor_id) emisor,
           coalesce((c.config ->> 'sincronizar_stock')::boolean, false) sincroniza, coalesce((c.config ->> 'subir_facturas')::boolean, false) sube_facturas,
           coalesce((c.config ->> 'sincronizar_precios')::boolean, false) precios, (c.config ->> 'orden_copia')::int orden_copia
      from ${base.desde} where ${base.donde} order by ${base.orden}`, base.valores);
  const listas = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from lista_precios where organizacion_id = $1 and estado = 'activa' order by orden, nombre", [s.org.id]);
  const razones = await emisoresDe(s.org.id);
  // "Factura con": cada canal elige su razón social (no hay "principal", Fer 4/10).
  const multi = razones.length > 0;
  const elegido = canales.find((c) => c.id === Number(sp.c));
  const ordenados = ordenarEnMemoria(canales, sp, {
    nombre: (c) => c.nombre, tipo: (c) => TIPOS[c.tipo] ?? c.tipo, lista: (c) => c.lista, depositos: (c) => c.depositos,
    estado: (c) => c.estado, ml: (c) => c.apodo ?? c.ml, emisor: (c) => c.emisor, umbral: (c) => c.umbral, stockml: (c) => (c.sincroniza ? 1 : 0), facturasml: (c) => (c.sube_facturas ? 1 : 0), preciosml: (c) => (c.precios ? 1 : 0), llave: (c) => (c.tiene_llave ? 1 : 0),
  });
  const pagina = paginarEnMemoria(ordenados, sp);
  const crudo = (await cookies()).get("token_nuevo")?.value?.match(/^(\d+):([0-9a-f]{64})$/);
  const tokenNuevo = crudo ? { canal: Number(crudo[1]), token: crudo[2] } : null;
  const aqui = url(BASE, { c: elegido?.id, ...filtros, p: sp.p, orden: sp.orden, dir: sp.dir });
  const conFiltros = { ...filtros, p: sp.p, orden: sp.orden, dir: sp.dir };

  const susDepositos = elegido ? await consulta<{ id: number; nombre: string; estado: string; prioridad: number }>(`
    select d.id::int, d.nombre, d.estado, cd.prioridad
      from canal_deposito cd join deposito d on d.id = cd.deposito_id
     where cd.canal_id = $2 and cd.organizacion_id = $1 order by cd.prioridad, d.nombre`, [s.org.id, elegido.id]) : [];
  const otrosDepositos = elegido ? await consulta<{ id: number; nombre: string }>(`
    select d.id::int, d.nombre from deposito d
     where d.organizacion_id = $1 and d.estado = 'activo'
       and not exists (select 1 from canal_deposito cd where cd.canal_id = $2 and cd.deposito_id = d.id)
     order by d.nombre`, [s.org.id, elegido.id]) : [];

  const selectorLista = (valor: number | null) => (
    <select name="lista" defaultValue={valor ?? ""} className={CAMPO} aria-label="Lista de precios">
      <option value="">Sin lista</option>
      {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
    </select>
  );
  const selectorRazon = (valor: number | null) => (
    <select name="emisor" defaultValue={valor ?? ""} required className={CAMPO} aria-label="Factura con (razón social)">
      {valor == null && <option value="" disabled>Elegí la razón social…</option>}
      {razones.map((x) => <option key={x.id} value={x.id}>{x.nombre ?? x.razon_social}</option>)}
    </select>
  );
  // Los interruptores de Mercado Libre de la fila (stock y facturas).
  const interruptoresMl = (c: { id: number; sincroniza: boolean; sube_facturas: boolean; precios: boolean }) => ({
    stock: <InterruptorConfirmar accion={accionSincronizarStock} prendido={c.sincroniza} campos={{ canal: String(c.id) }} etiqueta="Laucen manda el stock a ML y pausa al llegar al umbral"
      preguntaPrender="¿Prender? Laucen manda el stock y pausa en ML" preguntaApagar="¿Apagar el stock a ML?" />,
    facturas: <InterruptorConfirmar accion={accionSubirFacturas} prendido={c.sube_facturas} campos={{ canal: String(c.id) }} etiqueta="Subir facturas a Mercado Libre"
      preguntaPrender="¿Prender? Cada factura se sube a su venta" preguntaApagar="¿Apagar la subida de facturas?" />,
    precios: <InterruptorConfirmar accion={accionSincronizarPrecios} prendido={c.precios} campos={{ canal: String(c.id) }} etiqueta="Laucen manda los precios a ML solo"
      preguntaPrender="¿Prender? Laucen cambia los precios en ML solo" preguntaApagar="¿Apagar los precios a ML?" />,
  });
  const selectorTipo = (valor: string) => (
    <select name="tipo" defaultValue={valor} className={CAMPO} aria-label="Tipo">
      {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );

  return (
    <Pantalla titulo="Canales" subtitulo="Por dónde se vende: con qué lista de precios y desde qué depósitos. Tocá un canal para ver sus depósitos, su cuenta de Mercado Libre y su llave API."
      acciones={<><AccionesExcel lista={LISTA_CANALES} org={s.org.id} /><BotonNuevo texto="Nuevo canal" /></>}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo canal" sinBoton>
        <form action={accionCrearCanal} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre (ej. Mercado Libre cuenta 2)" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          {selectorTipo("mercadolibre")}
          {selectorLista(null)}
          {multi && selectorRazon(null)}
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      {deEjemplo.length > 0 && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          Son datos de ejemplo (un canal por tipo, con sus listas y un depósito propio): borralos o cambialos. No se vuelven a crear.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar canal" limpiar={["editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="nombre">Canal</ThOrden><ThOrden col="tipo">Tipo</ThOrden><ThOrden col="lista">Lista de precios</ThOrden><ThOrden col="depositos">Vende desde</ThOrden>
              <ThOrden col="estado" porDefecto>Estado</ThOrden><ThOrden col="ml" title="La cuenta de Mercado Libre conectada (su apodo)">Mercado Libre</ThOrden>{multi && <ThOrden col="emisor" title="La razón social con la que se factura lo que vende este canal">Factura con</ThOrden>}<ThOrden col="umbral" n>Umbral de pausa</ThOrden>
              <ThOrden col="stockml" title="Laucen manda el stock a Mercado Libre y pausa al llegar al umbral (sólo cuentas de ML)">Stock a ML</ThOrden>
              <ThOrden col="preciosml" title="Laucen manda solo los precios a Mercado Libre (sigue la lista del canal). Apagado, ningún precio sale salvo lo que mandes con tu clic (sólo cuentas de ML)">Precios a ML</ThOrden>
              <ThOrden col="facturasml" title="Cada factura que autoriza ARCA se sube sola a su venta en Mercado Libre (sólo cuentas de ML)">Facturas a ML</ThOrden>
              <ThOrden col="llave" title="Para que otro sistema cargue pedidos o lea el catálogo por la API; hoy no la usa nadie">Llave API</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {canales.length === 0 && <tr><td colSpan={multi ? 13 : 12} className={`${TD} text-[#5C6B76]`}>{q ? "Ningún canal coincide." : "No hay canales. Agregá el primero con «Nuevo canal»."}</td></tr>}
            {pagina.map((c) => editar === c.id ? (
              <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={multi ? 13 : 12} className={TD}>
                  <form action={accionGuardarCanal} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="volver" value={aqui} />
                    <label className="flex-1 min-w-40"><span className={ETIQUETA}>Nombre</span>
                      <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                    <label><span className={ETIQUETA}>Tipo</span>{selectorTipo(c.tipo)}</label>
                    <label><span className={ETIQUETA}>Lista de precios</span>{selectorLista(c.lista_id)}</label>
                    {multi && (
                      <label><span className={ETIQUETA}>Factura con</span>
                        {selectorRazon(c.emisor_id)}</label>
                    )}
                    <label><span className={ETIQUETA}>Estado</span>
                      <select name="estado" defaultValue={c.estado} className={CAMPO}>
                        <option value="activo">Activo</option><option value="pausado">Pausado</option><option value="archivado">Archivado</option>
                      </select></label>
                    <label><span className={ETIQUETA}>Umbral de pausa</span>
                      <CampoNumero name="umbral" valor={c.umbral} tipo="entero" placeholder="hereda" className={`${CAMPO} w-20`} /></label>
                    {c.tipo === "mercadolibre" && (
                      // De qué cuenta se copia una publicación para crearla en otra (Fer, 9/10): la de número más bajo primero.
                      <label title="Para crear una publicación en otra cuenta, Laucen copia la de la cuenta con el número más bajo que la tenga (vacío = al final)">
                        <span className={ETIQUETA}>Orden para copiar</span>
                        <CampoNumero name="orden_copia" valor={c.orden_copia} tipo="entero" placeholder="al final" className={`${CAMPO} w-20`} /></label>
                    )}
                    {/* El color del canal (Fer, 8/10): el fondo de sus filas en todas las pantallas. */}
                    <fieldset><span className={ETIQUETA}>Color</span>
                      <span className="flex flex-wrap gap-1">
                        {PALETA_CANALES.map((col) => (
                          <label key={col} title={NOMBRE_COLOR[col]} className="cursor-pointer">
                            <input type="radio" name="color" value={col} defaultChecked={(c.color ?? "").toUpperCase() === col} className="peer sr-only" />
                            <span className="block h-7 w-7 rounded-md border border-[#C9D3DD] peer-checked:ring-2 peer-checked:ring-[#16577F]" style={{ backgroundColor: col }} />
                          </label>
                        ))}
                      </span></fieldset>
                    <button className={VERDE}>Guardar</button>
                    <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                  {c.tipo === "mercadolibre" && (
                    // Fuera del formulario: cada interruptor se guarda solo (con su Sí / No).
                    <div className="flex flex-wrap items-center gap-4 mt-2 text-xs">
                      <span className="inline-flex items-center gap-2">Stock a ML {interruptoresMl(c).stock}</span>
                      <span className="inline-flex items-center gap-2">Precios a ML {interruptoresMl(c).precios}</span>
                      <span className="inline-flex items-center gap-2">Facturas a ML {interruptoresMl(c).facturas}</span>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              <tr key={c.id} data-canal={c.id} className={`${TR} ${elegido?.id === c.id ? "outline outline-2 -outline-offset-2 outline-[#16577F]" : ""}`}>
                <td className={TD}><Link href={url(BASE, { ...conFiltros, c: c.id })} className="font-semibold text-[#16577F] hover:underline">{c.nombre}</Link></td>
                <td className={TD}>{TIPOS[c.tipo] ?? c.tipo}</td>
                <td className={TD}>{c.lista_id
                  ? <Link href={url("/catalogo/precios", { lista: c.lista_id })} className="text-[#16577F] hover:underline">{c.lista}</Link>
                  : <span className="text-[#C03420]">sin lista</span>}</td>
                <td className={TD}><Link href={url(BASE, { ...conFiltros, c: c.id })} className="hover:text-[#16577F] hover:underline">{c.depositos ?? <span className="text-[#C03420]">ningún depósito</span>}</Link></td>
                <td className={TD}><Estado texto={ESTADOS[c.estado]?.texto ?? c.estado} tono={ESTADOS[c.estado]?.tono ?? "gris"} /></td>
                <td className={`${TD} whitespace-nowrap`}>{c.tipo === "mercadolibre"
                  ? <Link href={url(BASE, { ...conFiltros, c: c.id })}><Estado texto={c.ml === "activa" ? "Conectada" : "Desconectada"} tono={c.ml === "activa" ? "verde" : "rojo"} />{c.apodo && <span className="ml-1 font-semibold">{c.apodo}</span>}</Link>
                  : <span className="text-[#5C6B76]">—</span>}</td>
                {multi && <td className={TD}>{c.emisor ?? <span className="text-[#C03420]">sin razón social</span>}</td>}
                <td className={TDN}>{c.umbral ?? <span className="text-[#5C6B76]">hereda</span>}</td>
                <td className={TD}>{c.tipo === "mercadolibre" ? interruptoresMl(c).stock : <span className="text-[#5C6B76]">—</span>}</td>
                <td className={TD}>{c.tipo === "mercadolibre" ? interruptoresMl(c).precios : <span className="text-[#5C6B76]">—</span>}</td>
                <td className={TD}>{c.tipo === "mercadolibre" ? interruptoresMl(c).facturas : <span className="text-[#5C6B76]">—</span>}</td>
                <td className={`${TD} whitespace-nowrap`}><Link href={url(BASE, { ...conFiltros, c: c.id })} className="hover:underline">{c.tiene_llave ? "Tiene" : <span className="text-[#5C6B76]">sin llave</span>}</Link></td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { c: elegido?.id, ...conFiltros, editar: c.id })} />
                    <TachoConfirmar accion={accionBorrarCanal} campos={{ id: String(c.id) }} pregunta="¿Borrar el canal?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={canales.length} />
      <p className="text-[11px] text-[#5C6B76] mt-1">Umbral de pausa: con ese stock disponible o menos, se pausan las publicaciones del canal (vacío = el de la organización, 1).</p>
      <p className="text-[11px] text-[#5C6B76] mt-1">Llave API: para que otro sistema cargue pedidos o lea el catálogo por la API; hoy no la usa nadie.</p>

      {elegido && (
        <div className="grid gap-4 md:grid-cols-2 mt-6">
          <section className={CAJA}>
            <TituloSeccion titulo={<>Depósitos de “{elegido.nombre}”</>}>
              {otrosDepositos.length > 0 && <BotonNuevo texto="Agregar depósito" />}
            </TituloSeccion>
            <AltaNueva texto="Agregar depósito" sinBoton className="mb-2">
              <form action={accionAgregarDeposito} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="canal" value={elegido.id} />
                <input type="hidden" name="volver" value={aqui} />
                <select name="deposito" className={CAMPO} aria-label="Depósito">
                  {otrosDepositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
                <CampoNumero name="prioridad" valor={susDepositos.length + 1} tipo="entero" className={`${CAMPO} w-14`} />
                <button className={PRIMARIO}>Agregar</button>
              </form>
            </AltaNueva>
            <p className="text-[11px] text-[#5C6B76] mb-2">El stock disponible del canal es la suma de estos depósitos. Prioridad: el de número menor se usa primero.</p>
            <div className={CAJA_TABLA}>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>Depósito</th><th className={THN}>Prioridad</th><th /></tr></thead>
                <tbody>
                  {susDepositos.length === 0 && <tr><td colSpan={3} className={`${TD} text-[#5C6B76]`}>Todavía no vende desde ningún depósito: no va a tener stock.</td></tr>}
                  {susDepositos.map((d) => (
                    <tr key={d.id} className={TR}>
                      <td className={TD}>{d.nombre}{d.estado !== "activo" && <span className="ml-1"><Estado texto="Archivado: no suma" /></span>}</td>
                      <td className={TDN}>
                        {/* La prioridad se ve; el lápiz de la fila la vuelve editable ahí mismo (?dep=<id>). */}
                        {Number(sp.dep) === d.id ? (
                          <form action={accionPrioridadDeposito} className="inline-flex items-center gap-1 justify-end">
                            <input type="hidden" name="canal" value={elegido.id} />
                            <input type="hidden" name="deposito" value={d.id} />
                            <input type="hidden" name="volver" value={aqui} />
                            <CampoNumero name="prioridad" valor={d.prioridad} tipo="entero" className={`${CAMPO} w-14`} />
                            <button className={VERDE}>Guardar</button>
                            <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                          </form>
                        ) : d.prioridad}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        <span className="inline-flex gap-1">
                          {Number(sp.dep) !== d.id && <Lapiz href={url(BASE, { c: elegido.id, ...conFiltros, dep: d.id })} etiqueta="Cambiar la prioridad" />}
                          <TachoConfirmar accion={accionQuitarDeposito} campos={{ canal: String(elegido.id), deposito: String(d.id), volver: aqui }} pregunta="¿Quitar?" />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {otrosDepositos.length === 0 && (
              <p className="text-[11px] text-[#5C6B76] mt-2">No quedan otros depósitos activos. <Link href="/stock/depositos" className="text-[#16577F] underline">Crear uno</Link>.</p>
            )}
          </section>

          {elegido.tipo === "mercadolibre" && <CuentaMl org={s.org.id} canal={elegido.id} />}
          {elegido.tipo === "mercadolibre" && (
            <TextosCanal org={s.org.id} canal={elegido.id} nombre={elegido.nombre} aqui={aqui} editando={editandoFicha(sp, "textos")} />
          )}
          <CuentaMp org={s.org.id} canal={elegido.id} />

          <section className={CAJA}>
            <h2 className="text-sm font-bold mb-1">Llave API</h2>
            <p className="text-[11px] text-[#5C6B76] mb-2">
              Para que otro sistema cargue pedidos o lea el catálogo por la API; hoy no la usa nadie. Se manda como <code>Authorization: Bearer &lt;llave&gt;</code> a <code>/api/pedidos</code> o <code>/api/catalogo</code>: la llave dice de qué canal es.
            </p>
            {tokenNuevo && tokenNuevo.canal === elegido.id && (
              <p className="text-xs rounded-lg px-3 py-2 mb-2 bg-[#FFF8E5] text-[#8a6100] break-all">
                Llave nueva (copiala ahora, en un minuto deja de mostrarse): <b className="font-mono select-all">{tokenNuevo.token}</b>
              </p>
            )}
            {elegido.tiene_llave ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>Tiene llave (no se muestra).</span>
                <BotonConfirmar accion={accionGenerarToken} campos={{ canal: String(elegido.id), volver: aqui }} clase={SUAVE}
                  texto="Generar otro" pregunta="¿Reemplazarlo? El actual deja de andar." corriendo="Generando…" />
                <BotonConfirmar accion={accionRevocarToken} campos={{ canal: String(elegido.id), volver: aqui }} clase={APAGAR}
                  texto="Revocar" pregunta="¿Revocar la llave?" corriendo="Revocando…" />
              </div>
            ) : (
              <form action={accionGenerarToken} className="flex items-center gap-2 text-xs">
                <input type="hidden" name="canal" value={elegido.id} />
                <input type="hidden" name="volver" value={aqui} />
                <span className="text-[#5C6B76]">Sin llave: nadie puede usar la API con este canal.</span>
                <button className={PRIMARIO}>Generar llave</button>
              </form>
            )}
          </section>
        </div>
      )}
    </Pantalla>
  );
}

/** Los textos del canal (Fer, 10/10; lib/canales/textos.ts): la firma y las reglas de la IA de
 *  preguntas y mensajes, y el encabezado y el pie de la descripción al publicar. Abre en vista. */
async function TextosCanal({ org, canal, nombre, aqui, editando }: { org: string; canal: number; nombre: string; aqui: string; editando: boolean }) {
  const t = await textosCanal(org, canal);
  const editar = `${aqui}${aqui.includes("?") ? "&" : "?"}editar=textos`;
  const campo = (name: string, etiqueta: string, valor: string, ayuda: string, filas: number) => (
    <label className="block">
      <span className={ETIQUETA}>{etiqueta}</span>
      {filas === 1
        ? <input name={name} defaultValue={valor} maxLength={100} className={`${CAMPO} w-full`} />
        : <textarea name={name} defaultValue={valor} rows={filas} className={`${CAMPO} w-full leading-relaxed`} />}
      <span className="block text-[10px] text-[#5C6B76] mt-0.5">{ayuda}</span>
    </label>
  );
  const AYUDA = {
    firma: "Va al final de cada respuesta que propone la IA a preguntas y mensajes, tal cual la escribís. Ej.: «Saludos, el equipo de Daitom».",
    reglas: "Lo que la IA tiene que respetar siempre en este canal, una regla por renglón. Ej.: «Nunca sugerir abrir un reclamo ni una mediación en Mercado Libre».",
    enc: "Va arriba de la descripción técnica del producto al publicarlo en este canal.",
    pie: "Va abajo de la descripción técnica al publicarlo en este canal.",
  };
  return (
    <section className={`${CAJA} md:col-span-2`}>
      <TituloSeccion titulo={<>Textos de “{nombre}”</>}>
        <BotonesFicha editando={editando} ver={aqui} editar={editar} form="ficha-textos" />
      </TituloSeccion>
      {editando ? (
        <form id="ficha-textos" action={accionGuardarTextosCanal} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="canal" value={canal} />
          <input type="hidden" name="volver" value={aqui} />
          {campo("firma", "Firma de las respuestas", t.firma, AYUDA.firma, 1)}
          <div className="hidden md:block" />
          {campo("reglas_ia", "Reglas para la IA (preguntas y mensajes)", t.reglasIa, AYUDA.reglas, 5)}
          <div className="hidden md:block" />
          {campo("desc_encabezado", "Encabezado de la descripción", t.encabezado, AYUDA.enc, 6)}
          {campo("desc_pie", "Pie de la descripción", t.pie, AYUDA.pie, 6)}
        </form>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <Dato etiqueta="Firma de las respuestas" ayuda={AYUDA.firma}>{t.firma}</Dato>
          <div className="hidden md:block" />
          <Dato etiqueta="Reglas para la IA (preguntas y mensajes)" largo ayuda={AYUDA.reglas}>{t.reglasIa}</Dato>
          <div className="hidden md:block" />
          <Dato etiqueta="Encabezado de la descripción" largo ayuda={AYUDA.enc}>{t.encabezado}</Dato>
          <Dato etiqueta="Pie de la descripción" largo ayuda={AYUDA.pie}>{t.pie}</Dato>
        </div>
      )}
    </section>
  );
}
