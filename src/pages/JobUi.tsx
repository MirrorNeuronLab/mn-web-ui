import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
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
  const proxyRoot = `/job-ui-proxy/${encodeURIComponent(jobId)}/${port}`;
  // A root service must retain its trailing slash. Relative bundle URLs in
  // the framed page otherwise resolve outside the port-scoped proxy route.
  const proxyPath = remotePath ? `${proxyRoot}/${remotePath}` : `${proxyRoot}/`;
  const parameters = new URLSearchParams(remote.search);
  new URLSearchParams(query).forEach((value, key) => parameters.set(key, value));
  const suffix = parameters.toString();
  return suffix ? `${proxyPath}?${suffix}` : proxyPath;
}

function unavailableMessage(status: string | undefined): string {
  switch (status?.trim().toLowerCase()) {
    case 'paused':
      return 'This job is paused. Resume it to reopen its web UI.';
    case 'cancelled':
    case 'canceled':
      return 'This job was cancelled, so its web UI is no longer available.';
    case 'stopped':
      return 'This service has stopped, so its web UI is no longer available.';
    case 'failed':
      return 'This service failed, so its web UI is no longer available.';
    default:
      return '';
  }
}

// This route is the single job-scoped entry point for a blueprint web UI.
export default function JobUi() {
  const { jobId } = useParams();
  const location = useLocation();
  const [targetUrl, setTargetUrl] = useState('');
  const [title, setTitle] = useState('Blueprint Web UI');
  const [error, setError] = useState('');
  const targetUrlRef = useRef('');
  const query = useMemo(() => location.search || '', [location.search]);

  useEffect(() => {
    if (!jobId) return undefined;
    let cancelled = false;
    targetUrlRef.current = '';
    setTargetUrl('');
    setError('');
    const updateTargetUrl = (nextUrl: string) => {
      targetUrlRef.current = nextUrl;
      setTargetUrl(nextUrl);
    };
    const load = () => fetchJobUi(jobId)
      .then((response) => {
        if (cancelled) return;
        setTitle(response.web_ui?.title?.trim() || 'Blueprint Web UI');
        const unavailable = unavailableMessage(response.web_ui?.status);
        if (unavailable) {
          updateTargetUrl('');
          setError(unavailable);
          return;
        }
        const url = response.web_ui?.url?.trim();
        if (!url) {
          updateTargetUrl('');
          setError('No web UI is registered for this job yet.');
          return;
        }
        const nextUrl = localProxyUrl(jobId, url, query);
        if (!nextUrl) {
          updateTargetUrl('');
          setError('The registered web UI URL is invalid.');
          return;
        }
        setError('');
        updateTargetUrl(nextUrl);
      })
      .catch((err: unknown) => {
        if (!cancelled && !targetUrlRef.current) {
          setError(apiErrorMessage(err, 'Failed to load job web UI.'));
        }
      });
    void load();
    const poll = window.setInterval(() => void load(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [jobId, query]);

  if (targetUrl) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-white">
        <iframe className="block h-full w-full border-0" src={targetUrl} title={title} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-white">
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
