// La vuelta del alta embebida de Meta: canjea el código por el token, averigua
// la cuenta (WABA) y el número, guarda la credencial y suscribe la cuenta con
// la dirección de entrega de Laucen (así CadaMes, dueña de la app de Meta, no
// recibe estos mensajes). Copiado de CadaMes (alta-whatsapp.ts) y adaptado.

import { NextRequest, NextResponse } from "next/server";
import { consulta, una } from "@/lib/erp/base";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { urlPanel } from "@/lib/tienda/dominios";
import { anotarEvento } from "@/lib/mensajes/chats";
import { canjearCodigo, claveNueva, datosDelToken, numerosDeLaWaba, registrarNumero, suscribirApp, verificarEstado } from "@/lib/mensajes/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const base = urlPanel();
  const url = new URL(req.url);
  const volver = (motivo: string) => NextResponse.redirect(`${base}/ventas/mensajes/configuracion?wa=${motivo}`);
  await asegurarEsquemaErp();

  const code = url.searchParams.get("code");
  const datos = verificarEstado(url.searchParams.get("state") ?? "");
  await anotarEvento("alta_vuelta", {
    hayCode: !!code, estadoValido: !!datos, error: url.searchParams.get("error"), error_reason: url.searchParams.get("error_reason"),
    waba_id: url.searchParams.get("waba_id"), phone_number_id: url.searchParams.get("phone_number_id"),
  }, datos?.org ?? null);
  if (url.searchParams.get("error")) return volver("rechazo");
  if (!code) return volver("cancelado");
  if (!datos?.org) return volver("estado");
  const org = datos.org;
  const coexistencia = datos.modo !== "solo_laucen";
  const redirectUri = `${base}/api/whatsapp/conectar/callback`;

  let token: string, expiraEl: string, wabas: string[];
  try {
    const c = await canjearCodigo(code, redirectUri);
    const d = await datosDelToken(c.token);
    token = c.token; expiraEl = d?.expiraEl || c.expiraEl; wabas = d?.wabas ?? [];
  } catch (e) {
    console.error("[wa-alta-canje]", org, e);
    return volver("canje");
  }
  const wabaId = url.searchParams.get("waba_id") || (wabas.length === 1 ? wabas[0] : "");
  if (!wabaId) return volver(wabas.length > 1 ? "varias_cuentas" : "sin_cuenta");

  let numeros: { id: string; numero: string; nombre: string }[];
  try { numeros = await numerosDeLaWaba(wabaId, token); } catch (e) { console.error("[wa-alta-numeros]", org, e); return volver("sin_numero"); }
  const pedido = url.searchParams.get("phone_number_id");
  const num = (pedido ? numeros.find((n) => n.id === pedido) : null) ?? (numeros.length === 1 ? numeros[0] : null);
  if (!num) return volver(numeros.length > 1 ? "varias_cuentas" : "sin_numero");

  const dueno = await una<{ organizacion_id: string }>("select organizacion_id from wa_credencial where phone_number_id = $1", [num.id]);
  if (dueno && dueno.organizacion_id !== org) return volver("otro_dueno");

  // La credencial va antes de suscribir: Meta verifica la dirección en el
  // momento y el webhook busca la clave en esta tabla.
  const verify = claveNueva();
  await consulta("update wa_credencial set estado = 'desconectado' where organizacion_id = $1 and phone_number_id <> $2", [org, num.id]);
  await consulta(`
    insert into wa_credencial (organizacion_id, phone_number_id, waba_id, numero, nombre, token, verify_token, coexistencia, expira_el, estado)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'activo')
    on conflict (phone_number_id) do update set waba_id = excluded.waba_id, numero = excluded.numero, nombre = excluded.nombre, token = excluded.token,
      verify_token = excluded.verify_token, coexistencia = excluded.coexistencia, expira_el = excluded.expira_el, estado = 'activo', conectado_ts = now()`,
  [org, num.id, wabaId, num.numero, num.nombre, token, verify, coexistencia, expiraEl || null]);

  try {
    await suscribirApp(wabaId, token, `${base}/api/whatsapp/webhook`, verify);
  } catch (e) {
    console.error("[wa-alta-suscribir]", org, e);
    await consulta("update wa_credencial set estado = 'desconectado' where phone_number_id = $1", [num.id]);
    return volver("webhooks");
  }
  if (!coexistencia) await registrarNumero(num.id, token);
  return volver("conectado");
}
