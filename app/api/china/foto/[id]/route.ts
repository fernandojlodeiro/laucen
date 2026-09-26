import { leerFoto } from "@/lib/china/fotos";

// Link público de una foto subida en la pantalla de China (para Apify).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const foto = await leerFoto(id.replace(/\.\w+$/, ""));
  if (!foto) return new Response("No existe", { status: 404 });
  return new Response(new Uint8Array(foto.datos), {
    headers: { "content-type": foto.tipo, "cache-control": "public, max-age=31536000, immutable" },
  });
}
