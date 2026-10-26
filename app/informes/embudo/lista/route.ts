// Las listas para anuncios (Fer, 26/10): quienes consultaron o empezaron una compra y no compraron, para subir a
// Google Ads (Customer Match) o a Meta (Públicos personalizados) y volver a mostrarles anuncios. /informes/embudo/lista
// ?para=google|meta&dias=90 → CSV con el formato de cada plataforma (cada una cifra los datos al subirlos).
//
// Entran: los chats de WhatsApp de esos días cuyo cliente (o teléfono) no compró después de escribir, y los pedidos de
// la tienda web cancelados de quien no tiene otro pedido. Sin datos de quien pidió que se borren (Política de privacidad).

import { NextResponse, type NextRequest } from "next/server";
import { sesionActual } from "@/lib/tenancy";
import { tienePermiso } from "@/lib/permisos";
import { consulta } from "@/lib/erp/base";

export const dynamic = "force-dynamic";

/** El teléfono como lo piden las dos: +54 y los dígitos (los de WhatsApp ya vienen con 549…). */
function telefonoE164(t: string | null | undefined): string | null {
  let d = (t ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  if (!d.startsWith("54")) d = `54${d.replace(/^0/, "")}`;
  return `+${d}`;
}

const celda = (v: string | null | undefined) => {
  const t = v ?? "";
  return /[,"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export async function GET(req: NextRequest) {
  const s = await sesionActual();
  if (!s || !tienePermiso(s.permisos, "publicidad_ver")) return new NextResponse("Sin permiso", { status: 403 });
  const sp = req.nextUrl.searchParams;
  const para = sp.get("para") === "meta" ? "meta" : "google";
  const dias = Math.min(540, Math.max(7, Number(sp.get("dias")) || 90));
  const filas = await consulta<{ nombre: string | null; email: string | null; telefono: string | null }>(`
    with chats as (
      select coalesce(cl.nombre, ch.nombre) nombre, cl.email, ch.externo telefono, ch.cliente_id, ch.creado_ts desde
        from chat ch left join cliente cl on cl.id = ch.cliente_id
       where ch.organizacion_id = $1 and ch.canal = 'whatsapp' and ch.creado_ts > now() - ($2 || ' days')::interval),
    cancelados as (
      select cl.nombre, cl.email, coalesce(cl.telefono_movil, cl.telefono) telefono, p.cliente_id, p.fecha desde
        from pedido p join canal ca on ca.id = p.canal_id join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and ca.tipo in ('web_minorista', 'web_mayorista') and p.estado = 'cancelado' and p.fecha > now() - ($2 || ' days')::interval),
    todos as (select * from chats union all select * from cancelados),
    compraron as (
      select p.cliente_id, p.fecha, lower(cl.email) email, right(regexp_replace(coalesce(cl.telefono_movil, cl.telefono, ''), '\\D', '', 'g'), 10) tel
        from pedido p left join cliente cl on cl.id = p.cliente_id
       where p.organizacion_id = $1 and p.estado not in ('cancelado', 'devuelto'))
    select distinct on (coalesce(right(regexp_replace(t.telefono, '\\D', '', 'g'), 10), lower(t.email))) t.nombre, t.email, t.telefono
      from todos t
     where (t.telefono is not null or t.email is not null)
       and not exists (select 1 from compraron c where c.fecha >= t.desde
                         and ((t.cliente_id is not null and c.cliente_id = t.cliente_id)
                              or (t.telefono is not null and c.tel <> '' and c.tel = right(regexp_replace(t.telefono, '\\D', '', 'g'), 10))
                              or (t.email is not null and c.email = lower(t.email))))`, [s.org.id, String(dias)]);
  const partes = (n: string | null) => { const [fn, ...ln] = (n ?? "").trim().split(/\s+/); return { fn: fn ?? "", ln: ln.join(" ") }; };
  const cab = para === "google" ? ["Email", "Phone", "First Name", "Last Name", "Country", "Zip"] : ["email", "phone", "fn", "ln", "country"];
  const lineas = filas.map((f) => {
    const { fn, ln } = partes(f.nombre);
    const email = f.email?.includes("@") ? f.email.trim().toLowerCase() : "";
    const tel = telefonoE164(f.telefono) ?? "";
    return para === "google" ? [email, tel, fn, ln, "AR", ""] : [email, tel, fn, ln, "AR"];
  }).filter((l) => l[0] || l[1]);
  const texto = [cab, ...lineas].map((l) => l.map(celda).join(",")).join("\r\n");
  return new NextResponse(texto, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="consultaron-sin-comprar-${para}-${dias}-dias.csv"` },
  });
}
