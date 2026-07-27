import { Zap, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

const cols = [
  {
    title: 'Produto',
    links: [
      { label: 'Recursos', href: '#features' },
      { label: 'Como funciona', href: '#how-it-works' },
      { label: 'Planos', href: '#pricing' },
      { label: 'Depoimentos', href: '#testimonials' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Sobre', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contato', href: 'mailto:contato@zapfy.com.br' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Termos de uso', href: '/termos' },
      { label: 'Privacidade', href: '/privacidade' },
      { label: 'LGPD', href: '/privacidade' },
    ],
  },
  {
    title: 'Suporte',
    links: [
      { label: 'Central de ajuda', href: '#' },
      { label: 'FAQ', href: '#faq' },
      { label: 'WhatsApp', href: '#' },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-border/40 bg-background">
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-10">
          <div className="col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                <Zap className="w-4.5 h-4.5 text-primary-foreground fill-primary-foreground" strokeWidth={2.5} />
              </div>
              <span className="font-display text-xl font-bold lowercase">zapfy</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              O CRM que mora no seu WhatsApp. Centraliza, qualifica e fecha — sem você
              precisar ficar grudado no celular.
            </p>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-sm font-semibold mb-4">{c.title}</h4>
              <ul className="space-y-2.5">
                {c.links.map((l) => {
                  const isInternal = l.href.startsWith('/');
                  return (
                    <li key={l.label}>
                      {isInternal ? (
                        <Link
                          to={l.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {l.label}
                        </Link>
                      ) : (
                        <a
                          href={l.href}
                          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {l.label}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Zapfy. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            Feito com <Heart className="w-3 h-3 text-red-500 fill-red-500" /> no Brasil
          </p>
        </div>
      </div>
    </footer>
  );
}
