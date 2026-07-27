import React from 'react';

// URLs: http(s)://, www. ou domínios "soltos" comuns.
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;!?)\]}'"])/gi;

const MAX_DEPTH = 4;
const BOUNDARY = /[\s(.,!?;:>\-—"'\[\]<)]/;

function isBoundary(ch: string | undefined): boolean {
  if (ch === undefined || ch === '') return true;
  return BOUNDARY.test(ch);
}

/**
 * Procura o próximo match de formatação `marker...marker` em `text` a partir
 * de `from`, sem regex com backtracking. Retorna posições e conteúdo, ou null.
 */
function findNextMarker(
  text: string,
  from: number,
  marker: string,
): { start: number; end: number; inner: string } | null {
  const mlen = marker.length;
  let i = from;
  while (i <= text.length - mlen * 2) {
    // Match do marcador de abertura
    if (text.substr(i, mlen) !== marker) {
      i++;
      continue;
    }
    // Para *, _, ~ exigimos fronteira antes e que o char seguinte não seja espaço
    if (mlen === 1) {
      const prev = i > 0 ? text[i - 1] : undefined;
      if (!isBoundary(prev)) {
        i++;
        continue;
      }
      const next = text[i + 1];
      if (next === undefined || next === marker || /\s/.test(next)) {
        i++;
        continue;
      }
    }
    // Procura o marcador de fechamento na mesma "linha" (para * _ ~), multiline para ```
    const searchStart = i + mlen;
    const limit = mlen === 1 ? text.indexOf('\n', searchStart) : -1;
    const end = mlen === 1
      ? (() => {
          let j = searchStart;
          const stop = limit === -1 ? text.length : limit;
          while (j < stop) {
            const idx = text.indexOf(marker, j);
            if (idx === -1 || idx >= stop) return -1;
            const before = text[idx - 1];
            if (/\s/.test(before)) {
              j = idx + 1;
              continue;
            }
            const after = text[idx + mlen];
            if (after !== undefined && !isBoundary(after)) {
              j = idx + 1;
              continue;
            }
            return idx;
          }
          return -1;
        })()
      : text.indexOf(marker, searchStart);
    if (end === -1) {
      i++;
      continue;
    }
    const inner = text.slice(searchStart, end);
    if (!inner) {
      i++;
      continue;
    }
    // Limite de segurança
    if (inner.length > 5000) {
      i++;
      continue;
    }
    return { start: i, end: end + mlen, inner };
  }
  return null;
}

const MARKERS: Array<{ marker: string; tag: 'mono' | 'bold' | 'italic' | 'strike' }> = [
  { marker: '```', tag: 'mono' },
  { marker: '*', tag: 'bold' },
  { marker: '_', tag: 'italic' },
  { marker: '~', tag: 'strike' },
];

function formatSegment(text: string, keyBase: string, depth = 0): React.ReactNode[] {
  if (!text) return [text];
  if (depth >= MAX_DEPTH) return [text];
  // Curto-circuito
  if (!/[*_~`]/.test(text)) return [text];

  const out: React.ReactNode[] = [];
  let cursor = 0;
  let idx = 0;

  while (cursor < text.length) {
    // Encontra o próximo match mais à esquerda dentre todos os marcadores
    let best: { start: number; end: number; inner: string; tag: typeof MARKERS[number]['tag'] } | null = null;
    for (const { marker, tag } of MARKERS) {
      const found = findNextMarker(text, cursor, marker);
      if (found && (!best || found.start < best.start)) {
        best = { ...found, tag };
      }
    }
    if (!best) {
      out.push(text.slice(cursor));
      break;
    }
    if (best.start > cursor) out.push(text.slice(cursor, best.start));
    const key = `${keyBase}-f${idx++}`;
    const children = formatSegment(best.inner, key, depth + 1);
    if (best.tag === 'mono') {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded bg-foreground/10 font-mono text-[0.92em]">
          {children}
        </code>,
      );
    } else if (best.tag === 'bold') {
      out.push(<strong key={key}>{children}</strong>);
    } else if (best.tag === 'italic') {
      out.push(<em key={key}>{children}</em>);
    } else {
      out.push(<s key={key}>{children}</s>);
    }
    cursor = best.end;
  }
  return out.length ? out : [text];
}

/**
 * Quebra um texto em links + formatação WhatsApp (negrito/itálico/strike/mono).
 * Mantém quebras de linha (use whitespace-pre-wrap no container).
 */
export function linkifyText(text: string | null | undefined): React.ReactNode {
  if (!text) return text ?? '';
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a
          key={`u${i}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#039be5] underline underline-offset-2 hover:opacity-80 break-all [overflow-wrap:anywhere]"
          onClick={(e) => e.stopPropagation()}
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`t${i}`}>{formatSegment(part, `t${i}`)}</React.Fragment>;
  });
}
