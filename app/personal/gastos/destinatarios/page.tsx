// Destinatarios (pedido de Fer, 18/10): las cuentas a las que salió plata de las cuentas personales —el CBU/CVU
// del mail de la transferencia, o el usuario de Mercado Pago que la recibió—, con el titular y el banco que
// trae el mail, cuántas veces y cuánto. El lápiz de la fila la asigna a un proveedor (se elige o se crea) con su
// tipo de gasto: de ahí en adelante toda salida a esa cuenta se clasifica sola. Un proveedor puede tener varias
// cuentas (el mismo comercio que pide la plata a una cuenta o a otra). Lib: lib/personal/destinatarios.ts.

import Link from "next/link";
import { Pantalla, Avisos, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, LAPIZ, Estado, url } from "@/app/componentes/erp";
import BuscadorVivo, { FiltroVivo } from "@/app/componentes/BuscadorVivo";
import ElegirDeLista from "@/app/componentes/ElegirDeLista";
import { OPCIONES_CATEGORIA } from "@/app/componentes/RevisarGastos";
import { Paginado } from "@/app/componentes/Lista";
import { paginarEnMemoria } from "@/lib/lista";
import { coincideBusqueda } from "@/lib/busqueda";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { formatear } from "@/lib/moneda";
import { entrarPersonal } from "@/lib/personal/espacio";
import { gastosPersonales } from "@/lib/mercadopago/gastos-datos";
import { AMBITOS, RECURRENCIAS } from "@/lib/mercadopago/gastos";
import { agruparDestinatarios, proveedoresDelEspacio, textoCuenta } from "@/lib/personal/destinatarios";
import PestanasGastos, { cuentasGastos } from "../PestanasGastos";
import { accionAsignarDestino, accionCrearProveedor } from "../acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Sp = { ver?: string; q?: string; contiene?: string; p?: string; editar?: string; ok?: string; error?: string };
const plata = (n: number) => formatear(n, "ARS");
const fecha = (d: Date | null) => (d ? new Date(d).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export default async function Destinatarios({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { sesion, espacio } = await entrarPersonal();
  const [todos, proveedores] = await Promise.all([gastosPersonales(espacio.id, sesion.usuario.id, espacio.esDueno), proveedoresDelEspacio(espacio.id)]);
  const { lista, sinDestino } = agruparDestinatarios(todos);
  const ver = sp.ver ?? "sin";
  const q = sp.q ?? "", comienza = sp.contiene !== "1";
  const elegidas = lista
    .filter((d) => (ver === "sin" ? !d.proveedor : ver === "con" ? !!d.proveedor : true))
    .filter((d) => !q || coincideBusqueda([d.cuenta, d.titular, d.entidad, d.ejemplo, d.proveedor, d.categoria], q, comienza));
  const pagina = paginarEnMemoria(elegidas, sp);
  const base = "/personal/gastos/destinatarios";
  const aqui = (extra: Record<string, string | null>) => url(base, { ver, q: q || null, contiene: sp.contiene ?? null, p: sp.p ?? null, ...extra });
  const opcionesProv = proveedores.map((p) => ({ id: p.id, texto: p.nombre, detalle: p.categoria ?? undefined }));

  return (
    <Pantalla titulo="Destinatarios" camino={[{ texto: "Espacio personal", href: "/personal" }, { texto: "Mis gastos", href: "/personal/gastos" }, { texto: "Destinatarios" }]}
      subtitulo="A qué cuentas salió tu plata. Asigná cada cuenta a un proveedor con su tipo de gasto: de ahí en adelante se clasifica sola.">
      <PestanasGastos activa="destinatarios" cuentas={cuentasGastos(todos, proveedores.length)} />
      <Avisos sp={sp} />
      {sinDestino.cantidad > 0 && (
        <p className="text-xs text-[#8a5a00] bg-[#FFF8E6] border border-[#F2DFA8] rounded-lg px-3 py-2 mb-3">
          {sinDestino.cantidad} transferencias por {plata(sinDestino.total)} no tienen el mail de Mercado Pago que dice a qué cuenta fueron:
          quedan como «Transferencias a terceros» y se clasifican de a una en <Link href="/personal/gastos/revisar?ver=gastos" className="underline">Sin clasificar</Link>.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <FiltroVivo parametro="ver" valor={ver} etiqueta="Qué ver" limpiar={["p", "editar"]}>
          <option value="sin">Sin proveedor</option>
          <option value="con">Con proveedor</option>
          <option value="todos">Todas las cuentas</option>
        </FiltroVivo>
        <BuscadorVivo q={q} comienza={comienza} placeholder="Buscar cuenta, titular, banco, proveedor…" limpiar={["p", "editar"]} />
      </div>
      <div className={CAJA_TABLA}>
        <table className={TABLA}>
          <thead className={THEAD}><tr>
            <th className={TH}>Cuenta destino</th><th className={TH}>Titular</th><th className={TH}>Banco</th>
            <th className={THN}>Veces</th><th className={THN}>12 meses</th><th className={TH}>Última</th>
            <th className={TH}>Proveedor</th><th className={TH}>Tipo de gasto</th><th className={TH} />
          </tr></thead>
          <tbody>
            {pagina.map((d) => {
              const datos = (
                <>
                  <td className={TD}><span className="font-mono text-xs">{textoCuenta(d.cuenta)}</span></td>
                  <td className={TD}>{d.titular ?? <span className="text-[#5C6B76]">{d.ejemplo ?? "—"}</span>}</td>
                  <td className={TD}>{d.entidad ?? "—"}</td>
                  <td className={TDN}>{d.cantidad}</td><td className={TDN}>{plata(d.total)}</td><td className={TD}>{fecha(d.ultima)}</td>
                </>
              );
              if (sp.editar === d.cuenta) {
                const prov = proveedores.find((p) => p.nombre === d.proveedor);
                return (
                  <tr key={d.cuenta} className={`${TR} bg-[#F7FAFC]`}>
                    {datos}
                    <td className={TD} colSpan={3}>
                      <form action={accionAsignarDestino} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="cuenta" value={d.cuenta} />
                        <input type="hidden" name="volver" value={aqui({ editar: null })} />
                        <ElegirDeLista name="proveedor" opciones={opcionesProv} valor={prov?.id ?? null} vacio="Sin proveedor" placeholder="Buscá o creá el proveedor…" etiqueta="Proveedor" crear={accionCrearProveedor} className="w-56" />
                        <ElegirDeLista name="categoria" opciones={OPCIONES_CATEGORIA} valor={OPCIONES_CATEGORIA.find((o) => o.texto === (prov?.categoria ?? d.categoria))?.id ?? null} etiqueta="Tipo de gasto" className="w-56" />
                        <select name="ambito" defaultValue={prov?.ambito_gasto ?? "personal"} className={CAMPO} aria-label="A quién corresponde">
                          {AMBITOS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <select name="recurrencia" defaultValue={prov?.recurrencia ?? "sin clasificar"} className={CAMPO} aria-label="Recurrencia">
                          {RECURRENCIAS.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <button className={PRIMARIO}>Grabar</button>
                        <Link href={aqui({ editar: null })} className={SUAVE}>Cancelar</Link>
                      </form>
                      <p className="text-[11px] text-[#5C6B76] mt-1">El tipo de gasto es del proveedor: vale para todas sus cuentas.</p>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={d.cuenta} className={TR}>
                  {datos}
                  <td className={TD}>{d.proveedor ? <Link href={`/personal/gastos/proveedores?q=${encodeURIComponent(d.proveedor)}`} className="text-[#16577F] hover:underline">{d.proveedor}</Link> : <Estado texto="Sin proveedor" tono="amarillo" />}</td>
                  <td className={TD}>{d.categoria}</td>
                  <td className={TD}><Link href={aqui({ editar: d.cuenta })} scroll={false} className={LAPIZ} aria-label="Asignar proveedor" title="Asignar proveedor">✎</Link></td>
                </tr>
              );
            })}
            {!pagina.length && <tr className={TR}><td className={TD} colSpan={9}>No hay cuentas con ese filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <Paginado total={elegidas.length} />
    </Pantalla>
  );
}
