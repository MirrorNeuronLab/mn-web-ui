import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { fetchRunUi } from '../api';
import { apiErrorMessage } from '../utils/apiErrors';

export default function RunUi() {
  const { runId } = useParams();
  const location = useLocation();
  const [targetUrl, setTargetUrl] = useState('');
  const [error, setError] = useState('');
  const query = useMemo(() => location.search || '', [location.search]);

  useEffect(() => {
    if (!runId) return undefined;
    let cancelled = false;
    fetchRunUi(runId)
      .then((response) => {
        if (cancelled) return;
        const url = response.web_ui?.url?.trim();
        if (!url) {
          setError('No web UI is registered for this run yet.');
          return;
        }
        const separator = url.includes('?') ? '&' : '?';
        const nextUrl = query ? `${url}${separator}${query.slice(1)}` : url;
        setTargetUrl(nextUrl);
        window.location.replace(nextUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load run web UI.'));
      });
    return () => {
      cancelled = true;
    };
  }, [query, runId]);

  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="rounded-lg border border-neutral-200 bg-white p-5 text-center shadow-sm">
        {error ? (
          <AlertCircle className="mx-auto mb-3 h-5 w-5 text-red-600" />
        ) : (
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-neutral-500" />
        )}
        {error ? <div className="text-sm font-medium text-neutral-950">{error}</div> : null}
        {targetUrl && (
          <a
            className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            href={targetUrl}
          >
            Open Web UI
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}
