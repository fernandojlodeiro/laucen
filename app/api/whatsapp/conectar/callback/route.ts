// La vuelta del alta embebida de Meta: canjea el código por el token, averigua
// la cuenta (WABA) y el número, guarda la credencial y suscribe la cuenta con
// la dirección de entrega de Laucen (así CadaMes, dueña de la app de Meta, no
// recibe estos mensajes). Copiado de CadaMes (alta-whatsapp.ts) y adaptado.

import { NextRequest, NextResponse } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { urlPanel } from "@/lib/tienda/dominios";
import { anotarEvento } from "@/lib/mensajes/chats";
import { canjearCodigo, datosDelToken, verificarEstado } from "@/lib/mensajes/meta";
import { guardarPendiente, opcionesDelPermiso, terminarAlta } from "@/lib/mensajes/alta";

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
  // Las cuentas: la que mandó Meta en la vuelta o, si no, todas las del permiso.
  const pedidaWaba = url.searchParams.get("waba_id");
  const opciones = await opcionesDelPermiso(pedidaWaba ? [pedidaWaba] : wabas, token);
  await anotarEvento("alta_opciones", { wabas, numeros: opciones.map((o) => ({ waba: o.waba, id: o.id, numero: o.numero, nombre: o.nombre, ocupado: o.ocupado })) }, org);
  if (!opciones.length) return volver(wabas.length ? "sin_numero" : "sin_cuenta");
  const pedido = url.searchParams.get("phone_number_id");
  const elegido = pedido ? opciones.find((n) => n.id === pedido) : opciones.length === 1 ? opciones[0] : null;
  if (elegido) return volver(await terminarAlta(org, token, expiraEl, elegido, coexistencia));
  // Varios números: que la persona elija en pantalla.
  if (!opciones.some((o) => !o.ocupado)) return volver("ocupado");
  const id = await guardarPendiente(org, token, expiraEl, coexistencia, opciones);
  return NextResponse.redirect(`${base}/ventas/mensajes/configuracion?wa=elegir&alta=${id}`);
}
