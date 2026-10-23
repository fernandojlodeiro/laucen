"use server";

// Administración › Impuestos: subir una declaración jurada (la lee la IA), cargarla a mano, corregirla, borrarla, y
// las provincias de Ingresos Brutos y la municipal de cada razón social.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { ErrorErp, motivoErp, una } from "@/lib/erp/base";
import { supabaseServer } from "@/lib/supabase";
import { leerNumero } from "@/lib/numeros";
import { aDdjj, datosDe, datosVacios, leerDdjjArchivo, periodoNormal, IMPUESTOS, type DatosIibb, type Impuesto, type JurisdiccionDdjj } from "@/lib/impuestos/ddjj-leer";
import { borrarDdjj, borrarJurisdiccion, corregirDdjj, grabarDdjj, grabarJurisdiccion, grabarMunicipal } from "@/lib/impuestos/ddjj";
import { codigoJurisdiccion, nombreJurisdiccion } from "@/lib/impuestos/jurisdicciones";

const BASE = "/administracion/impuestos";
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => leerNumero(fd.get(k)) ?? 0;
const esImpuesto = (x: string): x is Impuesto => x === "iva" || x === "iibb" || x === "municipal";
const volver = (rs: string | number | null, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ ...(rs ? { rs: String(rs) } : {}), ...extra }).toString();
  return `${BASE}${q ? `?${q}` : ""}`;
};

/** «Subir declaración»: el archivo ya está en Storage (bucket "importaciones"). La IA lo lee, se reconoce el impuesto,
 *  el período y la razón social (por el CUIT) y se graba. Devuelve el id para abrirla. */
export async function accionSubirDdjj(a: { ruta: string; archivo: string; tipo: string }): Promise<{ id: number; ok: string } | { motivo: string }> {
  try {
    const s = await entrarErp("impuestos_ver");
    if (!a.ruta?.startsWith(`${s.org.id}/`) || a.ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
    const sb = await supabaseServer();
    const { data, error } = await sb.storage.from("importaciones").download(a.ruta);
    if (error || !data) throw new ErrorErp("No se pudo bajar el archivo que subiste. Probá de nuevo.");
    const r = await leerDdjjArchivo(await data.arrayBuffer(), a.tipo);
    if ("error" in r) throw new ErrorErp(r.error);
    const x = aDdjj(r.lectura);
    if ("error" in x) throw new ErrorErp(x.error);
    const emisor = x.cuit
      ? await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 and regexp_replace(cuit, '\\D', '', 'g') = $2", [s.org.id, x.cuit])
      : await una<{ id: number }>("select id::int from emisor where organizacion_id = $1 order by es_principal desc, id limit 1", [s.org.id]);
    if (!emisor) throw new ErrorErp(`La declaración es del CUIT ${x.cuit}, que no es de ninguna de tus razones sociales.`);
    const g = await grabarDdjj(s.org.id, { emisorId: emisor.id, impuesto: x.impuesto, periodo: x.periodo, rectificativa: x.rectificativa, fecha: x.fecha,
      datos: x.datos, lectura: r.lectura, archivo: a.ruta, archivoNombre: a.archivo, usuarioId: s.usuario.id });
    revalidatePath(BASE);
    const que = `${IMPUESTOS[x.impuesto]} de ${x.periodo.split("-").reverse().join("/")}${x.rectificativa ? ` (rectificativa ${x.rectificativa})` : ""}`;
    return { id: g.id, ok: `Leída: ${que}${g.reemplazo ? ". Reemplazó a la que estaba cargada" : ""}. Revisá los importes contra el PDF.` };
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

/** «Nueva declaración a mano»: vacía, y se abre para cargar los importes. */
export async function accionNuevaDdjj(fd: FormData) {
  const s = await entrarErp("impuestos_ver");
  const rs = Number(texto(fd, "emisor")) || 0;
  await intentar(volver(rs, { ver: "declaraciones" }), async () => {
    const impuesto = texto(fd, "impuesto");
    if (!esImpuesto(impuesto)) throw new ErrorErp("Elegí el impuesto.");
    const periodo = periodoNormal(texto(fd, "periodo"));
    if (!periodo) throw new ErrorErp("Elegí el mes de la declaración.");
    const g = await grabarDdjj(s.org.id, { emisorId: rs, impuesto, periodo, rectificativa: Math.max(0, Math.trunc(num(fd, "rectificativa"))), fecha: null,
      datos: datosVacios(impuesto), usuarioId: s.usuario.id });
    if (g.reemplazo) throw new ErrorErp("Esa declaración ya está cargada: abrila desde la lista y corregila con el lápiz.");
    revalidatePath(BASE);
    return { ir: `${BASE}/${g.id}?editar=ficha` };
  });
}

/** Grabar la ficha de una declaración (los importes corregidos a mano). */
export async function accionCorregirDdjj(fd: FormData) {
  const s = await entrarErp("impuestos_ver");
  const id = Number(texto(fd, "id")) || 0;
  const d = await una<{ impuesto: Impuesto }>("select impuesto from ddjj where organizacion_id = $1 and id = $2", [s.org.id, id]);
  const ruta = `${BASE}/${id}`;
  await intentar(ruta, async () => {
    revalidatePath(BASE);
    if (!d) throw new ErrorErp("La declaración no existe.");
    const fecha = texto(fd, "fecha_presentacion");
    const extra = { fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null, notas: texto(fd, "notas") || null };
    if (d.impuesto === "iibb") {
      const js: JurisdiccionDdjj[] = [];
      for (const c of fd.getAll("jur").map(Number)) {
        if (!codigoJurisdiccion(c)) continue;
        const v = (k: string) => num(fd, `j${c}_${k}`);
        const saldoPagar = v("a_pagar"), saldoFavor = v("a_favor");
        js.push({ codigo: c, coeficiente: v("coeficiente"), base: v("base"), alicuota: v("alicuota"), determinado: v("determinado"), retenciones: v("retenciones"),
          percepciones: v("percepciones"), percepciones_aduaneras: v("percepciones_aduaneras"), recaudaciones_bancarias: v("recaudaciones_bancarias"),
          saldo_anterior: v("saldo_anterior"), saldo: Math.round((saldoPagar - saldoFavor) * 100) / 100 });
      }
      const nueva = codigoJurisdiccion(texto(fd, "jur_nueva"));
      if (nueva && !js.some((j) => j.codigo === nueva)) js.push({ codigo: nueva, coeficiente: 0, base: 0, alicuota: 0, determinado: 0, retenciones: 0, percepciones: 0,
        percepciones_aduaneras: 0, recaudaciones_bancarias: 0, saldo_anterior: 0, saldo: 0 });
      for (const j of js) if (j.coeficiente > 1) j.coeficiente = j.coeficiente / 100;
      await corregirDdjj(s.org.id, id, datosDe("iibb", { base_total: num(fd, "base_total"), jurisdicciones: js }) as DatosIibb, extra);
      return nueva ? { ir: `${ruta}?editar=ficha&ok=${encodeURIComponent(`Agregada ${nombreJurisdiccion(nueva)}: cargale sus importes.`)}` } : "Declaración grabada.";
    }
    const campos = d.impuesto === "iva"
      ? ["debito", "credito", "saldo_tecnico_anterior", "saldo_tecnico_favor", "pagos_a_cuenta", "saldo_libre_anterior", "saldo_libre_favor", "a_pagar"]
      : ["base", "alicuota", "determinado", "minimo", "retenciones", "saldo_anterior", "a_pagar", "a_favor"];
    const datos = datosDe(d.impuesto, Object.fromEntries(campos.map((k) => [k, num(fd, k)])));
    await corregirDdjj(s.org.id, id, datos, extra);
    return "Declaración grabada.";
  });
}

export async function accionBorrarDdjj(fd: FormData) {
  const s = await entrarErp("impuestos_ver");
  const id = Number(texto(fd, "id")) || 0;
  const rs = Number(texto(fd, "rs")) || null;
  await intentar(`${BASE}/${id}`, async () => {
    await borrarDdjj(s.org.id, id);
    revalidatePath(BASE);
    return { ir: volver(rs, { ver: "declaraciones", ok: "Declaración borrada." }) };
  });
}

// ── Provincias de IIBB y municipal ───────────────────────────────────

export async function accionGrabarJurisdiccion(fd: FormData) {
  const s = await entrarErp("impuestos_ver");
  const rs = Number(texto(fd, "rs")) || 0;
  await intentar(volver(rs, { ver: "provincias" }), async () => {
    const codigo = codigoJurisdiccion(texto(fd, "codigo"));
    if (!codigo) throw new ErrorErp("Elegí la provincia.");
    let coef = num(fd, "coeficiente");
    if (coef > 1) coef = coef / 100;
    await grabarJurisdiccion(s.org.id, rs, codigo, coef, num(fd, "alicuota"));
    revalidatePath(BASE);
    return `${nombreJurisdiccion(codigo)} grabada.`;
  });
}

export async function accionBorrarJurisdiccion(fd: FormData) {
  const s = await entrarErp("impuestos_ver");
  const rs = Number(texto(fd, "rs")) || 0;
  await intentar(volver(rs, { ver: "provincias" }), async () => {
    await borrarJurisdiccion(s.org.id, rs, Number(texto(fd, "codigo")) || 0);
    revalidatePath(BASE);
    return "Provincia quitada.";
  });
}

export async function accionGrabarMunicipal(fd: FormData) {
  const s = await entrarErp("impuestos_ver");
  const rs = Number(texto(fd, "rs")) || 0;
  await intentar(volver(rs, { ver: "provincias" }), async () => {
    await grabarMunicipal(s.org.id, rs, { inscripta: fd.get("inscripta") === "on", alicuota: leerNumero(fd.get("alicuota")), minimo: leerNumero(fd.get("minimo")) });
    revalidatePath(BASE);
    return "Municipalidad de Córdoba grabada.";
  });
}
