// Proveedores del espacio personal (pedido de Fer, 18/10): cada uno con su tipo de gasto, sus cuentas destino y
// cuánto se le pagó en 12 meses. El lápiz cambia el nombre y el tipo de gasto (vale para todas sus cuentas); el
// tacho lo borra y sus cuentas quedan sin proveedor. Se crean al asignar una cuenta en Destinatarios.

import Link from "next/link";
import { Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, LAPIZ, url } from "@/app/componentes/erp";
import BuscadorVivo from "@/app/componentes/BuscadorVivo";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import { OPCIONES_CATEGORIA } from "@/app/componentes/RevisarGastos";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { Paginado } from "@/app/componentes/Lista";
import { paginarEnMemoria } from "@/lib/lista";
import { coincideBusqueda } from "@/lib/busqueda";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { formatear } from "@/lib/moneda";
import { entrarPersonal } from "@/lib/personal/espacio";
import { gastosPersonales } from "@/lib/mercadopago/gastos-datos";
import { AMBITOS, RECURRENCIAS } from "@/lib/mercadopago/gastos";
import { agruparDestinatarios, proveedoresDelEspacio, asignacionesDelEspacio } from "@/lib/personal/destinatarios";
import PestanasGastos, { cuentasGastos } from "../PestanasGastos";
import { accionEditarProveedor, accionBorrarProveedor } from "../acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Sp = { q?: string; contiene?: string; p?: string; editar?: string; ok?: string; error?: string };

export default async function Proveedores({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { sesion, espacio } = await entrarPersonal();
  const [todos, proveedores, asignadas] = await Promise.all([
    gastosPersonales(espacio.id, sesion.usuario.id, espacio.esDueno), proveedoresDelEspacio(espacio.id), asignacionesDelEspacio(espacio.id),
  ]);
  const { lista } = agruparDestinatarios(todos);
  const filas = proveedores.map((p) => {
    const cuentas = [...asignadas].filter(([, x]) => x.id === p.id).map(([c]) => c);
    const suyas = lista.filter((d) => cuentas.includes(d.cuenta));
    return { ...p, cuentas: cuentas.length, cantidad: suyas.reduce((s, d) => s + d.cantidad, 0), total: suyas.reduce((s, d) => s + d.total, 0) };
  }).sort((a, b) => b.total - a.total);
  const q = sp.q ?? "", comienza = sp.contiene !== "1";
  const elegidas = filas.filter((p) => !q || coincideBusqueda([p.nombre, p.categoria], q, comienza));
  const pagina = paginarEnMemoria(elegidas, sp);
  const base = "/personal/gastos/proveedores";
  const aqui = (extra: Record<string, string | null>) => url(base, { q: q || null, contiene: sp.contiene ?? null, p: sp.p ?? null, ...extra });

  return (
    <Pantalla titulo="Proveedores" camino={[{ texto: "Espacio personal", href: "/personal" }, { texto: "Mis gastos", href: "/personal/gastos" }, { texto: "Proveedores" }]}
      subtitulo="A quién le pagás, con su tipo de gasto. Se crean al asignar una cuenta en Destinatarios.">
      <PestanasGastos activa="proveedores" cuentas={cuentasGastos(todos, proveedores.length)} />
      <Avisos sp={sp} />
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar proveedor o tipo de gasto…" limpiar={["p", "editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>
            <th className={TH}>Proveedor</th><th className={TH}>Tipo de gasto</th><th className={TH}>A quién corresponde</th><th className={TH}>Recurrencia</th>
            <th className={THN}>Cuentas</th><th className={THN}>Pagos</th><th className={THN}>12 meses</th><th className={TH} />
          </tr></thead>
          <tbody>
            {pagina.map((p) => {
              const cuentas = <Link href={`/personal/gastos/destinatarios?ver=todos&q=${encodeURIComponent(p.nombre)}&contiene=1`} className="text-[#16577F] hover:underline">{p.cuentas}</Link>;
              if (sp.editar === String(p.id)) {
                return (
                  <tr key={p.id} className={`${TR} bg-[#F7FAFC]`}>
                    <td className={TD} colSpan={4}>
                      <form id={`prov-${p.id}`} action={accionEditarProveedor} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="volver" value={aqui({ editar: null })} />
                        <input name="nombre" defaultValue={p.nombre} className={`${CAMPO} w-48`} aria-label="Nombre" required />
                        <ElegirDeLista name="categoria" opciones={OPCIONES_CATEGORIA} valor={OPCIONES_CATEGORIA.find((o) => o.texto === p.categoria)?.id ?? null} etiqueta="Tipo de gasto" className="w-56" />
                        <select name="ambito" defaultValue={p.ambito_gasto ?? "personal"} className={CAMPO} aria-label="A quién corresponde">
                          {AMBITOS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <select name="recurrencia" defaultValue={p.recurrencia ?? "sin clasificar"} className={CAMPO} aria-label="Recurrencia">
                          {RECURRENCIAS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <button className={PRIMARIO}>Grabar</button>
                        <Link href={aqui({ editar: null })} className={SUAVE}>Cancelar</Link>
                      </form>
                    </td>
                    <td className={TDN}>{cuentas}</td><td className={TDN}>{p.cantidad}</td><td className={TDN}>{formatear(p.total, "ARS")}</td><td className={TD} />
                  </tr>
                );
              }
              return (
                <tr key={p.id} className={TR}>
                  <td className={TD}>{p.nombre}</td><td className={TD}>{p.categoria ?? "—"}</td><td className={TD}>{p.ambito_gasto ?? "—"}</td><td className={TD}>{p.recurrencia ?? "—"}</td>
                  <td className={TDN}>{cuentas}</td><td className={TDN}>{p.cantidad}</td><td className={TDN}>{formatear(p.total, "ARS")}</td>
                  <td className={TD}>
                    <span className="flex items-center gap-1">
                      <Link href={aqui({ editar: String(p.id) })} scroll={false} className={LAPIZ} aria-label="Editar" title="Editar">✎</Link>
                      <TachoConfirmar accion={accionBorrarProveedor} campos={{ id: String(p.id), volver: aqui({ editar: null }) }} pregunta="¿Borrar el proveedor?" />
                    </span>
                  </td>
                </tr>
              );
            })}
            {!pagina.length && <tr className={TR}><td className={TD} colSpan={8}>{proveedores.length ? "No hay proveedores con ese filtro." : "Todavía no hay proveedores: se crean al asignar una cuenta en Destinatarios."}</td></tr>}
          </tbody>
        </table>
      </div>
      <Paginado total={elegidas.length} />
    </Pantalla>
  );
}
