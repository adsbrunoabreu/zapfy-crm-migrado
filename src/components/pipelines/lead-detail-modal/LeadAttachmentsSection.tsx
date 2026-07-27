import { Paperclip, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { DrawerCollapsible, formatFileSize } from './shared';
import {
  useLeadAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from '@/hooks/useLeadAttachments';

export function LeadAttachmentsSection({
  leadId, open, onToggle,
}: { leadId: string; open: boolean; onToggle: (v: boolean) => void }) {
  const { data: attachments } = useLeadAttachments(leadId);
  const uploadAttachment = useUploadAttachment();
  const deleteAttachment = useDeleteAttachment();

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAttachment.mutate({ leadId, file });
  };

  return (
    <DrawerCollapsible
      icon={<Paperclip className="w-4 h-4 text-primary" />}
      label="Anexos"
      open={open}
      onToggle={onToggle}
    >
      <div>
        <Label className="mb-2 block text-sm font-medium">Anexar Arquivo</Label>
        <Input type="file" onChange={onPick} disabled={uploadAttachment.isPending} className="h-10" />
        {uploadAttachment.isPending && (
          <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />Enviando...
          </p>
        )}
      </div>
      <div>
        <Label className="mb-2 block text-sm font-medium">Arquivos Anexados</Label>
        <div className="space-y-2">
          {attachments && attachments.length > 0 ? (
            attachments.map((att) => (
              <div key={att.id} className="flex items-center justify-between p-3 border rounded-lg bg-secondary/30">
                <div className="flex items-center gap-3">
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline">
                      {att.file_name}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(att.file_size)} • {format(new Date(att.created_at), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteAttachment.mutate({ attachmentId: att.id, leadId, fileUrl: att.file_url, fileName: att.file_name })}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm p-3 border rounded-lg">Nenhum arquivo anexado</p>
          )}
        </div>
      </div>
    </DrawerCollapsible>
  );
}
