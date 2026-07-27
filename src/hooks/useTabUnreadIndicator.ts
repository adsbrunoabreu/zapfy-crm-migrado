import { useEffect, useRef } from 'react';

/**
 * Reflects unread message count in the browser tab title
 * and draws a red dot overlay on the favicon. Restores the
 * original title/favicon when count goes back to zero.
 */
export function useTabUnreadIndicator(unreadCount: number) {
  const originalTitleRef = useRef<string | null>(null);
  const originalFaviconRef = useRef<string | null>(null);

  useEffect(() => {
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title.replace(/^\(\d+\)\s*/, '');
    }
    const base = originalTitleRef.current;
    document.title = unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}` : base;
  }, [unreadCount]);

  useEffect(() => {
    const link =
      (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ||
      (document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement | null);
    if (!link) return;

    if (originalFaviconRef.current === null) {
      originalFaviconRef.current = link.href;
    }

    if (unreadCount <= 0) {
      link.href = originalFaviconRef.current!;
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      // red badge dot
      const r = size * 0.28;
      const cx = size - r - 2;
      const cy = r + 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
      try {
        link.href = canvas.toDataURL('image/png');
      } catch {
        // ignore tainted canvas
      }
    };
    img.src = originalFaviconRef.current!;
  }, [unreadCount]);

  useEffect(() => {
    return () => {
      if (originalTitleRef.current) document.title = originalTitleRef.current;
      const link =
        (document.querySelector("link[rel='icon']") as HTMLLinkElement | null) ||
        (document.querySelector("link[rel='shortcut icon']") as HTMLLinkElement | null);
      if (link && originalFaviconRef.current) link.href = originalFaviconRef.current;
    };
  }, []);
}
