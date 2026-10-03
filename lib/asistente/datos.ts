// Los datos que el asistente puede consultar: las mismas listas de los ABM
// (app/listas/registro.ts), con su consulta y sus filtros por organización y
// el permiso de cada pantalla. Nada de SQL libre: las condiciones, el orden y
// los agrupados sólo eligen campos del catálogo de la lista (lista blanca) y
// los valores viajan como parámetros.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { consulta } from "@/lib/erp/base";
import { tienePermiso, type Permisos } from "@/lib/permisos";
import { LISTAS } from "@/app/listas/registro";
import { camposDe, ordenDe, ordenables, seleccion, valorDe, type Campo, type Ctx, type Fila, type Lista, type SP } from "@/lib/listas/tipos";

export const TOPE_FILAS = 200;

export type Condicion = { campo: string; op: string; valor?: string | number | boolean | null };
export type PedidoDatos = {
  lista: string;
  campos?: string[];
  condiciones?: Condicion[];
  filtros?: Record<string, string>;
  orden?: { campo: string; desc?: boolean };
  agrupar_por?: string;
  sumar?: string[];
  limite?: number;
};

const OPS = ["=", "!=", ">", ">=", "<", "<=", "contiene", "empieza", "vacio", "no_vacio"] as const;

/** Las listas que esta persona puede consultar (las de su permiso). */
export function listasPermitidas(permisos: Permisos): Lista[] {
  return Object.values(LISTAS).filter((l) => tienePermiso(permisos, l.permiso));
}

function listaPedida(nombre: string, permisos: Permisos): Lista {
  const l = Object.hasOwn(LISTAS, nombre) ? LISTAS[nombre] : null;
  if (!l) throw new Error(`No existe la lista «${nombre}». Las que hay: ${Object.keys(LISTAS).join(", ")}.`);
  if (!tienePermiso(permisos, l.permiso)) throw new Error(`Esta persona no tiene permiso para ver «${l.titulo}».`);
  return l;
}

/** Los filtros de la dirección que usa una lista (sp.xxx en su archivo) y
 *  los renglones donde se leen (ahí se ve qué trae sin elegir nada: por
 *  ejemplo, Pedidos sin "estado" trae sólo los pendientes). */
async function filtrosDeLaLista(l: Lista): Promise<{ claves: string[]; renglones: string[] }> {
  const raiz = path.join(process.cwd(), "app");
  const encontrados = new Set<string>();
  const renglones: string[] = [];
  const recorrer = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await recorrer(p);
      else if (e.name === "lista.tsx") {
        const texto = await readFile(p, "utf8");
        if (texto.includes(`pantalla: "${l.pantalla}"`)) {
          for (const m of texto.matchAll(/\bsp\.(\w+)/g)) encontrados.add(m[1]);
          for (const r of texto.split("\n")) if (/\bsp\.\w+/.test(r) && renglones.length < 40) renglones.push(r.trim().slice(0, 220));
        }
      }
    }
  };
  await recorrer(raiz);
  return { claves: [...encontrados].filter((k) => !["orden", "dir", "p"].includes(k)), renglones };
}

/** El catálogo de campos de una lista (para saber qué pedir). */
export async function camposDeLista(nombre: string, permisos: Permisos, ctx: Ctx): Promise<string> {
  const l = listaPedida(nombre, permisos);
  const campos = await camposDe(l, ctx);
  const filtros = await filtrosDeLaLista(l);
  return JSON.stringify({
    lista: l.pantalla, titulo: l.titulo, pantalla: l.ruta,
    campos: campos.map((c) => ({ clave: c.clave, titulo: c.titulo, formato: c.formato ?? "texto", filtrable: !!c.sql || !l.consulta })),
    en_pantalla: l.enPantalla,
    filtros_de_la_pantalla: filtros.claves,
    como_se_leen_los_filtros: filtros.renglones,
    ojo: "Sin filtros, la lista trae lo mismo que la pantalla al abrirla, que a veces no es todo (mirá como_se_leen_los_filtros: un valor por defecto cuando el filtro no viene). Para traer todo, mandá el filtro con el valor que lo saca.",
    nota: l.consulta ? "Las condiciones, el orden y los agrupados van por clave de campo." : "Lista calculada en memoria: condiciones y agrupados sobre los valores.",
  });
}

const aTexto = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString() : String(v));

/** Un valor para mandar (fechas como texto, números como números). */
function limpio(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function cumple(v: unknown, c: Condicion): boolean {
  const t = aTexto(v).toLowerCase(), q = aTexto(c.valor).toLowerCase();
  const n = Number(v), m = Number(c.valor);
  const numeros = v !== null && v !== "" && Number.isFinite(n) && Number.isFinite(m);
  switch (c.op) {
    case "=": return numeros ? n === m : t === q;
    case "!=": return numeros ? n !== m : t !== q;
    case ">": return numeros ? n > m : t > q;
    case ">=": return numeros ? n >= m : t >= q;
    case "<": return numeros ? n < m : t < q;
    case "<=": return numeros ? n <= m : t <= q;
    case "contiene": return t.includes(q);
    case "empieza": return t.startsWith(q);
    case "vacio": return t === "";
    case "no_vacio": return t !== "";
    default: return true;
  }
}

/** Consulta una lista: filas (hasta 200) o, con agrupar_por / sumar, totales. */
export async function consultarLista(p: PedidoDatos, permisos: Permisos, ctx: Ctx): Promise<string> {
  const l = listaPedida(p.lista, permisos);
  const todos = await camposDe(l, ctx);
  const porClave = new Map(todos.map((c) => [c.clave, c]));
  const campo = (k: string): Campo => {
    const c = porClave.get(k);
    if (!c) throw new Error(`La lista «${l.pantalla}» no tiene el campo «${k}». Pedí sus campos con ver_campos.`);
    return c;
  };
  const condiciones = (p.condiciones ?? []).map((c) => {
    if (!(OPS as readonly string[]).includes(c.op)) throw new Error(`Operador «${c.op}» no válido. Válidos: ${OPS.join(", ")}.`);
    return { ...c, def: campo(c.campo) };
  });
  const sp: SP = { ...(p.filtros ?? {}) };
  const limite = Math.max(1, Math.min(TOPE_FILAS, Math.trunc(p.limite ?? 50)));
  const sumar = (p.sumar ?? []).map(campo);
  const grupo = p.agrupar_por ? campo(p.agrupar_por) : null;

  if (l.consulta) {
    const base = await l.consulta(ctx, sp);
    const valores = [...base.valores];
    const param = (v: unknown) => { valores.push(v); return `$${valores.length}`; };
    const donde = [base.donde];
    for (const c of condiciones) {
      if (!c.def.sql) throw new Error(`El campo «${c.campo}» no se puede filtrar.`);
      const e = `(${c.def.sql})`;
      switch (c.op) {
        case "contiene": donde.push(`${e}::text ilike ${param(`%${c.valor ?? ""}%`)}`); break;
        case "empieza": donde.push(`${e}::text ilike ${param(`${c.valor ?? ""}%`)}`); break;
        case "vacio": donde.push(`(${e} is null or ${e}::text = '')`); break;
        case "no_vacio": donde.push(`(${e} is not null and ${e}::text <> '')`); break;
        default: donde.push(`${e} ${c.op === "!=" ? "is distinct from" : c.op} ${param(typeof c.valor === "boolean" ? c.valor : c.valor ?? null)}`);
      }
    }
    const where = donde.map((d) => `(${d})`).join(" and ");

    if (grupo || sumar.length) {
      for (const c of [grupo, ...sumar]) if (c && !c.sql) throw new Error(`El campo «${c.clave}» no se puede agrupar ni sumar.`);
      const sums = sumar.map((c) => `sum((${c.sql})::numeric)::float as "${c.clave}"`);
      const cols = [grupo ? `(${grupo.sql}) as grupo` : null, "count(*)::int as cantidad", ...sums].filter(Boolean).join(", ");
      const orden = sumar.length ? `"${sumar[0].clave}" desc nulls last` : "cantidad desc";
      const filas = await consulta<Fila>(
        `select ${cols} from ${base.desde} where ${where}${grupo ? ` group by 1 order by ${orden} limit ${limite}` : ""}`, valores);
      return JSON.stringify({ lista: l.titulo, agrupado_por: grupo?.titulo ?? null, sumas: sumar.map((c) => c.titulo), grupos: filas.map((f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, limpio(v)]))) });
    }

    const elegidos = (p.campos?.length ? p.campos : l.enPantalla).map(campo);
    let orderBy = ordenDe(todos, sp, base.orden);
    if (p.orden) {
      const expr = ordenables(todos)[p.orden.campo];
      if (!expr) throw new Error(`No se puede ordenar por «${p.orden.campo}».`);
      orderBy = `${expr} ${p.orden.desc ? "desc" : "asc"} nulls last, ${base.orden}`;
    }
    const [filas, total] = await Promise.all([
      consulta<Fila>(`select ${seleccion(elegidos, todos)} from ${base.desde} where ${where} order by ${orderBy} limit ${limite}`, valores),
      consulta<{ n: number }>(`select count(*)::int n from ${base.desde} where ${where}`, valores),
    ]);
    return salidaFilas(l, elegidos, filas, total[0]?.n ?? filas.length);
  }

  // Lista en memoria: se filtra, ordena y agrupa sobre los valores del catálogo.
  let filas = (await l.filas?.(ctx, sp)) ?? [];
  for (const c of condiciones) filas = filas.filter((f) => cumple(valorDe(c.def, f), c));
  if (grupo || sumar.length) {
    const mapa = new Map<string, { grupo: unknown; cantidad: number; sumas: number[] }>();
    for (const f of filas) {
      const g = grupo ? aTexto(valorDe(grupo, f)) : "";
      const x = mapa.get(g) ?? { grupo: grupo ? valorDe(grupo, f) : undefined, cantidad: 0, sumas: sumar.map(() => 0) };
      x.cantidad++;
      sumar.forEach((c, i) => { x.sumas[i] += Number(valorDe(c, f)) || 0; });
      mapa.set(g, x);
    }
    const grupos = [...mapa.values()].sort((a, b) => (b.sumas[0] ?? b.cantidad) - (a.sumas[0] ?? a.cantidad)).slice(0, limite)
      .map((x) => ({ ...(grupo ? { grupo: limpio(x.grupo) } : {}), cantidad: x.cantidad, ...Object.fromEntries(sumar.map((c, i) => [c.clave, x.sumas[i]])) }));
    return JSON.stringify({ lista: l.titulo, agrupado_por: grupo?.titulo ?? null, sumas: sumar.map((c) => c.titulo), grupos });
  }
  if (p.orden) {
    const c = campo(p.orden.campo);
    filas = [...filas].sort((a, b) => {
      const x = valorDe(c, a), y = valorDe(c, b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : aTexto(x).localeCompare(aTexto(y));
      return p.orden!.desc ? -r : r;
    });
  }
  const elegidos = (p.campos?.length ? p.campos : l.enPantalla).map(campo);
  return salidaFilas(l, elegidos, filas.slice(0, limite), filas.length);
}

function salidaFilas(l: Lista, campos: Campo[], filas: Fila[], total: number): string {
  return JSON.stringify({
    lista: l.titulo,
    pantalla: l.ruta,
    total,
    mostradas: filas.length,
    columnas: campos.map((c) => ({ clave: c.clave, titulo: c.titulo, formato: c.formato ?? "texto" })),
    filas: filas.map((f) => ({
      ...(f.id != null ? { id: limpio(f.id) } : {}),
      ...Object.fromEntries(campos.map((c) => [c.clave, limpio(valorDe(c, f))])),
    })),
  });
}
