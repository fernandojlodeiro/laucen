// La cuenta de Mercado Pago de un canal (Fer, 6/10): conectarla con el botón
// (Mercado Pago pide aprobar la aplicación de Laucen con la cuenta que se
// quiere conectar), o usar una ya conectada en otro canal (la misma cuenta
// puede ir en varios: por ejemplo la de la tienda web y la de una cuenta de
// Mercado Libre). Sólo lectura: Laucen lee saldos y movimientos, no mueve plata.

import Link from "next/link";
import { PRIMARIO, SUAVE, APAGAR } from "@/app/botones";
import { BotonConfirmar } from "@/app/radar/Cliente";
import { CAJA, Estado } from "@/app/componentes/erp";
import { una } from "@/lib/erp/base";
import { conexionesDe } from "@/lib/mercadopago/conexion";
import { accionUsarCuentaMp, accionSacarCuentaMp } from "./acciones-mp";

export default async function CuentaMp({ org, canal }: { org: string; canal: number }) {
  const [conexiones, actual] = await Promise.all([
    conexionesDe(org),
    una<{ conexion_id: number }>("select conexion_id::int from canal_mp where canal_id = $1 and organizacion_id = $2", [canal, org]),
  ]);
  const c = conexiones.find((x) => x.id === actual?.conexion_id);
  const otras = conexiones.filter((x) => x.id !== c?.id);
  const conectar = `/config/canales/mercadopago?canal=${canal}`;

  return (
    <section className={CAJA}>
      <h2 className="text-sm font-bold mb-1">Cuenta de Mercado Pago</h2>
      {!c ? (
        <div className="text-xs grid gap-2">
          <p className="text-[#5C6B76]">Este canal todavía no tiene una cuenta de Mercado Pago. Al conectarla, Laucen lee sus saldos y movimientos (sólo lectura: no mueve plata).</p>
          <div className="flex flex-wrap gap-2">
            <Link href={conectar} className={PRIMARIO} prefetch={false}>Conectar Mercado Pago</Link>
            {otras.map((o) => (
              <form key={o.id} action={accionUsarCuentaMp}>
                <input type="hidden" name="canal" value={canal} /><input type="hidden" name="conexion" value={o.id} />
                <button className={SUAVE}>Usar la ya conectada: {o.nombre ?? o.email ?? `cuenta ${o.mpUserId}`}</button>
              </form>
            ))}
          </div>
          <p className="text-[11px] text-[#5C6B76]">Mercado Pago conecta la cuenta con la que estés logueado en el navegador: para conectar otra, cerrá antes esa sesión (o usá una ventana privada).</p>
        </div>
      ) : (
        <div className="text-xs grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <b>{c.nombre ?? c.email ?? `Cuenta ${c.mpUserId}`}</b>
            <Estado texto={c.estado === "activa" ? "Conectada" : "Desconectada: volvé a conectarla"} tono={c.estado === "activa" ? "verde" : "rojo"} />
            {c.estado !== "activa" && <Link href={conectar} className={PRIMARIO} prefetch={false}>Volver a conectar</Link>}
            <BotonConfirmar accion={accionSacarCuentaMp} campos={{ canal: String(canal) }} clase={APAGAR} texto="Sacarla del canal" pregunta="¿Sacar la cuenta de Mercado Pago de este canal?" corriendo="…" />
          </div>
          {c.canales.length > 1 && <p className="text-[11px] text-[#5C6B76]">La misma cuenta está en: {c.canales.map((x) => x.nombre).join(", ")} (en los saldos cuenta una sola vez).</p>}
          {c.ultimoError && <p className="text-[11px] text-[#C03420]">Último problema: {c.ultimoError}</p>}
          <p className="text-[11px]"><Link href="/administracion/mercadopago" className="text-[#16577F] hover:underline">Ver sus saldos en Administración › Mercado Pago</Link></p>
        </div>
      )}
    </section>
  );
}
