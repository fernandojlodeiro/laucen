// La muestra de cada voz de la IA (Ventas › Mensajes › Configuración, «Audios»; Fer, 4/11): una frase con su
// nombre, en la voz elegida. Se arma al apretar ▶ y se guarda en memoria mientras dure el servidor, para no
// pagarla cada vez.
//   ?voz=mujer|hombre

import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { configMensajes } from "@/lib/mensajes/config";
import { fraseDeMuestra, hablar } from "@/lib/mensajes/voz";

export const dynamic = "force-dynamic";

const guardadas = new Map<string, Buffer>();

export async function GET(req: Request) {
  const s = await sesionActual();
  if (!s) return new Response("sin sesión", { status: 401 });
  if (!tienePermiso(s.permisos, "mensajes_ver")) return new Response("sin permiso", { status: 403 });
  const voz = new URL(req.url).searchParams.get("voz");
  if (voz !== "mujer" && voz !== "hombre") return new Response("voz desconocida", { status: 400 });
  const frase = fraseDeMuestra((await configMensajes(s.org.id)).nombre);
  const clave = `${voz}|${frase}`;
  let audio = guardadas.get(clave);
  if (!audio) {
    const h = await hablar(frase, voz);
    if (!h.ok) return new Response("No se pudo armar la muestra", { status: 503 });
    audio = h.audio;
    guardadas.set(clave, audio);
  }
  return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/ogg", "cache-control": "private, max-age=86400" } });
}
