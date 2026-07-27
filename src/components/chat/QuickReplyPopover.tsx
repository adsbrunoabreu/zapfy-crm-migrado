import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { QuickReply } from '@/hooks/useAttendanceSettings';

interface Props {
  open: boolean;
  query: string;
  replies: QuickReply[];
  onSelect: (reply: QuickReply) => void;
  onClose: () => void;
}

/**
 * Popup que aparece acima do input do chat quando o usuário digita "/".
 * Filtra mensagens pré-definidas pelo atalho ou texto. Navegável por teclado.
 */
export function QuickReplyPopover({ open, query, replies, onSelect, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const list = replies.filter((r) => r.shortcut && r.text);
    if (!q || q === '/') return list.slice(0, 8);
    return list
      .filter(
        (r) =>
          r.shortcut.toLowerCase().includes(q) ||
          r.text.toLowerCase().includes(q.replace(/^\//, '')),
      )
      .slice(0, 8);
  }, [query, replies]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!filtered.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        onSelect(filtered[activeIdx]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, activeIdx, onSelect, onClose]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95"
    >
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-secondary/40 border-b border-border">
        Mensagens rápidas
      </div>
      <ul className="max-h-64 overflow-y-auto">
        {filtered.map((r, i) => (
          <li key={r.id}>
            <button
              type="button"
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => onSelect(r)}
              className={cn(
                'w-full text-left px-3 py-2 flex items-start gap-3 transition-colors',
                activeIdx === i ? 'bg-primary/15' : 'hover:bg-secondary/60',
              )}
            >
              <span className="font-mono text-xs text-primary shrink-0 mt-0.5 min-w-[80px]">
                {r.shortcut}
              </span>
              <span className="text-sm text-foreground line-clamp-2 flex-1">{r.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground bg-secondary/40 border-t border-border flex gap-3">
        <span>↑↓ navegar</span>
        <span>Enter selecionar</span>
        <span>Esc fechar</span>
      </div>
    </div>
  );
}
