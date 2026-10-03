// La cuenta de Mercado Libre de un canal: conectarla (o usar una ya
// conectada), prender la sincronización de stock y traer ya los pedidos.

import Link from "next/link";
import { consulta, una } from "@/lib/erp/base";
import { PRIMARIO, SUAVE, APAGAR } from "@/app/botones";
import { BotonEnviar, BotonConfirmar } from "@/app/radar/Cliente";
import { Interruptor } from "@/app/radar/Piezas";
import { CAJA, Estado } from "@/app/componentes/erp";
import { estadoColaCanal } from "@/lib/mercadolibre/cola";
import { accionSincronizarStock, accionSoltarCuenta, accionTraerAhora, accionUsarCuenta } from "./acciones-ml";

export default async function CuentaMl({ org, canal }: { org: string; canal: number }) {
  const cuenta = await una<{ id: number; nickname: string | null; estado: string; ultimo_error: string | null; pedidos_desde: Date | null }>(
    "select id::int, nickname, estado, ultimo_error, pedidos_desde from meli_cuenta where organizacion_id = $1 and canal_id = $2", [org, canal]);
  const libres = cuenta ? [] : await consulta<{ id: number; nickname: string | null }>(
    "select id::int, nickname from meli_cuenta where organizacion_id = $1 and canal_id is null order by id", [org]);
  const sincroniza = !!(await una("select 1 from canal where id = $1 and coalesce((config ->> 'sincronizar_stock')::boolean, false)", [canal]));
  const pendientes = await una<{ pubs: number; sin: number; preguntas: number }>(`
    select (select count(*) from publicacion where canal_id = $1 and id_externo is not null)::int pubs,
           (select count(*) from meli_item where canal_id = $1 and publicacion_id is null)::int sin,
           (select count(*) from meli_pregunta where canal_id = $1 and estado = 'UNANSWERED')::int preguntas`, [canal]);
  const campos = { canal: String(canal) };
  const cola = cuenta ? await estadoColaCanal(canal) : null;
  const fh = (d: Date) => d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <section className={CAJA}>
      <h2 className="text-sm font-bold mb-1">Cuenta de Mercado Libre</h2>
      {!cuenta ? (
        <div className="text-xs grid gap-2">
          <p className="text-[#5C6B76]">Este canal todavía no tiene una cuenta de ML. Al conectarla empiezan a entrar sus pedidos, envíos y preguntas.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/config/canales/meli?canal=${canal}`} className={PRIMARIO}>Conectar una cuenta de Mercado Libre</Link>
            {libres.map((l) => (
              <form key={l.id} action={accionUsarCuenta}>
                <input type="hidden" name="canal" value={canal} /><input type="hidden" name="cuenta" value={l.id} />
                <button className={SUAVE}>Usar la ya conectada: {l.nickname ?? `cuenta ${l.id}`}</button>
              </form>
            ))}
          </div>
          <p className="text-[11px] text-[#5C6B76]">Para conectar otra cuenta, cerrá antes la sesión de ML en el navegador (o usá una ventana privada): ML conecta la cuenta con la que estés logueado.</p>
        </div>
      ) : (
        <div className="text-xs grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <b>{cuenta.nickname ?? `Cuenta ${cuenta.id}`}</b>
            <Estado texto={cuenta.estado === "activa" ? "Conectada" : "Desconectada: volvé a conectarla"} tono={cuenta.estado === "activa" ? "verde" : "rojo"} />
            {cuenta.estado !== "activa" && <Link href={`/config/canales/meli?canal=${canal}`} className={PRIMARIO}>Volver a conectar</Link>}
            <BotonConfirmar accion={accionSoltarCuenta} campos={campos} clase={APAGAR} texto="Sacarla del canal" pregunta="¿Dejan de entrar sus pedidos?" corriendo="…" />
          </div>
          {cuenta.ultimo_error && <p className="text-[11px] text-[#C03420]">Último problema: {cuenta.ultimo_error}</p>}
          <p className="text-[11px] text-[#5C6B76]">
            {pendientes!.pubs} publicaciones vinculadas{pendientes!.sin ? ` · ${pendientes!.sin} sin vincular` : ""} · {pendientes!.preguntas} preguntas sin responder
            {cuenta.pedidos_desde && ` · pedidos al día hasta el ${cuenta.pedidos_desde.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          </p>
          {cola && (
            <p className="text-[11px]">
              <Link href={`/config/canales/cola?canal=${canal}`} className="text-[#16577F] hover:underline">Cola: {cola.pendientes} pendientes</Link>
              {", "}
              <Link href={`/config/canales/cola?ver=errores&canal=${canal}`} className={cola.errores ? "text-[#C03420] font-semibold hover:underline" : "text-[#16577F] hover:underline"}>{cola.errores} con error</Link>
              {cola.preparados > 0 && <>{", "}<Link href="/config/canales/cola?ver=lotes" className="text-[#8a6100] font-semibold hover:underline">{cola.preparados} preparados esperando tu clic</Link></>}
              {" · "}
              <Link href="/config/canales/cola?ver=barridas" className="text-[#16577F] hover:underline">
                {cola.barrida_ts ? `Última barrida: ${fh(cola.barrida_ts)}, ${cola.barrida_revisadas ?? 0} revisadas, ${cola.barrida_diferencias ?? 0} diferencias`
                  : cola.barrida_fase ? "Barrida de esta noche en curso" : "Todavía no hubo barrida nocturna"}
              </Link>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={accionTraerAhora}><input type="hidden" name="canal" value={canal} /><BotonEnviar clase={SUAVE} corriendo="Trayendo…">Traer pedidos y preguntas ahora</BotonEnviar></form>
            <Link href={`/catalogo/publicaciones/ml?canal=${canal}`} className={SUAVE}>Vincular publicaciones</Link>
          </div>
          <Interruptor accion={accionSincronizarStock} prendido={sincroniza} campos={campos}
            etiqueta="Laucen manda el stock a ML y pausa al llegar al umbral"
            ayuda={sincroniza
              ? "Prendido: cada publicación vinculada informa el disponible del canal; al llegar al umbral de pausa se pausa (y se reactiva cuando vuelve a haber). Las de Full no se tocan."
              : "Apagado: no se toca nada en ML. Prendelo cuando el stock de Laucen esté cargado y las publicaciones vinculadas — si no, las pausaría a todas por falta de stock."} />
        </div>
      )}
    </section>
  );
}
