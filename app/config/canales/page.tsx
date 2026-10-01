// Canales de venta (orden 136, §6): cada uno con su lista de precios, los
// depósitos desde los que vende (el stock disponible del canal es la suma de
// ellos) y el token con que llama a la API de pedidos.

import Link from "next/link";
import { cookies } from "next/headers";
import { consulta } from "@/lib/erp/base";
import { VERDE, SUAVE, PRIMARIO, APAGAR } from "@/app/botones";
import { TachoConfirmar, BotonConfirmar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import {
  entrarErp, Pantalla, Avisos, Lapiz, Estado, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { sembrarEjemploCanales, canalesDeEjemplo } from "./ejemplo";
import {
  accionAgregarDeposito, accionBorrarCanal, accionCrearCanal, accionGenerarToken, accionGuardarCanal,
  accionPrioridadDeposito, accionQuitarDeposito, accionRevocarToken,
} from "./acciones";

export const dynamic = "force-dynamic";

const BASE = "/config/canales";

const TIPOS: Record<string, string> = {
  mercadolibre: "Mercado Libre", web_minorista: "Web minorista", web_mayorista: "Web mayorista",
  local: "Local", historico: "Histórico", otro: "Otro",
};
const ESTADOS: Record<string, { texto: string; tono: "verde" | "amarillo" | "gris" }> = {
  activo: { texto: "Activo", tono: "verde" }, pausado: { texto: "Pausado", tono: "amarillo" }, archivado: { texto: "Archivado", tono: "gris" },
};

type SP = { c?: string; editar?: string; ok?: string; error?: string };

export default async function Canales({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("canales_ver");
  const sp = await searchParams;
  await sembrarEjemploCanales(s.org.id);
  const deEjemplo = await canalesDeEjemplo(s.org.id);
  const editar = Number(sp.editar) || 0;

  const canales = await consulta<{
    id: number; nombre: string; tipo: string; lista_id: number | null; lista: string | null; estado: string;
    umbral: number | null; token_fin: string | null; depositos: string | null;
  }>(`
    select c.id::int, c.nombre, c.tipo, c.lista_precios_id::int lista_id, l.nombre lista, c.estado, c.umbral_pausa_default umbral,
           right(c.config ->> 'token', 4) token_fin,
           (select string_agg(d.nombre, ', ' order by cd.prioridad, d.nombre) from canal_deposito cd join deposito d on d.id = cd.deposito_id
             where cd.canal_id = c.id) depositos
      from canal c left join lista_precios l on l.id = c.lista_precios_id
     where c.organizacion_id = $1 order by c.estado, c.nombre`, [s.org.id]);
  const listas = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from lista_precios where organizacion_id = $1 and estado = 'activa' order by orden, nombre", [s.org.id]);
  const elegido = canales.find((c) => c.id === Number(sp.c));
  const crudo = (await cookies()).get("token_nuevo")?.value?.match(/^(\d+):([0-9a-f]{64})$/);
  const tokenNuevo = crudo ? { canal: Number(crudo[1]), token: crudo[2] } : null;
  const aqui = url(BASE, { c: elegido?.id });

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
    <Pantalla titulo="Canales" subtitulo="Por dónde se vende: con qué lista de precios y desde qué depósitos. Tocá un canal para ver sus depósitos y su token.">
      <Avisos sp={sp} />
      {deEjemplo.length > 0 && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FFF8E5] text-[#8a6100]">
          Son datos de ejemplo (un canal por tipo, con sus listas y un depósito propio): borralos o cambialos. No se vuelven a crear.
        </p>
      )}

      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Canal</th><th className={TH}>Tipo</th><th className={TH}>Lista de precios</th><th className={TH}>Vende desde</th>
              <th className={TH}>Estado</th><th className={THN}>Umbral de pausa</th><th className={TH}>Token</th><th />
            </tr>
          </thead>
          <tbody>
            {canales.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>No hay canales. Agregá el primero abajo.</td></tr>}
            {canales.map((c) => editar === c.id ? (
              <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                <td colSpan={8} className={TD}>
                  <form action={accionGuardarCanal} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="volver" value={aqui} />
                    <label className="flex-1 min-w-40"><span className={ETIQUETA}>Nombre</span>
                      <input name="nombre" defaultValue={c.nombre} className={`${CAMPO} w-full`} autoFocus /></label>
                    <label><span className={ETIQUETA}>Tipo</span>{selectorTipo(c.tipo)}</label>
                    <label><span className={ETIQUETA}>Lista de precios</span>{selectorLista(c.lista_id)}</label>
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
                <td className={TD}><Link href={url(BASE, { c: c.id })} className="font-semibold text-[#16577F] hover:underline">{c.nombre}</Link></td>
                <td className={TD}>{TIPOS[c.tipo] ?? c.tipo}</td>
                <td className={TD}>{c.lista ?? <span className="text-[#C03420]">sin lista</span>}</td>
                <td className={TD}>{c.depositos ?? <span className="text-[#C03420]">ningún depósito</span>}</td>
                <td className={TD}><Estado texto={ESTADOS[c.estado]?.texto ?? c.estado} tono={ESTADOS[c.estado]?.tono ?? "gris"} /></td>
                <td className={TDN}>{c.umbral ?? <span className="text-[#5C6B76]">hereda</span>}</td>
                <td className={`${TD} whitespace-nowrap`}>{c.token_fin ? `…${c.token_fin}` : <span className="text-[#5C6B76]">sin token</span>}</td>
                <td className={`${TD} text-right whitespace-nowrap`}>
                  <span className="inline-flex gap-1">
                    <Lapiz href={url(BASE, { c: elegido?.id, editar: c.id })} />
                    <TachoConfirmar accion={accionBorrarCanal} campos={{ id: String(c.id) }} pregunta="¿Borrar el canal?" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form action={accionCrearCanal} className="flex flex-wrap items-center gap-2 mt-3">
        <input name="nombre" placeholder="Canal nuevo (ej. Mercado Libre cuenta 2)" className={`${CAMPO} flex-1 min-w-48`} />
        {selectorTipo("mercadolibre")}
        {selectorLista(null)}
        <button className={PRIMARIO}>Agregar</button>
      </form>
      <p className="text-[11px] text-[#5C6B76] mt-1">Umbral de pausa: con ese stock disponible o menos, se pausan las publicaciones del canal (vacío = el de la organización, 1).</p>

      {elegido && (
        <div className="grid gap-4 md:grid-cols-2 mt-6">
          <section className={CAJA}>
            <h2 className="text-sm font-bold mb-1">Depósitos de “{elegido.nombre}”</h2>
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
                        <form action={accionPrioridadDeposito} className="inline-flex items-center gap-1 justify-end">
                          <input type="hidden" name="canal" value={elegido.id} />
                          <input type="hidden" name="deposito" value={d.id} />
                          <input type="hidden" name="volver" value={aqui} />
                          <CampoNumero name="prioridad" valor={d.prioridad} tipo="entero" className={`${CAMPO} w-14`} />
                          <button className={SUAVE}>Guardar</button>
                        </form>
                      </td>
                      <td className={`${TD} text-right`}>
                        <TachoConfirmar accion={accionQuitarDeposito} campos={{ canal: String(elegido.id), deposito: String(d.id), volver: aqui }} pregunta="¿Quitar?" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {otrosDepositos.length > 0 ? (
              <form action={accionAgregarDeposito} className="flex flex-wrap items-center gap-2 mt-2">
                <input type="hidden" name="canal" value={elegido.id} />
                <input type="hidden" name="volver" value={aqui} />
                <select name="deposito" className={CAMPO} aria-label="Depósito">
                  {otrosDepositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
                <CampoNumero name="prioridad" valor={susDepositos.length + 1} tipo="entero" className={`${CAMPO} w-14`} />
                <button className={PRIMARIO}>Agregar depósito</button>
              </form>
            ) : (
              <p className="text-[11px] text-[#5C6B76] mt-2">No quedan otros depósitos activos. <Link href="/stock/depositos" className="text-[#16577F] underline">Crear uno</Link>.</p>
            )}
          </section>

          <section className={CAJA}>
            <h2 className="text-sm font-bold mb-1">Token de la API</h2>
            <p className="text-[11px] text-[#5C6B76] mb-2">
              La tienda web y la sincronización de Mercado Libre cargan pedidos llamando a <code>/api/pedidos</code> con <code>Authorization: Bearer &lt;token&gt;</code>: el token dice de qué canal es el pedido.
            </p>
            {tokenNuevo && tokenNuevo.canal === elegido.id && (
              <p className="text-xs rounded-lg px-3 py-2 mb-2 bg-[#FFF8E5] text-[#8a6100] break-all">
                Token nuevo (copialo ahora, en un minuto deja de mostrarse): <b className="font-mono select-all">{tokenNuevo.token}</b>
              </p>
            )}
            {elegido.token_fin ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>Tiene token: termina en <b className="font-mono">…{elegido.token_fin}</b></span>
                <BotonConfirmar accion={accionGenerarToken} campos={{ canal: String(elegido.id), volver: aqui }} clase={SUAVE}
                  texto="Generar otro" pregunta="¿Reemplazarlo? El actual deja de andar." corriendo="Generando…" />
                <BotonConfirmar accion={accionRevocarToken} campos={{ canal: String(elegido.id), volver: aqui }} clase={APAGAR}
                  texto="Revocar" pregunta="¿Revocar el token?" corriendo="Revocando…" />
              </div>
            ) : (
              <form action={accionGenerarToken} className="flex items-center gap-2 text-xs">
                <input type="hidden" name="canal" value={elegido.id} />
                <input type="hidden" name="volver" value={aqui} />
                <span className="text-[#5C6B76]">Sin token: nadie puede cargar pedidos de este canal por la API.</span>
                <button className={PRIMARIO}>Generar token</button>
              </form>
            )}
          </section>
        </div>
      )}
    </Pantalla>
  );
}
