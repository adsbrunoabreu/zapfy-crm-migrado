import { invokeEvolutionProxy } from '@/services/evolutionProxy';

export async function callProxy(action: string, params: Record<string, unknown> = {}) {
  return invokeEvolutionProxy(action, params);
}

export function normalizeProxyPayload<T = Record<string, unknown>>(payload: unknown): T | null {
  if (payload == null) return null;
  if (typeof payload !== 'string') return payload as T;
  const trimmed = payload.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return normalizeProxyPayload<T>(parsed);
  } catch {
    return null;
  }
}

export function extractQrCode(payload: unknown): string | null {
  const normalized = normalizeProxyPayload<Record<string, any>>(payload);
  const qrValue =
    normalized?.qrcode?.base64 ||
    normalized?.base64 ||
    normalized?.qr?.base64 ||
    normalized?.code;
  if (typeof qrValue !== 'string') return null;
  const cleaned = qrValue.trim().replace(/\s/g, '');
  if (!cleaned) return null;
  return cleaned.startsWith('data:') ? cleaned : `data:image/png;base64,${cleaned}`;
}

export function isInstanceConnected(payload: unknown): boolean {
  const normalized = normalizeProxyPayload<Record<string, any>>(payload);
  return normalized?.state === 'open' || normalized?.instance?.state === 'open';
}

const PHONE_FIELDS = [
  'ownerJid', 'owner', 'wuid', 'remoteJid', 'jid',
  'number', 'phone', 'phoneNumber', 'msisdn', 'me', 'user',
];

function sanitizePhone(raw: unknown): string | null {
  if (raw == null) return null;
  const str = typeof raw === 'number' ? String(raw) : String(raw || '');
  if (!str) return null;
  const beforeAt = str.split('@')[0].split(':')[0];
  const digits = beforeAt.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function extractOwnerPhone(payload: unknown): string | null {
  const visit = (node: any, hinted: boolean): string | null => {
    if (node == null) return null;
    if (typeof node === 'string') {
      if (hinted) return sanitizePhone(node);
      if (node.includes('@')) return sanitizePhone(node);
      return null;
    }
    if (typeof node === 'number' && hinted) return sanitizePhone(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const f = visit(item, hinted);
        if (f) return f;
      }
      return null;
    }
    if (typeof node === 'object') {
      for (const key of PHONE_FIELDS) {
        if (key in node) {
          const f = visit((node as any)[key], true);
          if (f) return f;
        }
      }
      for (const [k, v] of Object.entries(node)) {
        if (PHONE_FIELDS.includes(k)) continue;
        const f = visit(v, false);
        if (f) return f;
      }
    }
    return null;
  };
  return visit(payload, false);
}

export function findInstanceInList(list: unknown, instanceName: string): unknown {
  const arr: any[] = Array.isArray(list) ? list : ((list as any)?.data || []);
  if (!Array.isArray(arr)) return null;
  return arr.find((it: any) =>
    (it?.name || it?.instance?.instanceName || it?.instanceName) === instanceName
  );
}

export function evolutionWebhookUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;
}
