import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  /** Identificador da rota para resetar o boundary quando ela mudar */
  routeKey?: string;
}

/**
 * Captura erros de render dentro de uma rota para que a tela não fique
 * totalmente em branco. Um clique em "Tentar novamente" reseta o estado
 * e força um remount do conteúdo.
 */
export class RouteErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[RouteErrorBoundary] caught error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4 border border-border rounded-xl p-6 bg-secondary/30">
            <div className="w-12 h-12 mx-auto rounded-xl bg-destructive/15 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Algo deu errado ao carregar esta tela
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tente novamente. Se o problema persistir, recarregue a página.
              </p>
              {this.state.error?.message && (
                <p className="text-xs text-muted-foreground/80 mt-3 break-words">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={this.handleRetry}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
              <Button onClick={() => window.location.reload()}>
                Recarregar página
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
