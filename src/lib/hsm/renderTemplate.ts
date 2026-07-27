import { supabase } from '@/integrations/supabase/client';

export type HsmHeader =
  | { format: 'text'; text: string }
  | { format: 'image' | 'video' | 'document'; url?: string | null; media_id?: string | null; file_name?: string | null };

export interface HsmButton {
  type: string; // quick_reply | url | phone_number | copy_code | cta_url
  display_text: string;
  url?: string | null;
  phone_number?: string | null;
  example?: string | null;
  id?: string | null;
}

export interface HsmRendered {
  header: HsmHeader | null;
  body: string | null;
  footer: string | null;
  buttons: HsmButton[];
  variables: string[];
}

/** Substitui placeholders {{1}}, {{2}}... por valores. */
export function applyVariables(text: string | null | undefined, vars: string[]): string | null {
  if (!text) return text ?? null;
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, idx) => {
    const i = parseInt(idx, 10) - 1;
    return vars[i] ?? `{{${idx}}}`;
  });
}

/** Extrai parâmetros (string) por componente do payload Cloud API. */
export function extractParams(components: Array<Record<string, unknown>> | undefined, type: 'header' | 'body'): string[] {
  if (!Array.isArray(components)) return [];
  const c = components.find((x) => String(x.type ?? '').toLowerCase() === type);
  const params = (c?.parameters as Array<Record<string, unknown>> | undefined) ?? [];
  return params.map((p) => {
    if (typeof p.text === 'string') return p.text;
    if (p.image && typeof (p.image as any).link === 'string') return (p.image as any).link;
    if (p.video && typeof (p.video as any).link === 'string') return (p.video as any).link;
    if (p.document && typeof (p.document as any).link === 'string') return (p.document as any).link;
    return '';
  });
}

/** Renderiza um template HSM cadastrado em whatsapp_hsm_templates. */
export async function renderHsmTemplate(
  companyId: string,
  templateName: string,
  language?: string | null,
  components?: Array<Record<string, unknown>>,
): Promise<HsmRendered> {
  let q = supabase
    .from('whatsapp_hsm_templates')
    .select('components, language')
    .eq('company_id', companyId)
    .eq('name', templateName)
    .limit(1);
  if (language) q = q.eq('language', language);
  const { data } = await q.maybeSingle();

  const tplComponents = (data?.components ?? []) as Array<Record<string, unknown>>;
  const bodyVars = extractParams(components, 'body');
  const headerVars = extractParams(components, 'header');

  let header: HsmHeader | null = null;
  let body: string | null = null;
  let footer: string | null = null;
  const buttons: HsmButton[] = [];

  for (const comp of tplComponents) {
    const t = String(comp.type ?? '').toUpperCase();
    if (t === 'HEADER') {
      const fmt = String(comp.format ?? 'TEXT').toLowerCase();
      if (fmt === 'text') {
        const text = applyVariables(String(comp.text ?? ''), headerVars) ?? '';
        if (text) header = { format: 'text', text };
      } else if (fmt === 'image' || fmt === 'video' || fmt === 'document') {
        const url = headerVars[0] || null;
        header = { format: fmt as any, url };
      }
    } else if (t === 'BODY') {
      body = applyVariables(String(comp.text ?? ''), bodyVars);
    } else if (t === 'FOOTER') {
      footer = String(comp.text ?? '') || null;
    } else if (t === 'BUTTONS') {
      const btns = (comp.buttons as Array<Record<string, unknown>>) ?? [];
      for (const b of btns) {
        const bt = String(b.type ?? '').toLowerCase();
        buttons.push({
          type: bt === 'url' ? 'cta_url' : bt,
          display_text: String(b.text ?? ''),
          url: typeof b.url === 'string' ? (b.url as string) : null,
          phone_number: typeof b.phone_number === 'string' ? (b.phone_number as string) : null,
          example: Array.isArray((b as any).example) ? String((b as any).example[0] ?? '') : null,
        });
      }
    }
  }

  return { header, body, footer, buttons, variables: bodyVars };
}

export function mediaTypeFromHeader(h: HsmHeader | null): { messageType: string; mediaUrl: string | null } {
  if (!h || h.format === 'text') return { messageType: 'interactive', mediaUrl: null };
  return { messageType: h.format, mediaUrl: h.url ?? null };
}
