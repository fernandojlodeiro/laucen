"use server";

// Configuración › Métodos de envío › OCA: graba la cuenta de OCA y la prueba.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar, texto, entero, numero } from "@/lib/erp/acciones";
import { cuitDelFormulario } from "@/lib/cuit";
import { deFondo } from "@/lib/tareas-fondo";
import { guardarConfigOca, probarOca, FRANJAS } from "@/lib/oca/envios";

const VOLVER = "/config/envios/oca";

export async function accionGuardarOca(fd: FormData) {
  const s = await entrarErp("tienda_config");
  await intentar(VOLVER, async () => {
    const t = (k: string) => texto(fd, k) ?? "";
    const cuit = texto(fd, "cuit") ? cuitDelFormulario(texto(fd, "cuit")) : null;
    const cp = t("origen_cp");
    if (cp && !/^([A-Za-z]?\d{4}[A-Za-z]{0,3})$/.test(cp.replace(/\s/g, ""))) throw new ErrorErp("El código postal de origen no parece válido (ej. 1646 o B1646ABC).");
    const franja = entero(fd, "franja") ?? 1;
    if (!FRANJAS.some(([n]) => n === franja)) throw new ErrorErp("Elegí la franja horaria de retiro.");
    const peso = entero(fd, "peso_std_g") ?? 0;
    const caja = { largo: numero(fd, "caja_largo") ?? 0, ancho: numero(fd, "caja_ancho") ?? 0, alto: numero(fd, "caja_alto") ?? 0 };
    if (peso <= 0 || caja.largo <= 0 || caja.ancho <= 0 || caja.alto <= 0) throw new ErrorErp("Completá el peso y las medidas de la caja estándar (mayores que cero).");
    const op = (k: string) => (texto(fd, k) ?? "").replace(/\s/g, "") || null;
    for (const k of ["operativa_domicilio", "operativa_sucursal"]) if (op(k) && !/^\d+$/.test(op(k)!)) throw new ErrorErp("La operativa es un número (te lo da OCA).");
    await guardarConfigOca(s.org.id, {
      usuario: texto(fd, "usuario"), clave: texto(fd, "clave"), cuit, nroCuenta: texto(fd, "nro_cuenta"),
      operativaDomicilio: op("operativa_domicilio"), operativaSucursal: op("operativa_sucursal"),
      origen: { calle: t("origen_calle"), numero: t("origen_numero"), piso: t("origen_piso"), depto: t("origen_depto"), cp, localidad: t("origen_localidad"),
        provincia: t("origen_provincia"), contacto: t("origen_contacto"), email: t("origen_email"), telefono: t("origen_telefono") },
      centroOrigen: op("centro_origen"), franja, pesoStdG: peso, caja,
    });
    revalidatePath(VOLVER);
    return { ir: `${VOLVER}?ok=${encodeURIComponent("Grabado. Probá la conexión con «Probar con OCA».")}` };
  });
}

export async function accionProbarOca(_fd: FormData) {
  const s = await entrarErp("tienda_config");
  return deFondo(s, "oca-probar", "Prueba con OCA", () => probarOca(s.org.id));
}
