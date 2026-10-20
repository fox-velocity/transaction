import React, { Component, ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-slate-50 text-slate-900">
          <div className="flex flex-col items-center w-full max-w-xl p-8 bg-white rounded-2xl shadow-xl border border-slate-200">
            <AlertTriangle size={48} className="text-amber-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Une erreur inattendue est survenue</h2>
            <p className="text-sm text-slate-600 mb-6 text-center">
              Une anomalie d’affichage a été interceptée. Vous pouvez recharger la page ou réinitialiser les données locales.
            </p>
            {this.state.error && (
              <div className="p-4 w-full rounded-lg bg-slate-100 overflow-auto mb-6 max-h-40 border border-slate-200">
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono">
                  {this.state.error.message}
                </pre>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors shadow-sm"
              >
                <RotateCcw size={15} />
                Recharger la page
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-300 transition-colors"
              >
                Réinitialiser le cache
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
