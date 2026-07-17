import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle, Ban, CheckCircle, Clock, Eye, Loader2, PauseCircle, PlayCircle, Trash2, XCircle } from 'lucide-react';
import { cancelJob, clearJobs, fetchJobs, isServiceJob, pauseJob } from '../api';
import type { Job } from '../api';
import { confirmActionDialog } from '../components/ui/confirm-action';
import { Tooltip } from '../components/ui/tooltip';
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
import { usePollingEffect } from '../hooks/usePollingEffect';
import { cn } from '../lib/utils';
import { apiErrorMessage } from '../utils/apiErrors';

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <PlayCircle className="h-4 w-4" />;
    case 'completed': return <CheckCircle className="h-4 w-4" />;
    case 'failed': return <XCircle className="h-4 w-4" />;
    case 'pending': return <Clock className="h-4 w-4" />;
    default: return <AlertCircle className="h-4 w-4" />;
  }
};

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'pause' | 'cancel' | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);

  const applyJobs = useCallback((data: Job[]) => {
    setJobs(data);
    setSelectedJobIds((current) => {
      const availableIds = new Set(data.map((job) => job.job_id));
      return new Set([...current].filter((jobId) => availableIds.has(jobId)));
    });
  }, []);

  const loadJobs = useCallback(async () => {
    try {
      const data = await fetchJobs({ includeTerminal: !activeOnly });
      applyJobs(data);
    } catch (e) {
      console.error('Failed to load jobs', e);
    } finally {
      setLoading(false);
    }
  }, [activeOnly, applyJobs]);

  const markInitialLoading = useCallback(() => {
    setLoading(true);
  }, []);

  usePollingEffect(loadJobs, { intervalMs: 5000, onInitialPoll: markInitialLoading });

  const refreshJobs = async () => {
    const data = await fetchJobs({ includeTerminal: !activeOnly });
    applyJobs(data);
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((current) => {
      const next = new Set(current);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const toggleAllJobs = () => {
    setSelectedJobIds((current) => {
      if (current.size === jobs.length) return new Set();
      return new Set(jobs.map((job) => job.job_id));
    });
  };

  const confirmBulkAction = (action: 'pause' | 'cancel') => {
    const jobIds = [...selectedJobIds];
    if (jobIds.length === 0) return;

    const actionLabel = action === 'pause' ? 'Pause' : 'Cancel';
    const completedLabel = action === 'pause' ? 'Paused' : 'Cancelled';
    const loadingLabel = action === 'pause' ? 'Pausing' : 'Cancelling';
    const runner = action === 'pause' ? pauseJob : cancelJob;

    confirmActionDialog({
      tone: action === 'cancel' ? 'danger' : 'default',
      id: `jobs-bulk-${action}`,
      title: `${actionLabel} ${jobIds.length} selected job${jobIds.length === 1 ? '' : 's'}?`,
      description: action === 'pause'
        ? 'Selected running jobs will stop accepting work until they are resumed.'
        : 'Selected jobs will be stopped. Running agents attached to those jobs will be interrupted.',
      confirmLabel: actionLabel,
      cancelLabel: 'Keep jobs',
      loading: {
        title: `${loadingLabel} jobs`,
        description: `${jobIds.length} selected job${jobIds.length === 1 ? '' : 's'} are being updated.`,
      },
      success: {
        title: `${completedLabel} jobs`,
        description: `${completedLabel} ${jobIds.length} job${jobIds.length === 1 ? '' : 's'}.`,
      },
      error: {
        title: `${actionLabel} failed`,
        description: `Failed to ${action} selected jobs.`,
      },
      onConfirm: async () => {
        try {
          setBulkAction(action);
          await Promise.all(jobIds.map((jobId) => runner(jobId)));
          setSelectedJobIds(new Set());
          await refreshJobs();
        } catch (e) {
          console.error(`Failed to ${action} selected jobs`, e);
          throw e;
        } finally {
          setBulkAction(null);
        }
      },
    });
  };

  const confirmClearJobs = () => {
    confirmActionDialog({
      tone: 'danger',
      id: 'jobs-clear',
      title: 'Clear non-running jobs?',
      description: 'Completed, failed, and cancelled jobs will be removed from this list. Running jobs stay visible.',
      confirmLabel: 'Clear jobs',
      cancelLabel: 'Keep jobs',
      loading: {
        title: 'Clearing jobs',
        description: 'Removing completed, failed, and cancelled jobs.',
      },
      success: (result: { cleared_count: number }) => ({
        title: 'Jobs cleared',
        description: `Cleared ${result.cleared_count} job${result.cleared_count === 1 ? '' : 's'}.`,
      }),
      error: (error) => ({
        title: 'Clear failed',
        description: apiErrorMessage(error, 'Failed to clear non-running jobs.'),
      }),
      onConfirm: async () => {
        try {
          setIsClearing(true);
          const result = await clearJobs();
          setSelectedJobIds(new Set());
          await refreshJobs();
          return result;
        } catch (e) {
          console.error('Failed to clear non-running jobs', e);
          throw e;
        } finally {
          setIsClearing(false);
        }
      },
    });
  };

  const selectedCount = selectedJobIds.size;
  const hasSelection = selectedCount > 0;
  const allSelected = jobs.length > 0 && selectedCount === jobs.length;

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 border-b border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-medium text-neutral-500" aria-live="polite">
          {loading
            ? 'Loading jobs…'
            : selectedCount > 0
            ? `${selectedCount} job${selectedCount === 1 ? '' : 's'} selected`
            : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            role="switch"
            aria-checked={activeOnly}
            onClick={() => setActiveOnly((value) => !value)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <span
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                activeOnly ? 'bg-neutral-950' : 'bg-neutral-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  activeOnly ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            Active only
          </button>
          <Tooltip content="Pause all selected live jobs after confirmation.">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasSelection || bulkAction !== null}
                onClick={() => confirmBulkAction('pause')}
              >
                {bulkAction === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                {bulkAction === 'pause' ? 'Pausing...' : `Pause${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Cancel all selected jobs after confirmation. Running agents will stop.">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                size="sm"
                disabled={!hasSelection || bulkAction !== null}
                onClick={() => confirmBulkAction('cancel')}
              >
                {bulkAction === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                {bulkAction === 'cancel' ? 'Cancelling...' : `Cancel${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Clear completed, failed, and cancelled jobs after confirmation.">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                size="sm"
                disabled={isClearing || bulkAction !== null}
                onClick={confirmClearJobs}
              >
                {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {isClearing ? 'Clearing...' : 'Clear'}
              </Button>
            </span>
          </Tooltip>
          <Button asChild size="sm">
            <Link to="/run">New job</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="overflow-auto p-0">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <TableHead className="w-10 px-4 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all jobs"
                  checked={allSelected}
                  onChange={toggleAllJobs}
                  disabled={loading || jobs.length === 0}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950 disabled:opacity-40"
                />
              </TableHead>
              <TableHead className="px-4 py-2">Status</TableHead>
              <TableHead className="px-4 py-2">Job ID</TableHead>
              <TableHead className="px-4 py-2">Workflow ID</TableHead>
              <TableHead className="px-4 py-2">Submitted</TableHead>
              <TableHead className="px-4 py-2">Executors</TableHead>
              <TableHead className="px-4 py-2">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  <TableCell className="px-4 py-2.5"><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell className="px-4 py-2.5"><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="px-4 py-2.5"><Skeleton className="h-5 w-36" /></TableCell>
                  <TableCell className="px-4 py-2.5"><Skeleton className="h-5 w-28" /></TableCell>
                  <TableCell className="px-4 py-2.5"><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell className="px-4 py-2.5"><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell className="px-4 py-2.5"><Skeleton className="h-7 w-7" /></TableCell>
                </TableRow>
              ))
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-8 text-center text-xs text-neutral-500">
                  No jobs found.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => {
                const selected = selectedJobIds.has(job.job_id);
                return (
                <TableRow
                  key={job.job_id}
                  className={cn(selected ? 'bg-neutral-50' : 'hover:bg-neutral-50')}
                >
                  <TableCell className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select job ${job.job_id}`}
                      checked={selected}
                      onChange={() => toggleJobSelection(job.job_id)}
                      className="h-4 w-4 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950"
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Badge variant="outline" className="gap-1.5 capitalize">
                      <StatusIcon status={job.status} />
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <span className="font-mono text-xs font-medium text-neutral-950">
                      {job.job_id}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-neutral-600">{job.graph_id}</TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-neutral-500">
                    {job.submitted_at ? format(new Date(job.submitted_at), 'MMM d, HH:mm:ss') : 'Unknown'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-neutral-600">
                    {isServiceJob(job) ? '∞' : `${job.active_executors ?? 0} / ${job.executor_count ?? 0}`}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Tooltip content="Open job details and live progress.">
                      <Button asChild variant="outline" size="icon" className="h-7 w-7 text-neutral-600">
                        <Link
                          to={`/jobs/${job.job_id}`}
                          aria-label={`View details for ${job.job_id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
