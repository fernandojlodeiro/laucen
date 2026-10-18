// Espacio personal (pedido de Fer, 18/10): aparte de la empresa, para
// conectar cuentas personales de Mercado Pago y bajar su información. Entra
// sólo el dueño (el superadministrador que creó la organización) y quien él
// autorice. Nada de esta pantalla lee ni escribe tablas de la empresa
// (lib/personal/, esquema "personal").

import Link from "next/link";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { Pantalla, Avisos, Estado, TituloSeccion, CAJA, CAJA_TABLA, TABLA, THEAD, TH, THN, TR, TD, TDN, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import AltaNueva from "@/app/componentes/AltaNueva";
import { TachoConfirmar } from "@/app/radar/Cliente";
import { entrarPersonal, autorizados } from "@/lib/personal/espacio";
import { cuentasDelEspacio, trabajosDelEspacio, archivosDelEspacio, ultimosPasos, ultimasSondas, colaDelEspacio } from "@/lib/personal/mercadopago";
import { accionAutorizar, accionDesautorizar, accionDesconectar, accionInventario, accionMes, accionExportarAnio } from "./acciones";
import { BotonFondo, Refrescar } from "./Cliente";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Sp = { ok?: string; error?: string; nuevo?: string };

const ZONA = "America/Argentina/Buenos_Aires";
const fecha = (s: unknown) => (typeof s === "string" && s ? new Date(s).toLocaleDateString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toLocaleString("es-AR", { maximumFractionDigits: 0 })} KB`);

/** Los últimos 14 meses (el más reciente cerrado primero), para pedir un mes. */
function meses() {
  const hoy = new Date(Date.now() - 3 * 3600_000);
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    const valor = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const texto = d.toLocaleDateString("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }) + (i === 0 ? " (en curso)" : "");
    return { valor, texto };
  });
}

type Sonda = {
  usuario?: { nombre?: string; documento?: string; tipoDoc?: string; alta?: string };
  pagosCobrados?: { total?: number; masViejos?: { creado?: string }[] };
  pagosHechos?: { total?: number; masViejos?: { creado?: string }[] };
  todasLasTransacciones?: { lista?: { cantidad?: number; inicioMasViejo?: string } };
  liquidaciones?: { lista?: { cantidad?: number; inicioMasViejo?: string } };
};

export default async function EspacioPersonal({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const { espacio } = await entrarPersonal();
  const [cuentas, trabajos, archivos, pasos, sondas, cola, gente] = await Promise.all([
    cuentasDelEspacio(espacio.id), trabajosDelEspacio(espacio.id), archivosDelEspacio(espacio.id), ultimosPasos(espacio.id), ultimasSondas(espacio.id), colaDelEspacio(espacio.id),
    espacio.esDueno ? autorizados(espacio.id) : Promise.resolve([]),
  ]);
  const corriendo = trabajos.some((t) => t.estado === "corriendo");
  const sondaDe = new Map(sondas.map((s) => [s.conexionId, s.datos as Sonda]));
  const listaMeses = meses();
  const colaViva = cola.some((i) => i.estado === "pendiente" || i.estado === "pedido");
  // El año de análisis: los doce meses cerrados hasta el mes pasado (más el mes en curso, parcial).
  const hoyAr = new Date(Date.now() - 3 * 3600_000);
  const mesTxt = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;
  const ultimoCerrado = hoyAr.getUTCMonth() === 0 ? mesTxt(hoyAr.getUTCFullYear() - 1, 12) : mesTxt(hoyAr.getUTCFullYear(), hoyAr.getUTCMonth());
  const primeroDelAnio = mesTxt(hoyAr.getUTCFullYear() - 1, hoyAr.getUTCMonth() + 1);
  const etiquetaMes = (t: string) => new Date(`${t.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });

  return (
    <Pantalla titulo="Espacio personal" camino={[{ texto: "Espacio personal" }]}
      subtitulo={espacio.esDueno ? "Aparte de la empresa: no se mezcla con sus datos. Entrás vos y quien autorices." : `Espacio de ${espacio.dueno}: te autorizó a entrar.`}
      acciones={<a href="/personal/mercadopago/conectar" className={PRIMARIO}>+ Conectar cuenta de Mercado Pago</a>}>
      <Avisos sp={sp} />
      <Refrescar activo={corriendo} />
      <Refrescar activo={!corriendo && colaViva} cada={30} />

      <section className="mb-5">
        <TituloSeccion titulo={`Cuentas de Mercado Pago (${cuentas.length})`} />
        {cuentas.length === 0 ? (
          <p className={`${CAJA} text-xs text-[#5C6B76]`}>
            Todavía no hay ninguna. Con «Conectar cuenta de Mercado Pago» (arriba a la derecha) entrás a Mercado Pago con la cuenta personal y aprobás la aplicación.
            Si el navegador ya tiene abierta otra cuenta de Mercado Pago (la de la empresa), primero cerrá esa sesión en Mercado Pago.
          </p>
        ) : (
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                <th className={TH}>Cuenta</th><th className={THN}>N.º en Mercado Pago</th><th className={TH}>Estado</th><th className={TH}>Conectada</th>
                <th className={TH}>Inventario</th><th className={TH}>Un mes</th><th className={TH}>El año</th><th className={TH} />
              </tr></thead>
              <tbody>
                {cuentas.map((c) => (
                  <tr key={c.id} className={TR}>
                    <td className={TD}><b>{c.nombre ?? "—"}</b>{c.email && <div className="text-[#5C6B76]">{c.email}</div>}</td>
                    <td className={TDN}>{c.mpUserId}</td>
                    <td className={TD}>{c.estado === "activa" ? <Estado texto="Conectada" tono="verde" /> : <Estado texto="Desconectada" tono="rojo" />}
                      {c.ultimoError && <div className="text-[11px] text-[#C03420]">{c.ultimoError}</div>}</td>
                    <td className={TD}>{c.conectada}</td>
                    <td className={TD}>
                      <BotonFondo accion={accionInventario} campos={{ conexion: String(c.id) }} texto="Hacer inventario" clase={SUAVE} corriendo={corriendo} />
                      <div className="text-[11px] text-[#5C6B76] mt-0.5">{c.ultimaSonda ? `Último: ${c.ultimaSonda}` : "Sin hacer"}</div>
                    </td>
                    <td className={TD}>
                      <div className="flex flex-col gap-1">
                        <BotonFondo accion={accionMes} campos={{ conexion: String(c.id) }} texto="Pedir reportes y pagos" clase={SUAVE} corriendo={corriendo} conMes meses={listaMeses} />
                        <BotonFondo accion={accionMes} campos={{ conexion: String(c.id), bajar: "1" }} texto="Bajar reportes del mes" clase={SUAVE} corriendo={corriendo} conMes meses={listaMeses} />
                      </div>
                    </td>
                    <td className={TD}>
                      <form action={accionExportarAnio}>
                        <input type="hidden" name="conexion" value={c.id} /><input type="hidden" name="desde" value={primeroDelAnio} /><input type="hidden" name="hasta" value={ultimoCerrado} />
                        <button className={SUAVE}>Exportar {etiquetaMes(primeroDelAnio)} – hoy</button>
                      </form>
                    </td>
                    <td className={TD}>
                      {espacio.esDueno && <TachoConfirmar accion={accionDesconectar} campos={{ conexion: String(c.id) }} pregunta="¿Desconectar la cuenta y borrar lo bajado?" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {cuentas.some((c) => sondaDe.has(c.id)) && (
        <section className="mb-5">
          <TituloSeccion titulo="Qué se puede sacar de cada cuenta" />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr>
                <th className={TH}>Cuenta</th><th className={TH}>Titular</th><th className={TH}>Alta en Mercado Pago</th>
                <th className={THN}>Todos los pagos (API)</th><th className={TH}>Desde</th><th className={THN}>Pagos hechos (API)</th><th className={TH}>Desde</th>
                <th className={THN}>Reportes de movimientos ya armados</th><th className={TH}>Desde</th><th className={THN}>Reportes de liquidaciones ya armados</th><th className={TH}>Desde</th>
              </tr></thead>
              <tbody>
                {cuentas.filter((c) => sondaDe.has(c.id)).map((c) => {
                  const s = sondaDe.get(c.id)!;
                  return (
                    <tr key={c.id} className={TR}>
                      <td className={TD}>{c.nombre ?? c.mpUserId}</td>
                      <td className={TD}>{s.usuario?.nombre ?? "—"}{s.usuario?.documento && <div className="text-[#5C6B76]">{s.usuario.tipoDoc} {s.usuario.documento}</div>}</td>
                      <td className={TD}>{fecha(s.usuario?.alta)}</td>
                      <td className={TDN}>{s.pagosCobrados?.total ?? "—"}</td><td className={TD}>{fecha(s.pagosCobrados?.masViejos?.[0]?.creado)}</td>
                      <td className={TDN}>{s.pagosHechos?.total ?? "—"}</td><td className={TD}>{fecha(s.pagosHechos?.masViejos?.[0]?.creado)}</td>
                      <td className={TDN}>{s.todasLasTransacciones?.lista?.cantidad ?? "—"}</td><td className={TD}>{fecha(s.todasLasTransacciones?.lista?.inicioMasViejo)}</td>
                      <td className={TDN}>{s.liquidaciones?.lista?.cantidad ?? "—"}</td><td className={TD}>{fecha(s.liquidaciones?.lista?.inicioMasViejo)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[#5C6B76] mt-1">La consulta de pagos de Mercado Pago llega sólo hasta alrededor de un año atrás; lo anterior sale de los reportes.</p>
        </section>
      )}

      {cola.length > 0 && (
        <section className="mb-5">
          <TituloSeccion titulo={`Exportación del año (${cola.filter((i) => i.estado === "listo" || i.estado === "vacio").length} de ${cola.length} listos)`} />
          {cuentas.filter((c) => cola.some((i) => i.conexionId === c.id)).map((c) => {
            const items = cola.filter((i) => i.conexionId === c.id);
            const filas = [...new Set(items.map((i) => i.etiqueta))];
            const celda = (et: string, f: string) => {
              const i = items.find((x) => x.etiqueta === et && x.fuente === f);
              if (!i) return <td className={TD}>—</td>;
              const tono = i.estado === "listo" ? "verde" : i.estado === "vacio" ? "gris" : i.estado === "error" ? "rojo" : i.estado === "pedido" ? "azul" : "amarillo";
              const texto = { listo: "Bajado", vacio: "Sin movimientos", error: "Falló", pedido: "Armándose", pendiente: "En cola" }[i.estado] ?? i.estado;
              return <td className={TD} title={i.mensaje ?? ""}><Estado texto={texto} tono={tono} />{i.estado === "error" && i.mensaje && <div className="text-[11px] text-[#C03420]">{i.mensaje}</div>}</td>;
            };
            const especiales = filas.filter((et) => !/^\d{4}-\d{2}/.test(et));
            const meses = filas.filter((et) => /^\d{4}-\d{2}/.test(et));
            return (
              <div key={c.id} className="mb-3">
                <p className="text-xs font-semibold mb-1">{c.nombre ?? c.mpUserId}</p>
                {especiales.map((et) => {
                  const i = items.find((x) => x.etiqueta === et)!;
                  return <p key={et} className="text-xs text-[#5C6B76] mb-1">{et[0].toUpperCase() + et.slice(1)}: <b>{{ listo: "listo", vacio: "nada", error: "falló", pedido: "en curso", pendiente: "en cola" }[i.estado]}</b>{i.mensaje ? ` — ${i.mensaje}` : ""}</p>;
                })}
                <div className={CAJA_TABLA}>
                  <table className={TABLA}>
                    <thead className={THEAD}><tr><th className={TH}>Período</th><th className={TH}>Todas las transacciones</th><th className={TH}>Liquidaciones</th><th className={TH}>Pagos (API)</th></tr></thead>
                    <tbody>
                      {meses.map((et) => (
                        <tr key={et} className={TR}>
                          <td className={TD}>{etiquetaMes(et)}{et.includes("parcial") && <span className="text-[#5C6B76]"> (parcial)</span>}</td>
                          {celda(et, "settlement_report")}{celda(et, "release_report")}{celda(et, "payments")}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-[#5C6B76]">Se va pidiendo y bajando solo, de a poco; la pantalla se actualiza cada medio minuto. «Sin movimientos»: Mercado Pago lo entregó vacío. «Falló»: se reintentó varias veces; pasando el mouse se ve el motivo.</p>
        </section>
      )}

      {trabajos.length > 0 && (
        <section className="mb-5">
          <TituloSeccion titulo={`Lo último que se hizo (${trabajos.length})`} />
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Cuándo</th><th className={TH}>Qué</th><th className={TH}>Estado</th><th className={TH}>Resultado</th></tr></thead>
              <tbody>
                {trabajos.map((t) => (
                  <tr key={t.id} className={TR}>
                    <td className={TD}>{t.cuando}</td><td className={TD}>{t.titulo}</td>
                    <td className={TD}><Estado texto={t.estado === "corriendo" ? "Trabajando…" : t.estado === "ok" ? "Listo" : "Falló"} tono={t.estado === "corriendo" ? "azul" : t.estado === "ok" ? "verde" : "rojo"} /></td>
                    <td className={TD}>{t.mensaje ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mb-5">
        <TituloSeccion titulo={`Archivos bajados (${archivos.length})`} />
        {archivos.length === 0 ? <p className={`${CAJA} text-xs text-[#5C6B76]`}>Todavía no se bajó nada.</p> : (
          <div className={CAJA_TABLA}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Archivo</th><th className={TH}>Qué es</th><th className={THN}>Tamaño</th><th className={TH}>Bajado</th><th className={TH}>Comprobación</th></tr></thead>
              <tbody>
                {archivos.map((a) => (
                  <tr key={a.id} className={TR}>
                    <td className={TD}><Link href={`/personal/archivo/${a.id}`} prefetch={false} className="text-[#16577F] hover:underline">{a.nombre}</Link></td>
                    <td className={TD}>{{ settlement_report: "Todas las transacciones", release_report: "Liquidaciones", payments_cobrados: "Todos los pagos de la cuenta (API)", payments_hechos: "Pagos hechos (API)" }[a.fuente] ?? a.fuente}</td>
                    <td className={TDN}>{kb(a.bytes)}</td><td className={TD}>{a.bajado}</td><td className={`${TD} font-mono text-[11px]`}>{a.sha}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pasos.length > 0 && (
        <details className="mb-5">
          <summary className="text-xs font-semibold text-[#16577F] cursor-pointer">Qué contestó Mercado Pago ({pasos.length})</summary>
          <div className={`${CAJA_TABLA} mt-2`}>
            <table className={TABLA}>
              <thead className={THEAD}><tr><th className={TH}>Cuándo</th><th className={TH}>Paso</th><th className={THN}>Respuesta</th><th className={TH}>Detalle</th></tr></thead>
              <tbody>
                {pasos.map((p, i) => (
                  <tr key={i} className={TR}><td className={TD}>{p.cuando}</td><td className={TD}>{p.paso}</td><td className={TDN}>{p.status ?? "—"}</td><td className={`${TD} text-[11px] text-[#5C6B76] break-all`}>{p.resumen}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {espacio.esDueno && (
        <section className="mb-5">
          <TituloSeccion titulo={`Quién más puede entrar (${gente.length})`} />
          <AltaNueva texto="Autorizar a alguien">
            <form action={accionAutorizar} className={`${CAJA} flex flex-wrap items-end gap-2`}>
              <label><span className={ETIQUETA}>Mail del usuario de Laucen</span>
                <input name="email" type="email" required className={`${CAMPO} w-72`} /></label>
              <button className={PRIMARIO}>Autorizar</button>
            </form>
          </AltaNueva>
          {gente.length === 0 ? <p className="text-xs text-[#5C6B76]">Nadie más: sólo vos.</p> : (
            <div className={CAJA_TABLA}>
              <table className={TABLA}>
                <thead className={THEAD}><tr><th className={TH}>Persona</th><th className={TH}>Mail</th><th className={TH}>Desde</th><th className={TH} /></tr></thead>
                <tbody>
                  {gente.map((g) => (
                    <tr key={g.usuarioId} className={TR}>
                      <td className={TD}>{g.nombre || "—"}</td><td className={TD}>{g.email}</td><td className={TD}>{g.desde}</td>
                      <td className={TD}><TachoConfirmar accion={accionDesautorizar} campos={{ usuario: g.usuarioId }} pregunta="¿Sacarle el acceso?" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </Pantalla>
  );
}
