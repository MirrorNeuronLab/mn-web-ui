import { useCallback, useState } from 'react';
import { format } from 'date-fns';
import { Archive, Clock3, Eye, Layers3, Play, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchStableJobs } from '../api';
import type { StableJob } from '../api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Tooltip } from '../components/ui/tooltip';
import { usePollingEffect } from '../hooks/usePollingEffect';
import { apiErrorMessage } from '../utils/apiErrors';
import { jobLifecycleStatusBadgeClass, jobLifecycleStatusLabel } from '../utils/jobStatus';
import { cn } from '../lib/utils';

const timestamp = (value?: string | null) => {
  if (!value) return 'Not reported';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? format(parsed, 'MMM d, HH:mm') : 'Not reported';
};

export default function StableJobs() {
  const [jobs, setJobs] = useState<StableJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadJobs = useCallback(async () => {
    try {
      const page = await fetchStableJobs({ includeArchived });
      setJobs(page.items);
      setNextPageToken(page.next_page_token);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load persistent jobs.'));
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchStableJobs({ includeArchived, pageToken: nextPageToken });
      setJobs((current) => [...current, ...page.items]);
      setNextPageToken(page.next_page_token);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load more persistent jobs.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const markInitialLoading = useCallback(() => {
    setLoading(true);
  }, []);

  usePollingEffect(loadJobs, {
    intervalMs: 5000,
    onInitialPoll: markInitialLoading,
  });

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 border-b border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-neutral-950">Persistent jobs</div>
          <div className="mt-1 text-xs text-neutral-500">Reusable configuration, schedules, data, and run history.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            role="switch"
            aria-checked={includeArchived}
            onClick={() => setIncludeArchived((value) => !value)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <span className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${includeArchived ? 'bg-neutral-950' : 'bg-neutral-200'}`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${includeArchived ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            Show archived
          </button>
          <Button asChild size="sm">
            <Link to="/run"><Plus className="h-3.5 w-3.5" /> New job</Link>
          </Button>
        </div>
      </CardHeader>

      {error ? (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-800">{error}</div>
      ) : null}

      <CardContent className="overflow-auto p-0">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <TableHead className="px-4 py-2">Job</TableHead>
              <TableHead className="px-4 py-2">Job status</TableHead>
              <TableHead className="px-4 py-2">Runs</TableHead>
              <TableHead className="px-4 py-2">Schedules</TableHead>
              <TableHead className="px-4 py-2">Data</TableHead>
              <TableHead className="px-4 py-2">Updated</TableHead>
              <TableHead className="px-4 py-2">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4].map((row) => (
                <TableRow key={row}>
                  <TableCell className="px-4 py-3"><Skeleton className="h-8 w-52" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-5 w-12" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="px-4 py-3"><Skeleton className="h-7 w-7" /></TableCell>
                </TableRow>
              ))
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-12 text-center">
                  <Layers3 className="mx-auto mb-3 h-6 w-6 text-neutral-300" />
                  <div className="text-sm font-medium text-neutral-800">No persistent jobs found</div>
                  <div className="mt-1 text-xs text-neutral-500">Launch a blueprint or upload a bundle to create one.</div>
                </TableCell>
              </TableRow>
            ) : jobs.map((job) => (
              <TableRow key={job.job_id} className="hover:bg-neutral-50">
                <TableCell className="px-4 py-3">
                  <div className="text-xs font-medium text-neutral-950">{job.job_name || job.graph_id || 'Untitled job'}</div>
                  <div className="mt-1 font-mono text-[11px] text-neutral-500">{job.job_id}</div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <Badge variant="outline" className={cn('gap-1.5', jobLifecycleStatusBadgeClass(job.status))}>
                    {job.status === 'archived' ? <Archive className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {jobLifecycleStatusLabel(job.status)}
                  </Badge>
                </TableCell>
                <TableCell className="px-4 py-3 text-xs text-neutral-600">
                  <span className="font-medium text-neutral-950">{job.run_count}</span> total
                  {job.latest_run_id ? <span className="ml-1 text-neutral-400">· latest available</span> : null}
                </TableCell>
                <TableCell className="px-4 py-3 text-xs text-neutral-600">{job.schedule_count}</TableCell>
                <TableCell className="px-4 py-3 text-xs text-neutral-600">Generation {job.data_generation}</TableCell>
                <TableCell className="px-4 py-3 text-xs text-neutral-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{timestamp(job.updated_at)}</TableCell>
                <TableCell className="px-4 py-3">
                  <Tooltip content="Open job configuration and run history.">
                    <Button asChild variant="outline" size="icon" className="h-7 w-7">
                      <Link to={`/jobs/${encodeURIComponent(job.job_id)}`} aria-label={`View job ${job.job_id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {nextPageToken ? (
        <div className="border-t border-neutral-200 p-3 text-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
