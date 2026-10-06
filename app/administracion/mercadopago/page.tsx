// Administración → Mercado Pago (Fer, 6/10): el saldo de Mercado Pago de cada
// cuenta de Mercado Libre, leído en este momento (cada vez que se abre o con
// "Actualizar"): total, disponible, a liberar y todos los desgloses que mande
// Mercado Pago, una columna por cuenta y una de total. Debajo, cómo se
// conectó cada una (o por qué no) y la llave de Mercado Pago propia de cada
// cuenta, opcional. Sólo lee: no mueve plata ni cambia nada.

import Link from "next/link";
import { SUAVE, VERDE } from "@/app/botones";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { entrarErp, Pantalla, Avisos, Estado, Lapiz, TituloSeccion, CAJA, CAJA_TABLA, CAMPO, TABLA, THEAD, TH, THN, TR, TD, TDN } from "@/app/componentes/erp";
import { consulta } from "@/lib/erp/base";
import { formatear } from "@/lib/moneda";
import { cuentasDe } from "@/lib/mercadolibre/api";
import { leerSaldo, ultimasLecturas, numeros, type Lectura } from "@/lib/mercadopago/saldos";
import { accionGuardarLlaveMp, accionBorrarLlaveMp } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "/administracion/mercadopago";
const hora = (d: Date) => new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default async function MercadoPago({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; editar?: string }> }) {
  const s = await entrarErp("mercadopago_ver");
  const sp = await searchParams;
  const cuentas = (await cuentasDe(s.org.id)).filter((c) => c.canalId);
  const canales = new Map((await consulta<{ id: number; nombre: string }>(
    "select id::int, nombre from canal where organizacion_id = $1 and tipo = 'mercadolibre'", [s.org.id])).map((c) => [c.id, c.nombre]));
  const conLlave = new Set((await consulta<{ canal_id: number }>("select canal_id::int from mp_credencial where organizacion_id = $1", [s.org.id])).map((x) => x.canal_id));

  // El saldo de este momento: se lee al abrir; si una cuenta no contesta, queda la última lectura guardada.
  const anteriores = await ultimasLecturas(s.org.id);
  const lecturas = new Map<number, Lectura & { vieja?: boolean }>();
  await Promise.all(cuentas.map(async (c) => {
    try { lecturas.set(c.canalId!, await leerSaldo(c)); }
    catch (e) {
      console.error("[mercadopago] saldo", c.id, e);
      const v = anteriores.get(c.canalId!);
      if (v) lecturas.set(c.canalId!, { ...v, vieja: true });
    }
  }));

  // Los renglones: todos los números que mandó Mercado Pago, en el orden en que aparecen.
  const porCuenta = new Map(cuentas.map((c) => [c.canalId!, numeros(lecturas.get(c.canalId!)?.datos ?? null)]));
  const renglones = new Map<string, { titulo: string; nivel: number }>();
  for (const m of porCuenta.values()) for (const [k, v] of m) if (!renglones.has(k)) renglones.set(k, { titulo: v.titulo, nivel: v.nivel });
  const moneda = (c: number) => String((lecturas.get(c)?.datos as { currency_id?: string } | null)?.currency_id ?? "ARS");
  const plata = (n: number | undefined, cur = "ARS") => (n == null ? "—" : cur === "ARS" ? formatear(n, "ARS") : `${cur} ${n.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`);
  const conDatos = cuentas.filter((c) => lecturas.get(c.canalId!)?.datos);
  const editar = Number(sp.editar) || 0;

  return (
    <Pantalla titulo="Mercado Pago" subtitulo="El saldo de Mercado Pago de cada cuenta de Mercado Libre, leído en este momento. Sólo lectura: no mueve plata ni cambia nada."
      acciones={<Link href={BASE} className={SUAVE} prefetch={false}>↻ Actualizar</Link>}>
      <Avisos sp={sp} />

      <section className="mb-6">
        <TituloSeccion titulo="Saldos" />
        {conDatos.length === 0 && (
          <p className={`${CAJA} text-sm text-[#C03420] mb-3`}>
            Mercado Pago no dio el saldo de ninguna cuenta. En «Conexión» (abajo) está qué contestó cada una; si dice que falta permiso, cargá la llave de Mercado Pago de esa cuenta.
          </p>
        )}
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}>
              <tr>
                <th className={TH}>Concepto</th>
                {cuentas.map((c) => <th key={c.id} className={THN}>{canales.get(c.canalId!) ?? c.nickname}</th>)}
                {cuentas.length > 1 && <th className={THN}>Total</th>}
              </tr>
            </thead>
            <tbody>
              {renglones.size === 0 && <tr><td colSpan={cuentas.length + 2} className={`${TD} text-[#5C6B76]`}>Sin datos.</td></tr>}
              {[...renglones].map(([k, r]) => {
                const valores = cuentas.map((c) => porCuenta.get(c.canalId!)?.get(k)?.valor);
                const total = valores.reduce<number>((a, v) => a + (v ?? 0), 0);
                const principal = r.nivel === 0;
                return (
                  <tr key={k} className={`${TR} ${principal ? "font-semibold" : ""}`}>
                    <td className={TD} style={{ paddingLeft: 8 + r.nivel * 16 }}>{r.titulo}</td>
                    {cuentas.map((c, i) => <td key={c.id} className={TDN}>{plata(valores[i], moneda(c.canalId!))}</td>)}
                    {cuentas.length > 1 && <td className={`${TDN} font-semibold`}>{plata(total)}</td>}
                  </tr>
                );
              })}
              <tr className={`${TR} text-[11px] text-[#5C6B76]`}>
                <td className={TD}>Leído</td>
                {cuentas.map((c) => {
                  const l = lecturas.get(c.canalId!);
                  return <td key={c.id} className={TDN}>{l ? <>{hora(l.leidoTs)}{l.vieja && <span className="block text-[#C03420]">(lectura anterior)</span>}</> : "—"}</td>;
                })}
                {cuentas.length > 1 && <td />}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[#5C6B76] mt-1">
          Cada renglón es un número que manda Mercado Pago, con su nombre en castellano cuando se conoce (si no, el original). «No disponible» es la plata cobrada que todavía no se liberó; debajo, por qué motivo.
        </p>
      </section>

      <section className="mb-6">
        <TituloSeccion titulo="Conexión" />
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Cuenta</th><th className={TH}>Estado</th><th className={TH}>De dónde salió / qué contestó</th></tr></thead>
            <tbody>
              {cuentas.map((c) => {
                const l = lecturas.get(c.canalId!);
                return (
                  <tr key={c.id} className={TR}>
                    <td className={TD}>{canales.get(c.canalId!) ?? c.nickname}</td>
                    <td className={TD}>{l?.datos ? <Estado texto="Leído" tono="verde" /> : <Estado texto="Sin saldo" tono="rojo" />}</td>
                    <td className={`${TD} text-[11px]`}>
                      {l?.fuente ?? (l?.intentos ?? []).map((x, i) => (
                        <span key={i} className="block">{x.fuente} (llave de {x.llave === "ml" ? "Mercado Libre" : "Mercado Pago"}): {x.motivo ?? `contestó ${x.status}`}</span>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <TituloSeccion titulo="Llave de Mercado Pago de cada cuenta (opcional)" />
        <p className="text-[11px] text-[#5C6B76] mb-2">
          Laucen lee Mercado Pago con la conexión de Mercado Libre. Si para alguna cuenta no alcanza, cargá acá el <b>Access Token de producción</b> de su Mercado Pago (developers de Mercado Pago, con esa cuenta → tu aplicación → Credenciales productivas). Nunca se vuelve a mostrar.
        </p>
        <div className={CAJA_TABLA}>
          <table className={TABLA}>
            <thead className={THEAD}><tr><th className={TH}>Cuenta</th><th className={TH}>Llave de Mercado Pago</th><th /></tr></thead>
            <tbody>
              {cuentas.map((c) => editar === c.canalId ? (
                <tr key={c.id} className={`${TR} bg-[#FAFBFC]`}>
                  <td className={TD}>{canales.get(c.canalId!) ?? c.nickname}</td>
                  <td className={TD} colSpan={2}>
                    <form action={accionGuardarLlaveMp} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="canal" value={c.canalId!} />
                      <input name="access_token" autoComplete="off" placeholder="APP_USR-…" className={`${CAMPO} w-96 font-mono`} autoFocus />
                      <button className={VERDE}>Grabar</button>
                      <Link href={BASE} className={SUAVE}>Cancelar</Link>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={TR}>
                  <td className={TD}>{canales.get(c.canalId!) ?? c.nickname}</td>
                  <td className={TD}>{conLlave.has(c.canalId!) ? <Estado texto="Cargada" tono="verde" /> : <span className="text-[#5C6B76]">Sin cargar</span>}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    <span className="inline-flex gap-1">
                      <Lapiz href={`${BASE}?editar=${c.canalId}`} />
                      {conLlave.has(c.canalId!) && <TachoConfirmar accion={accionBorrarLlaveMp} campos={{ canal: String(c.canalId) }} pregunta="¿Borrar la llave?" />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Pantalla>
  );
}
