import { Component } from "react";
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, errorMsg: "", errorStack: "" };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, errorMsg: error?.message ?? String(error), errorStack: error?.stack ?? "" };
    }
    componentDidCatch(error, info) {
        const body = {
            error: error?.message ?? String(error),
            stack: error?.stack ?? "",
            componentStack: info.componentStack,
            url: window.location.href,
        };
        console.error("[ErrorBoundary]", body);
        fetch("/api/client-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(body),
        }).catch(() => { });
    }
    render() {
        if (this.state.hasError) {
            return (<div className="min-h-screen w-full flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md w-full text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z"/>
              </svg>
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-500 mb-3">
              An unexpected error occurred. Please try again or reload the page.
            </p>
            {this.state.errorMsg && (<p className="text-xs text-red-500 font-mono bg-red-50 rounded px-3 py-2 mb-4 text-left break-all">
                {this.state.errorMsg}
              </p>)}
            <div className="flex gap-2 justify-center">
              <button onClick={() => this.setState({ hasError: false, errorMsg: "", errorStack: "" })} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">
                Try again
              </button>
              <button onClick={() => window.location.reload()} className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#4F35A8" }}>
                Reload page
              </button>
            </div>
          </div>
        </div>);
        }
        return this.props.children;
    }
}
