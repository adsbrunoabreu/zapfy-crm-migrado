import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Send,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileVideo,
  FileAudio,
  File as FileIcon,
  Plus,
  X,
  Pencil,
  Check,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { categorizeFile, formatBytes, type MediaCategory } from '@/lib/mediaLimits';

interface FilePreviewDialogProps {
  files: File[];
  sending?: boolean;
  onConfirm: (
    items: { file: File; caption?: string }[],
    groupHeader?: string,
  ) => void;
  onCancel: () => void;
  onAddFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
  onRename?: (index: number, newName: string) => void;
}

function getDocumentIcon(mime: string) {
  const m = (mime || '').toLowerCase();
  if (m.includes('pdf')) return FileText;
  if (m.includes('sheet') || m.includes('excel') || m.includes('csv')) return FileSpreadsheet;
  if (m.includes('word') || m.includes('document')) return FileText;
  return FileIcon;
}

function getCategoryIcon(category: MediaCategory) {
  switch (category) {
    case 'image': return FileImage;
    case 'video': return FileVideo;
    case 'audio': return FileAudio;
    default: return FileIcon;
  }
}

const FRIENDLY_TYPE: Record<MediaCategory, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
};

function useObjectUrls(files: File[]): (string | null)[] {
  const urlsRef = useRef<Map<File, string>>(new Map());
  return useMemo(() => {
    const next = new Map<File, string>();
    const out: (string | null)[] = files.map((f) => {
      const cat = categorizeFile(f);
      if (cat === 'document') return null;
      const existing = urlsRef.current.get(f);
      if (existing) {
        next.set(f, existing);
        return existing;
      }
      const u = URL.createObjectURL(f);
      next.set(f, u);
      return u;
    });
    // revoke removed
    urlsRef.current.forEach((url, f) => {
      if (!next.has(f)) URL.revokeObjectURL(url);
    });
    urlsRef.current = next;
    return out;
  }, [files]);
}

export default function FilePreviewDialog({
  files,
  sending,
  onConfirm,
  onCancel,
  onAddFiles,
  onRemove,
  onRename,
}: FilePreviewDialogProps) {
  const open = files.length > 0;
  const [activeIndex, setActiveIndex] = useState(0);
  const [captions, setCaptions] = useState<Record<string, string>>({});
  const [groupHeader, setGroupHeader] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);
  const previews = useObjectUrls(files);
  const isGroup = files.length > 1;

  // clamp active index when list shrinks
  useEffect(() => {
    if (activeIndex >= files.length) setActiveIndex(Math.max(0, files.length - 1));
  }, [files.length, activeIndex]);

  // reset captions when dialog closes
  useEffect(() => {
    if (!open) {
      setCaptions({});
      setGroupHeader('');
      setActiveIndex(0);
      setRenaming(false);
      setRenameValue('');
    }
  }, [open]);

  // cancela edição de nome ao trocar de arquivo
  useEffect(() => {
    setRenaming(false);
    setRenameValue('');
  }, [activeIndex]);

  // revoke all on unmount
  useEffect(() => () => { /* handled inside hook */ }, []);

  if (!open) return null;
  const file = files[activeIndex];
  if (!file) return null;
  const category = categorizeFile(file);
  const supportsCaption = category === 'image' || category === 'video';
  const DocIcon = category === 'document' ? getDocumentIcon(file.type) : getCategoryIcon(category);
  const previewUrl = previews[activeIndex];
  const captionKey = `${file.name}-${file.size}-${activeIndex}`;
  const caption = captions[captionKey] || '';

  const setCaption = (v: string) =>
    setCaptions((prev) => ({ ...prev, [captionKey]: v }));

  const handleConfirm = () => {
    const items = files.map((f, i) => {
      const cat = categorizeFile(f);
      const k = `${f.name}-${f.size}-${i}`;
      const c = (cat === 'image' || cat === 'video') ? (captions[k] || '').trim() : '';
      // Quando agrupado, prefixa cada legenda com a posição para separar claramente.
      const finalCaption = isGroup
        ? (c ? `${i + 1}/${files.length} • ${c}` : `${i + 1}/${files.length}`)
        : c;
      return { file: f, caption: finalCaption || undefined };
    });
    const header = isGroup ? groupHeader.trim() : '';
    onConfirm(items, header || undefined);
  };

  const handleAddClick = () => addInputRef.current?.click();
  const handleAddInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (addInputRef.current) addInputRef.current.value = '';
    if (list.length) onAddFiles(list);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onCancel(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isGroup
              ? `Enviar ${files.length} arquivos agrupados`
              : `Enviar ${FRIENDLY_TYPE[category].toLowerCase()}`}
          </DialogTitle>
          <DialogDescription className={isGroup ? 'text-xs text-muted-foreground' : 'sr-only'}>
            {isGroup
              ? 'Os arquivos serão enviados em sequência, mantendo a ordem abaixo. Cada item recebe um indicador "n/N" para separação clara.'
              : 'Pré-visualização dos arquivos selecionados antes do envio.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Preview principal */}
          <div className="rounded-md border border-border/60 bg-secondary/30 overflow-hidden flex items-center justify-center min-h-[220px] max-h-[360px]">
            {category === 'image' && previewUrl && (
              <img src={previewUrl} alt={file.name} className="max-h-[360px] w-auto object-contain" />
            )}
            {category === 'video' && previewUrl && (
              <video src={previewUrl} controls className="max-h-[360px] w-full" />
            )}
            {category === 'audio' && previewUrl && (
              <div className="w-full p-6 flex flex-col items-center gap-3">
                <FileAudio className="w-10 h-10 text-muted-foreground" aria-hidden="true" />
                <audio src={previewUrl} controls className="w-full" />
              </div>
            )}
            {category === 'document' && (
              <div className="w-full p-6 flex flex-col items-center gap-3 text-center">
                <DocIcon className="w-12 h-12 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  {file.type || 'Documento'}
                </p>
              </div>
            )}
          </div>

          {/* Metadados + ações (renomear / remover) */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {renaming && onRename ? (
              <>
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (renameValue.trim()) onRename(activeIndex, renameValue);
                      setRenaming(false);
                    } else if (e.key === 'Escape') {
                      setRenaming(false);
                    }
                  }}
                  maxLength={120}
                  className="h-7 text-xs bg-secondary/50 border-border/50"
                  placeholder="Nome do arquivo"
                  disabled={sending}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    if (renameValue.trim()) onRename(activeIndex, renameValue);
                    setRenaming(false);
                  }}
                  aria-label="Confirmar novo nome"
                  disabled={sending}
                >
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setRenaming(false)}
                  aria-label="Cancelar edição"
                  disabled={sending}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <>
                <span className="truncate font-medium text-foreground" title={file.name}>{file.name}</span>
                <span className="shrink-0 tabular-nums">{formatBytes(file.size)}</span>
                {onRename && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      setRenameValue(file.name);
                      setRenaming(true);
                    }}
                    aria-label="Renomear arquivo"
                    disabled={sending}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(activeIndex)}
                  aria-label="Remover anexo"
                  disabled={sending}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
          </div>

          {/* Legenda */}
          {supportsCaption && (
            <Input
              autoFocus
              placeholder="Adicionar uma legenda (opcional)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !sending) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              maxLength={1024}
              disabled={sending}
              className="bg-secondary/50 border-border/50"
            />
          )}

          {/* Cabeçalho do grupo (somente quando >1 arquivo) */}
          {isGroup && (
            <Input
              placeholder="Mensagem para introduzir o grupo (opcional)"
              value={groupHeader}
              onChange={(e) => setGroupHeader(e.target.value)}
              maxLength={1024}
              disabled={sending}
              className="bg-secondary/50 border-border/50"
            />
          )}

          {/* Tira de thumbnails */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {files.map((f, i) => {
              const cat = categorizeFile(f);
              const url = previews[i];
              const isActive = i === activeIndex;
              const Icon = cat === 'document' ? getDocumentIcon(f.type) : getCategoryIcon(cat);
              return (
                <div key={`${f.name}-${i}`} className="relative shrink-0 group">
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className={cn(
                      'relative w-16 h-16 rounded-md border overflow-hidden bg-secondary/40 flex items-center justify-center',
                      isActive ? 'border-primary ring-2 ring-primary/40' : 'border-border/60 hover:border-border',
                    )}
                    aria-label={`Selecionar ${f.name}`}
                  >
                    {cat === 'image' && url ? (
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    ) : cat === 'video' && url ? (
                      <video src={url} className="w-full h-full object-cover" muted />
                    ) : (
                      <Icon className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
                    )}
                    {isGroup && (
                      <span className="absolute bottom-0.5 left-0.5 px-1.5 py-0.5 text-[10px] font-semibold leading-none rounded bg-background/90 text-foreground border border-border/60 tabular-nums">
                        {i + 1}/{files.length}
                      </span>
                    )}
                  </button>
                  {!sending && (
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-background border border-border/80 flex items-center justify-center text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remover ${f.name}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
            {!sending && (
              <button
                type="button"
                onClick={handleAddClick}
                className="shrink-0 w-16 h-16 rounded-md border border-dashed border-border/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-border"
                aria-label="Adicionar mais arquivos"
              >
                <Plus className="w-5 h-5" />
              </button>
            )}
            <input
              ref={addInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleAddInput}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={sending}>
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar {files.length > 1 ? `(${files.length})` : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
