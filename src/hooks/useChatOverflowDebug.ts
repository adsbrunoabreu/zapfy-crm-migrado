import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Modo debug para detectar overflow horizontal no chat.
 *
 * Ativação:
 *   - localStorage.setItem('chatOverflowDebug', '1')
 *   - ou querystring ?debugOverflow=1
 *
 * O hook:
 *   - Observa o container via ResizeObserver + MutationObserver
 *   - Varre descendentes procurando elementos com scrollWidth > clientWidth
 *     ou cuja borda direita estoura o container
 *   - Destaca os culpados com outline vermelho
 *   - Loga no console (agrupado) com data-message-id da bolha pai
 *   - Expõe um overlay flutuante com a contagem e a lista de mensagens
 */

interface OverflowReport {
  containerWidth: number;
  containerScrollWidth: number;
  offenders: Array<{
    messageId: string | null;
    tag: string;
    classes: string;
    width: number;
    scrollWidth: number;
    overflowBy: number;
    text: string;
  }>;
}

const HIGHLIGHT_ATTR = 'data-chat-overflow-offender';

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('chatOverflowDebug') === '1') return true;
    const params = new URLSearchParams(window.location.search);
    if (params.get('debugOverflow') === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

function findMessageId(el: Element | null): string | null {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    const id = cur.getAttribute?.('data-message-id');
    if (id) return id;
    cur = cur.parentElement;
  }
  return null;
}

export function useChatOverflowDebug(containerRef: RefObject<HTMLElement>) {
  const [enabled, setEnabled] = useState<boolean>(() => isDebugEnabled());
  const [report, setReport] = useState<OverflowReport | null>(null);
  const rafRef = useRef<number | null>(null);

  // Permite alternar pelo console: window.toggleChatOverflowDebug()
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as unknown as { toggleChatOverflowDebug?: () => boolean }).toggleChatOverflowDebug = () => {
      const next = !isDebugEnabled();
      try {
        window.localStorage.setItem('chatOverflowDebug', next ? '1' : '0');
      } catch {
        // ignore
      }
      setEnabled(next);
      // eslint-disable-next-line no-console
      console.info(`[chat-overflow] debug ${next ? 'ATIVADO' : 'desativado'}`);
      return next;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setReport(null);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const clearHighlights = () => {
      container.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((el) => {
        (el as HTMLElement).style.outline = '';
        (el as HTMLElement).style.outlineOffset = '';
        el.removeAttribute(HIGHLIGHT_ATTR);
      });
    };

    const scan = () => {
      rafRef.current = null;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = container.clientWidth;
      const rightEdge = containerRect.right;
      const offenders: OverflowReport['offenders'] = [];

      clearHighlights();

      const all = container.querySelectorAll<HTMLElement>('*');
      all.forEach((el) => {
        // Ignora o próprio overlay e elementos de scroll virtual
        if (el.hasAttribute('data-chat-overflow-overlay')) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) return;
        const scrolls = el.scrollWidth - el.clientWidth > 1;
        const escapesRight = rect.right - rightEdge > 1;
        if (!scrolls && !escapesRight) return;

        // Apenas reporta o "topo" do problema (evita poluir com filhos do mesmo nó)
        if (el.parentElement && offenders.some((o) => o.messageId && o.messageId === findMessageId(el) && el.parentElement?.hasAttribute(HIGHLIGHT_ATTR))) {
          return;
        }

        el.setAttribute(HIGHLIGHT_ATTR, '1');
        el.style.outline = '2px dashed hsl(0 90% 60%)';
        el.style.outlineOffset = '-2px';

        offenders.push({
          messageId: findMessageId(el),
          tag: el.tagName.toLowerCase(),
          classes: (el.className || '').toString().slice(0, 120),
          width: Math.round(rect.width),
          scrollWidth: el.scrollWidth,
          overflowBy: Math.round(Math.max(el.scrollWidth - el.clientWidth, rect.right - rightEdge)),
          text: (el.textContent || '').trim().slice(0, 60),
        });
      });

      const next: OverflowReport = {
        containerWidth,
        containerScrollWidth: container.scrollWidth,
        offenders,
      };
      setReport(next);

      if (offenders.length > 0) {
        // eslint-disable-next-line no-console
        console.groupCollapsed(
          `%c[chat-overflow] ${offenders.length} elemento(s) causando scroll lateral`,
          'color:#fff;background:#dc2626;padding:2px 6px;border-radius:3px;',
        );
        // eslint-disable-next-line no-console
        console.table(offenders);
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    };

    const schedule = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(scan);
    };

    schedule();

    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    container.querySelectorAll('img,video,iframe').forEach((el) => ro.observe(el as Element));

    const mo = new MutationObserver(schedule);
    mo.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });

    const onResize = () => schedule();
    window.addEventListener('resize', onResize);

    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', onResize);
      clearHighlights();
    };
  }, [enabled, containerRef]);

  return { enabled, report, setEnabled };
}
