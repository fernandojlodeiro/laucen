// Clientes: listado con buscador y filtro por tipo. Los clientes los crean
// los pedidos; el alta manual de abajo existe para corregir.

import Link from "next/link";
import { consulta } from "@/lib/erp/base";
import { PRIMARIO, SUAVE } from "@/app/botones";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import AltaNueva from "@/app/componentes/AltaNueva";
import {
  entrarErp, Pantalla, Avisos, url, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, patronBusqueda,
} from "@/app/componentes/erp";
import { fecha, TIPOS_CLIENTE, CONDICIONES_IVA, DOCUMENTOS, etiqueta } from "@/app/ventas/formato";
import { accionCrearCliente } from "./acciones";

export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

type SP = { q?: string; contiene?: string; tipo?: string; pagina?: string; ok?: string; error?: string };

type Fila = {
  id: number; nombre: string; tipo: string; documento_tipo: string | null; documento_numero: string | null;
  condicion_iva: string | null; email: string | null; telefono: string | null; pedidos: number; ultimo: Date | null; total: number;
};

export default async function Clientes({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await entrarErp("clientes_ver");
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const comienza = sp.contiene !== "1";
  const tipo = sp.tipo === "mayorista" || sp.tipo === "consumidor_final" ? sp.tipo : "";
  const pagina = Math.max(1, Number(sp.pagina) || 1);

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
  valores.push(POR_PAGINA, (pagina - 1) * POR_PAGINA);
  const filas = await consulta<Fila>(`
    select c.id::int, c.nombre, c.tipo, c.documento_tipo, c.documento_numero, c.condicion_iva, c.email, c.telefono,
           (select count(*) from pedido p where p.cliente_id = c.id)::int pedidos,
           (select max(p.fecha) from pedido p where p.cliente_id = c.id) ultimo,
           count(*) over ()::int total
      from cliente c
     where ${donde.join(" and ")}
     order by c.nombre, c.id
     limit $${valores.length - 1} offset $${valores.length}`, valores);
  const total = filas[0]?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const ir = (p: number) => url("/ventas/clientes", { q, contiene: comienza ? null : "1", tipo, pagina: p > 1 ? p : null });

  return (
    <Pantalla titulo="Clientes" subtitulo="Los crean los pedidos; acá se miran y se corrigen sus datos">
      <Avisos sp={sp} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar por nombre, mail, documento o teléfono" limpiar={["pagina"]} />
        <FiltroVivo parametro="tipo" valor={tipo} etiqueta="Tipo" limpiar={["pagina"]}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_CLIENTE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </FiltroVivo>
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}>
            <tr>
              <th className={TH}>Nombre</th><th className={TH}>Tipo</th><th className={TH}>Documento</th><th className={TH}>Condición IVA</th>
              <th className={TH}>Mail</th><th className={TH}>Teléfono</th><th className={THN}>Pedidos</th><th className={THN}>Último pedido</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={8} className={`${TD} text-[#5C6B76]`}>{q || tipo ? "No hay clientes con esa búsqueda." : "Todavía no hay clientes."}</td></tr>}
            {filas.map((c) => (
              <tr key={c.id} className={TR}>
                <td className={TD}><Link href={`/ventas/clientes/${c.id}`} className="font-semibold text-[#16577F] hover:underline">{c.nombre}</Link></td>
                <td className={TD}>{etiqueta(TIPOS_CLIENTE, c.tipo)}</td>
                <td className={`${TD} whitespace-nowrap`}>{c.documento_numero ? `${c.documento_tipo ?? ""} ${c.documento_numero}`.trim() : "—"}</td>
                <td className={TD}>{c.condicion_iva ? etiqueta(CONDICIONES_IVA, c.condicion_iva) : "—"}</td>
                <td className={TD}>{c.email ?? "—"}</td>
                <td className={`${TD} whitespace-nowrap`}>{c.telefono ?? "—"}</td>
                <td className={TDN}>{c.pedidos}</td>
                <td className={TDN}>{fecha(c.ultimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <nav className="flex items-center justify-end gap-2 mt-2 text-xs text-[#5C6B76]">
          <span>{total} clientes · página {pagina} de {paginas}</span>
          {pagina > 1 && <Link href={ir(pagina - 1)} className={SUAVE}>← Anterior</Link>}
          {pagina < paginas && <Link href={ir(pagina + 1)} className={SUAVE}>Siguiente →</Link>}
        </nav>
      )}

      <AltaNueva texto="Nuevo cliente" className="mt-4">
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
    </Pantalla>
  );
}
