// Lo que comparten la pantalla de Libros de IVA y sus descargas: el período
// que rige según la dirección (?mes=AAAA-MM, o ?desde=&hasta= a mano; sin
// nada, el mes pasado, que es el que se presenta).

import { hoyArgentina } from "@/lib/rango-fechas";
import { rangoMes, periodoDeRango } from "@/lib/administracion/libro-iva";

export type SPLibro = { rs?: string; libro?: string; mes?: string; desde?: string; hasta?: string; canal?: string; p?: string; ok?: string; error?: string };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function mesAnterior(hoy = hoyArgentina()) {
  const [a, m] = hoy.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function periodoDe(sp: SPLibro) {
  if (sp.desde && sp.hasta && FECHA.test(sp.desde) && FECHA.test(sp.hasta)) {
    const [desde, hasta] = sp.desde <= sp.hasta ? [sp.desde, sp.hasta] : [sp.hasta, sp.desde];
    return { desde, hasta, periodo: periodoDeRango(desde, hasta) };
  }
  const mes = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : mesAnterior();
  const r = rangoMes(mes);
  return { ...r, periodo: mes.replace("-", "") };
}

/** Los últimos 24 meses, del más nuevo al más viejo (AAAA-MM). */
export function mesesParaElegir(hoy = hoyArgentina()) {
  const [a, m] = hoy.split("-").map(Number);
  return Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7));
}

export const nombreMes = (mes: string) => {
  const t = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const canalDe = (sp: SPLibro) => (sp.canal && /^\d+$/.test(sp.canal) ? Number(sp.canal) : null);
