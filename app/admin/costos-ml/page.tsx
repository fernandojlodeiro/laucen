import Link from "next/link";
import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { asegurarEsquema } from "@/lib/costos-ml/esquema";
import {
  FASES, GRILLAS, cambiosRecientes, cargoFijoVigente, comisionesVigentes, envioGratisVigente, ultimasCorridas,
} from "@/lib/costos-ml/proceso";
import { formatearNumero } from "@/lib/numeros";
import { pool } from "@/db";
import Pestanas from "@/app/componentes/Pestanas";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { BotonEnviar } from "@/app/radar/Cliente";
import { accionCorrerAhora } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { robots: { index: false, follow: false } };

// Costos de vender en Mercado Libre (interno, sólo Fer): lo vigente de cada
// cosa y cómo vienen las corridas diarias. Los datos están en las tablas
// ml_costos_* (sólo cambios) para las sesiones que calculan costos.

const VISTAS = [
  { clave: "cambios", texto: "Cambios" },
  { clave: "comisiones", texto: "Comisiones" },
  { clave: "cargo", texto: "Cargo fijo" },
  { clave: "envio", texto: "Envío gratis (vendedor)" },
  { clave: "corridas", texto: "Corridas" },
] as const;
type Vista = (typeof VISTAS)[number]["clave"];

const NOMBRES: Record<string, string> = {
  referencias: "Referencias", cargo_fijo: "Cargo fijo", envio_gratis: "Envío gratis",
  comisiones: "Comisiones",
};

const ZONA = "America/Argentina/Buenos_Aires";
const fecha = (d: Date | null | undefined): string =>
  d ? new Date(d).toLocaleDateString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "2-digit" }) : "";
const hora = (d: Date | null) =>
  d ? new Date(d).toLocaleString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const pesos = (n: number | null | undefined) => (n == null ? "—" : `$ ${formatearNumero(n, "pesos")}`);
const pct = (n: number | null | undefined) => (n == null ? "—" : `${formatearNumero(n, "pct")} %`);
const kg = (g: number) => `${formatearNumero(g / 1000, "decimal")} kg`;
const ultimo = (filas: { desde: Date }[]) =>
  filas.length ? new Date(Math.max(...filas.map((f) => new Date(f.desde).getTime()))) : null;

const TH = "py-1 px-2 font-normal";
const TD = "py-1 px-2";

function Desde({ d }: { d: Date | null }) {
  return d ? <p className="text-[11px] text-[#9AA7B3] mb-2">Valores vigentes; el último cambio es del {fecha(d)}.</p> : null;
}

export default async function CostosML({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  if (!(await sosVos())) redirect("/panel");
  await asegurarEsquema();
  const sp = await searchParams;
  const vista: Vista = VISTAS.some((v) => v.clave === sp.ver) ? (sp.ver as Vista) : "cambios";
  const { rows: [cuentas] } = await pool.query<{ comisiones: number; cargo: number; envio: number; corridas: number }>(`
    select (select count(*) from ml_costos_mis_categorias where activa)::int comisiones,
           (select count(*) from ml_costos_cargo_fijo_vigente where tipo = 'gold_special')::int cargo,
           (select count(*) from ml_costos_envio_gratis_vigente)::int envio,
           (select count(*) from ml_costos_corridas)::int corridas`);

  return (
    <main className="max-w-5xl mx-auto p-6">
      <Link href="/panel" className={`inline-block mb-2 ${SUAVE}`}>← Panel</Link>
      <h1 className="text-lg font-bold mb-1">Costos de vender en Mercado Libre</h1>
      <p className="text-xs text-[#5C6B76] mb-3">
        Todos los días a las 6:30 se le pregunta a la API de Mercado Libre, con tu cuenta, cuánto cuesta vender. Se guarda sólo lo que
        cambia, con la fecha desde la que vale.
      </p>
      <Pestanas items={VISTAS.map((v) => ({
        clave: v.clave, texto: v.texto, href: `/admin/costos-ml?ver=${v.clave}`, activa: vista === v.clave,
        // Cambios sale de una consulta pesada: no se cuenta.
        cuenta: v.clave === "cambios" ? null : cuentas[v.clave],
      }))} />
      {vista === "cambios" && <Cambios />}
      {vista === "comisiones" && <Comisiones q={sp.q ?? ""} />}
      {vista === "cargo" && <CargoFijo />}
      {vista === "envio" && <EnvioGratis />}
      {vista === "corridas" && <Corridas />}
    </main>
  );
}

async function Cambios() {
  const lista = await cambiosRecientes();
  // Agrupados por día (hora argentina).
  const dias = new Map<string, typeof lista>();
  for (const c of lista) {
    const d = fecha(c.desde);
    dias.set(d, [...(dias.get(d) ?? []), c]);
  }
  return (
    <section>
      <p className="text-[11px] text-[#9AA7B3] mb-3">
        Lo que Mercado Libre cambió desde la primera lectura (28/09/26), lo más nuevo arriba: qué cambió, cuánto valía antes y cuánto vale
        ahora. Sirve de referencia para saber cuándo ML cambia sus costos.
      </p>
      {lista.length === 0 ? (
        <p className="text-sm text-[#5C6B76]">Todavía no hubo cambios.</p>
      ) : [...dias].map(([dia, filas]) => (
        <div key={dia} className="mb-5">
          <h2 className="text-sm font-bold mb-1">{dia} · {formatearNumero(filas.length, "entero")} cambio{filas.length > 1 ? "s" : ""}</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#5C6B76]">
                <th className={TH}>Qué</th><th className={TH}>Detalle</th><th className={`${TH} text-right`}>Antes</th><th className={`${TH} text-right`}>Ahora</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c, i) => (
                <tr key={i} className="border-t border-[#E3E9F0] align-top">
                  <td className={`${TD} text-xs whitespace-nowrap`}>{c.que}</td>
                  <td className={`${TD} text-xs`}>{c.detalle}</td>
                  <td className={`${TD} text-right text-xs text-[#5C6B76]`}>{c.antes}</td>
                  <td className={`${TD} text-right text-xs font-bold`}>{c.ahora}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {lista.length >= 300 && <p className="text-[11px] text-[#9AA7B3]">Se muestran los últimos 300 cambios.</p>}
    </section>
  );
}

async function Comisiones({ q }: { q: string }) {
  const { total, filas } = await comisionesVigentes(q);
  const mas = (base: number | null, extra: number | null) => (base == null || extra == null ? null : base + extra);
  return (
    <section className="overflow-x-auto">
      <form className="flex gap-2 mb-2">
        <input type="hidden" name="ver" value="comisiones" />
        <input name="q" defaultValue={q} placeholder="Buscar categoría (por ejemplo: regulador)"
          className="border border-[#E3E9F0] rounded-lg px-3 py-2 text-sm flex-1" />
        <button className={PRIMARIO}>Buscar</button>
      </form>
      <p className="text-[11px] text-[#9AA7B3] mb-2">
        {formatearNumero(total, "entero")} categorías donde tenés publicaciones activas (las que más publicaciones tienen, arriba).
        Comisión total sobre el precio según las cuotas que ofrezca la publicación; no depende del precio. Las cuotas van por la marca que
        ML le pone a la publicación (3x, 9x, 12x); lo que vale es lo que muestra la página al comprador.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[#5C6B76]">
            <th className={TH}>Categoría</th><th className={`${TH} text-right`}>Publ.</th>
            <th className={`${TH} text-right`}>Clásica</th><th className={`${TH} text-right`}>Clásica interés bajo</th>
            <th className={`${TH} text-right`}>Premium 3x</th><th className={`${TH} text-right`}>Premium (6)</th>
            <th className={`${TH} text-right`}>Premium 9x</th><th className={`${TH} text-right`}>Premium 12x</th>
            <th className={`${TH} text-right`}>Desde</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.categoria_id} className="border-t border-[#E3E9F0]">
              <td className={`${TD} text-xs`}>{f.ruta} <span className="text-[#9AA7B3]">{f.categoria_id}</span></td>
              <td className={`${TD} text-right`}>{formatearNumero(f.publicaciones, "entero")}</td>
              <td className={`${TD} text-right`}>{pct(f.clasica_pct)}</td>
              <td className={`${TD} text-right`}>{pct(mas(f.clasica_pct, f.clasica_bajo_interes_pct))}</td>
              <td className={`${TD} text-right`}>{pct(mas(f.clasica_pct, f.premium_3x_pct))}</td>
              <td className={`${TD} text-right`}>{pct(f.premium_pct)}</td>
              <td className={`${TD} text-right`}>{pct(mas(f.clasica_pct, f.premium_9x_pct))}</td>
              <td className={`${TD} text-right`}>{pct(mas(f.clasica_pct, f.premium_12x_pct))}</td>
              <td className={`${TD} text-right text-xs text-[#5C6B76]`}>{fecha(f.desde)}{f.cambios > 1 ? ` (${f.cambios - 1} cambio${f.cambios > 2 ? "s" : ""})` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 0 && <p className="text-sm text-[#5C6B76] mt-2">Todavía no se leyeron tus categorías: se completan en la próxima corrida (o con "Correr ahora" en Corridas).</p>}
    </section>
  );
}

async function CargoFijo() {
  const filas = await cargoFijoVigente();
  const v = (precio: number, logistica: string, peso: number) =>
    filas.find((f) => f.precio === precio && f.logistica === logistica && f.peso_g === peso)?.cargo_fijo;
  const igualesFull = filas.every((f) => f.logistica !== "fulfillment" || f.cargo_fijo === v(f.precio, "xd_drop_off", f.peso_g));
  return (
    <section className="overflow-x-auto">
      <Desde d={ultimo(filas)} />
      <p className="text-[11px] text-[#9AA7B3] mb-2">
        Cargo fijo por unidad vendida en publicación clásica, además del %. Se cobra debajo del precio de envío gratis. La primera columna es
        el cargo sin contarle a ML el peso; las otras, según el peso del paquete{igualesFull ? " (igual por colecta y por Full)" : " por colecta"}.
      </p>
      <table className="text-sm">
        <thead>
          <tr className="text-xs text-[#5C6B76]">
            <th className={`${TH} text-right`}>Precio</th><th className={`${TH} text-right`}>Sin peso</th>
            {GRILLAS.PESOS_CARGO_FIJO.map((p) => <th key={p} className={`${TH} text-right`}>{kg(p)}</th>)}
          </tr>
        </thead>
        <tbody>
          {GRILLAS.PRECIOS_CARGO_FIJO.map((precio) => (
            <tr key={precio} className="border-t border-[#E3E9F0]">
              <td className={`${TD} text-right font-bold`}>{pesos(precio)}</td>
              <td className={`${TD} text-right`}>{pesos(v(precio, "-", 0))}</td>
              {GRILLAS.PESOS_CARGO_FIJO.map((p) => <td key={p} className={`${TD} text-right`}>{pesos(v(precio, "xd_drop_off", p))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function EnvioGratis() {
  const filas = await envioGratisVigente();
  const tabla = (logistica: string, titulo: string) => (
    <div className="mb-6 overflow-x-auto">
      <h2 className="text-sm font-bold mb-1">{titulo}</h2>
      <table className="text-sm">
        <thead>
          <tr className="text-xs text-[#5C6B76]">
            <th className={`${TH} text-right`}>Peso</th>
            {GRILLAS.PRECIOS_ENVIO.map((p) => <th key={p} className={`${TH} text-right`}>a {pesos(p)}</th>)}
          </tr>
        </thead>
        <tbody>
          {GRILLAS.PESOS_ENVIO.map((peso) => (
            <tr key={peso} className="border-t border-[#E3E9F0]">
              <td className={`${TD} text-right font-bold`}>{kg(peso)}</td>
              {GRILLAS.PRECIOS_ENVIO.map((precio) => (
                <td key={precio} className={`${TD} text-right`}>
                  {pesos(filas.find((f) => f.logistica === logistica && f.precio === precio && f.peso_g === peso)?.costo)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <section>
      <Desde d={ultimo(filas)} />
      <p className="text-[11px] text-[#9AA7B3] mb-3">
        Lo que pagás vos por el envío gratis (obligatorio desde $ 33.000), igual a cualquier punto del país, ya con la bonificación de
        MercadoLíder. Paquete compacto: si la caja es voluminosa, ML cobra por el peso volumétrico (largo × ancho × alto / 4.000).
      </p>
      {tabla("xd_drop_off", "Colecta / punto de despacho")}
      {tabla("fulfillment", "Full")}
    </section>
  );
}

async function Corridas() {
  const lista = await ultimasCorridas();
  const filasNuevas = (c: Record<string, number> | null) => Object.values(c ?? {}).reduce((a, b) => a + b, 0);
  return (
    <section>
      <form action={accionCorrerAhora} className="mb-4">
        <BotonEnviar clase={PRIMARIO}>Correr ahora</BotonEnviar>
        <span className="text-[11px] text-[#9AA7B3] ml-2">Si hoy ya corrió, sigue lo que falte. Lo que no entre sigue solo cada 5 minutos.</span>
      </form>
      {lista.length === 0 ? (
        <p className="text-sm text-[#5C6B76]">Todavía no hay corridas.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#5C6B76]">
              <th className={TH}>Fecha</th><th className={TH}>Empezó</th><th className={TH}>Terminó</th>
              <th className={`${TH} text-right`}>Tus categorías</th><th className={`${TH} text-right`}>Cambios guardados</th>
              <th className={`${TH} text-right`}>Sin respuesta</th><th className={TH}>Partes</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-t border-[#E3E9F0] align-top">
                <td className={TD}>{fecha(new Date(`${new Date(c.fecha).toISOString().slice(0, 10)}T12:00:00Z`))}</td>
                <td className={TD}>{hora(c.iniciada)}</td>
                <td className={TD}>{hora(c.terminada)}</td>
                <td className={`${TD} text-right`}>{c.fases.includes("comisiones") ? formatearNumero(c.hojas, "entero") : "—"}</td>
                <td className={`${TD} text-right`}>{formatearNumero(filasNuevas(c.cambios), "entero")}</td>
                <td className={`${TD} text-right`}>{formatearNumero(c.fallas, "entero")}</td>
                <td className={`${TD} text-xs`}>
                  {FASES.map((f) => (
                    <span key={f} className={`inline-block mr-1 mb-1 rounded px-1.5 py-0.5 ${c.fases.includes(f) ? "bg-[#E7F4EE] text-[#167655]" : "bg-[#EEF3F8] text-[#9AA7B3]"}`}>
                      {NOMBRES[f]}
                    </span>
                  ))}
                  {c.error && <div className="text-[#C03420]">No se pudo seguir: {c.error.includes("cuenta") ? c.error : "Mercado Libre no respondió bien; se reintenta solo."}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-[#9AA7B3] mt-3">
        "Cambios guardados": filas nuevas porque algo cambió (la primera vez, todo). "Sin respuesta": consultas en las que ML no contestó; queda el último valor conocido.
      </p>
    </section>
  );
}
