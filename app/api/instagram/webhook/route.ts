// Entrada de los mensajes directos de Instagram (Fer, 25/10; como el webhook de WhatsApp).
//  GET  → verificación de la dirección: Meta la hace cuando se carga en la app de Instagram, con la clave de
//         verificación que muestra Ventas › Mensajes › Configuración.
//  POST → mensajes de las personas y ecos (lo que manda la cuenta: lo nuestro ya está guardado y no se duplica; lo que
//         contestan desde la app de Instagram entra como «desde el teléfono»). Se verifica la firma con la clave
//         secreta de la app. Se contesta 200 enseguida; la IA contesta después, esperando a que la persona termine.

import { NextRequest, NextResponse, after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { anotarAnuncio, anotarEvento, chatDe, ganaLaEspera, guardarMensaje } from "@/lib/mensajes/chats";
import { configMensajes } from "@/lib/mensajes/config";
import { contestar } from "@/lib/mensajes/estela";
import { appInstagram, cuentaDeId, firmaInstagramValida, mensajesDelAviso, perfil, type AvisoInstagram } from "@/lib/mensajes/instagram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") !== "subscribe") return new NextResponse("Forbidden", { status: 403 });
  await asegurarEsquemaErp();
  const app = await appInstagram();
  if (!app?.verifyToken || p.get("hub.verify_token") !== app.verifyToken) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const cuerpo = await req.text();
  await asegurarEsquemaErp();
  const app = await appInstagram();
  if (!app || !firmaInstagramValida(cuerpo, req.headers.get("x-hub-signature-256"), app.appSecret)) {
    console.warn("[ig-webhook] firma inválida");
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    const aviso = JSON.parse(cuerpo) as AvisoInstagram;
    for (const m of mensajesDelAviso(aviso)) {
      const cuenta = await cuentaDeId(m.cuenta);
      if (!cuenta) { await anotarEvento("ig_sin_dueno", m); continue; }
      const org = cuenta.organizacionId;
      const chat = await chatDe(org, "instagram", m.persona);
      if (!chat.nombre) {
        const nombre = await perfil(cuenta, m.persona).catch(() => "");
        if (nombre) { await chatDe(org, "instagram", m.persona, nombre); }
      }
      if (m.referral) await anotarAnuncio(chat.id, m.referral);
      if (!m.texto) continue; // sólo el anuncio (abrió la charla desde un anuncio)
      const wamid = m.mid ? `ig:${m.mid}` : null;
      if (m.eco) {
        // Lo que mandamos desde Laucen vuelve como eco con el mismo id: no se duplica. Lo demás lo escribieron en la app.
        await guardarMensaje({ org, chatId: chat.id, clase: "desde_el_telefono", texto: m.texto, wamid, estado: "enviado" });
        continue;
      }
      const id = await guardarMensaje({ org, chatId: chat.id, clase: "entrante", texto: m.texto, wamid });
      if (id == null) continue; // Meta lo mandó dos veces
      after(async () => {
        try {
          const cfg = await configMensajes(org);
          if (!cfg.iaActiva) return;
          if (!(await ganaLaEspera(chat.id, cfg.esperaSeg))) return;
          await contestar(org, chat.id);
        } catch (e) { console.error("[ig-contestar]", org, chat.id, e); }
      });
    }
  } catch (e) {
    console.error("[ig-webhook]", e);
  }
  return NextResponse.json({ ok: true });
}
