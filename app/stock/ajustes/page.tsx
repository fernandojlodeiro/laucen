// Ajustes de stock (orden 136, §7): sumar o restar a mano, con motivo
// obligatorio (movimiento tipo `ajuste`), y transferir entre ubicaciones
// (tipo `transferencia`). Todo por moverStock: nunca se toca `stock` directo.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { TIPOS_MOVIMIENTO, type TipoMovimiento } from "@/lib/stock";
import { PRIMARIO } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import CampoNumero from "@/app/componentes/CampoNumero";
import ElegirUbicacion from "@/app/componentes/ElegirUbicacion";
import {
  entrarErp, Pantalla, Avisos, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA, CAJA,
} from "@/app/componentes/erp";
import { accionAjustar, accionTransferir } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { sku?: string; ok?: string; error?: string };

type Ubic = { id: number; deposito_id: number; deposito: string; codigo: string; es_default: boolean };

/** Depósito → ubicación, con buscador (son cientos). */
function SelectorUbicacion({ name, ubicaciones, etiqueta }: { name: string; ubicaciones: Ubic[]; etiqueta: string }) {
  return (
    <div><span className={ETIQUETA}>{etiqueta}</span>
      <ElegirUbicacion name={name} className="w-64"
        opciones={ubicaciones.map((u) => ({ valor: String(u.id), texto: `${u.deposito} · ${u.es_default ? "General" : u.codigo}` }))} />
    </div>
  );
}

export default async function Ajustes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("stock_ajustar");
  const sp = await searchParams;

  // Ubicaciones activas de depósitos activos; si el depósito no usa
  // ubicaciones, sólo su general.
  const ubicaciones = await consulta<Ubic>(`
    select u.id::int, d.id::int deposito_id, d.nombre deposito, u.codigo, u.es_default
      from ubicacion u join deposito d on d.id = u.deposito_id
     where u.organizacion_id = $1 and u.estado = 'activa' and d.estado = 'activo' and (u.es_default or d.usa_ubicaciones)
     order by d.nombre, u.es_default desc, u.orden_recorrido, u.codigo`, [s.org.id]);

  const ultimos = await consulta<{
    id: number; fecha: string; tipo: TipoMovimiento; variacion_id: number; sku: string; origen: string | null; destino: string | null;
    cantidad: number; nota: string | null; usuario: string | null;
  }>(`
    select m.id::int, to_char(m.fecha at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY HH24:MI') fecha, m.tipo,
           v.id::int variacion_id, v.sku,
           (select d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_origen_id) origen,
           (select d.nombre || ' · ' || case when u.es_default then 'General' else u.codigo end from ubicacion u join deposito d on d.id = u.deposito_id where u.id = m.ubicacion_destino_id) destino,
           m.cantidad, m.nota, coalesce(us.nombre, us.email) usuario
      from movimiento_stock m
      join variacion v on v.id = m.variacion_id
      left join usuarios us on us.id = m.usuario_id
     where m.organizacion_id = $1 and m.tipo in ('ajuste', 'transferencia')
     order by m.fecha desc, m.id desc limit 30`, [s.org.id]);

  return (
    <Pantalla titulo="Ajustes de stock" subtitulo="Corregir el stock a mano (con motivo) o pasarlo de una ubicación a otra.">
      <Avisos sp={sp} />
      {ubicaciones.length === 0 ? (
        <p className={`${CAJA} text-xs text-[#5C6B76]`}>Primero hace falta un depósito: <Link href="/stock/depositos" className="text-[#16577F] underline">Stock → Depósitos y ubicaciones</Link>.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className={CAJA}>
            <h2 className="text-sm font-bold mb-2">Ajuste</h2>
            <form action={accionAjustar} className="flex flex-wrap items-end gap-2">
              <label><span className={ETIQUETA}>SKU o código de barras</span>
                <input name="sku" defaultValue={sp.sku ?? ""} className={`${CAMPO} w-44`} autoFocus /></label>
              <SelectorUbicacion name="ubicacion" ubicaciones={ubicaciones} etiqueta="Depósito · ubicación" />
              <label><span className={ETIQUETA}>Sumar o restar</span>
                <select name="sentido" defaultValue="sumar" className={CAMPO}>
                  <option value="sumar">Sumar (+)</option><option value="restar">Restar (−)</option>
                </select></label>
              <label><span className={ETIQUETA}>Cantidad</span>
                <CampoNumero name="cantidad" valor={null} tipo="entero" className={`${CAMPO} w-20`} /></label>
              <label className="w-full"><span className={ETIQUETA}>Motivo (obligatorio)</span>
                <input name="motivo" placeholder="Ej. conteo físico, rotura, apareció en otro estante" className={`${CAMPO} w-full`} /></label>
              <BotonEnviar clase={PRIMARIO} corriendo="Guardando…">Ajustar</BotonEnviar>
            </form>
          </section>

          <section className={CAJA}>
            <h2 className="text-sm font-bold mb-2">Transferencia</h2>
            <form action={accionTransferir} className="flex flex-wrap items-end gap-2">
              <label><span className={ETIQUETA}>SKU o código de barras</span>
                <input name="sku" defaultValue={sp.sku ?? ""} className={`${CAMPO} w-44`} /></label>
              <label><span className={ETIQUETA}>Cantidad</span>
                <CampoNumero name="cantidad" valor={null} tipo="entero" className={`${CAMPO} w-20`} /></label>
              <SelectorUbicacion name="origen" ubicaciones={ubicaciones} etiqueta="Desde" />
              <SelectorUbicacion name="destino" ubicaciones={ubicaciones} etiqueta="Hacia" />
              <label className="w-full"><span className={ETIQUETA}>Nota (opcional)</span>
                <input name="nota" className={`${CAMPO} w-full`} /></label>
              <BotonEnviar clase={PRIMARIO} corriendo="Guardando…">Transferir</BotonEnviar>
            </form>
          </section>
        </div>
      )}
      <p className="text-[11px] text-[#5C6B76] mt-2">Los kits no se ajustan: su stock se mueve con el de sus componentes.</p>

      <h2 className="text-sm font-bold mt-6 mb-2">Últimos ajustes y transferencias</h2>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Fecha</th><th className={TH}>Tipo</th><th className={TH}>SKU</th><th className={TH}>Desde</th><th className={TH}>Hacia</th>
              <th className={THN}>Cantidad</th><th className={TH}>Motivo / nota</th><th className={TH}>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {ultimos.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>Todavía no hay ajustes.</td></tr>}
            {ultimos.map((m) => {
              // Un ajuste con sólo origen resta; con sólo destino suma.
              const signo = m.tipo === "ajuste" ? (m.origen ? "−" : "+") : "";
              return (
                <tr key={m.id} className={TR}>
                  <td className={`${TD} whitespace-nowrap`}>{m.fecha}</td>
                  <td className={TD}>{TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo}</td>
                  <td className={TD}><Link href={url("/stock/consulta", { v: m.variacion_id })} className="text-[#16577F] hover:underline">{m.sku}</Link></td>
                  <td className={TD}>{m.origen ?? "—"}</td>
                  <td className={TD}>{m.destino ?? "—"}</td>
                  <td className={`${TDN} ${signo === "−" ? "text-[#C03420]" : ""}`}>{signo}{m.cantidad}</td>
                  <td className={TD}>{m.nota ?? "—"}</td>
                  <td className={TD}>{m.usuario ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Pantalla>
  );
}
