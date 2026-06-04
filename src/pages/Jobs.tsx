import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertCircle, Ban, CheckCircle, Clock, Eye, Loader2, PauseCircle, PlayCircle, Trash2, XCircle } from 'lucide-react';
import { cancelJob, clearJobs, fetchJobs, isServiceJob, pauseJob } from '../api';
import type { Job } from '../api';
import { confirmActionToast } from '../components/ui/confirm-toast';
import { Tooltip } from '../components/ui/tooltip';

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
  const [showTerminalJobs, setShowTerminalJobs] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchJobs({ includeTerminal: showTerminalJobs });
        setJobs(data);
        setSelectedJobIds((current) => {
          const availableIds = new Set(data.map((job) => job.job_id));
          return new Set([...current].filter((jobId) => availableIds.has(jobId)));
        });
      } catch (e) {
        console.error('Failed to load jobs', e);
      } finally {
        setLoading(false);
      }
    };
    const initialTimer = window.setTimeout(() => {
      setLoading(true);
      void load();
    }, 0);
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [showTerminalJobs]);

  const refreshJobs = async () => {
    const data = await fetchJobs({ includeTerminal: showTerminalJobs });
    setJobs(data);
    setSelectedJobIds((current) => {
      const availableIds = new Set(data.map((job) => job.job_id));
      return new Set([...current].filter((jobId) => availableIds.has(jobId)));
    });
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

    confirmActionToast({
      id: `jobs-bulk-${action}`,
      title: `${actionLabel} ${jobIds.length} selected job${jobIds.length === 1 ? '' : 's'}?`,
      description: action === 'pause'
        ? 'Selected running jobs will stop accepting work until they are resumed.'
        : 'Selected jobs will be stopped. Running agents attached to those jobs will be interrupted.',
      confirmLabel: actionLabel,
      cancelLabel: 'Keep jobs',
      loading: `${loadingLabel} ${jobIds.length} job${jobIds.length === 1 ? '' : 's'}...`,
      success: `${completedLabel} ${jobIds.length} job${jobIds.length === 1 ? '' : 's'}.`,
      error: `Failed to ${action} selected jobs.`,
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
    confirmActionToast({
      id: 'jobs-clear',
      title: 'Clear non-running jobs?',
      description: 'Completed, failed, and cancelled jobs will be removed from this list. Running jobs stay visible.',
      confirmLabel: 'Clear jobs',
      cancelLabel: 'Keep jobs',
      loading: 'Clearing non-running jobs...',
      success: (result: { cleared_count: number }) => `Cleared ${result.cleared_count} job${result.cleared_count === 1 ? '' : 's'}.`,
      error: 'Failed to clear non-running jobs.',
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
    <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-5 py-4">
        <div>
          <h2 className="font-semibold tracking-tight text-neutral-950">Jobs</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {showTerminalJobs ? 'Live and completed job runs.' : 'Live job runs only.'} Select rows for bulk actions or open details explicitly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={showTerminalJobs}
            onClick={() => setShowTerminalJobs((value) => !value)}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <span
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                showTerminalJobs ? 'bg-neutral-950' : 'bg-neutral-200'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                  showTerminalJobs ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            Past jobs
          </button>
          <Tooltip content="Pause all selected live jobs after confirmation.">
            <span className="inline-flex">
              <button
                type="button"
                disabled={!hasSelection || bulkAction !== null}
                onClick={() => confirmBulkAction('pause')}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {bulkAction === 'pause' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                {bulkAction === 'pause' ? 'Pausing...' : `Pause${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            </span>
          </Tooltip>
          <Tooltip content="Cancel all selected jobs after confirmation. Running agents will stop.">
            <span className="inline-flex">
              <button
                type="button"
                disabled={!hasSelection || bulkAction !== null}
                onClick={() => confirmBulkAction('cancel')}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {bulkAction === 'cancel' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                {bulkAction === 'cancel' ? 'Cancelling...' : `Cancel${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
              </button>
            </span>
          </Tooltip>
          <Tooltip content="Clear completed, failed, and cancelled jobs after confirmation.">
            <span className="inline-flex">
              <button
                type="button"
                disabled={isClearing || bulkAction !== null}
                onClick={confirmClearJobs}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                {isClearing ? 'Clearing...' : 'Clear'}
              </button>
            </span>
          </Tooltip>
          <Link
            to="/run"
            className="inline-flex h-8 items-center justify-center rounded-md bg-neutral-950 px-3 text-xs font-medium text-white hover:bg-neutral-800"
          >
            New job
          </Link>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="w-10 px-4 py-2 font-medium">
                <input
                  type="checkbox"
                  aria-label="Select all jobs"
                  checked={allSelected}
                  onChange={toggleAllJobs}
                  disabled={loading || jobs.length === 0}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950 disabled:opacity-40"
                />
              </th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Job ID</th>
              <th className="px-4 py-2 font-medium">Graph ID</th>
              <th className="px-4 py-2 font-medium">Submitted</th>
              <th className="px-4 py-2 font-medium">Executors</th>
              <th className="px-4 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-2.5"><div className="h-4 w-4 rounded bg-neutral-100" /></td>
                  <td className="px-4 py-2.5"><div className="h-5 w-24 rounded bg-neutral-100" /></td>
                  <td className="px-4 py-2.5"><div className="h-5 w-36 rounded bg-neutral-100" /></td>
                  <td className="px-4 py-2.5"><div className="h-5 w-28 rounded bg-neutral-100" /></td>
                  <td className="px-4 py-2.5"><div className="h-5 w-32 rounded bg-neutral-100" /></td>
                  <td className="px-4 py-2.5"><div className="h-5 w-16 rounded bg-neutral-100" /></td>
                  <td className="px-4 py-2.5"><div className="h-7 w-7 rounded bg-neutral-100" /></td>
                </tr>
              ))
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-neutral-500">
                  No jobs found.
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const selected = selectedJobIds.has(job.job_id);
                return (
                <tr
                  key={job.job_id}
                  className={selected ? 'bg-neutral-50' : 'hover:bg-neutral-50'}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select job ${job.job_id}`}
                      checked={selected}
                      onChange={() => toggleJobSelection(job.job_id)}
                      className="h-4 w-4 rounded border-neutral-300 text-neutral-950 focus:ring-neutral-950"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-2 py-0.5 text-[11px] font-medium capitalize text-neutral-700">
                      <StatusIcon status={job.status} />
                      {job.status}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-xs font-medium text-neutral-950">
                      {job.job_id}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-600">{job.graph_id}</td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {job.submitted_at ? format(new Date(job.submitted_at), 'MMM d, HH:mm:ss') : 'Unknown'}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-600">
                    {isServiceJob(job) ? '∞' : `${job.active_executors ?? 0} / ${job.executor_count ?? 0}`}
                  </td>
                  <td className="px-4 py-2.5">
                    <Tooltip content="Open job details and live progress.">
                      <Link
                        to={`/jobs/${job.job_id}`}
                        aria-label={`View details for ${job.job_id}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </Tooltip>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
