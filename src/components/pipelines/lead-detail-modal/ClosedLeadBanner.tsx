import { Trophy, XCircle, Lock } from 'lucide-react';

export function ClosedLeadBanner({ status }: { status: 'won' | 'lost' }) {
  const isWon = status === 'won';
  return (
    <div
      className={[
        'mx-5 mt-3 rounded-md border-l-2 px-3 py-2 text-xs flex items-center gap-2',
        'bg-muted/40 border-y border-r border-border/60',
        isWon ? 'border-l-emerald-500/70' : 'border-l-rose-500/70',
      ].join(' ')}
    >
      {isWon ? (
        <Trophy className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
      )}
      <span className="text-foreground/90">
        Ficha encerrada como <strong>{isWon ? 'Ganho' : 'Perdido'}</strong>.
      </span>
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Lock className="w-3 h-3" />
        Reabra para editar.
      </span>
    </div>
  );
}
