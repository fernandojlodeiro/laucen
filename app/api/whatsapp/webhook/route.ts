// Entrada de los mensajes de WhatsApp (Cloud API de Meta), copiada de CadaMes
// y adaptada (pedido de Fer, 3/10).
//  GET  → verificación de la dirección: Meta la hace al suscribir cada cuenta
//         (override_callback_uri), con la clave que inventó Laucen al conectar.
//  POST → mensajes del cliente, ecos de coexistencia (lo que contestan desde el
//         teléfono) y estados de entrega. Se verifica la firma de Meta. Se
//         contesta 200 enseguida; la IA contesta después (after), esperando a
//         que el cliente termine de escribir.

import { NextRequest, NextResponse, after } from "next/server";
import { asegurarEsquemaErp } from "@/lib/erp/esquema";
import { firmaValida, motivoEnvio } from "@/lib/mensajes/meta";
import { anotarEntrega, anotarEvento, chatDe, credencialDeNumero, ganaLaEspera, guardarMensaje, ponerIa, verifyTokenValido } from "@/lib/mensajes/chats";
import { configMensajes } from "@/lib/mensajes/config";
import { contestar } from "@/lib/mensajes/estela";
import { conQuienHablaban, ecosDelCambio, esOrdenDeMando, loQueDijo, sinLaMarca } from "@/lib/mensajes/reglas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") !== "subscribe") return new NextResponse("Forbidden", { status: 403 });
  await asegurarEsquemaErp();
  if (!(await verifyTokenValido(p.get("hub.verify_token") ?? ""))) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

type Mensaje = {
  from?: string; id?: string; timestamp?: string; type?: string;
  text?: { body?: string };
  image?: { caption?: string }; video?: { caption?: string }; document?: { caption?: string; filename?: string };
  audio?: { id?: string }; sticker?: unknown; location?: { name?: string; address?: string; latitude?: number; longitude?: number };
  button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  reaction?: unknown;
};
type Estado = { id?: string; status?: string; recipient_id?: string; errors?: { code?: number }[] };
type Valor = {
  metadata?: { phone_number_id?: string };
  messages?: Mensaje[]; statuses?: Estado[];
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
};

/** Lo que dijo el cliente, en texto (lo que no es texto se describe). null = no va al chat (reacciones, avisos del sistema). */
function textoDe(m: Mensaje): string | null {
  switch (m.type) {
    case "text": return m.text?.body?.trim() || null;
    case "image": return m.image?.caption?.trim() ? `📷 ${m.image.caption.trim()}` : "📷 (mandó una foto)";
    case "video": return m.video?.caption?.trim() ? `🎬 ${m.video.caption.trim()}` : "🎬 (mandó un video)";
    case "document": return `📄 (mandó un archivo${m.document?.filename ? `: ${m.document.filename}` : ""})${m.document?.caption ? ` ${m.document.caption}` : ""}`;
    case "audio": return "🎤 (mandó un audio)";
    case "sticker": return "(mandó una figurita)";
    case "location": return `📍 (mandó una ubicación${m.location?.name || m.location?.address ? `: ${[m.location.name, m.location.address].filter(Boolean).join(", ")}` : ""})`;
    case "button": return m.button?.text ?? null;
    case "interactive": return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
    default: return null;
  }
}

export async function POST(req: NextRequest) {
  const cuerpo = await req.text();
  if (!firmaValida(cuerpo, req.headers.get("x-hub-signature-256"))) {
    console.warn("[wa-webhook] firma inválida");
    return new NextResponse("Forbidden", { status: 403 });
  }
  try {
    await asegurarEsquemaErp();
    const body = JSON.parse(cuerpo) as { entry?: { changes?: { field?: string; value?: Valor }[] }[] };
    const cambios = body.entry?.flatMap((e) => e.changes ?? []) ?? [];
    for (const c of cambios) {
      const v = c.value;
      const cred = v?.metadata?.phone_number_id ? await credencialDeNumero(v.metadata.phone_number_id) : null;
      if (!cred) { await anotarEvento("sin_dueno", c); continue; }
      const org = cred.organizacionId;

      // ── Lo que contestaron desde el teléfono (coexistencia) ──
      // El `from` del eco es el negocio; la persona es `to`. Un eco no
      // despierta a la IA, salvo que empiece con la marca (prende o apaga).
      for (const eco of ecosDelCambio(v)) {
        const quien = conQuienHablaban(eco);
        await anotarEvento("eco", eco, org, quien || null);
        if (!quien) continue;
        const dijo = loQueDijo(eco);
        const chat = await chatDe(org, "whatsapp", quien);
        if (dijo) await guardarMensaje({ org, chatId: chat.id, clase: "desde_el_telefono", texto: dijo, wamid: eco.id ?? null, estado: "enviado" });
        const cfg = await configMensajes(org);
        if (dijo && esOrdenDeMando(dijo, cfg.marca)) {
          // Asimetría de CadaMes: al apagar, lo que sigue a la marca va tal
          // cual al cliente y no se interpreta; al prender, es un encargo para la IA.
          if (chat.atiendePersonaDesde) {
            await ponerIa(org, chat.id, true);
            const encargo = sinLaMarca(dijo, cfg.marca);
            if (encargo) after(() => contestar(org, chat.id, encargo).then(() => undefined).catch((e) => console.error("[wa-encargo]", e)));
          } else {
            await ponerIa(org, chat.id, false);
          }
        }
      }

      // ── Estados de entrega de lo que mandamos ──
      for (const st of v?.statuses ?? []) {
        const estado = st.status === "delivered" ? "entregado" : st.status === "read" ? "leido" : st.status === "failed" ? "fallido" : null;
        if (estado === "fallido") {
          console.error("[wa-entrega] rechazado org=%s codigo=%s", org, st.errors?.[0]?.code ?? "?");
          await anotarEvento("estado", st, org, st.recipient_id ?? null);
        }
        if (st.id && estado) await anotarEntrega(st.id, estado, estado === "fallido" ? motivoEnvio(st.errors?.[0]?.code) : null);
      }

      // ── Mensajes del cliente ──
      for (const m of v?.messages ?? []) {
        const tel = String(m.from ?? "").replace(/\D/g, "");
        if (!tel) continue;
        const texto = textoDe(m);
        if (!texto) { await anotarEvento("mensaje_sin_texto", m, org, tel); continue; }
        const nombre = v?.contacts?.find((k) => k.wa_id === m.from)?.profile?.name ?? "";
        const chat = await chatDe(org, "whatsapp", tel, nombre);
        const id = await guardarMensaje({ org, chatId: chat.id, clase: "entrante", texto, wamid: m.id ?? null });
        if (id == null) continue; // Meta lo mandó dos veces
        after(async () => {
          try {
            const cfg = await configMensajes(org);
            if (!cfg.iaActiva) return;
            if (!(await ganaLaEspera(chat.id, cfg.esperaSeg))) return;
            await contestar(org, chat.id);
          } catch (e) {
            console.error("[wa-contestar]", org, chat.id, e);
          }
        });
      }

      if (v && !v.messages?.length && !v.statuses?.length && !ecosDelCambio(v).length) await anotarEvento("otro", c, org);
    }
  } catch (e) {
    console.error("[wa-webhook]", e);
  }
  return NextResponse.json({ ok: true });
}
