/**
 * ErrorBoundary — Application-level error catch (NFR Design §8).
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // future: send to Sentry / CloudWatch RUM
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8">
          <h1 className="font-serif text-2xl font-bold mb-3">エラーが発生しました</h1>
          <p className="text-neutral-600 mb-6">ページを再読み込みしてください。</p>
          <button
            type="button"
            className="bg-brand-600 text-neutral-0 rounded-xl px-4 py-2 hover:bg-brand-700"
            onClick={() => window.location.reload()}
          >
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
