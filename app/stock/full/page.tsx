// Stock › Envíos a Full (lib/full/envios.ts): los envíos de mercadería a Full de Mercado Libre.
// «Nuevo envío» pide la cuenta y el depósito de donde sale; si la cuenta no tiene depósito Full,
// se crea solo. Cada envío se arma, se despacha y se recibe en su ficha.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { consultaPaginada } from "@/lib/lista";
import { ordenDe } from "@/lib/listas/tipos";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { PRIMARIO } from "@/app/botones";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { BotonEnviar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import { AccionesExcel } from "@/app/listas/piezas";
import { formatear } from "@/lib/moneda";
import { formatearNumero } from "@/lib/numeros";
import { fecha } from "@/app/ventas/formato";
import { ESTADOS_ENVIO, type EstadoEnvio } from "@/lib/full/envios";
import { diaAR } from "./piezas";
import { LISTA_FULL_ENVIOS, PRODUCTOS_ENVIO, UNIDADES_ENVIO, RECIBIDAS_ENVIO } from "./lista";
import { PestanasFull } from "./piezas";
import { accionNuevoEnvio } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; estado?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string; nuevo?: string };
type Fila = {
  id: number; creado_ts: Date; canal_id: number; cuenta: string; origen: string; numero_ml: string | null; fecha_entrega: string | null;
  productos: number; unidades: number; recibidas: number; flete_ars: number | null; estado: EstadoEnvio;
};

export default async function EnviosFull({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("full_ver");
  const sp = await searchParams;
  const ctx = { org: s.org.id, moneda: s.moneda };
  const base = await LISTA_FULL_ENVIOS.consulta!(ctx, sp);
  const campos = typeof LISTA_FULL_ENVIOS.campos === "function" ? await LISTA_FULL_ENVIOS.campos(ctx) : LISTA_FULL_ENVIOS.campos;
  const [cuentas, depositos, { filas, total }] = await Promise.all([
    consulta<{ id: number; nombre: string }>("select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre' and estado = 'activo' order by id", [s.org.id]),
    consulta<{ id: number; nombre: string }>("select id::int, nombre from deposito where organizacion_id = $1 and estado = 'activo' and tipo not in ('full_ml', 'transito', 'caja_abierta') order by (tipo = 'propio') desc, id", [s.org.id]),
    consultaPaginada<Fila>({
      campos: `e.id::int, e.creado_ts, e.canal_id::int, c.nombre cuenta, o.nombre origen, e.numero_ml, to_char(e.fecha_entrega, 'YYYY-MM-DD') fecha_entrega,
               ${PRODUCTOS_ENVIO}::int productos, ${UNIDADES_ENVIO}::int unidades, ${RECIBIDAS_ENVIO}::int recibidas, e.flete_ars::float, e.estado`,
      desde: base.desde, donde: base.donde, orden: ordenDe(campos, sp, base.orden),
    }, base.valores, sp),
  ]);
  const q = sp.q ?? "";
  const estado = sp.estado && Object.hasOwn(ESTADOS_ENVIO, sp.estado) ? sp.estado : "";
  const n = (x: number) => formatearNumero(x, "entero");

  return (
    <Pantalla titulo="Envíos a Full" subtitulo="Mercadería que sale del depósito propio a Full de una cuenta de Mercado Libre: se arma, se despacha y se recibe sola cuando Mercado Libre la cuenta."
      acciones={<><AccionesExcel lista={LISTA_FULL_ENVIOS} org={s.org.id} /><BotonNuevo texto="Nuevo envío" /></>}>
      <AltaNueva texto="Nuevo envío" sinBoton>
        <form action={accionNuevoEnvio} className="flex flex-wrap items-end gap-2">
          <label><span className={ETIQUETA}>Cuenta de Mercado Libre</span>
            <select name="canal" required defaultValue={cuentas.length === 1 ? cuentas[0].id : ""} className={CAMPO}>
              <option value="">Elegí…</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></label>
          <label><span className={ETIQUETA}>Sale del depósito</span>
            <select name="origen" required defaultValue={depositos[0]?.id ?? ""} className={CAMPO}>
              {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select></label>
          <BotonEnviar clase={PRIMARIO} corriendo="Creando…">Crear</BotonEnviar>
          <p className="basis-full text-[11px] text-[#5C6B76]">Si la cuenta todavía no tiene depósito Full, se crea solo («Full &lt;cuenta&gt;»).</p>
        </form>
      </AltaNueva>
      <Avisos sp={sp} />
      <PestanasFull org={s.org.id} activa="envios" />
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div className="flex-1 min-w-60"><BuscadorVivo q={q} comienza={sp.contiene !== "1"} placeholder="Buscar por número, cuenta, Nº de ML o producto" limpiar={["p"]} /></div>
        <form className="flex items-end gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          <label><span className={ETIQUETA}>Estado</span>
            <select name="estado" defaultValue={estado} className={CAMPO}>
              <option value="">Todos</option>
              {Object.entries(ESTADOS_ENVIO).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
            </select></label>
          <button className={PRIMARIO}>Filtrar</button>
        </form>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="id" n porDefecto>Envío</ThOrden><ThOrden col="creado" n>Creado</ThOrden><ThOrden col="cuenta">Cuenta</ThOrden><ThOrden col="origen">Sale de</ThOrden>
              <ThOrden col="numero_ml">Nº en ML</ThOrden><ThOrden col="entrega" n>Entrega en Full</ThOrden><ThOrden col="productos" n>Productos</ThOrden>
              <ThOrden col="unidades" n>Unidades</ThOrden><ThOrden col="recibidas" n>Recibidas</ThOrden><ThOrden col="flete" n>Flete</ThOrden><ThOrden col="estado">Estado</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={11} className={`${TD} text-[#5C6B76]`}>{q || estado ? "Nada con esos filtros." : "Todavía no hay envíos a Full. Empezá con «Nuevo envío»."}</td></tr>}
            {filas.map((f) => {
              const est = ESTADOS_ENVIO[f.estado];
              return (
                <tr key={f.id} className={TR} data-canal={f.canal_id}>
                  <td className={TDN}><Link href={`/stock/full/${f.id}`} className="font-bold text-[#16577F] hover:underline">{f.id}</Link></td>
                  <td className={TDN}>{fecha(f.creado_ts)}</td>
                  <td className={TD}>{f.cuenta}</td>
                  <td className={TD}>{f.origen}</td>
                  <td className={`${TD} font-mono`}>{f.numero_ml ?? "—"}</td>
                  <td className={TDN}>{diaAR(f.fecha_entrega)}</td>
                  <td className={TDN}><Link href={`/stock/full/${f.id}`} className="hover:underline">{n(f.productos)}</Link></td>
                  <td className={TDN}>{n(f.unidades)}</td>
                  <td className={TDN}>{f.estado === "borrador" ? "—" : n(f.recibidas)}</td>
                  <td className={TDN}>{f.flete_ars != null ? formatear(f.flete_ars, "ARS") : "—"}</td>
                  <td className={TD}><Estado texto={est.texto} tono={est.tono} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
