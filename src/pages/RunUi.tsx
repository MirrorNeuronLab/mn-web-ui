import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';

const env = import.meta.env as ImportMetaEnv & Record<string, string>;

const gradioBaseUrl = () => {
  const configured = env.MN_GRADIO_UI_BASE_URL || '';
  return (configured || 'http://localhost:7860').replace(/\/+$/, '');
};

export default function RunUi() {
  const { runId } = useParams();
  const targetUrl = useMemo(() => {
    if (!runId) return '';
    const query = window.location.search || '';
    return `${gradioBaseUrl()}/runs/${encodeURIComponent(runId)}/ui${query}`;
  }, [runId]);

  useEffect(() => {
    if (targetUrl) {
      window.location.replace(targetUrl);
    }
  }, [targetUrl]);

  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="rounded-lg border border-neutral-200 bg-white p-5 text-center shadow-sm">
        <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-neutral-500" />
        <h2 className="font-semibold text-neutral-950">Opening Blueprint UI</h2>
        <p className="mt-2 max-w-md text-xs text-neutral-600">
          This route is forwarded from React to the central Gradio dashboard.
        </p>
        {targetUrl && (
          <a
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            href={targetUrl}
          >
            Open Gradio UI
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
