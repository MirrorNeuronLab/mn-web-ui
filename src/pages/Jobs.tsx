import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle, Ban, CheckCircle, Clock, Eye, Loader2, PauseCircle, PlayCircle, Trash2, XCircle } from 'lucide-react';
import { cancelAllJobs, cancelRun, clearJobs, fetchRuns, isServiceJob, pauseRun } from '../api';
import type { RunSummary } from '../api';
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

export default function Runs() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<'pause' | 'cancel' | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const applyRuns = useCallback((data: RunSummary[]) => {
    setRuns(data);
    setSelectedJobIds((current) => {
      const availableIds = new Set(data.map((run) => run.run_id));
      return new Set([...current].filter((jobId) => availableIds.has(jobId)));
    });
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const page = await fetchRuns({ includeTerminal: !activeOnly });
      applyRuns(page.items);
      setNextPageToken(page.next_page_token);
    } catch (e) {
      console.error('Failed to load runs', e);
    } finally {
      setLoading(false);
    }
  }, [activeOnly, applyRuns]);

  const markInitialLoading = useCallback(() => {
    setLoading(true);
  }, []);

  usePollingEffect(loadRuns, { intervalMs: 5000, onInitialPoll: markInitialLoading });

  const refreshRuns = async () => {
    const page = await fetchRuns({ includeTerminal: !activeOnly });
    applyRuns(page.items);
    setNextPageToken(page.next_page_token);
  };

  const loadMore = async () => {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchRuns({ includeTerminal: !activeOnly, pageToken: nextPageToken });
      applyRuns([...runs, ...page.items]);
      setNextPageToken(page.next_page_token);
    } finally {
      setLoadingMore(false);
    }
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
      if (current.size === runs.length) return new Set();
      return new Set(runs.map((run) => run.run_id));
    });
  };

  const confirmBulkAction = (action: 'pause' | 'cancel') => {
    const jobIds = [...selectedJobIds];
    if (jobIds.length === 0) return;

    const actionLabel = action === 'pause' ? 'Pause' : 'Cancel';
    const completedLabel = action === 'pause' ? 'Paused' : 'Cancelled';
    const loadingLabel = action === 'pause' ? 'Pausing' : 'Cancelling';
    const runner = action === 'pause' ? pauseRun : cancelRun;

    confirmActionDialog({
      tone: action === 'cancel' ? 'danger' : 'default',
      id: `jobs-bulk-${action}`,
      title: `${actionLabel} ${jobIds.length} selected run${jobIds.length === 1 ? '' : 's'}?`,
      description: action === 'pause'
        ? 'Selected running executions will stop accepting work until they are resumed.'
        : 'Selected executions will be stopped. Their running agents will be interrupted.',
      confirmLabel: actionLabel,
      cancelLabel: 'Keep runs',
      loading: {
        title: `${loadingLabel} runs`,
        description: `${jobIds.length} selected run${jobIds.length === 1 ? '' : 's'} are being updated.`,
      },
      success: {
        title: `${completedLabel} runs`,
        description: `${completedLabel} ${jobIds.length} run${jobIds.length === 1 ? '' : 's'}.`,
      },
      error: (error) => ({
        title: `${actionLabel} failed`,
        description: apiErrorMessage(error, `Failed to ${action} selected runs.`),
      }),
      onConfirm: async () => {
        try {
          setBulkAction(action);
          await Promise.all(jobIds.map((jobId) => runner(jobId)));
          setSelectedJobIds(new Set());
          await refreshRuns();
        } catch (e) {
          console.error(`Failed to ${action} selected runs`, e);
          throw e;
        } finally {
          setBulkAction(null);
        }
      },
    });
  };

  const confirmCancelAllJobs = () => {
    if (runs.length === 0) return;

    confirmActionDialog({
      tone: 'danger',
      id: 'jobs-cancel-all',
      title: 'Cancel all active runs?',
      description: 'A durable cancellation operation will be started for every pending, scheduled, running, and paused execution.',
      confirmLabel: 'Cancel all',
      cancelLabel: 'Keep runs',
      loading: {
        title: 'Starting cancellation',
        description: 'Submitting the durable cancellation operation.',
      },
      success: (result: { operation_id: string }) => ({
        title: 'Cancellation started',
        description: `Operation ${result.operation_id} will continue until every active run is handled.`,
      }),
      error: (error) => ({
        title: 'Cancel all failed',
        description: apiErrorMessage(error, 'Failed to start cancellation for active runs.'),
      }),
      onConfirm: async () => {
        try {
          setIsCancellingAll(true);
          const result = await cancelAllJobs();
          setSelectedJobIds(new Set());
          await refreshRuns();
          return result;
        } catch (e) {
          console.error('Failed to cancel all active runs', e);
          throw e;
        } finally {
          setIsCancellingAll(false);
        }
      },
    });
  };

  const confirmClearJobs = () => {
    confirmActionDialog({
      tone: 'danger',
      id: 'jobs-clear',
      title: 'Clean execution history?',
      description: 'A durable cleanup operation will remove completed, failed, cancelled, and cancellation-pending executions. Offline cleanup continues when a node rejoins. Active runs stay visible.',
      confirmLabel: 'Start cleanup',
      cancelLabel: 'Keep history',
      loading: {
        title: 'Starting cleanup',
        description: 'Submitting the durable execution cleanup operation.',
      },
      success: (result: { operation_id: string }) => ({
        title: 'Cleanup started',
        description: `Operation ${result.operation_id} will continue in the background.`,
      }),
      error: (error) => ({
        title: 'Cleanup failed',
        description: apiErrorMessage(error, 'Failed to start execution cleanup.'),
      }),
      onConfirm: async () => {
        try {
          setIsClearing(true);
          const result = await clearJobs();
          setSelectedJobIds(new Set());
          await refreshRuns();
          return result;
        } catch (e) {
          console.error('Failed to start execution cleanup', e);
          throw e;
        } finally {
          setIsClearing(false);
        }
      },
    });
  };

  const selectedCount = selectedJobIds.size;
  const hasSelection = selectedCount > 0;
  const allSelected = runs.length > 0 && selectedCount === runs.length;

  return (
    <Card>
      <CardHeader className="flex flex-col items-stretch gap-3 space-y-0 border-b border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-medium text-neutral-500" aria-live="polite">
          {loading
            ? 'Loading runs…'
            : selectedCount > 0
            ? `${selectedCount} run${selectedCount === 1 ? '' : 's'} selected`
            : `${runs.length} run${runs.length === 1 ? '' : 's'}`}
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
          <Tooltip content="Pause all selected active runs after confirmation.">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasSelection || isCancellingAll || bulkAction !== null}
                onClick={() => confirmBulkAction('pause')}
              >
                {bulkAction === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                {bulkAction === 'pause' ? 'Pausing...' : `Pause${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Cancel all selected runs after confirmation. Running agents will stop.">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                size="sm"
                disabled={!hasSelection || isCancellingAll || bulkAction !== null}
                onClick={() => confirmBulkAction('cancel')}
              >
                {bulkAction === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                {bulkAction === 'cancel' ? 'Cancelling...' : `Cancel${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Start a durable operation to cancel every active run.">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                size="sm"
                disabled={runs.length === 0 || isCancellingAll || bulkAction !== null}
                onClick={confirmCancelAllJobs}
              >
                {isCancellingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                {isCancellingAll ? 'Cancelling all...' : 'Cancel all'}
              </Button>
            </span>
          </Tooltip>
          <Tooltip content="Start durable cleanup for terminal and cancellation-pending executions.">
            <span className="inline-flex">
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                size="sm"
                disabled={isClearing || isCancellingAll || bulkAction !== null}
                onClick={confirmClearJobs}
              >
                {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {isClearing ? 'Starting...' : 'Clean up'}
              </Button>
            </span>
          </Tooltip>
          <Button asChild size="sm">
            <Link to="/run">New run</Link>
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
                  aria-label="Select all runs"
                  checked={allSelected}
                  onChange={toggleAllJobs}
                  disabled={loading || runs.length === 0}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950 disabled:opacity-40"
                />
              </TableHead>
              <TableHead className="px-4 py-2">Status</TableHead>
              <TableHead className="px-4 py-2">Run ID</TableHead>
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
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-8 text-center text-xs text-neutral-500">
                  No execution runs found.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((run) => {
                const runId = run.run_id;
                const selected = selectedJobIds.has(runId);
                return (
                <TableRow
                  key={runId}
                  className={cn(selected ? 'bg-neutral-50' : 'hover:bg-neutral-50')}
                >
                  <TableCell className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select run ${runId}`}
                      checked={selected}
                      onChange={() => toggleJobSelection(runId)}
                      className="h-4 w-4 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950"
                    />
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Badge variant="outline" className="gap-1.5 capitalize">
                      <StatusIcon status={run.status} />
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <span className="font-mono text-xs font-medium text-neutral-950">
                      {runId}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-neutral-600">{run.graph_id}</TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-neutral-500">
                    {run.submitted_at ? format(new Date(run.submitted_at), 'MMM d, HH:mm:ss') : 'Unknown'}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-xs text-neutral-600">
                    {isServiceJob(run) ? '∞' : `${run.active_executors ?? 0} / ${run.executor_count ?? 0}`}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <Tooltip content="Open run details and live progress.">
                      <Button asChild variant="outline" size="icon" className="h-7 w-7 text-neutral-600">
                        <Link
                          to={`/runs/${encodeURIComponent(runId)}`}
                          aria-label={`View run ${runId}`}
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
