// Clientes: listado con buscador y filtro por tipo. Los clientes los crean
// los pedidos; el alta manual de abajo existe para corregir.

import Link from "next/link";
import { PRIMARIO } from "@/app/botones";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import AltaNueva, { BotonNuevo } from "@/app/componentes/AltaNueva";
import { ThOrden, Paginado } from "@/app/componentes/Lista";
import { consultaPaginada, leerOrden } from "@/lib/lista";
import {
  entrarErp, Pantalla, Avisos, url, CAJA_TABLA, TABLA, THEAD, TR, TD, TDN, CAMPO, patronBusqueda,
} from "@/app/componentes/erp";
import { fecha, TIPOS_CLIENTE, CONDICIONES_IVA, DOCUMENTOS, etiqueta } from "@/app/ventas/formato";
import { accionCrearCliente } from "./acciones";

export const dynamic = "force-dynamic";

type SP = { q?: string; contiene?: string; tipo?: string; p?: string; orden?: string; dir?: string; ok?: string; error?: string };

type Fila = {
  id: number; nombre: string; tipo: string; documento_tipo: string | null; documento_numero: string | null;
  condicion_iva: string | null; email: string | null; telefono: string | null; pedidos: number; ultimo: Date | null;
};

export default async function Clientes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("clientes_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const tipo = sp.tipo === "mayorista" || sp.tipo === "consumidor_final" ? sp.tipo : "";

  const valores: unknown[] = [s.org.id];
  const donde = ["c.organizacion_id = $1"];
  if (tipo) { valores.push(tipo); donde.push(`c.tipo = $${valores.length}`); }
  if (q) {
    valores.push(patronBusqueda(q, comienza));
    const p = `$${valores.length}`;
    const digitos = q.replace(/\D/g, "");
    let doc = "";
    if (digitos.length >= 3) { valores.push(patronBusqueda(digitos, comienza)); doc = ` or regexp_replace(coalesce(c.documento_numero, ''), '\\D', '', 'g') like $${valores.length} or regexp_replace(coalesce(c.telefono, ''), '\\D', '', 'g') like $${valores.length}`; }
    donde.push(`(c.nombre ilike ${p} or c.email ilike ${p} or c.documento_numero ilike ${p} or c.telefono ilike ${p}${doc})`);
  }
  const PEDIDOS = "(select count(*) from pedido p where p.cliente_id = c.id)";
  const ULTIMO = "(select max(p.fecha) from pedido p where p.cliente_id = c.id)";
  const { filas, total } = await consultaPaginada<Fila>({
    campos: `c.id::int, c.nombre, c.tipo, c.documento_tipo, c.documento_numero, c.condicion_iva, c.email, c.telefono,
             ${PEDIDOS}::int pedidos, ${ULTIMO} ultimo`,
    desde: "cliente c",
    donde: donde.join(" and "),
    orden: leerOrden(sp, {
      id: "c.id", nombre: "c.nombre", tipo: "c.tipo", documento: "c.documento_numero", iva: "c.condicion_iva",
      email: "c.email", telefono: "c.telefono", pedidos: PEDIDOS, ultimo: ULTIMO,
    }, "c.nombre, c.id"),
  }, valores, sp);

  return (
    <Pantalla titulo="Clientes" subtitulo="Los crean los pedidos; acá se miran y se corrigen sus datos"
      acciones={<BotonNuevo texto="Nuevo cliente" />}>
      <Avisos sp={sp} />
      <AltaNueva texto="Nuevo cliente" sinBoton>
        <form action={accionCrearCliente} className="flex flex-wrap items-center gap-2">
          <input name="nombre" placeholder="Nombre o razón social" className={`${CAMPO} flex-1 min-w-48`} autoFocus />
          <select name="tipo" defaultValue="consumidor_final" className={CAMPO} aria-label="Tipo">
            {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="documento_tipo" defaultValue="DNI" className={CAMPO} aria-label="Tipo de documento">
            {DOCUMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input name="documento_numero" placeholder="Número" className={`${CAMPO} w-32`} />
          <input name="email" type="email" placeholder="Mail" className={`${CAMPO} w-48`} />
          <input name="telefono" placeholder="Teléfono" className={`${CAMPO} w-32`} />
          <button className={PRIMARIO}>Crear</button>
        </form>
      </AltaNueva>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por nombre, mail, documento o teléfono" />
        <FiltroVivo parametro="tipo" valor={tipo} etiqueta="Tipo">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <ThOrden col="id" n desc={false}>N.º</ThOrden><ThOrden col="nombre" porDefecto>Nombre</ThOrden><ThOrden col="tipo">Tipo</ThOrden>
              <ThOrden col="documento">Documento</ThOrden><ThOrden col="iva">Condición IVA</ThOrden>
              <ThOrden col="email">Mail</ThOrden><ThOrden col="telefono">Teléfono</ThOrden><ThOrden col="pedidos" n>Pedidos</ThOrden><ThOrden col="ultimo" n>Último pedido</ThOrden>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className={`${TD} text-[#5C6B76]`}>{q || tipo ? "No hay clientes con esa búsqueda." : "Todavía no hay clientes."}</td></tr>}
            {filas.map((c) => (
              <tr key={c.id} className={TR}>
                <td className={`${TDN} text-[#5C6B76]`}><Link href={`/ventas/clientes/${c.id}`} className="hover:underline">{c.id}</Link></td>
                <td className={TD}><Link href={`/ventas/clientes/${c.id}`} className="font-semibold text-[#16577F] hover:underline">{c.nombre}</Link></td>
                <td className={TD}><Link href={url("/ventas/clientes", { tipo: c.tipo })} className="hover:text-[#16577F] hover:underline">{etiqueta(TIPOS_CLIENTE, c.tipo)}</Link></td>
                <td className={`${TD} whitespace-nowrap`}>{c.documento_numero ? `${c.documento_tipo ?? ""} ${c.documento_numero}`.trim() : "—"}</td>
                <td className={TD}>{c.condicion_iva ? etiqueta(CONDICIONES_IVA, c.condicion_iva) : "—"}</td>
                <td className={TD}>{c.email ? <a href={`mailto:${c.email}`} className="hover:text-[#16577F] hover:underline">{c.email}</a> : "—"}</td>
                <td className={`${TD} whitespace-nowrap`}>{c.telefono ?? "—"}</td>
                <td className={TDN}>{c.pedidos ? <Link href={url("/ventas/pedidos", { cliente: c.id })} className="text-[#16577F] hover:underline">{c.pedidos}</Link> : 0}</td>
                <td className={TDN}>{fecha(c.ultimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Paginado total={total} />
    </Pantalla>
  );
}
