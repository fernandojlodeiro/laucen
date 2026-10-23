// Una cuenta contable de Ingresos Brutos por provincia (Fer, 23/10): bajo el título "1.2.06 Ingresos Brutos por
// provincia", una imputable "IIBB — <provincia>" por cada jurisdicción en la que está inscripta alguna razón social
// (iibb_jurisdiccion). Llevan rol "iibb_<código>" (iibb_904 = Córdoba): así las encuentran los asientos de compras y
// despachos (lib/administracion/contabilidad.ts) sin importar el código que tengan. Una percepción de una provincia
// sin cuenta va a la general "Percepciones de IIBB".

import { consulta, una } from "@/lib/erp/base";
import { nombreJurisdiccion } from "@/lib/impuestos/jurisdicciones";

const TITULO = { codigo: "1.2.06", nombre: "Ingresos Brutos por provincia" };

export const rolIibb = (codigo: number) => `iibb_${codigo}`;

/** Crea las que falten. Devuelve cuántas creó. */
export async function asegurarCuentasIibb(org: string): Promise<number> {
  const jurs = (await consulta<{ codigo: number }>("select distinct codigo from iibb_jurisdiccion where organizacion_id = $1 order by codigo", [org])).map((x) => x.codigo);
  if (!jurs.length) return 0;
  const ya = new Set((await consulta<{ rol: string }>("select rol from plan_cuenta where organizacion_id = $1 and rol like 'iibb\\_%'", [org])).map((x) => x.rol));
  const faltan = jurs.filter((c) => !ya.has(rolIibb(c)));
  if (!faltan.length) return 0;
  const codigos = new Set((await consulta<{ codigo: string }>("select codigo from plan_cuenta where organizacion_id = $1", [org])).map((x) => x.codigo));
  // El título: si el código está tomado por otra cuenta, el próximo libre bajo 1.2.
  let titulo = (await una<{ codigo: string }>("select codigo from plan_cuenta where organizacion_id = $1 and nombre = $2 and not imputable", [org, TITULO.nombre]))?.codigo;
  if (!titulo) {
    titulo = TITULO.codigo;
    for (let n = 6; codigos.has(titulo); n++) titulo = `1.2.${String(n).padStart(2, "0")}`;
    await consulta("insert into plan_cuenta (organizacion_id, codigo, nombre, tipo, imputable) values ($1, $2, $3, 'activo', false)", [org, titulo, TITULO.nombre]);
    codigos.add(titulo);
  }
  let creadas = 0;
  for (const c of faltan) {
    let codigo = `${titulo}.${String(c - 900).padStart(2, "0")}`;
    for (let n = 25; codigos.has(codigo); n++) codigo = `${titulo}.${n}`;
    await consulta(`insert into plan_cuenta (organizacion_id, codigo, nombre, tipo, imputable, rol) values ($1, $2, $3, 'activo', true, $4)
      on conflict do nothing`, [org, codigo, `IIBB — ${nombreJurisdiccion(c)}`, rolIibb(c)]);
    codigos.add(codigo);
    creadas++;
  }
  return creadas;
}
