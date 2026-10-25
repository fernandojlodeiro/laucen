// Informes › Embudo de publicidad (Fer, 25/10; como el de CadaMes): por canal de anuncios —las cuentas de Mercado
// Libre, Meta, Google, TikTok— del gasto a lo vendido en el período, con cuánto costó cada venta y cuánto volvió por cada
// peso; y los anuncios de Meta uno por uno. Los datos: lib/publicidad/embudo.ts. Arriba, la conexión con Meta.

import Link from "next/link";
import RangoFechas from "@/app/componentes/RangoFechas";
import { entrarErp, Pantalla, Avisos, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, TituloSeccion } from "@/app/componentes/erp";
import { Paginado } from "@/app/componentes/Lista";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { BotonConfirmar } from "@/app/radar/Cliente";
import TituloCorto from "@/app/componentes/TituloCorto";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { formatearNumero } from "@/lib/numeros";
import { rangoDeAtajo } from "@/lib/rango-fechas";
import { paginarEnMemoria } from "@/lib/lista";
import { embudo, type FilaEmbudo } from "@/lib/publicidad/embudo";
import { conexionMeta, datosAppMetaAnuncios } from "@/lib/publicidad/meta-ads";
import { PARAMETROS_META } from "@/lib/publicidad/atribucion";
import { accionDesconectarMeta, accionLeerMeta } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SP = { desde?: string; hasta?: string; p?: string; meta?: string; ok?: string; error?: string };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const pesos = (n: number | null) => (n == null ? "—" : `$ ${formatearNumero(Math.round(n), "pesos")}`);
const entero = (n: number | null) => (n == null ? "—" : formatearNumero(n, "entero"));
const veces = (vendido: number, gasto: number | null) => (gasto ? `${formatearNumero(Math.round((vendido / gasto) * 10) / 10, "decimal")} x` : "—");
const porVenta = (gasto: number | null, ventas: number) => (gasto != null && ventas ? pesos(gasto / ventas) : "—");

const VUELTA_META: Record<string, { ok: boolean; texto: string }> = {
  ok: { ok: true, texto: "¡Anuncios de Meta conectados! Ya se leyó el gasto de los últimos 30 días; se vuelve a leer solo cada 3 horas." },
  cancelado: { ok: false, texto: "Se canceló la conexión con Meta antes de terminar." },
  rechazo: { ok: false, texto: "Meta no dio el permiso. Probá de nuevo y aceptá todos los pasos." },
  estado: { ok: false, texto: "La conexión tardó demasiado o vino de otro lado. Empezala de nuevo." },
  canje: { ok: false, texto: "Meta no terminó de dar el permiso. Probá de nuevo en un rato." },
  sin_cuentas: { ok: false, texto: "No se compartió ninguna cuenta publicitaria. Probá de nuevo y tildá la cuenta de anuncios del negocio." },
  sinpermiso: { ok: false, texto: "Tu rol no puede conectar los anuncios." },
  sinapp: { ok: false, texto: "La conexión con Meta todavía no está lista del lado de Laucen." },
};

export default async function EmbudoPublicidad({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("publicidad_ver");
  const sp = await searchParams;
  const mes = rangoDeAtajo("mes");
  const desde = FECHA.test(sp.desde ?? "") ? sp.desde! : mes.desde;
  const hasta = FECHA.test(sp.hasta ?? "") ? sp.hasta! : mes.hasta;
  const [{ filas, anuncios }, meta, app] = await Promise.all([embudo(s.org.id, desde, hasta), conexionMeta(s.org.id), datosAppMetaAnuncios()]);
  const appLista = !!(app.appId && app.hayClave && app.configId);
  const vuelta = sp.meta ? VUELTA_META[sp.meta] : null;
  const conGasto = filas.filter((f) => f.gasto != null);
  const total = { gasto: conGasto.reduce((t, f) => t + (f.gasto ?? 0), 0), vendido: conGasto.reduce((t, f) => t + f.vendido, 0) };

  return (
    <Pantalla titulo="Embudo de publicidad"
      subtitulo="De lo invertido en anuncios a lo vendido, por canal: Mercado Libre, Meta (Facebook e Instagram), Google y TikTok"
      acciones={meta
        ? <BotonTarea accion={accionLeerMeta} tipo="meta-ads" clase={SUAVE} texto="Leer Meta ahora" />
        : appLista ? <a href="/api/meta-ads/conectar/ir" className={PRIMARIO}>Conectar anuncios de Meta</a> : null}>
      <Avisos sp={sp} />
      {vuelta && <p className={`text-xs rounded-lg px-3 py-2 mb-3 ${vuelta.ok ? "bg-[#E8F5EE] text-[#167655]" : "bg-[#FDF0E6] text-[#8a6100]"}`}>{vuelta.texto}</p>}
      {meta?.lecturaEstado === "rechazo" && (
        <p className="text-xs rounded-lg px-3 py-2 mb-3 bg-[#FDF0E6] text-[#8a6100]">Meta dejó de dejar leer los anuncios: <a href="/api/meta-ads/conectar/ir" className="underline font-semibold">volvé a conectar la cuenta</a>.</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <RangoFechas desde={desde} hasta={hasta} />
        {conGasto.length > 0 && <span className="text-xs text-[#5C6B76]">Invertido: <b className="text-[#1F2D3A]">{pesos(total.gasto)}</b> · vendido con publicidad: <b className="text-[#1F2D3A]">{pesos(total.vendido)}</b> · {veces(total.vendido, total.gasto)}</span>}
      </div>

      <TituloSeccion titulo={`Por canal (${filas.length})`} />
      <div className={`${CAJA_TABLA} mb-4`}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Canal</th>
              <th className={THN} title="Lo gastado en anuncios en el período">Invertido</th>
              <th className={THN} title="Cuántas veces se vio un anuncio (impresiones)">Vieron</th>
              <th className={THN} title="Clics en los anuncios">Clics</th>
              <th className={THN} title="Chats de WhatsApp o Instagram que empezaron desde un anuncio">Escrib.</th>
              <th className={THN} title="Mercado Libre: unidades vendidas por la publicidad; los demás: pedidos de la tienda web que llegaron desde un anuncio">Ventas</th>
              <th className={THN} title="Lo vendido por esas ventas">Vendido</th>
              <th className={THN} title="Invertido dividido ventas">Costo/venta</th>
              <th className={THN} title="Vendido dividido invertido: cuántos pesos volvieron por cada peso invertido">Retorno</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => <FilaCanal key={f.clave} f={f} metaConectada={!!meta} />)}
          </tbody>
        </table>
      </div>

      <TituloSeccion titulo={`Anuncios de Meta (${anuncios.length})`} />
      {anuncios.length === 0 ? (
        <p className={`${CAJA} text-xs text-[#5C6B76] mb-4`}>{meta ? "No hay anuncios de Meta con gasto, chats ni ventas en el período." : "Cuando conectes la cuenta de anuncios de Meta, acá se ve cada anuncio con lo que gastó y lo que trajo."}</p>
      ) : (
        <div className="mb-4">
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Anuncio</th>
                  <th className={THN}>Invertido</th><th className={THN}>Vieron</th><th className={THN}>Clics</th>
                  <th className={THN} title="Chats que empezaron desde este anuncio">Escrib.</th>
                  <th className={THN} title="Pedidos de la tienda web que llegaron desde este anuncio">Ventas</th>
                  <th className={THN}>Vendido</th><th className={THN}>Costo/venta</th><th className={THN}>Retorno</th>
                </tr>
              </thead>
              <tbody>
                {paginarEnMemoria(anuncios, sp).map((a) => (
                  <tr key={a.anuncioId} className={TR}>
                    <td className={`${TD} max-w-80`}>
                      <span className="font-semibold">{a.anuncio ?? `Anuncio ${a.anuncioId}`}</span>
                      {a.campana && <TituloCorto titulo={a.campana} />}
                    </td>
                    <td className={TDN}>{pesos(a.gasto)}</td><td className={TDN}>{entero(a.vieron)}</td><td className={TDN}>{entero(a.clics)}</td>
                    <td className={TDN}>{entero(a.escribieron)}</td><td className={TDN}>{entero(a.ventas)}</td><td className={TDN}>{pesos(a.vendido)}</td>
                    <td className={TDN}>{porVenta(a.gasto || null, a.ventas)}</td><td className={TDN}>{veces(a.vendido, a.gasto || null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginado total={anuncios.length} />
        </div>
      )}

      <TituloSeccion titulo="Conexiones" />
      <div className={`${CAJA} text-xs space-y-3`}>
        <div>
          <p className="font-semibold">Meta (Facebook e Instagram)</p>
          {meta ? (
            <>
              <p className="text-[#5C6B76]">Conectada: {meta.cuentas.map((c) => c.nombre).join(", ")}. {meta.lecturaTs ? `Leído el ${new Date(meta.lecturaTs).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}; se vuelve a leer solo cada 3 horas.` : "Todavía sin leer."}</p>
              <div className="flex flex-wrap gap-2 mt-1">
                <a href="/api/meta-ads/conectar/ir" className={SUAVE}>Volver a conectar</a>
                <BotonConfirmar accion={accionDesconectarMeta} campos={{}} clase={SUAVE} texto="Desconectar" corriendo="Desconectando…" pregunta="¿Desconectar los anuncios de Meta? Lo ya leído queda." />
              </div>
            </>
          ) : appLista ? (
            <p className="text-[#5C6B76]">Sin conectar: «Conectar anuncios de Meta» (arriba a la derecha) abre Facebook para compartir la cuenta de anuncios del negocio, sólo para leer el gasto.</p>
          ) : (
            <p className="text-[#5C6B76]">Sin conectar: falta cargar la app de Meta de Laucen (Ventas › Mensajes › <Link href="/ventas/mensajes/configuracion" className="text-[#16577F] underline">Configuración</Link>).</p>
          )}
          <p className="text-[11px] text-[#5C6B76] mt-2">
            Para que cada venta de la tienda web sepa de qué anuncio vino, en cada anuncio de Meta, en «Parámetros de URL», poné:
            <code className="block mt-1 bg-[#F7F9FB] border border-[#E3E9F0] rounded px-2 py-1 break-all select-all">{PARAMETROS_META}</code>
          </p>
        </div>
        <div className="text-[#5C6B76]"><span className="font-semibold text-[#1F2D3A]">Google y TikTok:</span> el gasto todavía no se lee (próximamente); las ventas de la web que llegan desde sus anuncios ya se cuentan.</div>
      </div>
    </Pantalla>
  );
}

function FilaCanal({ f, metaConectada }: { f: FilaEmbudo; metaConectada: boolean }) {
  const sinConectar = f.gasto == null && (f.clave === "google" || f.clave === "tiktok" || (f.clave === "meta" && !metaConectada));
  return (
    <tr className={TR} data-canal={f.clave.startsWith("ml:") ? f.clave.slice(3) : undefined}>
      <td className={TD}>
        <span className="font-semibold">{f.canal}</span>{f.detalle && <span className="text-[#5C6B76]"> · {f.detalle}</span>}
        {sinConectar && <span className="block text-[10px] text-[#8A97A3]">{f.clave === "meta" ? "gasto sin conectar" : "gasto: próximamente"}</span>}
      </td>
      <td className={TDN}>{pesos(f.gasto)}</td><td className={TDN}>{entero(f.vieron)}</td><td className={TDN}>{entero(f.clics)}</td>
      <td className={TDN}>{entero(f.escribieron)}</td>
      <td className={TDN} title={f.unidad === "unidades" ? "Unidades vendidas por la publicidad" : "Pedidos"}>{entero(f.ventas)}</td>
      <td className={TDN}>{pesos(f.vendido)}</td><td className={TDN}>{porVenta(f.gasto, f.ventas)}</td><td className={TDN}>{veces(f.vendido, f.gasto)}</td>
    </tr>
  );
}
