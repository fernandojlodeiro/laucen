"use server";

// Acciones del Radar. Cada una verifica el permiso (hoy lo tiene el Admin de
// cada organización; cuando existan los roles, se reparte con checkboxes).

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { radarConfig, radarSeguidas } from "@/db/radar";
import { sesionRequerida, puede } from "@/lib/tenancy";
import type { PermisoKey } from "@/lib/permisos";
import { asegurarEsquema } from "@/lib/radar/esquema";
import { SITIO } from "@/lib/radar/base";
import { buscarGratis, buscarConApify, TopeDeGasto } from "@/lib/radar/busquedas";
import { procesoArbol, procesoTendencias } from "@/lib/radar/procesos";
import { estadoDelArbol } from "@/lib/radar/categorias";
import { FUENTES_APIFY } from "@/lib/radar/config";

async function contexto(permiso: PermisoKey) {
  await asegurarEsquema();
  const sesion = await sesionRequerida();
  if (!(await puede(permiso))) redirect("/radar?error=permiso");
  return sesion;
}

/** A dónde volver: sólo dentro del Radar. */
function volver(fd: FormData, extra: Record<string, string> = {}): never {
  const crudo = String(fd.get("volver") ?? "/radar");
  const url = new URL(crudo.startsWith("/radar") ? crudo : "/radar", "http://x");
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  redirect(`${url.pathname}${url.search}`);
}

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function accionSeguir(fd: FormData) {
  const s = await contexto("radar_ver");
  const cat = texto(fd, "cat");
  if (cat && cat !== SITIO) {
    if (fd.get("valor") === "1") {
      await db.insert(radarSeguidas).values({ organizacionId: s.org.id, categoriaId: cat, creadoPor: s.usuario.id }).onConflictDoNothing();
    } else {
      await db.delete(radarSeguidas).where(and(eq(radarSeguidas.organizacionId, s.org.id), eq(radarSeguidas.categoriaId, cat)));
    }
  }
  volver(fd);
}

export async function accionProfundizar(fd: FormData) {
  const s = await contexto("radar_gastar");
  const cat = texto(fd, "cat");
  await db.update(radarSeguidas).set({ profundizar: fd.get("valor") === "1" })
    .where(and(eq(radarSeguidas.organizacionId, s.org.id), eq(radarSeguidas.categoriaId, cat)));
  volver(fd);
}

export async function accionVerPublicaciones(fd: FormData) {
  const s = await contexto("radar_ver");
  const palabra = texto(fd, "palabra");
  if (palabra) {
    await buscarGratis({ palabra, categoriaId: texto(fd, "cat") || null, organizacionId: s.org.id, usuarioId: s.usuario.id });
  }
  volver(fd, { abierta: palabra });
}

export async function accionApify(fd: FormData) {
  const s = await contexto("radar_gastar");
  const palabra = texto(fd, "palabra");
  try {
    await buscarConApify({ palabra, categoriaId: texto(fd, "cat") || null, organizacionId: s.org.id, usuarioId: s.usuario.id });
  } catch (e) {
    console.error("[radar] apify:", e);
    volver(fd, { abierta: palabra, error: e instanceof TopeDeGasto ? "tope" : "apify" });
  }
  volver(fd, { abierta: palabra });
}

const entero = (v: string, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const fecha = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10));
const unidad = (v: string) => (v === "meses" ? "meses" : "dias");

export async function accionGuardarConfig(fd: FormData) {
  const s = await contexto("radar_configurar");
  const tope = Number(texto(fd, "tope").replace(",", "."));
  const fuente = texto(fd, "fuente");
  await db.update(radarConfig).set({
    topeSemanalUsd: Number.isFinite(tope) && tope >= 0 ? Math.min(tope, 1000) : 5,
    tendenciasCada: entero(texto(fd, "tendencias_cada"), 1, 365, 7),
    tendenciasUnidad: unidad(texto(fd, "tendencias_unidad")),
    tendenciasDesde: fecha(texto(fd, "tendencias_desde")),
    arbolCada: entero(texto(fd, "arbol_cada"), 1, 365, 1),
    arbolUnidad: unidad(texto(fd, "arbol_unidad")),
    arbolDesde: fecha(texto(fd, "arbol_desde")),
    palabrasAProfundizar: entero(texto(fd, "palabras"), 1, 20, 3),
    fuenteApify: fuente in FUENTES_APIFY ? fuente : "karamelo",
    mostrarSalieron: fd.get("mostrar_salieron") === "on",
    actualizadoEl: new Date(),
  }).where(eq(radarConfig.organizacionId, s.org.id));
  redirect("/radar/configuracion?ok=guardado");
}

export async function accionCorrerAhora(fd: FormData) {
  const s = await contexto("radar_configurar");
  const hasta = Date.now() + 240_000;
  if (texto(fd, "tipo") === "arbol") {
    const e = await estadoDelArbol();
    await procesoArbol("manual", hasta, e.total > 0 && e.pendientes === 0);
  } else {
    await procesoTendencias(s.org.id, "manual", hasta);
  }
  redirect("/radar/configuracion?ok=corrido");
}
