// Dibuja la respuesta del asistente: un markdown chico (párrafos, títulos,
// listas, negrita, cursiva, código en línea, tablas simples y enlaces). Los
// enlaces a una dirección del sistema ("/compras/facturas") abren adentro;
// los de afuera, en otra pestaña. Nada de HTML crudo.

import Link from "next/link";
import type { ReactNode } from "react";

function enLinea(texto: string, clave: string): ReactNode[] {
  const salida: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(?<![*\w])\*([^*\n]+)\*(?!\w)|(?<!\w)_([^_\n]+)_(?!\w)/g;
  let ultimo = 0, n = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index! > ultimo) salida.push(texto.slice(ultimo, m.index));
    const k = `${clave}-${n++}`;
    if (m[1]) {
      const href = m[2];
      if (href.startsWith("/")) salida.push(<Link key={k} href={href} className="text-[#16577F] font-semibold underline">{m[1]}</Link>);
      else if (/^https?:\/\//.test(href)) salida.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-[#16577F] underline">{m[1]}</a>);
      else salida.push(m[1]);
    } else if (m[3]) salida.push(<b key={k}>{enLinea(m[3], k)}</b>);
    else if (m[4]) salida.push(<code key={k} className="px-1 rounded bg-[#EEF3F8] text-[11px]">{m[4]}</code>);
    else if (m[5] || m[6]) salida.push(<i key={k}>{m[5] ?? m[6]}</i>);
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) salida.push(texto.slice(ultimo));
  return salida;
}

const celdas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export default function Texto({ texto }: { texto: string }) {
  const lineas = texto.replace(/\r/g, "").split("\n");
  const bloques: ReactNode[] = [];
  let i = 0, b = 0;
  while (i < lineas.length) {
    const l = lineas[i];
    const k = `b${b++}`;
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) { bloques.push(<p key={k} className="font-bold mt-2">{enLinea(h[2], k)}</p>); i++; continue; }
    // Tabla: renglones con "|" y una línea de guiones.
    if (l.includes("|") && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1] ?? "")) {
      const titulos = celdas(l);
      const filas: string[][] = [];
      i += 2;
      while (i < lineas.length && lineas[i].includes("|")) filas.push(celdas(lineas[i++]));
      bloques.push(
        <div key={k} className="overflow-x-auto my-1">
          <table className="text-[11px] border-collapse">
            <thead><tr>{titulos.map((t, j) => <th key={j} className="border border-[#E3E9F0] px-1.5 py-0.5 bg-[#FAFBFC] text-left">{enLinea(t, `${k}h${j}`)}</th>)}</tr></thead>
            <tbody>{filas.map((f, x) => <tr key={x}>{f.map((c, j) => <td key={j} className={`border border-[#E3E9F0] px-1.5 py-0.5 ${/^[-$US\d.,\s%]+$/.test(c) ? "text-right tabular-nums" : ""}`}>{enLinea(c, `${k}${x}${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>);
      continue;
    }
    const lista = l.match(/^\s*([-*•]|\d+[.)])\s+/);
    if (lista) {
      const numerada = /\d/.test(lista[1]);
      const items: ReactNode[] = [];
      while (i < lineas.length) {
        const m = lineas[i].match(/^\s*([-*•]|\d+[.)])\s+(.*)/);
        if (!m || /\d/.test(m[1]) !== numerada) break;
        items.push(<li key={i}>{enLinea(m[2], `${k}i${i}`)}</li>);
        i++;
      }
      bloques.push(numerada
        ? <ol key={k} className="list-decimal pl-5 space-y-0.5">{items}</ol>
        : <ul key={k} className="list-disc pl-5 space-y-0.5">{items}</ul>);
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s)/.test(lineas[i]) && !(lineas[i].includes("|") && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1] ?? ""))) parrafo.push(lineas[i++]);
    bloques.push(<p key={k}>{parrafo.flatMap((p, j) => (j ? [<br key={`${k}br${j}`} />, ...enLinea(p, `${k}p${j}`)] : enLinea(p, `${k}p${j}`)))}</p>);
  }
  return <div className="space-y-1.5 break-words">{bloques}</div>;
}
