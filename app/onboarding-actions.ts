"use server";

// Alta de organización para quien ya tiene cuenta pero todavía no tiene
// ninguna membresía (caso borde: casi siempre `accionRegistro` ya la crea en
// el mismo paso). Mismo patrón que `armarOrganizacion()` de CadaMes,
// recortado a lo mínimo de tenancy.

import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizaciones, membresias } from "@/db/tenancy";
import { asegurarRolesDeLaOrg } from "@/lib/roles";
import { asegurarUsuario, fijarOrgActiva } from "@/lib/tenancy";
import type { Problema } from "@/app/auth-actions";

export async function accionCrearOrganizacion(_previo: Problema, formData: FormData): Promise<Problema> {
  const nombre = String(formData.get("organizacion") ?? "").trim();
  if (!nombre) return { texto: "Completá el nombre de la organización." };

  const u = await asegurarUsuario();
  if (!u) redirect("/login");

  const [org] = await db.insert(organizaciones).values({ nombre }).returning();
  const roles = await asegurarRolesDeLaOrg(org.id);
  const admin = roles.find((r) => r.protegido) ?? roles[0];
  await db.insert(membresias).values({
    usuarioId: u.id, organizacionId: org.id, rolId: admin.id, estado: "ACTIVO",
  });
  await fijarOrgActiva(org.id);

  redirect("/panel");
}
