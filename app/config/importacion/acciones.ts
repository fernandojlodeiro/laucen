"use server";

import { revalidatePath } from "next/cache";
import { entrarErp } from "@/app/componentes/erp";
import { ErrorErp } from "@/lib/erp/base";
import { intentar } from "@/lib/erp/acciones";
import { leerNumero } from "@/lib/numeros";
import { CONFIG_INICIAL, guardarConfigCosteo, type ConfigCosteo } from "@/lib/marketpro/costeo-config";
import { CAMPOS } from "./campos";

const VOLVER = "/config/importacion";

export async function accionGuardarCosteo(fd: FormData) {
  const s = await entrarErp("market_pro_config");
  await intentar(VOLVER, async () => {
    const c: ConfigCosteo = { ...CONFIG_INICIAL, nombre: String(fd.get("nombre") ?? "").trim() || CONFIG_INICIAL.nombre,
      envio_familia: String(fd.get("envio_familia") ?? "").trim() };
    for (const f of CAMPOS) {
      const v = leerNumero(fd.get(f.clave));
      if (v == null || v < 0) throw new ErrorErp(`Falta «${f.etiqueta}» (un número, 0 o más).`);
      (c as Record<string, unknown>)[f.clave] = v;
    }
    if (!c.unidades_caja || !c.divisor_vol) throw new ErrorErp("Las notebooks por caja y el divisor del peso volumétrico no pueden ser 0.");
    // La tabla TCA: un renglón por tramo, «hasta kg; US$» (el último, «más; US$»).
    const tca: [number | null, number][] = [];
    for (const renglon of String(fd.get("tca") ?? "").split(/\n/).map((x) => x.trim()).filter(Boolean)) {
      const [a, b] = renglon.split(/[;\t|]/).map((x) => x.trim());
      const hasta = /^m[aá]s/i.test(a ?? "") ? null : leerNumero(a);
      const precio = leerNumero(b);
      if ((hasta == null && !/^m[aá]s/i.test(a ?? "")) || precio == null) throw new ErrorErp(`No entiendo el renglón de la TCA «${renglon}»: va «hasta kg; US$», por ejemplo «50; 149,93», y el último «más; 3.258,56».`);
      tca.push([hasta, precio]);
    }
    if (!tca.length) throw new ErrorErp("Falta la tabla TCA.");
    c.tca = tca.sort((x, y) => (x[0] ?? Infinity) - (y[0] ?? Infinity));
    await guardarConfigCosteo(s.org.id, c);
    revalidatePath(VOLVER);
    return "Guardado.";
  });
}
