import { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  children: ReactNode;
  otherLink: { to: string; label: string };
}

export function LegalLayout({ title, description, children, otherLink }: Props) {
  useEffect(() => {
    document.title = `${title} — Zapfy`;
    const ensureMeta = (name: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
    };
    ensureMeta('description', description);

    const url = window.location.origin + window.location.pathname;
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    const ensureOg = (property: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    ensureOg('og:title', `${title} — Zapfy`);
    ensureOg('og:description', description);
    ensureOg('og:url', url);
    ensureOg('og:type', 'article');
  }, [title, description]);

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground fill-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-display text-lg font-bold lowercase">zapfy</span>
          </Link>
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao início
          </Link>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        <article className="max-w-3xl mx-auto px-6 py-12 md:py-16">
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">{title}</h1>
          <p className="text-sm text-muted-foreground mb-10">
            Atualizado em 11 de maio de 2026 — Contagem/MG
          </p>

          <div className="space-y-8 text-sm md:text-base leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-xl [&_h2]:md:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-2 [&_ul]:my-4 [&_li]:text-foreground/90 [&_strong]:text-foreground [&_a]:text-primary [&_a:hover]:underline">
            {children}
          </div>

          <div className="mt-16 pt-8 border-t border-border/60 flex items-center justify-between text-sm">
            <Link to={otherLink.to} className="text-primary hover:underline">
              {otherLink.label} →
            </Link>
            <a href="mailto:suporte@zapfy.com.br" className="text-muted-foreground hover:text-foreground">
              suporte@zapfy.com.br
            </a>
          </div>
        </article>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Zapfy. Todos os direitos reservados.</span>
          <div className="flex gap-4">
            <Link to="/termos" className="hover:text-foreground">Termos de uso</Link>
            <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link to="/exclusao-de-dados" className="hover:text-foreground">Exclusão de dados</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
