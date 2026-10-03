// Dominios de las tiendas en el proyecto de Vercel (bitácora #281): al dar de
// alta un dominio, Laucen lo agrega al proyecto por API; al borrarlo, lo saca.
// Llave: VERCEL_TOKEN (un token de API con acceso al equipo de Vercel). El
// proyecto sale de VERCEL_PROJECT_ID (si no, "laucen") y el equipo de
// VERCEL_TEAM_ID (si no, se busca entre los equipos de la llave el que tiene
// el proyecto). La llave nunca se muestra: sólo si hay o no.

import { ErrorErp } from "@/lib/erp/base";
import { esRaiz, subdominio } from "@/lib/tienda/dominios";

const API = "https://api.vercel.com";

export type RegistroDns = { tipo: "A" | "CNAME" | "TXT"; nombre: string; valor: string };
export type EstadoVercel = {
  existe: boolean; verificado: boolean; dnsBien: boolean; redirige: string | null; registros: RegistroDns[];
};

const token = () => process.env.VERCEL_TOKEN?.trim() || null;
const proyecto = () => process.env.VERCEL_PROJECT_ID?.trim() || "laucen";
export const hayLlaveVercel = () => !!token();

type Respuesta = { ok: boolean; status: number; j: Record<string, unknown> };

async function pedir(metodo: string, ruta: string, cuerpo?: unknown, equipo?: string | null): Promise<Respuesta> {
  const t = token();
  if (!t) throw new ErrorErp("Falta la llave de Vercel (VERCEL_TOKEN): el dominio queda anotado y se conecta cuando esté.");
  const u = new URL(`${API}${ruta}`);
  if (equipo) u.searchParams.set("teamId", equipo);
  const r = await fetch(u, {
    method: metodo, cache: "no-store", signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${t}`, ...(cuerpo ? { "content-type": "application/json" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).catch(() => null);
  if (!r) throw new ErrorErp("Vercel no responde. Probá de nuevo en un momento.");
  return { ok: r.ok, status: r.status, j: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

let equipoCache: Promise<string | null> | null = null;

/** El equipo de Vercel del proyecto: VERCEL_TEAM_ID, o el primero de la llave que lo tenga. */
function equipo(): Promise<string | null> {
  const fijo = process.env.VERCEL_TEAM_ID?.trim();
  if (fijo) return Promise.resolve(fijo);
  equipoCache ??= (async () => {
    const p = `/v9/projects/${encodeURIComponent(proyecto())}`;
    if ((await pedir("GET", p)).ok) return null; // la llave es de la cuenta personal
    const equipos = ((await pedir("GET", "/v2/teams?limit=100")).j.teams ?? []) as { id: string }[];
    for (const e of equipos) if ((await pedir("GET", p, undefined, e.id)).ok) return e.id;
    throw new ErrorErp("La llave de Vercel no tiene acceso al proyecto de Laucen. Hay que crearla con acceso al equipo.");
  })().catch((e) => { equipoCache = null; throw e; });
  return equipoCache;
}

const enProyecto = (resto = "") => `/v9/projects/${encodeURIComponent(proyecto())}/domains${resto}`;

function mensaje(r: Respuesta): string {
  const e = (r.j.error ?? {}) as { code?: string; message?: string };
  if (r.status === 403 || r.status === 401) return "La llave de Vercel no tiene permiso para esto (puede estar vencida).";
  if (e.code === "invalid_domain" || e.code === "invalid_name") return "Vercel dice que ese dominio no es válido.";
  if (e.code === "domain_already_in_use" || e.code === "domain_taken") return "Ese dominio ya está conectado a otro proyecto de Vercel: hay que sacarlo de allá primero.";
  console.error("[vercel] respuesta inesperada:", r.status, e.code, e.message);
  return "Vercel no aceptó el cambio. Probá de nuevo en un momento.";
}

/** Agrega el dominio al proyecto (o lo deja como está si ya estaba). Con
 *  `redirigeA`, Vercel lo redirige (308) a ese dominio. */
export async function agregarEnVercel(dominio: string, redirigeA: string | null): Promise<void> {
  const eq = await equipo();
  const cuerpo = redirigeA ? { name: dominio, redirect: redirigeA, redirectStatusCode: 308 } : { name: dominio };
  const r = await pedir("POST", `/v10/projects/${encodeURIComponent(proyecto())}/domains`, cuerpo, eq);
  if (r.ok) return;
  // Ya estaba en el proyecto (los cargados a mano en Vercel): se toma como
  // existente y se le acomoda la redirección si hace falta.
  const ya = await pedir("GET", enProyecto(`/${encodeURIComponent(dominio)}`), undefined, eq);
  if (!ya.ok) throw new ErrorErp(mensaje(r));
  if ((ya.j.redirect ?? null) !== redirigeA) {
    const p = await pedir("PATCH", enProyecto(`/${encodeURIComponent(dominio)}`), { redirect: redirigeA, redirectStatusCode: redirigeA ? 308 : null }, eq);
    if (!p.ok) throw new ErrorErp(mensaje(p));
  }
}

/** Lo saca del proyecto. Si ya no estaba, no es error. */
export async function quitarDeVercel(dominio: string): Promise<void> {
  const r = await pedir("DELETE", enProyecto(`/${encodeURIComponent(dominio)}`), undefined, await equipo());
  if (!r.ok && r.status !== 404) throw new ErrorErp(mensaje(r));
}

/** Cómo está el dominio en Vercel: si está, si está verificado, si el DNS
 *  apunta bien y qué registros hay que cargar. Pide a Vercel que lo verifique. */
export async function estadoEnVercel(dominio: string): Promise<EstadoVercel> {
  const eq = await equipo();
  let info = await pedir("GET", enProyecto(`/${encodeURIComponent(dominio)}`), undefined, eq);
  if (!info.ok) {
    if (info.status === 404) return { existe: false, verificado: false, dnsBien: false, redirige: null, registros: [] };
    throw new ErrorErp(mensaje(info));
  }
  if (!info.j.verified) {
    const v = await pedir("POST", enProyecto(`/${encodeURIComponent(dominio)}/verify`), undefined, eq);
    if (v.ok) info = v;
  }
  const q = new URLSearchParams({ projectIdOrName: proyecto() });
  const conf = await pedir("GET", `/v6/domains/${encodeURIComponent(dominio)}/config?${q}`, undefined, eq);
  const c = conf.j as { misconfigured?: boolean; recommendedIPv4?: { rank: number; value: string[] }[]; recommendedCNAME?: { rank: number; value: string }[] };
  const primero = <T extends { rank: number }>(l?: T[]) => l?.slice().sort((a, b) => a.rank - b.rank)[0];

  const raiz = esRaiz(dominio);
  const registros: RegistroDns[] = raiz
    ? [{ tipo: "A", nombre: "@", valor: primero(c.recommendedIPv4)?.value?.[0] ?? "216.150.1.1" }]
    : [{ tipo: "CNAME", nombre: subdominio(dominio), valor: (primero(c.recommendedCNAME)?.value ?? "cname.vercel-dns.com").replace(/\.$/, "") }];
  for (const v of (info.j.verification ?? []) as { type: string; domain: string; value: string }[]) {
    if (v.type === "TXT") registros.push({ tipo: "TXT", nombre: v.domain, valor: v.value });
  }
  return {
    existe: true, verificado: !!info.j.verified, dnsBien: conf.ok && c.misconfigured === false,
    redirige: (info.j.redirect as string | null) ?? null, registros,
  };
}

/** ¿El dominio ya abre con https (tiene certificado)? */
export async function tieneCertificado(dominio: string): Promise<boolean> {
  const r = await fetch(`https://${dominio}/`, { method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8_000) }).catch(() => null);
  return !!r;
}
