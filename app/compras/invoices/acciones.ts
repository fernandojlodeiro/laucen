"use server";

// Invoices de compra (historial): leer los Excel ya subidos a Storage, corregir la cabecera y los renglones,
// confirmar y borrar. Nada de esto mueve stock ni costos.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { motivoErp, ErrorErp } from "@/lib/erp/base";
import { intentar, id, numero, texto, entero, tildado } from "@/lib/erp/acciones";
import { supabaseServer } from "@/lib/supabase";
import {
  agregarLinea, borrarInvoice, borrarLinea, confirmar, confirmarListos, crearInvoice, guardarCabecera, guardarConfigInvoices, guardarLinea, leerArchivoInvoice, volverARevisar,
} from "@/lib/compras/invoices";

const LISTA = "/compras/invoices";

/** Baja de Storage un invoice que se acaba de subir, lo lee y lo deja «a revisar». La llama SubirInvoices.tsx, uno por archivo. */
export async function accionLeerInvoice(a: { ruta: string; archivo: string; proveedorId: number | null }): Promise<{ id: number; renglones: number } | { motivo: string }> {
  const s = await entrarErp("compras_ver");
  try {
    if (!a.ruta?.startsWith(`${s.org.id}/`) || a.ruta.includes("..")) throw new ErrorErp("El archivo no es de esta organización.");
    const sb = await supabaseServer();
    const { data, error } = await sb.storage.from("importaciones").download(a.ruta);
    if (error || !data) throw new ErrorErp(`No se pudo bajar «${a.archivo}». Probá de nuevo.`);
    // Un PDF queda guardado sin renglones: se cargan a mano en su ficha («Nuevo renglón»).
    if (/\.pdf$/i.test(a.ruta)) {
      const nuevo = await crearInvoice(s.org.id, {
        archivo: a.archivo, ruta: a.ruta, proveedorId: a.proveedorId, usuarioId: s.usuario.id, hoja: null, pdf: true,
        leido: { fecha: null, fechaTexto: null, fechaDudosa: false, numero: null, renglones: [], avisos: ["Es un PDF: la fecha y los renglones se cargan a mano."] },
      });
      revalidatePath(LISTA);
      return { id: nuevo, renglones: 0 };
    }
    const { hoja, leido } = await leerArchivoInvoice(await data.arrayBuffer());
    const nuevo = await crearInvoice(s.org.id, { archivo: a.archivo, ruta: a.ruta, proveedorId: a.proveedorId, usuarioId: s.usuario.id, hoja, leido });
    revalidatePath(LISTA);
    return { id: nuevo, renglones: leido.renglones.length };
  } catch (e) {
    return { motivo: motivoErp(e) };
  }
}

export async function accionGuardarInvoice(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const iid = id(fd);
  await intentar(`${LISTA}/${iid}`, async () => {
    await guardarCabecera(s.org.id, iid, {
      fecha: texto(fd, "fecha"), via: String(fd.get("via") ?? ""), numero: texto(fd, "numero"),
      proveedorId: entero(fd, "proveedor_id"), compraCourierId: entero(fd, "compra_courier_id"), notas: texto(fd, "notas"), ignorarPrecio: tildado(fd, "ignorar_precio"),
    });
    revalidatePath(`${LISTA}/${iid}`);
    return "Grabado.";
  });
}

export async function accionGuardarLineaInvoice(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const iid = id(fd, "invoice_id");
  await intentar(`${LISTA}/${iid}`, async () => {
    await guardarLinea(s.org.id, id(fd), { sku: texto(fd, "sku") ?? "", cantidad: numero(fd, "cantidad") ?? 0, precio: numero(fd, "precio") });
    revalidatePath(`${LISTA}/${iid}`);
    return "Renglón grabado.";
  });
}

export async function accionAgregarLineaInvoice(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const iid = id(fd, "invoice_id");
  await intentar(`${LISTA}/${iid}`, async () => {
    await agregarLinea(s.org.id, iid, { sku: texto(fd, "sku") ?? "", cantidad: numero(fd, "cantidad") ?? 0, precio: numero(fd, "precio"), descripcion: texto(fd, "descripcion") });
    revalidatePath(`${LISTA}/${iid}`);
    return { ir: `${LISTA}/${iid}?nuevo=nuevo-renglon&ok=${encodeURIComponent("Renglón agregado.")}` };
  });
}

export async function accionBorrarLineaInvoice(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const iid = id(fd, "invoice_id");
  await intentar(`${LISTA}/${iid}`, async () => {
    await borrarLinea(s.org.id, id(fd));
    revalidatePath(`${LISTA}/${iid}`);
    return "Renglón borrado.";
  });
}

export async function accionConfirmarInvoice(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const iid = id(fd);
  await intentar(`${LISTA}/${iid}`, async () => {
    await confirmar(s.org.id, iid);
    revalidatePath(LISTA);
    return "Confirmado: ya cuenta en el historial de compras de cada producto.";
  });
}

export async function accionRevisarInvoice(fd: FormData) {
  const s = await entrarErp("compras_ver");
  const iid = id(fd);
  await intentar(`${LISTA}/${iid}`, async () => {
    await volverARevisar(s.org.id, iid);
    revalidatePath(LISTA);
    return "Volvió a «A revisar»: no cuenta hasta confirmarlo de nuevo.";
  });
}

export async function accionBorrarInvoice(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    await borrarInvoice(s.org.id, id(fd));
    revalidatePath(LISTA);
    return "Invoice borrado.";
  });
}

export async function accionGuardarDemoras(fd: FormData) {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    await guardarConfigInvoices(s.org.id, { demoraAvion: entero(fd, "demora_avion") ?? -1, demoraBarco: entero(fd, "demora_barco") ?? -1 });
    revalidatePath(LISTA);
    return "Demoras grabadas.";
  });
}

/** Confirma de una vez todos los «a revisar» que tienen la fecha segura. */
export async function accionConfirmarListos() {
  const s = await entrarErp("compras_ver");
  await intentar(LISTA, async () => {
    const n = await confirmarListos(s.org.id);
    revalidatePath(LISTA);
    return n ? `${n} invoice${n === 1 ? "" : "s"} confirmado${n === 1 ? "" : "s"}.` : "No había ninguno con la fecha segura para confirmar.";
  });
}
