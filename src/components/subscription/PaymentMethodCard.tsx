import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreditCard, QrCode, Pencil } from 'lucide-react';

interface Props {
  paymentMethod?: string | null;
  cardLast4?: string | null;
  cardBrand?: string | null;
  onChange: () => void;
}

export function PaymentMethodCard({ paymentMethod, cardLast4, cardBrand, onChange }: Props) {
  const hasMethod = !!paymentMethod;
  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-medium">Forma de pagamento</CardTitle>
        <Button variant="outline" size="sm" onClick={onChange}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> {hasMethod ? 'Alterar' : 'Adicionar'}
        </Button>
      </CardHeader>
      <CardContent>
        {!hasMethod ? (
          <div className="text-sm text-muted-foreground">
            Nenhum método de pagamento cadastrado. Configure para iniciar a cobrança automática.
          </div>
        ) : paymentMethod === 'CREDIT_CARD' ? (
          <div className="flex items-center gap-3">
            <div className="h-10 w-14 rounded bg-gradient-to-br from-muted to-card border border-border flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">{cardBrand || 'Cartão'} •••• {cardLast4 || '----'}</div>
              <div className="text-xs text-muted-foreground">Cobrança recorrente automática</div>
            </div>
            <Badge variant="outline" className="ml-auto text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)]">Ativo</Badge>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-10 w-14 rounded bg-[hsl(var(--emerald)/0.10)] border border-[hsl(var(--emerald)/0.30)] flex items-center justify-center">
              <QrCode className="h-5 w-5 text-[hsl(var(--emerald))]" />
            </div>
            <div>
              <div className="text-sm font-medium">Pix</div>
              <div className="text-xs text-muted-foreground">QR gerado a cada vencimento</div>
            </div>
            <Badge variant="outline" className="ml-auto text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)]">Ativo</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
