// Canales de venta (orden 136, §6): cada uno con su lista de precios, los
// depósitos desde los que vende (el stock disponible del canal es la suma de
// ellos), la llave con que otro sistema llama a la API (pedidos y catálogo) y,
// si es de Mercado Libre, si su cuenta está conectada. Las llaves no se
// muestran nunca (sólo si tiene o no); la recién generada, una sola vez.

import Link from "next/link";
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
  entrarErp, Pantalla, Avisos, Lapiz, Estado, TituloSeccion, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { emisoresDe } from "@/lib/arca/facturar";
import { sembrarEjemploCanales, canalesDeEjemplo } from "./ejemplo";
import CuentaMl from "./CuentaMl";
import { AccionesExcel } from "@/app/listas/piezas";
import { LISTA_CANALES } from "./lista";
import {
  accionAgregarDeposito, accionBorrarCanal, accionCrearCanal, accionGenerarToken, accionGuardarCanal,
  accionPrioridadDeposito, accionQuitarDeposito, accionRevocarToken,
} from "./acciones";

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
    umbral: number | null; tiene_llave: boolean; depositos: string | null; ml: string | null; emisor_id: number | null; emisor: string | null;
  }>(`
    select c.id::int, c.nombre, c.tipo, c.lista_precios_id::int lista_id, l.nombre lista, c.estado, c.umbral_pausa_default umbral,
           c.config ? 'token' tiene_llave,
           (select string_agg(d.nombre, ', ' order by cd.prioridad, d.nombre) from canal_deposito cd join deposito d on d.id = cd.deposito_id
             where cd.canal_id = c.id) depositos,
           (select mc.estado from meli_cuenta mc where mc.canal_id = c.id) ml,
           c.emisor_id::int, (select coalesce(e.nombre, e.razon_social) from emisor e where e.id = c.emisor_id) emisor
      from ${base.desde} where ${base.donde} order by ${base.orden}`, base.valores);
  const listas = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from lista_precios where organizacion_id = $1 and estado = 'activa' order by orden, nombre", [s.org.id]);
  const razones = await emisoresDe(s.org.id);
  const multi = razones.length > 1;
  const principal = razones.find((x) => x.es_principal);
  const elegido = canales.find((c) => c.id === Number(sp.c));
  const ordenados = ordenarEnMemoria(canales, sp, {
    nombre: (c) => c.nombre, tipo: (c) => TIPOS[c.tipo] ?? c.tipo, lista: (c) => c.lista, depositos: (c) => c.depositos,
    estado: (c) => c.estado, ml: (c) => c.ml, emisor: (c) => c.emisor ?? principal?.nombre ?? principal?.razon_social, umbral: (c) => c.umbral, llave: (c) => (c.tiene_llave ? 1 : 0),
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
              <ThOrden col="estado" porDefecto>Estado</ThOrden><ThOrden col="ml">Mercado Libre</ThOrden>{multi && <ThOrden col="emisor" title="La razón social con la que se factura lo que vende este canal; sin elegir, la principal">Factura con</ThOrden>}<ThOrden col="umbral" n>Umbral de pausa</ThOrden>
              <ThOrden col="llave" title="Para que otro sistema cargue pedidos o lea el catálogo por la API; hoy no la usa nadie">Llave API</ThOrden><th />
            </tr>
          </thead>
          <tbody>
            {canales.length === 0 && <tr><td colSpan={multi ? 10 : 9} className={`${TD} text-[#5C6B76]`}>{q ? "Ningún canal coincide." : "No hay canales. Agregá el primero con «Nuevo canal»."}</td></tr>}
            {pagina.map((c) => editar === c.id ? (
              <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={multi ? 10 : 9} className={TD}>
                  <form action={accionGuardarCanal} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="volver" value={aqui} />
                    <label className="flex-1 min-w-40"><span className={ETIQUETA}>Nombre</span>
                      <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                    <label><span className={ETIQUETA}>Tipo</span>{selectorTipo(c.tipo)}</label>
                    <label><span className={ETIQUETA}>Lista de precios</span>{selectorLista(c.lista_id)}</label>
                    {multi && (
                      <label><span className={ETIQUETA}>Factura con</span>
                        <select name="emisor" defaultValue={c.emisor_id ?? ""} className={CAMPO}>
                          <option value="">La principal ({principal?.nombre ?? principal?.razon_social})</option>
                          {razones.map((x) => <option key={x.id} value={x.id}>{x.nombre ?? x.razon_social}</option>)}
                        </select></label>
                    )}
                    <label><span className={ETIQUETA}>Estado</span>
                      <select name="estado" defaultValue={c.estado} className={CAMPO}>
                        <option value="activo">Activo</option><option value="pausado">Pausado</option><option value="archivado">Archivado</option>
                      </select></label>
                    <label><span className={ETIQUETA}>Umbral de pausa</span>
                      <CampoNumero name="umbral" valor={c.umbral} tipo="entero" placeholder="hereda" className={`${CAMPO} w-20`} /></label>
                    <button className={VERDE}>Guardar</button>
                    <Link href={aqui} className={SUAVE} scroll={false}>Cancelar</Link>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id} className={`${TR} ${elegido?.id === c.id ? "bg-[#EEF3F8]" : ""}`}>
                <td className={TD}><Link href={url(BASE, { ...conFiltros, c: c.id })} className="font-semibold text-[#16577F] hover:underline">{c.nombre}</Link></td>
                <td className={TD}>{TIPOS[c.tipo] ?? c.tipo}</td>
                <td className={TD}>{c.lista_id
                  ? <Link href={url("/catalogo/precios", { lista: c.lista_id })} className="text-[#16577F] hover:underline">{c.lista}</Link>
                  : <span className="text-[#C03420]">sin lista</span>}</td>
                <td className={TD}><Link href={url(BASE, { ...conFiltros, c: c.id })} className="hover:text-[#16577F] hover:underline">{c.depositos ?? <span className="text-[#C03420]">ningún depósito</span>}</Link></td>
                <td className={TD}><Estado texto={ESTADOS[c.estado]?.texto ?? c.estado} tono={ESTADOS[c.estado]?.tono ?? "gris"} /></td>
                <td className={`${TD} whitespace-nowrap`}>{c.tipo === "mercadolibre"
                  ? <Link href={url(BASE, { ...conFiltros, c: c.id })}><Estado texto={c.ml === "activa" ? "Conectada" : "Desconectada"} tono={c.ml === "activa" ? "verde" : "rojo"} /></Link>
                  : <span className="text-[#5C6B76]">—</span>}</td>
                {multi && <td className={TD}>{c.emisor ?? <span className="text-[#5C6B76]">La principal</span>}</td>}
                <td className={TDN}>{c.umbral ?? <span className="text-[#5C6B76]">hereda</span>}</td>
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
