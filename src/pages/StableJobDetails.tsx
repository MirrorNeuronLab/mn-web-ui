import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Archive, Ban, Clock3, DatabaseZap, Eye, Loader2, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  archiveStableJob,
  cancelRun,
  deleteRun,
  deleteStableJob,
  fetchStableJob,
  fetchStableJobRuns,
  pauseRun,
  resetStableJobData,
  resumeRun,
  startStableJobRun,
} from '../api';
import type { StableJob, StableRun } from '../api';
import { confirmActionDialog } from '../components/ui/confirm-action';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Tooltip } from '../components/ui/tooltip';
import { cn } from '../lib/utils';
import { apiErrorMessage } from '../utils/apiErrors';
import { isActiveJobStatus, isTerminalJobStatus, jobStatusBadgeClass } from '../utils/jobStatus';

const timestamp = (...values: Array<string | null | undefined>) => {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  if (!value) return 'Not reported';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? format(parsed, 'PP p') : 'Not reported';
};

export default function StableJobDetails() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<StableJob | null>(null);
  const [runs, setRuns] = useState<StableRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState('');

  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      const [nextJob, nextRuns] = await Promise.all([
        fetchStableJob(jobId),
        fetchStableJobRuns(jobId),
      ]);
      setJob(nextJob);
      setRuns(nextRuns);
      setError('');
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to load this job.'));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const activeRuns = useMemo(() => runs.filter((run) => isActiveJobStatus(run.status)), [runs]);
  const hasActiveRuns = activeRuns.length > 0;

  const confirmStart = () => {
    if (!job) return;
    confirmActionDialog({
      id: `stable-job-start-${job.job_id}`,
      title: 'Start a new run?',
      description: `A fresh execution will use ${job.job_name || job.job_id}'s current configuration and shared data.`,
      confirmLabel: 'Start run',
      cancelLabel: 'Not now',
      loading: { title: 'Starting run', description: job.job_id },
      success: (run) => ({ title: 'Run started', description: run.run_id }),
      error: (err) => ({ title: 'Start failed', description: apiErrorMessage(err, 'Failed to start a new run.') }),
      onConfirm: async () => {
        setBusyAction('start');
        try {
          const run = await startStableJobRun(job.job_id);
          if (!run.run_id || run.run_id === 'unknown') throw new Error('The API did not return a run id.');
          navigate(`/runs/${encodeURIComponent(run.run_id)}`);
          return run;
        } finally {
          setBusyAction('');
        }
      },
    });
  };

  const confirmArchive = () => {
    if (!job) return;
    confirmActionDialog({
      id: `stable-job-archive-${job.job_id}`,
      title: 'Archive this job?',
      description: 'Schedules will be paused. Configuration, shared data, and run history will be retained.',
      confirmLabel: 'Archive job',
      cancelLabel: 'Keep active',
      loading: { title: 'Archiving job', description: job.job_id },
      success: { title: 'Job archived', description: job.job_id },
      error: (err) => ({ title: 'Archive failed', description: apiErrorMessage(err, 'Failed to archive this job.') }),
      onConfirm: async () => {
        setBusyAction('archive');
        try {
          await archiveStableJob(job.job_id);
          await load();
        } finally {
          setBusyAction('');
        }
      },
    });
  };

  const confirmReset = () => {
    if (!job) return;
    confirmActionDialog({
      tone: 'danger',
      id: `stable-job-reset-${job.job_id}`,
      title: 'Reset shared job data?',
      description: 'The persistent data directory will be recreated from its declared seeds. Run history remains available. This cannot be undone.',
      confirmLabel: 'Reset data',
      cancelLabel: 'Keep data',
      loading: { title: 'Resetting job data', description: job.job_id },
      success: { title: 'Job data reset', description: job.job_id },
      error: (err) => ({ title: 'Reset failed', description: apiErrorMessage(err, 'Failed to reset job data.') }),
      onConfirm: async () => {
        setBusyAction('reset');
        try {
          await resetStableJobData(job.job_id);
          await load();
        } finally {
          setBusyAction('');
        }
      },
    });
  };

  const confirmDeleteJob = () => {
    if (!job) return;
    confirmActionDialog({
      tone: 'danger',
      id: `stable-job-delete-${job.job_id}`,
      title: 'Permanently delete this job?',
      description: 'Configuration, schedules, shared data, and historical runs will be deleted. This cannot be undone.',
      confirmLabel: 'Delete permanently',
      cancelLabel: 'Keep job',
      loading: { title: 'Deleting job', description: job.job_id },
      success: { title: 'Job deleted', description: job.job_id },
      error: (err) => ({ title: 'Delete failed', description: apiErrorMessage(err, 'Failed to delete this job.') }),
      onConfirm: async () => {
        setBusyAction('delete');
        try {
          await deleteStableJob(job.job_id);
          navigate('/jobs');
        } finally {
          setBusyAction('');
        }
      },
    });
  };

  const confirmRunAction = (run: StableRun, action: 'pause' | 'resume' | 'cancel' | 'delete') => {
    const actionLabel = action === 'delete' ? 'Delete' : `${action[0].toUpperCase()}${action.slice(1)}`;
    const actionFn = action === 'pause' ? pauseRun : action === 'resume' ? resumeRun : action === 'cancel' ? cancelRun : deleteRun;
    confirmActionDialog({
      tone: action === 'cancel' || action === 'delete' ? 'danger' : 'default',
      id: `stable-run-${action}-${run.run_id}`,
      title: `${actionLabel} this run?`,
      description: action === 'delete'
        ? 'The execution record and its run-scoped artifacts will be removed. Shared job data remains.'
        : `${actionLabel} execution ${run.run_id}.`,
      confirmLabel: action === 'delete' ? 'Delete run' : `${actionLabel} run`,
      cancelLabel: 'Go back',
      loading: { title: `${actionLabel}ing run`, description: run.run_id },
      success: {
        title: `Run ${{ pause: 'paused', resume: 'resumed', cancel: 'cancelled', delete: 'deleted' }[action]}`,
        description: run.run_id,
      },
      error: (err) => ({ title: `${actionLabel} failed`, description: apiErrorMessage(err, `Failed to ${action} this run.`) }),
      onConfirm: async () => {
        setBusyAction(`${action}:${run.run_id}`);
        try {
          await actionFn(run.run_id);
          await load();
        } finally {
          setBusyAction('');
        }
      },
    });
  };

  if (loading) return <div className="p-5 text-sm text-neutral-500">Loading job…</div>;
  if (!job) return <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error || 'Job not found.'}</div>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-neutral-950">{job.job_name || job.graph_id || job.job_id}</h2>
              <Badge variant="outline" className={cn('capitalize', jobStatusBadgeClass(job.status))}>{job.status}</Badge>
            </div>
            <div className="mt-1 break-all font-mono text-xs text-neutral-500">{job.job_id}</div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
              <span>Workflow <strong className="text-neutral-950">{job.graph_id || 'Not reported'}</strong></span>
              <span>Owner <strong className="text-neutral-950">{job.owner_node || 'Not reported'}</strong></span>
              <span>Data generation <strong className="text-neutral-950">{job.data_generation}</strong></span>
              <span>Updated <strong className="text-neutral-950">{timestamp(job.updated_at)}</strong></span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {job.status !== 'archived' ? (
              <Button size="sm" onClick={confirmStart} disabled={Boolean(busyAction)}>
                {busyAction === 'start' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Start run
              </Button>
            ) : null}
            {job.status !== 'archived' ? (
              <Button variant="outline" size="sm" onClick={confirmArchive} disabled={Boolean(busyAction) || hasActiveRuns}>
                <Archive className="h-3.5 w-3.5" /> Archive
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={confirmReset} disabled={Boolean(busyAction) || hasActiveRuns}>
              <DatabaseZap className="h-3.5 w-3.5" /> Reset data
            </Button>
            <Button variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={confirmDeleteJob} disabled={Boolean(busyAction) || hasActiveRuns}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
        {hasActiveRuns ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Archive, reset, and delete are unavailable while {activeRuns.length} run{activeRuns.length === 1 ? ' is' : 's are'} active.
          </div>
        ) : null}
        {error ? <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div> : null}
      </Card>

      <Card>
        <CardHeader className="border-b border-neutral-200 px-5 py-4">
          <div className="text-sm font-semibold text-neutral-950">Run history</div>
          <div className="mt-1 text-xs text-neutral-500">{runs.length} execution{runs.length === 1 ? '' : 's'} · {activeRuns.length} active</div>
        </CardHeader>
        <CardContent className="overflow-auto p-0">
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <TableHead className="px-4 py-2">Run ID</TableHead>
                <TableHead className="px-4 py-2">Status</TableHead>
                <TableHead className="px-4 py-2">Started</TableHead>
                <TableHead className="px-4 py-2">Attempt</TableHead>
                <TableHead className="px-4 py-2">Data access</TableHead>
                <TableHead className="px-4 py-2 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="px-4 py-10 text-center text-xs text-neutral-500">No runs yet. Start one from this job.</TableCell></TableRow>
              ) : runs.slice().reverse().map((run) => {
                const busy = busyAction.endsWith(`:${run.run_id}`);
                return (
                  <TableRow key={run.run_id} className="hover:bg-neutral-50">
                    <TableCell className="px-4 py-3 font-mono text-xs font-medium text-neutral-950">{run.run_id}</TableCell>
                    <TableCell className="px-4 py-3"><Badge variant="outline" className={cn('capitalize', jobStatusBadgeClass(run.status))}>{run.status}</Badge></TableCell>
                    <TableCell className="px-4 py-3 text-xs text-neutral-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{timestamp(run.started_at, run.submitted_at)}</TableCell>
                    <TableCell className="px-4 py-3 text-xs text-neutral-600">{run.attempt}</TableCell>
                    <TableCell className="px-4 py-3 text-xs capitalize text-neutral-600">{run.job_data_access || 'Not reported'}</TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Tooltip content="Open live run details.">
                          <Button asChild variant="outline" size="icon" className="h-7 w-7"><Link to={`/runs/${encodeURIComponent(run.run_id)}`} aria-label={`View run ${run.run_id}`}><Eye className="h-3.5 w-3.5" /></Link></Button>
                        </Tooltip>
                        {run.status === 'running' ? <Button variant="outline" size="icon" className="h-7 w-7" disabled={busy} aria-label={`Pause run ${run.run_id}`} onClick={() => confirmRunAction(run, 'pause')}><Pause className="h-3.5 w-3.5" /></Button> : null}
                        {run.status === 'paused' ? <Button variant="outline" size="icon" className="h-7 w-7" disabled={busy} aria-label={`Resume run ${run.run_id}`} onClick={() => confirmRunAction(run, 'resume')}><RotateCcw className="h-3.5 w-3.5" /></Button> : null}
                        {isActiveJobStatus(run.status) ? <Button variant="outline" size="icon" className="h-7 w-7 border-red-200 text-red-700" disabled={busy} aria-label={`Cancel run ${run.run_id}`} onClick={() => confirmRunAction(run, 'cancel')}><Ban className="h-3.5 w-3.5" /></Button> : null}
                        {isTerminalJobStatus(run.status) ? <Button variant="outline" size="icon" className="h-7 w-7 border-red-200 text-red-700" disabled={busy} aria-label={`Delete run ${run.run_id}`} onClick={() => confirmRunAction(run, 'delete')}><Trash2 className="h-3.5 w-3.5" /></Button> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <details className="rounded-lg border border-neutral-200 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-neutral-700">Configuration and storage</summary>
        <pre className="overflow-auto border-t border-neutral-200 bg-neutral-950 p-4 text-[11px] leading-5 text-neutral-200">{JSON.stringify({ resolved_configuration: job.resolved_configuration, storage: job.storage, schedules: job.schedules, bundle_ref: job.bundle_ref }, null, 2)}</pre>
      </details>
    </div>
  );
}
