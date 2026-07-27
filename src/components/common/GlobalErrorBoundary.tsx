import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { logClientEvent } from '@/lib/clientTelemetry';

interface State { hasError: boolean; error: Error | null }

/**
 * Boundary global no topo da árvore. Captura crashes que escaparam dos
 * RouteErrorBoundary internos e reporta para system_logs.
 */
export class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary]', error, info?.componentStack);
    void logClientEvent({
      event: 'react.error_boundary',
      message: error.message || 'render crash',
      metadata: {
        stack: error.stack?.slice(0, 2000),
        component_stack: info?.componentStack?.slice(0, 2000),
      },
    });
  }

  handleReset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <div className="max-w-md w-full text-center space-y-4 border border-border rounded-xl p-6 bg-secondary/30">
          <div className="w-12 h-12 mx-auto rounded-xl bg-destructive/15 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Algo deu errado</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Já registramos esse erro. Tente recarregar a página.
            </p>
            {this.state.error?.message && (
              <p className="text-xs text-muted-foreground/80 mt-3 break-words">
                {this.state.error.message}
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={this.handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
            </Button>
            <Button onClick={() => window.location.reload()}>Recarregar</Button>
          </div>
        </div>
      </div>
    );
  }
}
