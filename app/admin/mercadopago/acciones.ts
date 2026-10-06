"use server";

// La aplicación de Mercado Pago de Laucen (sólo el dueño del sistema): sus
// datos se cargan acá, una vez, y nunca se vuelven a mostrar.

import { redirect } from "next/navigation";
import { sosVos } from "@/lib/admin";
import { consulta } from "@/lib/erp/base";

const BASE = "/admin/mercadopago";

export async function accionGuardarAppMp(fd: FormData) {
  if (!(await sosVos())) redirect("/panel");
  const id = String(fd.get("client_id") ?? "").trim();
  const secreto = String(fd.get("client_secret") ?? "").trim();
  if (!/^\d{6,25}$/.test(id) || secreto.length < 16 || /\s/.test(secreto)) {
    redirect(`${BASE}?error=${encodeURIComponent("Revisá los datos: el Client ID son sólo números y el Client Secret es un texto largo sin espacios.")}`);
  }
  await consulta(`insert into plataforma_mp (id, client_id, client_secret) values (1, $1, $2)
                  on conflict (id) do update set client_id = excluded.client_id, client_secret = excluded.client_secret, actualizado_ts = now()`, [id, secreto]);
  redirect(`${BASE}?ok=${encodeURIComponent("Aplicación de Mercado Pago grabada. Ya se puede conectar Mercado Pago desde cada canal.")}`);
}
