// Administración → Mercado Pago (Fer, 6/10): los números de cada cuenta de
// Mercado Pago conectada (Configuración › Canales › "Conectar Mercado Pago"),
// leídos al abrir o con "Actualizar": disponible, a liberar, saldo total,
// próxima liberación y lo cobrado en los últimos 30 días; una columna por
// cuenta y una de total. Una misma cuenta en varios canales es una columna.
// Debajo, qué contestó Mercado Pago a cada consulta. Sólo lee.

import Link from "next/link";
import { SUAVE } from "@/app/botones";
import { entrarErp, Pantalla, Avisos, Estado, TituloSeccion, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { lecturasGuardadas, ultimoDisponible, type Numeros } from "@/lib/mercadopago/saldos";
import { BotonTarea } from "@/app/componentes/TareasFondo";
import { accionLeerMercadoPago } from "./acciones";
import LeerSolo from "./LeerSolo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ZONA = "America/Argentina/Buenos_Aires";
const hora = (d: Date | string) => new Date(d).toLocaleString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const dia = (d: string) => new Date(d).toLocaleDateString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit" });
const plata = (n: number | null | undefined) => (n == null ? "—" : formatear(n, "ARS"));

type Renglon = { titulo: string; ayuda?: string; nivel?: number; valor: (d: Numeros) => number | null | undefined; texto?: (d: Numeros) => string | null; suma?: boolean; cantidad?: boolean;
  /** En negrita y con los montos pintados según cuál tiene más (Fer, 6/10). */
  destacar?: boolean };

// Colores del renglón destacado, de mayor a menor: el más grande en verde
// fuerte, el que le sigue en verde suave, los del medio sin color y los dos
// más chicos en ámbar. Las columnas no cambian de lugar.
const PRIMERO = "bg-[#CDEFD9] text-[#14532D] ring-1 ring-[#86CFA3]";
const SEGUNDO = "bg-[#EAF7EF] text-[#1F6E4A]";
const ULTIMOS = "bg-[#FFF1D6] text-[#8a5a00]";
function coloresPorMonto(vals: (number | null | undefined)[]): (string | null)[] {
  const conMonto = vals.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null).sort((a, b) => b.v - a.v);
  const out: (string | null)[] = vals.map(() => null);
  if (conMonto.length < 2) return out;
  const n = conMonto.length;
  conMonto.forEach((x, rango) => {
    if (rango === 0) out[x.i] = PRIMERO;
    else if (rango === 1 && n >= 4) out[x.i] = SEGUNDO;
    else if (rango >= 2 && rango >= n - 2) out[x.i] = ULTIMOS;
  });
  return out;
}

const RENGLONES: Renglon[] = [
  { titulo: "Saldo total", ayuda: "Disponible + a liberar", valor: (d) => (d.disponible && d.aLiberar ? d.disponible.monto + d.aLiberar.monto : null), suma: true },
  { titulo: "Disponible", ayuda: "Según el último Reporte de Liquidaciones de Mercado Pago", nivel: 1, valor: (d) => d.disponible?.monto, suma: true, destacar: true,
    texto: (d) => (d.disponible ? null : d.reportePedido ? "pedido a MP, actualizá en unos minutos" : null) },
  { titulo: "A liberar", ayuda: "Cobros aprobados que todavía no se liberaron (neto)", nivel: 1, valor: (d) => d.aLiberar?.monto, suma: true },
  { titulo: "Pagos a liberar", nivel: 2, valor: (d) => d.aLiberar?.pagos, suma: true, cantidad: true },
  { titulo: "Se libera en los próximos 7 días", nivel: 2, valor: (d) => d.aLiberar?.en7dias, suma: true },
  { titulo: "Próxima liberación", nivel: 2, valor: (d) => d.aLiberar?.proximaMonto, texto: (d) => (d.aLiberar?.proxima ? `${plata(d.aLiberar.proximaMonto)} el ${dia(d.aLiberar.proxima)}` : null) },
  { titulo: "Cobrado en los últimos 30 días (bruto)", valor: (d) => d.cobrado30?.bruto, suma: true },
  { titulo: "Pagos", nivel: 1, valor: (d) => d.cobrado30?.pagos, suma: true, cantidad: true },
  { titulo: "Comisiones y cargos (Mercado Pago y Mercado Libre)", ayuda: "Bruto − neto recibido − devuelto", nivel: 1, valor: (d) => (d.cobrado30 ? -d.cobrado30.comisiones : null), suma: true },
  { titulo: "Neto recibido", nivel: 1, valor: (d) => d.cobrado30?.neto, suma: true },
  { titulo: "Devuelto", nivel: 1, valor: (d) => (d.cobrado30 ? -d.cobrado30.devuelto : null), suma: true },
];

export default async function MercadoPago({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const s = await entrarErp("mercadopago_ver");
  const sp = await searchParams;
  // Lo guardado se ve al instante; la lectura nueva corre de fondo ("↻ Actualizar", o sola si la última tiene más de 10 minutos).
  const { conexiones, lecturas } = await lecturasGuardadas(s.org.id);
  const masNueva = Math.max(0, ...[...lecturas.values()].map((l) => new Date(l.leidoTs).getTime()));
  const vieja = conexiones.length > 0 && Date.now() - masNueva > 10 * 60_000;
  const ultimos = await ultimoDisponible(s.org.id);
  // Si esta lectura no trajo reporte nuevo, vale el último disponible conocido.
  const datosDe = (id: number): Numeros => {
    const d = lecturas.get(id)?.datos ?? {};
    return d.disponible ? d : { ...d, disponible: ultimos.get(id) ?? null };
  };
  const sinConectar = await consulta<{ id: number; nombre: string }>(`
    select c.id::int, c.nombre from canal c where c.organizacion_id = $1 and c.estado = 'activo'
       and not exists (select 1 from canal_mp x where x.canal_id = c.id) order by c.nombre`, [s.org.id]);

  return (
    <Pantalla titulo="Mercado Pago" subtitulo="Los números de cada cuenta de Mercado Pago conectada, leídos en este momento. Sólo lectura: no mueve plata ni cambia nada."
      acciones={<BotonTarea accion={accionLeerMercadoPago} tipo="mercadopago" texto="↻ Actualizar" clase={SUAVE} />}>
      <LeerSolo vieja={vieja} />
      <Avisos sp={sp} />

      {conexiones.length === 0 ? (
        <p className={`${CAJA} text-sm mb-4`}>
          Todavía no hay ninguna cuenta de Mercado Pago conectada. Se conectan desde <Link href="/config/canales" className="text-[#16577F] underline">Configuración › Canales</Link>: elegí un canal y apretá <b>“Conectar Mercado Pago”</b>.
        </p>
      ) : (
        <section className="mb-6">
          <TituloSeccion titulo="Resumen" />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}>
                <tr>
                  <th className={TH}>Concepto</th>
                  {conexiones.map((c) => (
                    <th key={c.id} className={THN}>{c.nombre ?? c.email ?? `Cuenta ${c.mpUserId}`}
                      <span className="block text-[10px] font-normal text-[#5C6B76]">{c.canales.map((x) => x.nombre).join(" · ")}</span></th>
                  ))}
                  {conexiones.length > 1 && <th className={THN}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {RENGLONES.map((r) => {
                  const vals = conexiones.map((c) => r.valor(datosDe(c.id)));
                  const total = vals.some((v) => v != null) ? vals.reduce<number>((a, v) => a + (v ?? 0), 0) : null;
                  const fmt = (v: number | null | undefined) => (v == null ? "—" : r.cantidad ? v.toLocaleString("es-AR") : plata(v));
                  const colores = r.destacar ? coloresPorMonto(vals) : [];
                  return (
                    <tr key={r.titulo} className={`${TR} ${!r.nivel || r.destacar ? "font-semibold" : ""} ${r.destacar ? "font-bold text-[13px]" : ""}`}>
                      <td className={TD} style={{ paddingLeft: 8 + (r.nivel ?? 0) * 16 }} title={r.ayuda}>{r.titulo}</td>
                      {conexiones.map((c, i) => {
                        const t = r.texto?.(datosDe(c.id));
                        return <td key={c.id} className={TDN}>{t ?? (colores[i]
                          ? <span className={`inline-block rounded-md px-2 py-0.5 ${colores[i]}`}>{fmt(vals[i])}</span>
                          : fmt(vals[i]))}</td>;
                      })}
                      {conexiones.length > 1 && <td className={`${TDN} font-semibold`}>{r.suma ? fmt(total) : ""}</td>}
                    </tr>
                  );
                })}
                <tr className={`${TR} text-[11px] text-[#5C6B76]`}>
                  <td className={TD}>Leído</td>
                  {conexiones.map((c) => {
                    const l = lecturas.get(c.id);
                    const d = datosDe(c.id);
                    return <td key={c.id} className={TDN}>{l ? hora(l.leidoTs) : "—"}{d.disponible?.al && <span className="block">disponible al {d.disponible.al.slice(0, 16).replace("T", " ")}</span>}</td>;
                  })}
                  {conexiones.length > 1 && <td />}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[#5C6B76] mt-1">
            El disponible sale del Reporte de Liquidaciones que Laucen le pide a Mercado Pago (lo arma en unos minutos; se pide uno nuevo cada hora). Lo «a liberar» y lo cobrado salen de los pagos de la cuenta.
          </p>
        </section>
      )}

      {conexiones.length > 0 && (
        <section className="mb-6">
          <TituloSeccion titulo="Qué contestó Mercado Pago" />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Cuenta</th><th className={TH}>Estado</th><th className={TH}>Consultas</th></tr></thead>
              <tbody>
                {conexiones.map((c) => {
                  const l = lecturas.get(c.id);
                  const mal = (l?.intentos ?? []).filter((x) => x.status >= 300 || x.motivo);
                  return (
                    <tr key={c.id} className={TR}>
                      <td className={TD}>{c.nombre ?? c.email ?? `Cuenta ${c.mpUserId}`}</td>
                      <td className={TD}>{c.estado !== "activa" ? <Estado texto="Desconectada" tono="rojo" /> : mal.length ? <Estado texto="Con problemas" tono="amarillo" /> : <Estado texto="Todo leído" tono="verde" />}</td>
                      <td className={`${TD} text-[11px]`}>{(l?.intentos ?? []).map((x, i) => (
                        <span key={i} className={`block ${x.status >= 300 || x.motivo ? "text-[#C03420]" : "text-[#5C6B76]"}`}>{x.fuente}: {x.motivo ?? "ok"}</span>
                      ))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sinConectar.length > 0 && (
        <p className="text-[11px] text-[#5C6B76]">
          Canales sin cuenta de Mercado Pago: {sinConectar.map((c, i) => <span key={c.id}>{i ? ", " : ""}<Link href={`/config/canales?c=${c.id}`} className="text-[#16577F] hover:underline">{c.nombre}</Link></span>)}.
        </p>
      )}
    </Pantalla>
  );
}
