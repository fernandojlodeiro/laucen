// Recepción de mercadería: armar una recepción nueva (compra, devolución u
// otra) y ver las abiertas y las últimas cerradas. Pensada para el celular.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { PRIMARIO, DESPLEGABLE, FLECHA } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { fechaHoraAR, GRANDE, TIPO_RECEPCION } from "../formato";
import { accionCrearRecepcion } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; nueva?: string };

type Fila = {
  id: number; tipo: string; estado: string; deposito: string; proveedor: string | null; pedido_id: number | null; documento: string | null;
  creado_ts: Date; cerrada_ts: Date | null; unidades: number; lineas: number;
};

export default async function Recepcion({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("recepcion_ver");
  const sp = await searchParams;
  const [depositos, proveedores, filas] = await Promise.all([
    consulta<{ id: number; nombre: string }>(
      "select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo <> 'full_ml' order by id", [s.org.id]),
    consulta<{ id: number; nombre: string }>(
      "select id::int, nombre from proveedor where organizacion_id = $1 and estado = 'activo' order by nombre", [s.org.id]),
    consulta<Fila>(`
      select r.id::int, r.tipo, r.estado, d.nombre deposito, pr.nombre proveedor, r.pedido_id::int, r.documento, r.creado_ts, r.cerrada_ts,
             coalesce((select sum(cantidad) from recepcion_linea where recepcion_id = r.id), 0)::int unidades,
             (select count(*) from recepcion_linea where recepcion_id = r.id)::int lineas
        from recepcion r join deposito d on d.id = r.deposito_id left join proveedor pr on pr.id = r.proveedor_id
       where r.organizacion_id = $1
         and (r.estado = 'abierta' or r.id in (select id from recepcion where organizacion_id = $1 and estado = 'cerrada' order by cerrada_ts desc limit 15))
       order by r.estado = 'abierta' desc, coalesce(r.cerrada_ts, r.creado_ts) desc`, [s.org.id]),
  ]);
  const abiertas = filas.filter((f) => f.estado === "abierta");
  const cerradas = filas.filter((f) => f.estado !== "abierta");

  return (
    <Pantalla titulo="Recepción" subtitulo="Entrada de mercadería y devoluciones, escaneando" ancho="max-w-2xl">
      <Avisos sp={sp} />

      <details className="group mb-5" open={!abiertas.length || sp.nueva === "1"}>
        <summary className={`${DESPLEGABLE} text-base py-3`}>➕ Recepción nueva<span className={FLECHA}>▼</span></summary>
        <form action={accionCrearRecepcion} className={`${CAJA} mt-2 grid gap-3`}>
          <label><span className={ETIQUETA}>Qué entra</span>
            <select name="tipo" className={`${CAMPO} w-full text-base py-2.5`} defaultValue="compra">
              {Object.entries(TIPO_RECEPCION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Depósito</span>
            <select name="d" className={`${CAMPO} w-full text-base py-2.5`}>
              {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Proveedor (opcional)</span>
            <select name="proveedor" className={`${CAMPO} w-full text-base py-2.5`} defaultValue="">
              <option value="">—</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Nº de pedido (si es una devolución: el nuestro o el de Mercado Libre)</span>
            <input name="pedido" inputMode="numeric" className={`${CAMPO} w-full text-base py-2.5`} /></label>
          <label><span className={ETIQUETA}>Nº de remito o factura</span>
            <input name="documento" className={`${CAMPO} w-full text-base py-2.5`} /></label>
          <label><span className={ETIQUETA}>Nota</span>
            <input name="nota" className={`${CAMPO} w-full text-base py-2.5`} /></label>
          <BotonEnviar clase={`${PRIMARIO} ${GRANDE} w-full`} corriendo="Creando…">Empezar a recibir</BotonEnviar>
        </form>
      </details>

      <h2 className="text-sm font-bold mb-2">Abiertas ({abiertas.length})</h2>
      {abiertas.length === 0 ? <p className="text-sm text-[#5C6B76] mb-5">No hay recepciones abiertas.</p> : (
        <div className="space-y-2 mb-5">{abiertas.map((f) => <Tarjeta key={f.id} f={f} />)}</div>
      )}

      {cerradas.length > 0 && (
        <>
          <h2 className="text-sm font-bold mb-2">Últimas cerradas</h2>
          <div className="space-y-2">{cerradas.map((f) => <Tarjeta key={f.id} f={f} />)}</div>
        </>
      )}
    </Pantalla>
  );
}

function Tarjeta({ f }: { f: Fila }) {
  return (
    <Link href={`/deposito/recepcion/${f.id}`} className={`${CAJA} block hover:border-[#16577F]`}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-bold text-[#16577F]">Recepción #{f.id}</span>
        <Estado texto={TIPO_RECEPCION[f.tipo] ?? f.tipo} tono={f.tipo === "devolucion" ? "amarillo" : "azul"} />
      </div>
      <div className="text-xs text-[#5C6B76]">
        {f.deposito}{f.proveedor ? ` · ${f.proveedor}` : ""}{f.pedido_id ? ` · pedido #${f.pedido_id}` : ""}{f.documento ? ` · ${f.documento}` : ""}
      </div>
      <div className="text-xs text-[#5C6B76]">
        {f.unidades} unidad{f.unidades === 1 ? "" : "es"} en {f.lineas} línea{f.lineas === 1 ? "" : "s"} ·{" "}
        {f.estado === "abierta" ? `desde ${fechaHoraAR(f.creado_ts)}` : `cerrada ${fechaHoraAR(f.cerrada_ts)}`}
      </div>
    </Link>
  );
}
