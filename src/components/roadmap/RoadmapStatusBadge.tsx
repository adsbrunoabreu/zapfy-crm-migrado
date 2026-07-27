import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, CheckCircle2 } from 'lucide-react';
import type { RoadmapStatus } from '@/data/roadmapItems';

export function RoadmapStatusBadge({ status }: { status: RoadmapStatus }) {
  if (status === 'done') {
    return (
      <Badge variant="outline" className="border-sky-500/40 text-sky-500 bg-sky-500/10 gap-1.5">
        <CheckCircle2 className="w-3 h-3" />
        Pronto
      </Badge>
    );
  }
  if (status === 'in_progress') {
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-500 bg-emerald-500/10 gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        Em desenvolvimento
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 gap-1.5">
      <Clock className="w-3 h-3" />
      Em breve
    </Badge>
  );
}
