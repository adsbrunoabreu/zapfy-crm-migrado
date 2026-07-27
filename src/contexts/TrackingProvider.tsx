import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import { captureMarketingParams, setTrackingContext, trackPageView } from '@/lib/tracking';

interface TrackingConfig {
  enabled: boolean;
  meta_pixel_id: string;
  gtm_id: string;
  google_ads_id: string;
  google_ads_conversion_label: string;
}

let injected = false;

function injectScripts(cfg: TrackingConfig) {
  if (injected || typeof document === 'undefined') return;
  injected = true;

  // GTM
  if (cfg.gtm_id) {
    const gtm = document.createElement('script');
    gtm.async = true;
    gtm.innerHTML = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${cfg.gtm_id}');`;
    document.head.appendChild(gtm);

    const noscript = document.createElement('noscript');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${cfg.gtm_id}`;
    iframe.height = '0'; iframe.width = '0'; iframe.style.display = 'none'; iframe.style.visibility = 'hidden';
    noscript.appendChild(iframe);
    document.body.prepend(noscript);
  }

  // Meta Pixel
  if (cfg.meta_pixel_id) {
    const px = document.createElement('script');
    px.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${cfg.meta_pixel_id}');fbq('track','PageView');`;
    document.head.appendChild(px);
  }

  // Google Ads (gtag) — only if no GTM (to avoid double-loading)
  if (cfg.google_ads_id && !cfg.gtm_id) {
    const gtag = document.createElement('script');
    gtag.async = true;
    gtag.src = `https://www.googletagmanager.com/gtag/js?id=${cfg.google_ads_id}`;
    document.head.appendChild(gtag);
    const init = document.createElement('script');
    init.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${cfg.google_ads_id}');`;
    document.head.appendChild(init);
    (window as any).gtag = (window as any).gtag || function () { (window as any).dataLayer.push(arguments); };
  }

  if (cfg.google_ads_id) {
    (window as any).__gAdsId = cfg.google_ads_id;
    (window as any).__gAdsLabel = cfg.google_ads_conversion_label;
  }
}

export function TrackingProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [cfg, setCfg] = useState<TrackingConfig | null>(null);

  useEffect(() => {
    captureMarketingParams();
    let cancel = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('tracking-config', { method: 'GET' });
        if (error || cancel) return;
        const c = data as TrackingConfig;
        if (c?.enabled) {
          setCfg(c);
          injectScripts(c);
        }
      } catch { /* silent */ }
    })();
    return () => { cancel = true; };
  }, []);

  // Update tracking context when user changes
  useEffect(() => {
    setTrackingContext({
      email: user?.email,
      user_id: user?.id,
      company_id: profile?.company_id || undefined,
    });
  }, [user?.email, user?.id, profile?.company_id]);

  // Page views on route changes
  useEffect(() => {
    if (cfg?.enabled) trackPageView();
  }, [location.pathname, cfg?.enabled]);

  return <>{children}</>;
}
