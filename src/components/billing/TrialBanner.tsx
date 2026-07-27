import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTrialStatus } from '@/hooks/useTrialStatus';
import { Sparkles, AlertTriangle } from 'lucide-react';

function formatRemaining(ms: number) {
  if (ms <= 0) return '00:00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function TrialBanner() {
  const { data } = useTrialStatus();
  const [now, setNow] = useState(() => Date.now());

  // Tick a cada 1s enquanto o trial está visível
  useEffect(() => {
    if (!data || data.plan_status !== 'trial' || data.expired) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [data]);

  if (!data || data.plan_status !== 'trial' || data.expired) return null;

  // Fonte da verdade: trial_ends_at (timestamp do servidor). Fallback p/ hours_left.
  const endsAt = data.trial_ends_at ? new Date(data.trial_ends_at).getTime() : null;
  const remainingMs = endsAt ? Math.max(0, endsAt - now) : Math.max(0, (data.hours_left ?? 0) * 3600_000);
  const hoursLeft = remainingMs / 3600_000;

  const critical = hoursLeft <= 1;
  const urgent = hoursLeft <= 6;
  const tone = critical
    ? 'bg-destructive/15 border-destructive/40 text-destructive'
    : urgent
      ? 'bg-amber/10 border-amber/30 text-amber'
      : 'bg-primary/10 border-primary/30 text-primary';

  const Icon = urgent ? AlertTriangle : Sparkles;
  const countdown = formatRemaining(remainingMs);

  const message = critical
    ? `Seu teste grátis termina em ${countdown} — assine agora para não perder acesso.`
    : urgent
      ? `Faltam ${countdown} do seu teste grátis · assine para manter o acesso.`
      : `Teste grátis de 24h · faltam ${countdown}.`;

  return (
    <div className={`border-b ${tone} px-4 py-2 flex items-center justify-between gap-3 text-sm`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="truncate">
          {message.split(countdown)[0]}
          <strong className="tabular-nums font-semibold">{countdown}</strong>
          {message.split(countdown)[1]}
        </span>
      </div>
      <Link
        to="/subscription"
        className="font-medium underline underline-offset-2 hover:opacity-80 shrink-0"
      >
        {urgent ? 'Assinar agora →' : 'Ver planos →'}
      </Link>
    </div>
  );
}
