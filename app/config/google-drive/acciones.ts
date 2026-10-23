"use server";

// Configuración › Google Drive: la ruta de cada razón social en el árbol de carpetas del Drive, y desconectar.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { ErrorErp } from "@/lib/erp/base";
import { desconectarDrive, grabarRuta } from "@/lib/google/drive";

const BASE = "/config/google-drive";

export async function accionRutaDrive(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(BASE, async () => {
    const emisor = Number(fd.get("emisor")) || 0;
    const ruta = String(fd.get("ruta") ?? "").trim();
    if (!emisor) throw new ErrorErp("Elegí la razón social.");
    await grabarRuta(s.org.id, emisor, ruta);
    revalidatePath(BASE);
    return "Ruta grabada: la encontré en el Drive.";
  });
}

export async function accionDesconectarDrive() {
  const s = await entrarErp("empresa_config");
  await intentar(BASE, async () => {
    await desconectarDrive(s.org.id);
    revalidatePath(BASE);
    return "Google Drive desconectado. Lo que ya se subió sigue en el Drive.";
  });
}
