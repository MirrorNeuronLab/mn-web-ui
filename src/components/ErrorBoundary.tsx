import { Component } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackTitle?: string;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Never log payloads or tokens here — only the error name/message.
    console.error('UI error boundary caught:', error.name, error.message);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="space-y-3 rounded-md border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <div className="font-semibold">{this.props.fallbackTitle || 'Something went wrong in this view.'}</div>
          <div>The data may be malformed. Try again or return to a known page.</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
            >
              Try again
            </button>
            <Link
              to="/"
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
