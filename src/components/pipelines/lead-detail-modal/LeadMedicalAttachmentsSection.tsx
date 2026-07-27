import { Paperclip, Loader2, X } from 'lucide-react';
import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { formatFileSize } from './shared';
import {
  useLeadAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from '@/hooks/useLeadAttachments';

/**
 * Anexos médicos (receitas, exames, etc.) — múltiplos uploads.
 */
export function LeadMedicalAttachmentsSection({ leadId, locked = false }: { leadId: string; locked?: boolean }) {
  const { data: attachments = [] } = useLeadAttachments(leadId, 'medical');
  const upload = useUploadAttachment();
  const remove = useDeleteAttachment();
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => upload.mutate({ leadId, file, category: 'medical' }));
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-primary" />
          Arquivos médicos
        </h4>
        {!locked && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="h-8"
          >
            {upload.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Paperclip className="w-3.5 h-3.5 mr-1" />}
            Anexar
          </Button>
        )}
        <Input ref={fileRef} type="file" multiple className="hidden" onChange={onPick} />
      </div>

      <div className="space-y-2">
        {attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">Nenhum arquivo médico anexado</p>
        ) : (
          attachments.map((att) => (
            <div key={att.id} className="flex items-center justify-between p-2.5 border border-border/60 rounded-lg bg-background/40">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate block">
                    {att.file_name}
                  </a>
                  <p className="text-[11px] text-muted-foreground">
                    {formatFileSize(att.file_size)} • {format(new Date(att.created_at), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
              </div>
              {!locked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive h-7 w-7 p-0"
                  onClick={() => remove.mutate({ attachmentId: att.id, leadId, fileUrl: att.file_url, fileName: att.file_name })}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
