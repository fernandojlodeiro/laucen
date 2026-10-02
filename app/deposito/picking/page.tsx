// Picking: elegir depósito, ver los pedidos para preparar (lo más urgente
// primero) y armar un picking de uno o de varios. Debajo, los pickings
// abiertos de ese depósito y los últimos terminados. Pensada para el celular.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { hoyAR } from "@/lib/moneda";
import { pedidosParaPreparar } from "@/lib/deposito/picking";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA, CAMPO } from "@/app/componentes/erp";
import { diaAR, fechaHoraAR, GRANDE } from "../formato";
import { accionCrearLote } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { d?: string; ok?: string; error?: string };

type Lote = { id: number; creado_ts: Date; terminado_ts: Date | null; estado: string; pedidos: number; total: number; hechas: number; faltantes: number };

export default async function Picking({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("picking_ver");
  const sp = await searchParams;
  const depositos = await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo <> 'full_ml' order by id", [s.org.id]);
  const dep = depositos.find((d) => d.id === Number(sp.d)) ?? depositos[0];

  if (!dep) {
    return (
      <Pantalla titulo="Picking" ancho="max-w-2xl">
        <p className="text-sm text-[#5C6B76]">No hay depósitos activos. Crealos en <Link href="/stock/depositos" className="underline">Stock → Depósitos</Link>.</p>
      </Pantalla>
    );
  }

  const [pedidos, lotes] = await Promise.all([
    pedidosParaPreparar(s.org.id, dep.id),
    consulta<Lote>(`
      select l.id::int, l.creado_ts, l.terminado_ts, l.estado,
             (select count(*)::int from picking_pedido where lote_id = l.id) pedidos,
             coalesce(sum(i.cantidad), 0)::int total, coalesce(sum(least(i.escaneado, i.cantidad)), 0)::int hechas,
             coalesce(sum(i.faltante), 0)::int faltantes
        from picking_lote l left join picking_item i on i.lote_id = l.id
       where l.organizacion_id = $1 and l.deposito_id = $2
         and (l.estado = 'abierto' or l.id in (select id from picking_lote where organizacion_id = $1 and deposito_id = $2
                                                 and estado = 'terminado' order by terminado_ts desc limit 10))
       group by l.id order by l.estado = 'abierto' desc, coalesce(l.terminado_ts, l.creado_ts) desc`, [s.org.id, dep.id]),
  ]);
  const hoy = hoyAR();
  const abiertos = lotes.filter((l) => l.estado === "abierto");
  const terminados = lotes.filter((l) => l.estado !== "abierto");

  return (
    <Pantalla titulo="Picking" subtitulo="Preparar pedidos escaneando cada unidad" ancho="max-w-2xl">
      <Avisos sp={sp} />

      {depositos.length > 1 && (
        <form className="flex gap-2 mb-4">
          <select name="d" defaultValue={dep.id} className={`${CAMPO} flex-1 text-base py-2.5`} aria-label="Depósito">
            {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <button className={`${SUAVE} ${GRANDE}`}>Ver</button>
        </form>
      )}

      {abiertos.length > 0 && (
        <section className="mb-5">
          <h2 className="text-sm font-bold mb-2">Pickings abiertos</h2>
          <div className="space-y-2">
            {abiertos.map((l) => <TarjetaLote key={l.id} l={l} />)}
          </div>
        </section>
      )}

      <h2 className="text-sm font-bold mb-2">Para preparar en {dep.nombre} ({pedidos.length})</h2>
      {pedidos.length === 0 ? (
        <p className="text-sm text-[#5C6B76] mb-5">No hay pedidos para preparar.</p>
      ) : (
        <form action={accionCrearLote} className="mb-5">
          <input type="hidden" name="d" value={dep.id} />
          <div className="space-y-2">
            {pedidos.map((p) => {
              const dia = diaAR(p.despachar_antes);
              const urgente = dia !== null && dia <= hoy;
              return (
                <div key={p.id} className={`${CAJA} flex items-start gap-3 ${urgente ? "border-[#E8B4AA] bg-[#FFF9F7]" : ""}`}>
                  <input type="checkbox" name="p" value={p.id} className="mt-1 h-6 w-6 shrink-0 accent-[#16577F]" aria-label={`Tildar pedido ${p.id}`} />
                  <div className="flex-1 min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/ventas/pedidos/${p.id}`} className="font-bold text-[#16577F]">#{p.id}</Link>
                      {p.id_externo && <span className="text-xs text-[#5C6B76]">{p.id_externo}</span>}
                      {p.estado === "en_preparacion" && <Estado texto="Ya empezado" tono="amarillo" />}
                    </div>
                    <div className="truncate">{p.cliente ?? "Sin cliente"} · <span className="text-[#5C6B76]">{p.canal}</span></div>
                    <div className="text-xs text-[#5C6B76]">
                      {p.unidades} unidad{p.unidades === 1 ? "" : "es"} en {p.lineas} línea{p.lineas === 1 ? "" : "s"}
                      {p.despachar_antes && (
                        <> · <span className={urgente ? "font-bold text-[#C03420]" : ""}>Despachar antes: {fechaHoraAR(p.despachar_antes)}</span></>
                      )}
                    </div>
                  </div>
                  <button name="solo" value={p.id} className={`${SUAVE} shrink-0`}>Preparar este</button>
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-20 md:bottom-10 mt-3">
            <BotonEnviar clase={`${PRIMARIO} ${GRANDE} w-full shadow`} corriendo="Armando…">Armar lote con los tildados</BotonEnviar>
          </div>
        </form>
      )}

      {terminados.length > 0 && (
        <section>
          <h2 className="text-sm font-bold mb-2">Últimos terminados</h2>
          <div className="space-y-2">
            {terminados.map((l) => <TarjetaLote key={l.id} l={l} />)}
          </div>
        </section>
      )}
    </Pantalla>
  );
}

function TarjetaLote({ l }: { l: Lote }) {
  const pct = l.total ? Math.round((100 * l.hechas) / l.total) : 0;
  return (
    <Link href={`/deposito/picking/${l.id}`} className={`${CAJA} block hover:border-[#16577F]`}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-bold text-[#16577F]">Picking #{l.id}</span>
        <span className="text-xs text-[#5C6B76]">
          {l.estado === "abierto" ? `desde ${fechaHoraAR(l.creado_ts)}` : `terminado ${fechaHoraAR(l.terminado_ts)}`}
        </span>
      </div>
      <div className="text-xs text-[#5C6B76] mb-1">
        {l.pedidos} pedido{l.pedidos === 1 ? "" : "s"} · {l.hechas} de {l.total} unidades{l.faltantes ? ` · ${l.faltantes} faltante(s)` : ""}
      </div>
      <div className="h-2 rounded-full bg-[#EEF1F4] overflow-hidden">
        <div className="h-full bg-[#167655]" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}
