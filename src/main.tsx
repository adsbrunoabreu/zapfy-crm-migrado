import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installGlobalErrorHandlers } from "@/lib/clientTelemetry";

installGlobalErrorHandlers();

/**
 * Recuperação automática de chunk obsoleto após deploy (Failed to fetch
 * dynamically imported module / Loading chunk N failed).
 *
 * Gate baseado em timestamp + contador em localStorage para evitar loop
 * de reloads quando a rede está instável:
 *  - máximo 2 reloads automáticos por janela de 10 minutos
 *  - se exceder, mostra a tela de erro com botão manual em vez de recarregar
 */
const CHUNK_RELOAD_AT = "__zapfy_chunk_reload_at";
const CHUNK_RELOAD_COUNT = "__zapfy_chunk_reload_count";
const RELOAD_WINDOW_MS = 10 * 60 * 1000;
const MAX_RELOADS = 2;

const isChunkLoadError = (msg?: string) =>
  !!msg && /(Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed)/i.test(msg);

const readNum = (key: string): number => {
  try {
    const v = localStorage.getItem(key);
    return v ? Number(v) || 0 : 0;
  } catch {
    return 0;
  }
};

const writeNum = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage indisponível: segue sem persistir */
  }
};

const tryReloadOnce = (msg?: string) => {
  if (!isChunkLoadError(msg)) return;

  const now = Date.now();
  const lastAt = readNum(CHUNK_RELOAD_AT);
  let count = readNum(CHUNK_RELOAD_COUNT);

  // Janela expirou → zera contador
  if (!lastAt || now - lastAt > RELOAD_WINDOW_MS) {
    count = 0;
  }

  if (count >= MAX_RELOADS) {
    // Atingiu o teto — não recarrega mais sozinho; entrega controle ao usuário
    (window as any).__zapfyShowBootError?.(
      "Falha ao baixar arquivos do aplicativo. Atualize a página manualmente.",
    );
    return;
  }

  writeNum(CHUNK_RELOAD_AT, now);
  writeNum(CHUNK_RELOAD_COUNT, count + 1);
  window.location.reload();
};

window.addEventListener("error", (e) => tryReloadOnce(e.message));
window.addEventListener("unhandledrejection", (e) => {
  const msg = (e.reason && (e.reason.message || String(e.reason))) || "";
  tryReloadOnce(msg);
});

// Após 10 min sem erro, limpa o contador (janela rolante)
window.addEventListener("load", () => {
  setTimeout(() => {
    const lastAt = readNum(CHUNK_RELOAD_AT);
    if (lastAt && Date.now() - lastAt > RELOAD_WINDOW_MS) {
      try {
        localStorage.removeItem(CHUNK_RELOAD_AT);
        localStorage.removeItem(CHUNK_RELOAD_COUNT);
      } catch {
        /* ignore */
      }
    }
  }, 2000);
});

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Elemento raiz não encontrado");
  createRoot(rootEl).render(<App />);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  (window as any).__zapfyShowBootError?.(message);
  throw error;
}
