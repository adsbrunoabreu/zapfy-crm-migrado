// AES-256-GCM symmetric encryption for storing third-party API tokens at rest.
// Key is provided via env STORE_CRED_ENC_KEY (base64-encoded, 32 bytes).
// Output format: { v: 1, iv: <b64>, ct: <b64> } (ct includes auth tag appended by WebCrypto)

const VERSION = 1;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedKey: CryptoKey | null = null;
async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const raw = Deno.env.get('STORE_CRED_ENC_KEY');
  if (!raw) throw new Error('STORE_CRED_ENC_KEY env var not configured');
  const keyBytes = b64decode(raw.trim());
  if (keyBytes.length !== 32) {
    throw new Error(`STORE_CRED_ENC_KEY must decode to 32 bytes (got ${keyBytes.length})`);
  }
  cachedKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return cachedKey;
}

export interface EncryptedBlob { v: number; iv: string; ct: string }

export async function encryptString(plain: string): Promise<EncryptedBlob> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain));
  return { v: VERSION, iv: b64encode(iv), ct: b64encode(ct) };
}

export async function decryptString(blob: EncryptedBlob): Promise<string> {
  const key = await getKey();
  const iv = b64decode(blob.iv);
  const ct = b64decode(blob.ct);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

/** Detect ciphertext blobs vs legacy plaintext credentials. */
export function isEncryptedBlob(v: unknown): v is EncryptedBlob {
  return !!v && typeof v === 'object' && 'iv' in (v as object) && 'ct' in (v as object);
}

/** Decrypt an admin_token from a stored credentials object, supporting legacy plaintext. */
export async function readAdminToken(credentials: Record<string, unknown>): Promise<string> {
  const enc = credentials?.admin_token_enc;
  if (isEncryptedBlob(enc)) return await decryptString(enc);
  const legacy = credentials?.admin_token;
  if (typeof legacy === 'string' && legacy.length > 0) return legacy;
  throw new Error('No admin token stored');
}

/** Build the credentials JSON to persist (encrypted only — never plaintext). */
export async function buildCredentials(adminToken: string): Promise<Record<string, unknown>> {
  const blob = await encryptString(adminToken);
  return { admin_token_enc: blob };
}

export function tokenLast4(token: string): string {
  const t = token.trim();
  return t.length <= 4 ? t : t.slice(-4);
}
