import { useMemo } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Image as ImageIcon, Video as VideoIcon, FileText, Music, Variable } from 'lucide-react';
import { renderWithLead, detectMissingVariables, type LeadForTemplate } from '@/components/templates/renderTemplateWithLead';
import { TEMPLATE_VARIABLES } from '@/components/templates/templateVariables';

interface Props {
  body: string;
  lead: LeadForTemplate | null;
  mediaUrl?: string | null;
  mediaMimetype?: string | null;
  mediaFilename?: string | null;
  /** Optional ISO datetime to display under the bubble */
  scheduledFor?: string | null;
  /** When true, render with example placeholder values (used when no lead picked yet) */
  fallbackToExamples?: boolean;
  className?: string;
}

const KNOWN_KEYS = new Set(TEMPLATE_VARIABLES.map((v) => v.key));

/**
 * Preview message bubble that mimics WhatsApp rendering, plus inline validation
 * (unknown variables, missing lead data, character count, formatting).
 */
export function WhatsAppPreview({
  body,
  lead,
  mediaUrl,
  mediaMimetype,
  mediaFilename,
  scheduledFor,
  fallbackToExamples = false,
  className,
}: Props) {
  const rendered = useMemo(() => {
    if (lead) return renderWithLead(body, lead);
    if (fallbackToExamples) {
      // Replace with example values from TEMPLATE_VARIABLES
      let out = body || '';
      for (const v of TEMPLATE_VARIABLES) {
        out = out.split(`{{${v.key}}}`).join(v.example);
      }
      return out;
    }
    return body;
  }, [body, lead, fallbackToExamples]);

  // ===== validation =====
  const usedVars = useMemo(() => {
    return Array.from(new Set((body.match(/\{\{([a-z_]+)\}\}/g) || []).map((m) => m.slice(2, -2))));
  }, [body]);

  const unknownVars = usedVars.filter((v) => !KNOWN_KEYS.has(v));
  const missingData = lead ? detectMissingVariables(body, lead) : [];
  const unrenderedTags = (rendered.match(/\{\{([a-z_]+)\}\}/g) || []);

  const charCount = rendered.length;
  const isLong = charCount > 1024;

  const formattedRendered = useMemo(() => formatWhatsAppText(rendered), [rendered]);

  const mediaKind = guessMediaKind(mediaMimetype);

  return (
    <div className={className}>
      {/* WhatsApp-style chat backdrop */}
      <div
        className="rounded-lg p-4 min-h-[220px] relative overflow-hidden"
        style={{
          backgroundColor: '#0b141a',
          backgroundImage:
            'radial-gradient(circle at 20% 10%, rgba(255,255,255,0.02) 0, transparent 40%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.02) 0, transparent 40%)',
        }}
      >
        <div className="flex justify-end">
          <div
            className="relative max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm"
            style={{ backgroundColor: '#005c4b', color: '#e9edef' }}
          >
            {/* tail */}
            <span
              className="absolute -right-1 top-0 h-3 w-3"
              style={{
                backgroundColor: '#005c4b',
                clipPath: 'polygon(0 0, 100% 0, 0 100%)',
              }}
            />

            {mediaUrl && mediaKind === 'image' && (
              <img src={mediaUrl} alt="" className="rounded mb-1 max-h-56 w-auto" />
            )}
            {mediaUrl && mediaKind === 'video' && (
              <video src={mediaUrl} controls className="rounded mb-1 max-h-56 w-auto" />
            )}
            {mediaUrl && mediaKind === 'audio' && (
              <div className="flex items-center gap-2 mb-1 text-xs opacity-90">
                <Music className="h-3.5 w-3.5" /> Áudio
              </div>
            )}
            {mediaUrl && mediaKind === 'document' && (
              <div className="flex items-center gap-2 mb-1 px-2 py-1 rounded bg-foreground/10 text-xs">
                <FileText className="h-3.5 w-3.5" /> {mediaFilename || 'Documento'}
              </div>
            )}

            {rendered ? (
              <div
                className="whitespace-pre-wrap break-words leading-snug"
                dangerouslySetInnerHTML={{ __html: formattedRendered }}
              />
            ) : (
              <div className="opacity-60 italic">Sem conteúdo…</div>
            )}

            <div className="text-[10px] mt-1 text-right opacity-70">
              {scheduledFor ? format(new Date(scheduledFor), 'dd/MM HH:mm') : format(new Date(), 'HH:mm')}{' '}
              <span className="ml-0.5">✓✓</span>
            </div>
          </div>
        </div>

        {/* tiny header label */}
        <div className="absolute top-1 left-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Pré-visualização WhatsApp
        </div>
      </div>

      {/* Validation panel */}
      <div className="mt-3 space-y-1.5 text-xs">
        <ValidationRow
          ok={unknownVars.length === 0}
          okLabel="Todas as variáveis usadas existem"
          errorLabel={`Variáveis desconhecidas: ${unknownVars.map((v) => `{{${v}}}`).join(', ')}`}
          icon={Variable}
        />
        <ValidationRow
          ok={unrenderedTags.length === 0}
          okLabel="Nenhuma variável ficou sem substituição"
          errorLabel={`Não substituídas no envio: ${Array.from(new Set(unrenderedTags)).join(', ')}`}
          icon={AlertTriangle}
        />
        {lead && (
          <ValidationRow
            ok={missingData.length === 0}
            okLabel={`Dados do lead "${lead.name}" cobrem todas as variáveis`}
            errorLabel={`Lead sem dado para: ${missingData.map((m) => `{{${m}}}`).join(', ')}`}
            icon={AlertTriangle}
          />
        )}
        <ValidationRow
          ok={!isLong}
          okLabel={`${charCount} caracteres`}
          errorLabel={`${charCount} caracteres — mensagens muito longas podem ser cortadas no WhatsApp`}
          icon={FileText}
        />
        {mediaUrl && (
          <ValidationRow
            ok
            okLabel={`Mídia anexada: ${mediaFilename || mediaKind}`}
            errorLabel=""
            icon={mediaIcon(mediaKind)}
          />
        )}
      </div>
    </div>
  );
}

function ValidationRow({
  ok,
  okLabel,
  errorLabel,
  icon: Icon,
}: {
  ok: boolean;
  okLabel: string;
  errorLabel: string;
  icon: React.ElementType;
}) {
  return (
    <div className={`flex items-start gap-2 ${ok ? 'text-muted-foreground' : 'text-amber'}`}>
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 mt-px shrink-0 text-emerald" />
      ) : (
        <Icon className="h-3.5 w-3.5 mt-px shrink-0" />
      )}
      <span>{ok ? okLabel : errorLabel}</span>
    </div>
  );
}

function guessMediaKind(mime: string | null | undefined): 'image' | 'video' | 'audio' | 'document' | null {
  if (!mime) return null;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function mediaIcon(k: ReturnType<typeof guessMediaKind>) {
  if (k === 'image') return ImageIcon;
  if (k === 'video') return VideoIcon;
  if (k === 'audio') return Music;
  return FileText;
}

/**
 * Convert WhatsApp-style markup to safe HTML:
 *   *bold*  _italic_  ~strike~  ```mono```
 * Escapes HTML first to avoid injection.
 */
function formatWhatsAppText(text: string): string {
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/```([\s\S]+?)```/g, '<code style="background:rgba(0,0,0,0.25);padding:1px 4px;border-radius:3px;">$1</code>')
    .replace(/(^|[\s(])\*([^\s*][^*]*[^\s*]|\S)\*(?=[\s),.!?]|$)/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_([^\s_][^_]*[^\s_]|\S)_(?=[\s),.!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])~([^\s~][^~]*[^\s~]|\S)~(?=[\s),.!?]|$)/g, '$1<s>$2</s>');
}
