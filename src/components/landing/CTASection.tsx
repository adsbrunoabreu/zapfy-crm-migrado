import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, MessageCircle } from 'lucide-react';

export function CTASection() {
  const navigate = useNavigate();

  return (
    <section className="py-20 md:py-28">
      <div className="max-w-5xl mx-auto px-6">
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card/80 to-card p-10 md:p-16 text-center">
          <div className="absolute inset-0 -z-10 opacity-30">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/30 blur-3xl rounded-full" />
          </div>

          <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight">
            Pronto pra organizar seu atendimento no WhatsApp?
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-xl mx-auto">
            Conecta o Zap, convida sua equipe e em 5 minutos todo mundo está atendendo
            no mesmo número, com pipeline e métricas. Sem cartão. Sem enrolação.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              size="lg"
              variant="glow"
              onClick={() => navigate('/auth')}
              className="h-12 px-7 gap-2 text-base"
            >
              Começar grátis no Zap <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => (window.location.href = 'mailto:vendas@zapfy.com.br')}
              className="h-12 px-7 gap-2 text-base"
            >
              <MessageCircle className="w-4 h-4" />
              Falar com vendas
            </Button>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Sem cartão · Sem fidelidade · Cancele quando quiser
          </p>
        </div>
      </div>
    </section>
  );
}
