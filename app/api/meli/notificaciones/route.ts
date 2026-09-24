// Receptor de notificaciones (tópicos) de Mercado Libre. Por ahora no se usan:
// ML exige una URL al crear la aplicación, y si no recibe 200 reintenta. Se
// contesta "recibido" y nada más; cuando haga falta, acá se procesan.

export const dynamic = "force-dynamic";

export async function POST() {
  return new Response(null, { status: 200 });
}

export async function GET() {
  return new Response("ok", { status: 200 });
}
