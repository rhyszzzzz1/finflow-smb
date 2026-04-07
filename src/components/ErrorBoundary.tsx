import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-slate-100 text-slate-900">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <pre className="max-w-2xl w-full overflow-auto rounded-md bg-white p-4 text-sm border border-slate-200 whitespace-pre-wrap">
            {this.state.message}
          </pre>
          <button
            type="button"
            className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
