"use server";

// La aplicación de Google de Laucen (sólo el dueño del sistema): sus datos se cargan acá, una vez, y nunca se vuelven
// a mostrar. Con ella cada organización conecta su Google Drive desde Configuración › Google Drive.

import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { consulta } from "@/lib/erp/base";

const BASE = "/admin/google";

export async function accionGuardarAppGoogle(fd: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const id = String(fd.get("client_id") ?? "").trim();
  const secreto = String(fd.get("client_secret") ?? "").trim();
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id) || secreto.length < 16 || /\s/.test(secreto)) {
    redirect(`${BASE}?error=${encodeURIComponent("Revisá los datos: el ID de cliente termina en «.apps.googleusercontent.com» y el secreto es un texto largo sin espacios.")}`);
  }
  await consulta(`insert into plataforma_google (id, client_id, client_secret) values (1, $1, $2)
                  on conflict (id) do update set client_id = excluded.client_id, client_secret = excluded.client_secret, actualizado_ts = now()`, [id, secreto]);
  redirect(`${BASE}?ok=${encodeURIComponent("Aplicación de Google grabada. Ya se puede conectar Google Drive desde Configuración › Google Drive.")}`);
}
