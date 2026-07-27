import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import type { WebhookRecord } from './constants';

interface Props {
  webhook: WebhookRecord;
  instancesCount: number;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testing: boolean;
}

export const WebhookRow = memo(function WebhookRow({
  webhook, onEdit, onDelete, onTest, testing,
}: Props) {
  return (
    <div className="border border-border rounded-lg p-4 bg-background">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-foreground">{webhook.name}</h4>
            {webhook.is_active ? (
              <Badge variant="outline" className="bg-emerald/10 text-emerald border-emerald/30">Ativo</Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Inativo</Badge>
            )}
          </div>
          <code className="text-xs text-muted-foreground/80 truncate block mt-1">{webhook.url}</code>
          <div className="flex flex-wrap gap-1 mt-2">
            {webhook.events.map((ev) => (
              <Badge key={ev} variant="outline" className="text-xs bg-card border-border text-muted-foreground">{ev}</Badge>
            ))}
            {webhook.instance_ids.length > 0 && (
              <Badge variant="outline" className="text-xs bg-card border-border text-muted-foreground">
                {webhook.instance_ids.length} instância(s)
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
          <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
});
