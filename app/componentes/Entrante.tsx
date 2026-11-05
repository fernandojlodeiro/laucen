// La mercadería entrante de un producto (Fer, 5/11): siempre con sus tres datos —llegando, prevendido y saldo— y la
// próxima orden que llega, con su enlace. La usan todas las pantallas donde se consulta stock.

import Link from "next/link";
import type { Entrante as DatoEntrante } from "@/lib/compras/ordenes";

const dia = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

/** «Llegando 100 · prevendido 20 · saldo 80 — M0226, 15/12» (o nada si no hay entrante). */
export default function Entrante({ e, chico = false }: { e: DatoEntrante | null | undefined; chico?: boolean }) {
  if (!e || e.llegando <= 0) return null;
  return (
    <span className={`${chico ? "text-[10px]" : "text-[11px]"} text-[#16577F] whitespace-nowrap`} title={e.ordenes > 1 ? `${e.ordenes} órdenes en camino` : undefined}>
      Llegando <b>{e.llegando}</b> · prevendido <b>{e.prevendido}</b> · saldo <b>{e.saldo}</b>
      {e.proxima_orden_id ? <> — <Link href={`/compras/ordenes/${e.proxima_orden_id}`} className="underline">{e.proxima_orden}</Link>, {dia(e.proxima_llegada)}</> : null}
    </span>
  );
}

/** Las tres columnas para una tabla: llegando, prevendido, saldo (vacías si no hay entrante). */
export function CeldasEntrante({ e, td }: { e: DatoEntrante | null | undefined; td: string }) {
  const n = (x: number | undefined) => (e && e.llegando > 0 ? x : "");
  return (
    <>
      <td className={td} title={e?.proxima_orden ? `Próxima: ${e.proxima_orden}, ${dia(e.proxima_llegada)}` : undefined}>
        {e && e.llegando > 0 && e.proxima_orden_id ? <Link href={`/compras/ordenes/${e.proxima_orden_id}`} className="text-[#16577F] hover:underline">{e.llegando}</Link> : n(e?.llegando)}
      </td>
      <td className={td}>{n(e?.prevendido)}</td>
      <td className={td}>{n(e?.saldo)}</td>
    </>
  );
}

export const TITULOS_ENTRANTE = [
  { corto: "Lleg.", largo: "Llegando: lo que traen las órdenes de compra en camino" },
  { corto: "Prev.", largo: "Prevendido: lo vendido en preventa de esas órdenes" },
  { corto: "Saldo", largo: "Saldo entrante: llegando − prevendido" },
] as const;
