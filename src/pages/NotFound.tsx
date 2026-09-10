import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="space-y-3 rounded-md border border-neutral-200 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-neutral-950">Page not found</h2>
      <p className="text-sm text-neutral-500">
        The address doesn&apos;t match a known view. Check the URL or return to a known page.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          to="/"
          className="rounded-md bg-neutral-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
        >
          Back to dashboard
        </Link>
        <Link
          to="/runs"
          className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
        >
          View runs
        </Link>
      </div>
    </div>
  );
}
