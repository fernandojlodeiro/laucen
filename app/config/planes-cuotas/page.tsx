// La dirección vieja de los planes de cuotas: ahora son una pestaña de Precios en Mercado Libre.
import { redirect } from "next/navigation";

export default function PlanesCuotasViejo() {
  redirect("/catalogo/precios-ml/planes-cuotas");
}
