"use server";

// Login, registro y logout. Recortado de src/app/auth-actions.ts de CadaMes:
// email + password solamente (sin Google OAuth, sin antibot, sin aceptación
// de términos aparte) — son piezas que se agregan después si hacen falta,
// mirando el original de CadaMes como modelo.
//
// AJUSTAR: el mensaje de error de Supabase se traduce acá mismo a criollo.
// Nunca dejar pasar `error.message` crudo a una pantalla (regla de CadaMes:
// "nada de la cocina en las pantallas" — el detalle técnico va al log del
// servidor, no a la persona).

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import { db } from "@/db";
import { organizaciones, membresias } from "@/db/tenancy";
import { asegurarRolesDeLaOrg } from "@/lib/roles";
import { vincularUsuario } from "@/lib/tenancy";
import { eq } from "drizzle-orm";

/** `ok` = no es un error sino un aviso (ej. "te mandamos un mail"). */
export type Problema = { campo?: string; texto: string; ok?: boolean } | null;

function motivoLegible(error: { message: string } | null): string {
  if (!error) return "";
  const m = error.message.toLowerCase();
  if (m.includes("invalid login credentials")) return "El mail o la contraseña no coinciden.";
  if (m.includes("email not confirmed")) return "Todavía no confirmaste el mail. Buscá el link que te mandamos (fijate en spam).";
  if (m.includes("already registered") || m.includes("already exists")) return "Ese mail ya tiene una cuenta.";
  if (m.includes("password")) return "La contraseña tiene que tener al menos 8 caracteres.";
  console.error("[auth] error de Supabase:", error.message);
  return "No se pudo completar. Probá de nuevo en un momento.";
}

export async function accionLogin(_previo: Problema, formData: FormData): Promise<Problema> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { campo: !email ? "email" : "password", texto: "Completá el email y la contraseña." };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { texto: motivoLegible(error) };
  redirect("/panel");
}

/** Registro en un solo paso: crea la cuenta, la organización y el rol Admin
 *  para quien se registra. Simplificado del flujo de dos entradas de CadaMes
 *  (login por Google + onboarding aparte) porque acá no hay Google todavía. */
export async function accionRegistro(_previo: Problema, formData: FormData): Promise<Problema> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const organizacion = String(formData.get("organizacion") ?? "").trim();
  if (!email || !password || !nombre || !organizacion) {
    return { texto: "Completá todos los campos." };
  }

  const supabase = await supabaseServer();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { nombre }, emailRedirectTo: `${base}/auth/callback?next=/panel` },
  });
  if (error) return { texto: motivoLegible(error) };
  // Con la confirmación por mail prendida, un mail ya registrado no da error:
  // devuelve un usuario de mentira sin identidades.
  if (!data.user || data.user.identities?.length === 0) {
    return { texto: "Ese mail ya tiene una cuenta." };
  }

  // Se usa el usuario que devuelve signUp, no la sesión: si hay que confirmar
  // el mail, todavía no hay sesión, pero la organización se deja armada igual.
  const u = await vincularUsuario({ authId: data.user.id, email, nombre });
  if (!u) return { texto: "No se pudo completar. Probá de nuevo en un momento." };

  // Si ya se registró antes sin confirmar, no le armamos otra organización.
  const [yaTiene] = await db.select().from(membresias).where(eq(membresias.usuarioId, u.id)).limit(1);
  if (!yaTiene) {
    const [org] = await db.insert(organizaciones).values({ nombre: organizacion }).returning();
    const roles = await asegurarRolesDeLaOrg(org.id);
    const admin = roles.find((r) => r.protegido) ?? roles[0];
    await db.insert(membresias).values({
      usuarioId: u.id, organizacionId: org.id, rolId: admin.id, estado: "ACTIVO",
    });
  }

  if (!data.session) {
    return { ok: true, texto: `Te mandamos un mail a ${email}. Abrí el link para confirmar la cuenta y entrás directo al panel.` };
  }
  redirect("/panel");
}

export async function accionLogout() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function accionOlvide(_previo: Problema, formData: FormData): Promise<Problema> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { texto: "Completá el email." };
  const supabase = await supabaseServer();
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${base}/auth/callback?next=/reset`,
  });
  if (error) return { texto: motivoLegible(error) };
  return { texto: "Si ese mail tiene cuenta, te llega un link para elegir una contraseña nueva." };
}

export async function accionNuevaPassword(_previo: Problema, formData: FormData): Promise<Problema> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { texto: "La contraseña tiene que tener al menos 8 caracteres." };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { texto: motivoLegible(error) };
  redirect("/panel");
}
