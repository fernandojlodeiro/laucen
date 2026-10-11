// Datos que ML pide al publicar y no tiene ninguna publicación del producto (Fer, 11/10): la IA (Claude,
// el modelo chico) elige el valor entre los que acepta la categoría, mirando el título y la descripción. Si
// no está segura, no inventa: devuelve null y el caso queda en «No se pudieron crear». Si los datos pedidos
// no tienen que ver con el producto (un chip en una categoría de suplementos), avisa, y se le pregunta a ML
// qué categoría corresponde al título (domain_discovery).

import { ml, type CuentaMl } from "@/lib/mercadolibre/api";
import { hayClaude, jsonDe, pedirClaude } from "@/lib/claude";

type AtributoMl = { id: string; name: string; value_type: string; values?: { id: string; name: string }[]; allowed_units?: { id: string; name: string }[] };
export type ValorIA = { value_id?: string; value_name?: string };

const SISTEMA = "Completás datos técnicos de publicaciones de Mercado Libre de componentes electrónicos y herramientas. " +
  "Sólo contestás con lo que se deduce con seguridad del título y la descripción; si no estás seguro de un dato, ponés null. " +
  "Contestás sólo un objeto JSON.";

/** Lo que pide ML para esos atributos: tipo y valores permitidos (de la categoría). */
async function atributosCategoria(cuenta: CuentaMl, categoria: string): Promise<AtributoMl[]> {
  const r = await ml<AtributoMl[]>(cuenta, "GET", `/categories/${categoria}/attributes`);
  return r.status === 200 && Array.isArray(r.datos) ? r.datos : [];
}

export async function completarConIA(cuenta: CuentaMl, categoria: string, faltan: string[], titulo: string, descripcion: string):
  Promise<{ valores: Map<string, ValorIA>; categoriaIncorrecta: boolean }> {
  const vacio = { valores: new Map<string, ValorIA>(), categoriaIncorrecta: false };
  if (!faltan.length || !hayClaude()) return vacio;
  const defs = (await atributosCategoria(cuenta, categoria)).filter((a) => faltan.includes(a.id));
  if (!defs.length) return vacio;
  const pedido = defs.map((a) => ({
    id: a.id, nombre: a.name, tipo: a.value_type,
    ...(a.values?.length ? { opciones: a.values.slice(0, 80).map((v) => ({ id: v.id, nombre: v.name })) } : {}),
    ...(a.allowed_units?.length ? { unidades: a.allowed_units.map((u) => u.name) } : {}),
  }));
  const r = await pedirClaude({
    system: SISTEMA, modelo: "chico", maxTokens: 600,
    contenido: `Producto: ${titulo}\n\nDescripción:\n${descripcion.slice(0, 2500)}\n\nDatos que pide Mercado Libre:\n${JSON.stringify(pedido)}\n\n` +
      "Devolvé {\"valores\": {ID: {\"value_id\": \"...\"} si una de las opciones corresponde, o {\"value_name\": \"...\"} si el tipo no es \"list\" y ninguna opción corresponde " +
      "(ej. tipo de alimentación \"USB\"; con unidad si tiene unidades, ej. \"5 V\"), o null}, " +
      "\"categoria_incorrecta\": true si esos datos no tienen nada que ver con este producto (está en una categoría equivocada)}.",
  });
  const j = "texto" in r ? jsonDe<{ valores?: Record<string, ValorIA | null>; categoria_incorrecta?: boolean }>(r.texto) : null;
  if (!j) return vacio;
  const valores = new Map<string, ValorIA>();
  for (const a of defs) {
    const v = j.valores?.[a.id];
    if (!v) continue;
    // Una opción tiene que ser una de las que acepta ML; un texto, no vacío y sólo si el dato no es una lista cerrada
    // (en los de texto las opciones son sugerencias: ML acepta otro valor, ej. «USB»).
    if (v.value_id && a.values?.some((x) => x.id === String(v.value_id))) valores.set(a.id, { value_id: String(v.value_id) });
    else if (a.value_type !== "list" && v.value_name && String(v.value_name).trim()) valores.set(a.id, { value_name: String(v.value_name).trim() });
  }
  return { valores, categoriaIncorrecta: j.categoria_incorrecta === true };
}

/** La categoría que ML cree que corresponde al título (o null). */
export async function categoriaParaTitulo(cuenta: CuentaMl, titulo: string): Promise<string | null> {
  const r = await ml<{ category_id?: string }[]>(cuenta, "GET", `/sites/MLA/domain_discovery/search?limit=1&q=${encodeURIComponent(titulo.slice(0, 120))}`);
  return r.status === 200 && Array.isArray(r.datos) ? r.datos[0]?.category_id ?? null : null;
}
