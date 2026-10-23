"use server";

// Configuración › Google Drive: crear (o renombrar) la carpeta del contador y compartirla, y desconectar.

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { intentar } from "@/lib/erp/acciones";
import { ErrorErp } from "@/lib/erp/base";
import { desconectarDrive, prepararCarpeta } from "@/lib/google/drive";

const BASE = "/config/google-drive";

export async function accionCarpetaContador(fd: FormData) {
  const s = await entrarErp("empresa_config");
  await intentar(BASE, async () => {
    const nombre = String(fd.get("nombre") ?? "").trim();
    const mail = String(fd.get("mail") ?? "").trim().toLowerCase() || null;
    if (!nombre) throw new ErrorErp("Poné el nombre de la carpeta.");
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) throw new ErrorErp("El mail del contador no parece un mail.");
    await prepararCarpeta(s.org.id, nombre, mail);
    revalidatePath(BASE);
    return mail ? `Carpeta «${nombre}» lista y compartida con ${mail} (le llega un aviso de Google).` : `Carpeta «${nombre}» lista.`;
  });
}

export async function accionDesconectarDrive() {
  const s = await entrarErp("empresa_config");
  await intentar(BASE, async () => {
    await desconectarDrive(s.org.id);
    revalidatePath(BASE);
    return "Google Drive desconectado. La carpeta y lo que se subió siguen en el Drive.";
  });
}
