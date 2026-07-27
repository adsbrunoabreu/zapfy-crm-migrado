// Frontend tracking helper.
// - Maintains window.dataLayer
// - Generates unique event_id (deduped Pixel ↔ Meta CAPI)
// - Hashes PII (SHA-256) before pushing
// - Reads _fbp/_fbc cookies and gclid (persisted in cookie 90d)
// - Mirrors important conversions to backend tracking-dispatch
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    dataLayer: any[];
    fbq?: (...args: any[]) => void;
    gtag?: (...args: any[]) => void;
  }
}

function ensureDL() {
  if (typeof window === 'undefined') return;
  if (!window.dataLayer) window.dataLayer = [];
}

async function sha256(input: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return '';
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : undefined;
}

function setCookie(name: string, value: string, days = 90) {
  if (typeof document === 'undefined') return;
  const exp = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
}

export function captureMarketingParams() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const gclid = url.searchParams.get('gclid');
  if (gclid) setCookie('gclid', gclid);
  const fbclid = url.searchParams.get('fbclid');
  if (fbclid) {
    // build fbc value per Meta spec: fb.1.<timestamp>.<fbclid>
    const fbc = `fb.1.${Date.now()}.${fbclid}`;
    setCookie('_fbc', fbc);
  }
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID();
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface TrackContext {
  email?: string;
  phone?: string;
  user_id?: string;
  company_id?: string;
}

let ctx: TrackContext = {};
export function setTrackingContext(c: TrackContext) {
  ctx = { ...ctx, ...c };
}

export interface TrackPayload {
  value?: number;
  currency?: string;
  content_name?: string;
  content_type?: string;
  payment_type?: string;
  billing_cycle?: string;
  [k: string]: unknown;
}

const META_EVENT_MAP: Record<string, string> = {
  sign_up: 'CompleteRegistration',
  start_trial: 'StartTrial',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  view_item: 'ViewContent',
};

export async function trackEvent(eventName: string, payload: TrackPayload = {}) {
  ensureDL();
  if (typeof window === 'undefined') return;

  const event_id = uuid();
  const fbp = getCookie('_fbp');
  const fbc = getCookie('_fbc');
  const gclid = getCookie('gclid');

  const em = ctx.email ? await sha256(ctx.email) : undefined;
  const ph = ctx.phone ? await sha256(ctx.phone.replace(/\D/g, '')) : undefined;
  const external_id = ctx.user_id ? await sha256(ctx.user_id) : undefined;

  // dataLayer push (consumed by GTM, GA4 tags, etc.)
  window.dataLayer.push({
    event: eventName,
    event_id,
    user_data: { em, ph, external_id, fbp, fbc, gclid },
    ...payload,
  });

  // Meta Pixel (browser)
  const metaName = META_EVENT_MAP[eventName] || eventName;
  if (window.fbq) {
    try {
      window.fbq('track', metaName, payload, { eventID: event_id });
    } catch (e) { /* ignore */ }
  }

  // Google Ads gtag conversion (browser)
  if (window.gtag && eventName === 'purchase' && (window as any).__gAdsId && (window as any).__gAdsLabel) {
    try {
      window.gtag('event', 'conversion', {
        send_to: `${(window as any).__gAdsId}/${(window as any).__gAdsLabel}`,
        value: payload.value,
        currency: payload.currency || 'BRL',
        transaction_id: event_id,
      });
    } catch (e) { /* ignore */ }
  }

  // Mirror to server-side (CAPI + Google Ads enhanced)
  // For "purchase", server is the source of truth (fired by webhook); browser still sends with same event_id for dedup.
  try {
    await supabase.functions.invoke('tracking-dispatch', {
      body: {
        event_name: metaName,
        event_id,
        user_id: ctx.user_id || null,
        company_id: ctx.company_id || null,
        value: payload.value,
        currency: payload.currency || 'BRL',
        user_data: {
          email: ctx.email,
          phone: ctx.phone,
          external_id: ctx.user_id,
          fbp, fbc, gclid,
          user_agent: navigator.userAgent,
        },
        custom_data: payload,
        source: 'client',
        action_source: 'website',
        event_source_url: window.location.href,
      },
    });
  } catch (e) {
    // silent
  }
}

export function trackPageView() {
  ensureDL();
  if (typeof window === 'undefined') return;
  window.dataLayer.push({ event: 'page_view', page_path: window.location.pathname, page_location: window.location.href, page_title: document.title });
  if (window.fbq) try { window.fbq('track', 'PageView'); } catch {}
}
