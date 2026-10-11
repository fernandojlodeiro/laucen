// La caja «Regla de precio» de la pestaña Seguimiento (pedido de Fer, 11/10;
// lib/seguimiento/regla.ts): mirando las publicaciones que se siguen, baja el
// precio de la lista Clásicas del producto. Abre en vista; el lápiz del título
// la pasa a edición (?editar=regla) y ahí quedan «Grabar» y «Cancelar».

import { formatear } from "@/lib/moneda";
import { vistaRegla, MODOS_REGLA, COMO_REGLA } from "@/lib/seguimiento/regla";
import { BotonesFicha, Dato, Estado, TituloSeccion, CAJA, CAMPO, ETIQUETA } from "@/app/componentes/erp";
import CampoNumero from "@/app/componentes/CampoNumero";
import { PRIMARIO, SUAVE } from "@/app/botones";
import { accionGuardarRegla, accionRevisarRegla, accionAplicarPropuesta, accionDescartarPropuesta } from "@/app/catalogo/productos/acciones-seguimiento";

const ESTADOS_AJUSTE: Record<string, { t: string; tono: "verde" | "amarillo" | "gris" | "rojo" }> = {
  propuesto: { t: "Espera tu clic", tono: "amarillo" }, aplicado: { t: "Aplicado", tono: "verde" },
  descartado: { t: "Descartado", tono: "gris" }, reemplazado: { t: "Reemplazado", tono: "gris" },
};
const pesos = (n: number | null | undefined) => (n == null ? "—" : formatear(n, "ARS"));
const fecha = (d: Date) => new Date(d).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" });

export default async function ReglaPrecio({ org, productoId, seguidas, editando, ver, editar }: {
  org: string; productoId: number; seguidas: { id: number; item_id: string; vendedor: string | null; precio: number | null }[];
  editando: boolean; ver: string; editar: string;
}) {
  const v = await vistaRegla(org, productoId);
  const r = v.regla;
  const contraTexto = r.contra === "mas_barato" ? "El más barato de los que sigo"
    : (() => { const x = seguidas.find((s) => s.id === r.seguimientoId); return x ? `${x.vendedor ?? x.item_id}` : "La que elegí (ya no se sigue)"; })();
  const comoTexto = r.como === "igual" ? COMO_REGLA.igual : r.como === "pesos" ? `${pesos(r.diferencia)} abajo` : `${r.diferencia.toLocaleString("es-AR")} % abajo`;
  const campos = { producto_id: String(productoId) };

  return (
    <section className={CAJA}>
      <TituloSeccion titulo="Regla de precio">
        {!editando && r.modo !== "apagada" && (
          <form action={accionRevisarRegla}>
            <input type="hidden" name="producto_id" value={productoId} />
            <button className={SUAVE} title="Con lo último leído de las que seguís, sin volver a leerlas">Revisar ahora</button>
          </form>
        )}
        <BotonesFicha editando={editando} ver={ver} editar={editar} form="regla" />
      </TituloSeccion>
      <p className="text-[11px] text-[#5C6B76] mb-3">
        Baja el precio de la <b>lista Clásicas</b> de este producto según lo que cobran las publicaciones que seguís. No toca Mercado Libre: desde la
        lista, el esquema de precios lo lleva a todas las cuentas y todos los planes. Sólo baja, nunca por debajo del piso, y se revisa sola después de cada lectura.
      </p>

      {editando ? (
        <form id="regla" action={accionGuardarRegla} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="producto_id" value={productoId} />
          <label><span className={ETIQUETA}>Qué hace</span>
            <select name="modo" defaultValue={r.modo} className={`${CAMPO} w-full`}>
              {Object.entries(MODOS_REGLA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <label><span className={ETIQUETA}>Contra quién</span>
            <select name="contra" defaultValue={r.contra === "una" && r.seguimientoId ? String(r.seguimientoId) : "mas_barato"} className={`${CAMPO} w-full`}>
              <option value="mas_barato">El más barato de los que sigo</option>
              {seguidas.map((s) => <option key={s.id} value={s.id}>{`${s.vendedor ?? s.item_id}${s.precio != null ? ` (${pesos(s.precio)})` : ""}`}</option>)}
            </select>
          </label>
          <label><span className={ETIQUETA}>Cómo</span>
            <select name="como" defaultValue={r.como} className={`${CAMPO} w-full`}>
              {Object.entries(COMO_REGLA).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </label>
          <label><span className={ETIQUETA}>X (pesos o %; con «Igualar» no se usa)</span>
            <CampoNumero name="diferencia" valor={r.diferencia} tipo="decimal" className={`${CAMPO} w-full`} />
          </label>
          <label><span className={ETIQUETA}>Piso: la Clásica nunca baja de</span>
            <CampoNumero name="piso" valor={r.piso} tipo="pesos" className={`${CAMPO} w-full`} />
            <span className="block text-[10px] text-[#5C6B76] mt-0.5">Obligatorio para prenderla.</span>
          </label>
        </form>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Dato etiqueta="Qué hace">{MODOS_REGLA[r.modo]}</Dato>
          <Dato etiqueta="Contra quién">{contraTexto}</Dato>
          <Dato etiqueta="Cómo">{comoTexto}</Dato>
          <Dato etiqueta="Piso: la Clásica nunca baja de" numero>{r.piso != null ? pesos(r.piso) : null}</Dato>
        </div>
      )}

      <div className="mt-3 grid gap-1 text-xs">
        <div>
          <b>Tu Clásica hoy:</b>{" "}
          {v.clasicas.length ? v.clasicas.map((c) => `${v.clasicas.length > 1 ? `${c.sku} ` : ""}${pesos(c.ars)}`).join(" · ") : "sin lista de la Clásica"}
        </div>
        <div>
          <b>Referencia:</b> {v.referencia ? <>{v.referencia.texto} → quedarías a <b>{pesos(v.objetivo)}</b>{r.piso != null && v.objetivo != null && v.objetivo < r.piso && <> (topea en el piso, {pesos(r.piso)})</>}</>
            : <span className="text-[#5C6B76]">ninguna seguida activa con precio leído</span>}
        </div>
        {r.revisadaTs && <div className="text-[#5C6B76]">Última revisión, {fecha(r.revisadaTs)}: {r.resultado}</div>}
      </div>

      {v.propuestas > 0 && (
        <div className="mt-3 rounded-lg border border-[#F2D27A] bg-[#FFF8E5] p-3 text-xs flex flex-wrap items-center justify-between gap-2">
          <span>
            <b>Propuesto:</b> {v.ajustes.filter((a) => a.estado === "propuesto").map((a) => `${a.sku} de ${pesos(a.antes)} a ${pesos(a.nuevo)}`).join(" · ")}
          </span>
          <span className="flex items-center gap-2">
            <form action={accionAplicarPropuesta}><input type="hidden" name="producto_id" value={campos.producto_id} /><button className={PRIMARIO}>Aplicar</button></form>
            <form action={accionDescartarPropuesta}><input type="hidden" name="producto_id" value={campos.producto_id} /><button className={SUAVE}>Descartar</button></form>
          </span>
        </div>
      )}

      {v.ajustes.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-semibold">Lo que hizo la regla ({v.ajustes.length})</summary>
          <table className="mt-2">
            <thead><tr className="text-[#5C6B76]">
              <th className="text-left pr-4 font-semibold">Cuándo</th><th className="text-left pr-4 font-semibold">SKU</th>
              <th className="text-right pr-4 font-semibold">Antes</th><th className="text-right pr-4 font-semibold">Después</th>
              <th className="text-left pr-4 font-semibold">Referencia</th><th className="text-left font-semibold">Estado</th>
            </tr></thead>
            <tbody>
              {v.ajustes.map((a) => (
                <tr key={a.id}>
                  <td className="pr-4 py-0.5 whitespace-nowrap">{fecha(a.ts)}</td>
                  <td className="pr-4 py-0.5">{a.sku}</td>
                  <td className="pr-4 py-0.5 text-right">{pesos(a.antes)}</td>
                  <td className="pr-4 py-0.5 text-right">{pesos(a.nuevo)}</td>
                  <td className="pr-4 py-0.5">{a.referencia ?? "—"}</td>
                  <td className="py-0.5"><Estado texto={`${ESTADOS_AJUSTE[a.estado]?.t ?? a.estado}${a.modo === "automatico" ? " (automático)" : ""}`} tono={ESTADOS_AJUSTE[a.estado]?.tono ?? "gris"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
