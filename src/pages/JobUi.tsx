import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { fetchJobUi } from '../api';
import { apiErrorMessage } from '../utils/apiErrors';

function localProxyUrl(jobId: string, serviceUrl: string, query: string): string {
  let remote: URL;
  try {
    remote = new URL(serviceUrl);
  } catch {
    return '';
  }
  if (!['http:', 'https:'].includes(remote.protocol) || !remote.hostname) return '';

  const port = Number(remote.port || (remote.protocol === 'https:' ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '';

  const remotePath = remote.pathname.replace(/^\/+/, '');
  const proxyPath = `/job-ui-proxy/${encodeURIComponent(jobId)}/${port}${remotePath ? `/${remotePath}` : ''}`;
  const parameters = new URLSearchParams(remote.search);
  new URLSearchParams(query).forEach((value, key) => parameters.set(key, value));
  const suffix = parameters.toString();
  return suffix ? `${proxyPath}?${suffix}` : proxyPath;
}

// This route is the single job-scoped entry point for a blueprint web UI.
export default function JobUi() {
  const { jobId } = useParams();
  const location = useLocation();
  const [targetUrl, setTargetUrl] = useState('');
  const [title, setTitle] = useState('Blueprint Web UI');
  const [error, setError] = useState('');
  const query = useMemo(() => location.search || '', [location.search]);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    fetchJobUi(jobId)
      .then((response) => {
        if (cancelled) return;
        const url = response.web_ui?.url?.trim();
        if (!url) {
          setError('No web UI is registered for this job yet.');
          return;
        }
        const nextUrl = localProxyUrl(jobId, url, query);
        if (!nextUrl) {
          setError('The registered web UI URL is invalid.');
          return;
        }
        setTitle(response.web_ui?.title?.trim() || 'Blueprint Web UI');
        setTargetUrl(nextUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load job web UI.'));
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, query]);

  if (targetUrl) {
    return (
      <div className="flex min-h-[620px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5">
          <div className="truncate text-sm font-medium text-neutral-950">{title}</div>
          <a
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            href={targetUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in tab
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <iframe className="min-h-[580px] w-full flex-1 border-0" src={targetUrl} title={title} />
      </div>
    );
  }

  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="rounded-lg border border-neutral-200 bg-white p-5 text-center shadow-sm">
        {error ? (
          <AlertCircle className="mx-auto mb-3 h-5 w-5 text-red-600" />
        ) : (
          <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-neutral-500" />
        )}
        {error ? <div className="text-sm font-medium text-neutral-950">{error}</div> : null}
      </div>
    </div>
  );
}
