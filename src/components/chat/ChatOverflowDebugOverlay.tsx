import { useChatOverflowDebug } from '@/hooks/useChatOverflowDebug';
import { AlertTriangle, X } from 'lucide-react';
import { useState, type RefObject } from 'react';

interface Props {
  containerRef: RefObject<HTMLElement>;
}

/**
 * Overlay flutuante que aparece quando o modo debug de overflow está ativo.
 * Ative com: localStorage.setItem('chatOverflowDebug','1') ou ?debugOverflow=1
 */
export function ChatOverflowDebugOverlay({ containerRef }: Props) {
  const { enabled, report, setEnabled } = useChatOverflowDebug(containerRef);
  const [collapsed, setCollapsed] = useState(false);

  if (!enabled) return null;

  const offenders = report?.offenders ?? [];
  const hasIssues = offenders.length > 0;

  return (
    <div
      data-chat-overflow-overlay="1"
      className="absolute top-2 left-2 z-50 max-w-[360px] rounded-md border border-border bg-background/95 backdrop-blur-sm shadow-lg text-xs"
    >
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
        <AlertTriangle className={`w-3.5 h-3.5 ${hasIssues ? 'text-destructive' : 'text-muted-foreground'}`} />
        <span className="font-semibold flex-1">
          Overflow debug{' '}
          <span className={hasIssues ? 'text-destructive' : 'text-muted-foreground'}>
            ({offenders.length})
          </span>
        </span>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="px-1.5 py-0.5 rounded hover:bg-muted text-[10px] uppercase tracking-wide"
        >
          {collapsed ? 'Mostrar' : 'Ocultar'}
        </button>
        <button
          onClick={() => {
            try {
              localStorage.setItem('chatOverflowDebug', '0');
            } catch {/* ignore */}
            setEnabled(false);
          }}
          className="p-0.5 rounded hover:bg-muted"
          aria-label="Fechar debug"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      {!collapsed && (
        <div className="max-h-[260px] overflow-y-auto p-2 space-y-1">
          {report && (
            <div className="text-[10px] text-muted-foreground">
              container: {report.containerWidth}px / scroll: {report.containerScrollWidth}px
            </div>
          )}
          {!hasIssues && (
            <div className="text-[10px] text-muted-foreground italic">Sem overflow detectado.</div>
          )}
          {offenders.map((o, i) => (
            <div key={i} className="rounded border border-border/60 p-1.5 bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] truncate">
                  {o.tag}
                  {o.messageId ? ` · msg ${o.messageId.slice(0, 10)}` : ''}
                </span>
                <span className="text-destructive font-semibold">+{o.overflowBy}px</span>
              </div>
              {o.text && <div className="text-[10px] text-muted-foreground truncate">"{o.text}"</div>}
              <div className="text-[10px] text-muted-foreground/70 truncate">{o.classes}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
