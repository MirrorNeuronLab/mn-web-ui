import { useState, type AnchorHTMLAttributes } from 'react';
import { downloadRunFile } from '../api';
import { apiErrorMessage } from '../utils/apiErrors';

/** API files need the same bearer header as other reads; anchors cannot send it. */
export default function ArtifactLink({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apiFile = /^\/api\/v1\/runs\/[^/]+\/(artifacts|outputs)\//.test(href);
  return (
    <span>
      <a {...props} href={href} aria-busy={busy} onClick={apiFile ? (event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        void downloadRunFile(href).catch((err: unknown) => {
          setError(apiErrorMessage(err, "Couldn't download the file. Try again."));
        }).finally(() => setBusy(false));
      } : props.onClick}>
        {children}{busy ? ' · Downloading…' : ''}
      </a>
      {error ? <span role="alert" className="ml-2 text-xs text-red-700">{error}</span> : null}
    </span>
  );
}
