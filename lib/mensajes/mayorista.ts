// La precarga de un mayorista desde el chat (Fer, 29/10): cuando alguien pide precios mayoristas y deja sus
// datos, la IA lo busca en los clientes (el del chat, o por CUIT, mail o WhatsApp); si está, le corrige los datos
// que dio; si no, lo carga. En los dos casos queda «Acceso mayorista: Solicitado» en la ficha, para avisarle por
// mail y WhatsApp el día que abra la sección mayorista de la tienda. El chat queda enlazado a la ficha.

import { consulta, una } from "@/lib/erp/base";
import { cuitCierra } from "@/lib/cuit";
import { whatsappNormal } from "@/lib/telefono";
import { clientePorTelefono, type Chat } from "./chats";

export type DatosMayorista = { razon_social: string; contacto: string; cuit: string; email: string; telefono: string };

const limpio = (v: unknown, tope = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, tope);

/** Lo que mandó la IA, validado: { motivo } si falta algo o algo no cierra (no se guarda nada). */
export function datosMayorista(e: Record<string, unknown>, chat: Pick<Chat, "canal" | "externo">): DatosMayorista | { motivo: string } {
  const razon = limpio(e.razon_social);
  const email = limpio(e.email).toLowerCase();
  const cuit = limpio(e.cuit).replace(/\D/g, "");
  // El teléfono que dio o, en WhatsApp, el número desde el que escribe.
  const telefono = whatsappNormal(limpio(e.telefono)) ?? (chat.canal === "whatsapp" ? whatsappNormal(chat.externo) : null) ?? "";
  if (razon.length < 3) return { motivo: "Falta la razón social (o el nombre del negocio): pedísela. No se guardó nada." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { motivo: "El mail no parece válido: pedíselo de nuevo. No se guardó nada." };
  if (cuit && (cuit.length !== 11 || !cuitCierra(cuit))) return { motivo: "El CUIT no es válido (tiene que tener 11 números y el último tiene que cerrar): pedíselo de nuevo. No se guardó nada." };
  if (!email && !telefono) return { motivo: "Falta un dato de contacto: pedile el mail o un teléfono. No se guardó nada." };
  return { razon_social: razon, contacto: limpio(e.contacto, 80), cuit, email, telefono };
}

/** El cliente que ya tenemos: el enlazado al chat, o por CUIT, mail o WhatsApp (en ese orden). */
async function existente(org: string, chat: Pick<Chat, "clienteId">, d: DatosMayorista): Promise<number | null> {
  if (chat.clienteId) return chat.clienteId;
  if (d.cuit) {
    const r = await una<{ id: number }>("select id::int from cliente where organizacion_id = $1 and regexp_replace(coalesce(cuit, ''), '\\D', '', 'g') = $2 order by id limit 1", [org, d.cuit]);
    if (r) return r.id;
  }
  if (d.email) {
    const r = await una<{ id: number }>("select id::int from cliente where organizacion_id = $1 and lower(email) = $2 order by id desc limit 1", [org, d.email]);
    if (r) return r.id;
  }
  return d.telefono ? clientePorTelefono(org, d.telefono) : null;
}

/** Carga o corrige el cliente y lo deja con el acceso mayorista solicitado. Devuelve lo que la IA le cuenta (para ella, no para el cliente). */
export async function registrarMayorista(org: string, chat: Chat, d: DatosMayorista): Promise<string> {
  const [pila, ...resto] = d.contacto.split(" ");
  const contacto = { nombre_pila: d.contacto ? pila : null, apellido: resto.length ? resto.join(" ") : null };
  const delChat = chat.canal === "whatsapp" && d.telefono === whatsappNormal(chat.externo);
  const nota = `Pidió acceso mayorista por ${chat.canal === "whatsapp" ? "WhatsApp" : chat.canal === "instagram" ? "Instagram" : "chat"} (chat ${chat.id}).`;
  const id = await existente(org, chat, d);

  let cliente: number, texto: string;
  if (id) {
    const antes = await una<Record<string, string | null>>(
      "select razon_social, nombre_pila, apellido, cuit, email, whatsapp, acceso_mayorista from cliente where id = $1 and organizacion_id = $2", [id, org]);
    // Se corrige sólo lo que la persona dio (lo vacío queda como estaba). La razón social es también su nombre en las listas.
    await consulta(`
      update cliente set nombre = $3, razon_social = $3,
             nombre_pila = coalesce($4, nombre_pila), apellido = coalesce($5, apellido),
             cuit = coalesce(nullif($6, ''), cuit), email = coalesce(nullif($7, ''), email),
             whatsapp_confirmado_ts = case when nullif($8, '') is not null and whatsapp is distinct from $8 then (case when $9 then now() else null end) else whatsapp_confirmado_ts end,
             whatsapp = coalesce(nullif($8, ''), whatsapp),
             acceso_mayorista_ts = case when acceso_mayorista is null then now() else acceso_mayorista_ts end,
             acceso_mayorista = coalesce(acceso_mayorista, 'solicitado'),
             notas = concat_ws(E'\\n', nullif(notas, ''), $10::text)
       where id = $1 and organizacion_id = $2`,
      [id, org, d.razon_social, contacto.nombre_pila, contacto.apellido, d.cuit, d.email, d.telefono, delChat, nota]);
    const cambios = antes ? [
      antes.razon_social !== d.razon_social && "razón social",
      d.cuit && antes.cuit?.replace(/\D/g, "") !== d.cuit && "CUIT",
      d.email && antes.email?.toLowerCase() !== d.email && "mail",
      d.telefono && antes.whatsapp !== d.telefono && "WhatsApp",
      contacto.nombre_pila && (antes.nombre_pila !== contacto.nombre_pila || antes.apellido !== (contacto.apellido ?? antes.apellido)) && "contacto",
    ].filter(Boolean) : [];
    cliente = id;
    texto = `Ya era cliente (#${id}).${cambios.length ? ` Corregí: ${cambios.join(", ")}.` : " Sus datos estaban bien."}`
      + (antes?.acceso_mayorista === "habilitado" ? " Ya tenía el acceso mayorista habilitado." : " Quedó con el acceso mayorista solicitado.");
  } else {
    const r = await una<{ id: number }>(`
      insert into cliente (organizacion_id, nombre, razon_social, nombre_pila, apellido, cuit, email, whatsapp, whatsapp_confirmado_ts,
                           acceso_mayorista, acceso_mayorista_ts, notas)
      values ($1, $2, $2, $3, $4, nullif($5, ''), nullif($6, ''), nullif($7, ''), case when $8 then now() end, 'solicitado', now(), $9)
      returning id::int`,
      [org, d.razon_social, contacto.nombre_pila, contacto.apellido, d.cuit, d.email, d.telefono, delChat, nota]);
    cliente = r!.id;
    texto = `No estaba: lo cargué como cliente nuevo (#${cliente}), con el acceso mayorista solicitado.`;
  }
  if (!chat.clienteId) {
    await consulta("update chat set cliente_id = $2 where id = $1 and organizacion_id = $3", [chat.id, cliente, org]);
    chat.clienteId = cliente;
  }
  return `${texto} No hace falta derivar. Decile que quedó anotado y que cuando la sección mayorista esté habilitada le vamos a mandar un aviso por mail y por WhatsApp para que entre a ver las novedades; la primera vez va a tener que crear una contraseña.`;
}
