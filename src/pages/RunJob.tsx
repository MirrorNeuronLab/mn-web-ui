import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBlueprints, fetchLaunchProgress, launchBlueprintJob, uploadBundle } from '../api';
import type { Blueprint, LaunchProgressEvent, LaunchProgressPhase, LaunchProgressResponse } from '../api';
import { CheckCircle, FileArchive, FolderInput, Loader2, Play, UploadCloud, Workflow, XCircle } from 'lucide-react';
import { confirmActionDialog } from '../components/ui/confirm-action';
import { Tooltip } from '../components/ui/tooltip';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '../lib/utils';
import { apiErrorMessage } from '../utils/apiErrors';
import { parseConfigOverrideAssignments } from '../utils/configOverrides';

type LaunchMode = 'blueprint' | 'path' | 'bundle';

type UploadedBundle = {
  bundle_path: string;
  manifest: Record<string, unknown>;
};

const modeTabs: Array<{ id: LaunchMode; label: string; description: string }> = [
  { id: 'blueprint', label: 'Blueprint', description: 'Choose an installed blueprint from the catalog.' },
  { id: 'path', label: 'File system path', description: 'Run a local blueprint folder on this machine.' },
  { id: 'bundle', label: 'ZIP bundle', description: 'Upload a zipped bundle with manifest.json and payloads/.' },
];

const launchPhases = [
  { id: 'resolve_source', label: 'Resolve blueprint source' },
  { id: 'requirements', label: 'Check runtime requirements' },
  { id: 'model_install', label: 'Install required runtime models' },
  { id: 'validation', label: 'Validate blueprint and inputs' },
  { id: 'submit', label: 'Submit job to runtime' },
  { id: 'open_job_progress', label: 'Open job progress' },
] as const;

type LaunchProgressItem = {
  id: string;
  label: string;
  status: string;
  message: string;
  detail: string | undefined;
  expectation: string | undefined;
};

type LaunchHandoff =
  | { type: 'response'; response: Awaited<ReturnType<typeof launchBlueprintJob>> }
  | { type: 'progress'; jobId: string };

const LAUNCH_PROGRESS_POLL_MS = 1000;
const LAUNCH_JOB_ID_TIMEOUT_MS = 90 * 60 * 1000;
const FAILED_LAUNCH_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled']);
const COMPLETED_LAUNCH_STATUSES = new Set(['completed', 'succeeded', 'success']);

const makeProgressId = () => `launch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const stringValue = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);
const normalizedKey = (value: unknown) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const latestEventsByPhase = (events: LaunchProgressEvent[]) => events.reduce<Record<string, LaunchProgressEvent>>((acc, event) => {
  const key = normalizedKey(event.phase);
  if (key && key !== 'launch') acc[key] = event;
  return acc;
}, {});

const normalizedStatus = (value: unknown) => String(value || 'pending').trim().toLowerCase();

const progressJobId = (progress: LaunchProgressResponse | null | undefined) => (
  stringValue(progress?.job_id)
);

const launchResponseJobId = (response: { job_id?: string | null; id?: string | null }) => (
  stringValue(response.job_id) || stringValue(response.id)
);

const phaseId = (phase: LaunchProgressPhase) => (
  normalizedKey(phase.id || phase.phase || phase.name || phase.label)
);

const labelFromPhase = (phase: LaunchProgressPhase, id: string) => (
  stringValue(phase.label) || stringValue(phase.name) || id.replace(/_/g, ' ')
);

const messageFromProgressError = (error: unknown) => {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (!isRecord(error)) return null;
  const detail = error.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (isRecord(detail)) return stringValue(detail.message) || stringValue(detail.error);
  return stringValue(error.message) || stringValue(error.desc) || stringValue(error.error);
};

const launchProgressFailureMessage = (progress: LaunchProgressResponse | null | undefined) => {
  if (!progress) return null;
  const status = normalizedStatus(progress.status);
  const latestStatus = normalizedStatus(progress.latest?.status);
  if (!FAILED_LAUNCH_STATUSES.has(status) && !FAILED_LAUNCH_STATUSES.has(latestStatus)) return null;
  return (
    messageFromProgressError(progress.error) ||
    stringValue(progress.latest?.message) ||
    'Blueprint launch failed.'
  );
};

const buildProgressItems = (
  progress: LaunchProgressResponse | null,
  events: LaunchProgressEvent[],
): LaunchProgressItem[] => {
  const byPhase = latestEventsByPhase(events);
  const backendItems = (progress?.phases || [])
    .map((phase) => {
      const id = phaseId(phase);
      if (!id || id === 'launch') return null;
      const event = byPhase[id];
      return {
        id,
        label: labelFromPhase(phase, id),
        status: normalizedStatus(phase.status || event?.status),
        message: stringValue(phase.message) || stringValue(phase.detail) || stringValue(event?.message) || '',
        detail: stringValue(phase.detail) || undefined,
        expectation: stringValue(phase.expectation) || undefined,
      };
    })
    .filter((item): item is LaunchProgressItem => Boolean(item));

  const jobIsReady = Boolean(progressJobId(progress));
  if (backendItems.length > 0) {
    return jobIsReady
      ? [
        ...backendItems,
        {
          id: 'open_job_progress',
          label: 'Open job progress',
          status: 'completed',
          message: 'Runtime job is ready.',
          detail: undefined,
          expectation: undefined,
        },
      ]
      : backendItems;
  }

  const progressStatus = normalizedStatus(progress?.status);
  const hasConcreteEvent = Object.keys(byPhase).length > 0;
  const showOverallLaunchActivity = Boolean(
    progress &&
    !jobIsReady &&
    !progress.completed &&
    !hasConcreteEvent &&
    (progressStatus === 'launching' || progressStatus === 'running' || progressStatus === 'pending')
  );

  return launchPhases.map((phase) => {
    if (phase.id === 'open_job_progress') {
      return {
        id: phase.id,
        label: phase.label,
        status: jobIsReady ? 'completed' : 'pending',
        message: jobIsReady ? 'Runtime job is ready.' : '',
        detail: undefined,
        expectation: undefined,
      };
    }
    const event = byPhase[phase.id];
    const useOverallStatus = phase.id === 'resolve_source' && showOverallLaunchActivity;
    return {
      id: phase.id,
      label: phase.label,
      status: useOverallStatus ? 'running' : normalizedStatus(event?.status),
      message: stringValue(event?.message) || (useOverallStatus ? stringValue(progress?.latest?.message) || 'Resolving blueprint source.' : ''),
      detail: undefined,
      expectation: undefined,
    };
  });
};

function LaunchProgressModal({
  events,
  progress,
  open,
  running,
  onClose,
}: {
  events: LaunchProgressEvent[];
  progress: LaunchProgressResponse | null;
  open: boolean;
  running: boolean;
  onClose: () => void;
}) {
  const items = buildProgressItems(progress, events);
  const completedCount = items.filter((item) => {
    const status = normalizedStatus(item.status);
    return COMPLETED_LAUNCH_STATUSES.has(status) || status === 'skipped';
  }).length;
  const hasActivePhase = items.some((item) => ['running', 'launching'].includes(normalizedStatus(item.status)));
  const progressValue = Math.min(
    100,
    Math.round(((completedCount + (hasActivePhase ? 0.45 : 0)) / Math.max(1, items.length)) * 100),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !running) onClose();
      }}
    >
      <DialogContent className="max-w-md gap-4 p-5" showClose={!running}>
        <DialogHeader>
          <DialogTitle>Progress</DialogTitle>
          <DialogDescription className="sr-only">
            Track blueprint source resolution, model installation, validation, submission, and job handoff.
          </DialogDescription>
        </DialogHeader>
        <Progress value={progressValue} aria-label="Launch progress" />
        <ol className="space-y-3">
          {items.map((phase) => {
            const status = normalizedStatus(phase.status);
            const failed = FAILED_LAUNCH_STATUSES.has(status);
            const completed = COMPLETED_LAUNCH_STATUSES.has(status);
            const active = status === 'running' || status === 'launching';
            const skipped = status === 'skipped';
            const showMessage = active || failed;
            const labelTone = failed
              ? 'text-red-700'
              : completed || skipped || active
                ? 'text-neutral-800'
                : 'text-neutral-400';
            return (
              <li key={phase.id} className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {failed ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : completed || skipped ? (
                    <CheckCircle className="h-4 w-4 text-neutral-700" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 animate-spin text-neutral-700" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border-2 border-neutral-300" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn('text-sm font-medium leading-5', labelTone)}>{phase.label}</div>
                  {showMessage && phase.message ? (
                    <div className="mt-0.5 text-xs leading-5 text-neutral-500">{phase.message}</div>
                  ) : null}
                  {showMessage && phase.detail && phase.detail !== phase.message ? (
                    <div className="text-xs leading-5 text-neutral-500">{phase.detail}</div>
                  ) : null}
                  {showMessage && phase.expectation ? (
                    <div className="text-xs leading-5 text-neutral-500">{phase.expectation}</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

const manifestLabel = (manifest: Record<string, unknown>, fallback = 'uploaded bundle') => {
  const graphId = typeof manifest.graph_id === 'string' && manifest.graph_id.trim() ? manifest.graph_id.trim() : '';
  const jobName = typeof manifest.job_name === 'string' && manifest.job_name.trim() ? manifest.job_name.trim() : '';
  return graphId || jobName || fallback;
};

export default function RunJob() {
  const [mode, setMode] = useState<LaunchMode>('blueprint');
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');
  const [pathValue, setPathValue] = useState('');
  const [bundleData, setBundleData] = useState<UploadedBundle | null>(null);
  const [configAssignments, setConfigAssignments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progressId, setProgressId] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<LaunchProgressEvent[]>([]);
  const [launchProgress, setLaunchProgress] = useState<LaunchProgressResponse | null>(null);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingBlueprints(true);
      fetchBlueprints()
        .then((response) => {
          if (cancelled) return;
          setBlueprints(response.blueprints || []);
          setSelectedBlueprintId((current) => current || response.blueprints?.[0]?.id || '');
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(apiErrorMessage(err, 'Failed to load blueprints'));
        })
        .finally(() => {
          if (!cancelled) setLoadingBlueprints(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const selectedBlueprint = useMemo(
    () => blueprints.find((blueprint) => blueprint.id === selectedBlueprintId),
    [blueprints, selectedBlueprintId],
  );

  const parsedConfigOverrides = useMemo(
    () => parseConfigOverrideAssignments(configAssignments),
    [configAssignments],
  );

  const refreshLaunchProgress = useCallback(async (id: string) => {
    try {
      const progress = await fetchLaunchProgress(id);
      setLaunchProgress(progress);
      setProgressEvents(progress.events || []);
      return progress;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!running || !progressId) return undefined;
    let cancelled = false;
    const loadProgress = async () => {
      try {
        const progress = await fetchLaunchProgress(progressId);
        if (!cancelled) {
          setLaunchProgress(progress);
          setProgressEvents(progress.events || []);
        }
      } catch {
        // The launch request is still the source of truth; a missed progress poll is harmless.
      }
    };
    void loadProgress();
    const timer = window.setInterval(loadProgress, LAUNCH_PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [progressId, running]);

  const canLaunch =
    !running &&
    parsedConfigOverrides.ok &&
    ((mode === 'blueprint' && Boolean(selectedBlueprintId)) ||
      (mode === 'path' && Boolean(pathValue.trim())) ||
      (mode === 'bundle' && Boolean(bundleData?.bundle_path)));

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const selectedFile = e.target.files[0];

    confirmActionDialog({
      id: `bundle-upload-${selectedFile.name}`,
      title: 'Upload this ZIP bundle?',
      description: `${selectedFile.name} will be uploaded and validated as a MirrorNeuron bundle source.`,
      confirmLabel: 'Upload ZIP',
      cancelLabel: 'Choose later',
      loading: {
        title: 'Uploading bundle',
        description: selectedFile.name,
      },
      success: (result: UploadedBundle) => ({
        title: 'Bundle uploaded',
        description: manifestLabel(result.manifest, selectedFile.name),
      }),
      error: (err) => ({
        title: 'Upload failed',
        description: apiErrorMessage(err, 'Failed to upload bundle'),
      }),
      onCancel: resetFileInput,
      onConfirm: async () => {
        setUploading(true);
        setError(null);
        setBundleData(null);
        try {
          const res = await uploadBundle(selectedFile);
          setBundleData(res);
          resetFileInput();
          return res;
        } catch (err: unknown) {
          const message = apiErrorMessage(err, 'Failed to upload bundle');
          setError(message);
          resetFileInput();
          throw new Error(message);
        } finally {
          setUploading(false);
        }
      },
    });
  };

  const launchPayload = (launchProgressId: string) => {
    const config_overrides = parsedConfigOverrides.ok && parsedConfigOverrides.count
      ? parsedConfigOverrides.value
      : undefined;
    if (mode === 'blueprint') return { source: 'catalog', blueprint_id: selectedBlueprintId, progress_id: launchProgressId, config_overrides };
    if (mode === 'path') return { source: 'path', path: pathValue.trim(), progress_id: launchProgressId, config_overrides };
    return { source: 'bundle', _bundle_path: bundleData?.bundle_path, progress_id: launchProgressId, config_overrides };
  };

  const launchSummary = () => {
    if (mode === 'blueprint') return selectedBlueprint?.name || selectedBlueprintId;
    if (mode === 'path') return pathValue.trim();
    return bundleData ? manifestLabel(bundleData.manifest, bundleData.bundle_path || 'uploaded bundle') : 'uploaded bundle';
  };

  const waitForLaunchJobId = useCallback(async (id: string, initialProgress: LaunchProgressResponse | null) => {
    let current = initialProgress;
    const startedAt = Date.now();

    while (Date.now() - startedAt <= LAUNCH_JOB_ID_TIMEOUT_MS) {
      if (!current) current = await refreshLaunchProgress(id);

      const jobId = progressJobId(current);
      if (jobId) return jobId;

      const failureMessage = launchProgressFailureMessage(current);
      if (failureMessage) throw new Error(failureMessage);

      if (current?.completed) throw new Error('Launch completed but no job id was returned.');

      await new Promise<void>((resolve) => window.setTimeout(resolve, LAUNCH_PROGRESS_POLL_MS));
      current = await refreshLaunchProgress(id);
    }

    throw new Error('Launch is still waiting for a runtime job id. Check launch progress and try again.');
  }, [refreshLaunchProgress]);

  const confirmLaunch = () => {
    if (!canLaunch) return;

    const summary = launchSummary();
    const launchProgressId = makeProgressId();
    confirmActionDialog({
      id: `launch-${mode}-${summary}`,
      title: 'Launch this job?',
      description: `Source: ${summary}`,
      confirmLabel: 'Launch',
      cancelLabel: 'Review',
      loading: {
        title: 'Launching job',
        description: 'Preparing launch steps.',
      },
      success: (jobId: string) => ({
        title: 'Job launched',
        description: jobId,
      }),
      error: (err) => ({
        title: 'Launch failed',
        description: apiErrorMessage(err, 'Failed to validate and launch job'),
      }),
      onConfirm: async () => {
        setRunning(true);
        setError(null);
        setProgressId(launchProgressId);
        setLaunchProgress(null);
        setProgressModalOpen(true);
        setProgressEvents([{
          ts: new Date().toISOString(),
          phase: 'resolve_source',
          status: 'running',
          message: 'Starting launch.',
        }]);
        let activeProgressId = launchProgressId;
        try {
          const launchRequest = launchBlueprintJob(launchPayload(launchProgressId));
          const handoff = await Promise.race<LaunchHandoff>([
            launchRequest.then((response) => ({ type: 'response', response })),
            waitForLaunchJobId(launchProgressId, null).then((jobId) => ({ type: 'progress', jobId })),
          ]);
          let jobId = '';
          if (handoff.type === 'progress') {
            jobId = handoff.jobId;
            void launchRequest.catch(() => undefined);
          } else {
            const res = handoff.response;
            activeProgressId = stringValue(res.progress_id) || launchProgressId;
            if (activeProgressId !== launchProgressId) setProgressId(activeProgressId);
            const progress = await refreshLaunchProgress(activeProgressId);
            jobId = launchResponseJobId(res) || progressJobId(progress) || await waitForLaunchJobId(activeProgressId, progress);
          }
          setRunning(false);
          navigate(`/jobs/${jobId}`);
          return jobId;
        } catch (err: unknown) {
          await refreshLaunchProgress(activeProgressId);
          const message = apiErrorMessage(err, 'Failed to validate and launch job');
          setError(message);
          setRunning(false);
          setProgressModalOpen(true);
          throw new Error(message);
        }
      },
    });
  };

  const selectMode = (nextMode: LaunchMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError(null);
    setProgressId(null);
    setProgressEvents([]);
    setLaunchProgress(null);
    setProgressModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Tabs
            value={mode}
            onValueChange={(value) => selectMode(value as LaunchMode)}
          >
            <div className="border-b border-neutral-200 px-5 pt-3">
              <TabsList className="flex w-fit flex-wrap">
                {modeTabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} onClick={() => selectMode(tab.id)}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <p className="py-2.5 text-xs text-neutral-500">{modeTabs.find((tab) => tab.id === mode)?.description}</p>
            </div>

            <div className="space-y-4 p-5">
              {mode === 'blueprint' ? (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-neutral-700" htmlFor="blueprint-select">Blueprint</label>
                  <div className="flex items-center gap-2.5">
                    <Workflow className="h-4 w-4 text-neutral-400" />
                    <select
                      id="blueprint-select"
                      value={selectedBlueprintId}
                      onChange={(event) => setSelectedBlueprintId(event.target.value)}
                      className="h-9 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-950 shadow-sm focus:border-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={loadingBlueprints || running}
                    >
                      {blueprints.map((blueprint) => (
                        <option key={blueprint.id} value={blueprint.id}>
                          {blueprint.name || blueprint.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  {loadingBlueprints ? <div className="text-xs text-neutral-500">Loading blueprints...</div> : null}
                  {!loadingBlueprints && blueprints.length === 0 ? <div className="text-xs text-neutral-500">No blueprints available.</div> : null}
                  {selectedBlueprint ? (
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                      <div className="font-medium text-neutral-950">{selectedBlueprint.name || selectedBlueprint.id}</div>
                      {selectedBlueprint.description ? <div className="mt-1">{selectedBlueprint.description}</div> : null}
                      <div className="mt-2 font-mono text-xs text-neutral-500">{selectedBlueprint.id}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {mode === 'path' ? (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-neutral-700" htmlFor="path-input">Blueprint folder path</label>
                  <div className="flex items-center gap-2.5">
                    <FolderInput className="h-4 w-4 text-neutral-400" />
                    <Input
                      id="path-input"
                      type="text"
                      value={pathValue}
                      onChange={(event) => setPathValue(event.target.value)}
                      placeholder="~/Projects/mirror-neuron-set/otterdesk-blueprints/video_watch_assistant"
                      className="min-w-0 flex-1 font-mono text-xs"
                      disabled={running}
                    />
                  </div>
                </div>
              ) : null}

              {mode === 'bundle' ? (
                <div className="space-y-4">
                  {!bundleData ? (
                    <Tooltip content="Choose a ZIP bundle, then confirm before it uploads.">
                      <div className="relative rounded-lg border-2 border-dashed border-neutral-300 p-6 text-center transition-colors hover:bg-neutral-50">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".zip"
                          onChange={handleFileChange}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          disabled={uploading || running}
                        />
                        <UploadCloud className={cn('mx-auto mb-3 h-10 w-10', uploading ? 'animate-bounce text-neutral-500' : 'text-neutral-400')} />
                        {uploading ? (
                          <div className="flex items-center justify-center text-neutral-950">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            <p className="text-xs font-medium">Uploading bundle...</p>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs font-medium text-neutral-700">Click to upload or drag and drop</p>
                            <p className="mt-1 text-xs text-neutral-500">.zip files only</p>
                          </>
                        )}
                      </div>
                    </Tooltip>
                  ) : (
                    <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
                      <div className="flex items-start gap-2.5">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-700" />
                        <div>
                          <h3 className="text-xs font-medium text-neutral-950">Bundle uploaded</h3>
                          <p className="mt-1 text-xs text-neutral-700">
                            Workflow ID: <strong className="font-mono">{manifestLabel(bundleData.manifest, 'bundle')}</strong>
                          </p>
                          <p className="mt-1 font-mono text-xs text-neutral-500">{bundleData.bundle_path}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              <details className="rounded-md border border-neutral-200 bg-neutral-50">
                <summary className="cursor-pointer select-none px-3 py-2.5 text-xs font-medium text-neutral-700">
                  Run configuration{parsedConfigOverrides.ok && parsedConfigOverrides.count ? ` (${parsedConfigOverrides.count} override${parsedConfigOverrides.count === 1 ? '' : 's'})` : ''}
                </summary>
                <div className="space-y-2 border-t border-neutral-200 p-3">
                  <label className="block text-xs font-medium text-neutral-700" htmlFor="config-overrides">
                    Configuration overrides
                  </label>
                  <textarea
                    id="config-overrides"
                    value={configAssignments}
                    onChange={(event) => setConfigAssignments(event.target.value)}
                    placeholder={'llm.configs.primary.context_size=8192\ninputs.payload.document_folder="/path/to/files"'}
                    className="min-h-24 w-full resize-y rounded-md border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-950 shadow-sm focus:border-neutral-950 focus:outline-none focus:ring-1 focus:ring-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={running}
                    aria-invalid={!parsedConfigOverrides.ok}
                    aria-describedby="config-overrides-help"
                  />
                  <p id="config-overrides-help" className="text-xs leading-5 text-neutral-500">
                    One <span className="font-mono">dotted.path=value</span> per line. JSON values become booleans, numbers, arrays, or objects; other values stay strings. These overrides apply only to this run.
                  </p>
                  {!parsedConfigOverrides.ok ? (
                    <p role="alert" className="text-xs text-red-700">{parsedConfigOverrides.error}</p>
                  ) : null}
                </div>
              </details>

              {error ? (
                <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-neutral-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-neutral-500">
                  Review the selected source before validation and launch.
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {mode === 'bundle' && bundleData ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBundleData(null);
                        setError(null);
                      }}
                      disabled={running}
                    >
                      Choose another ZIP
                    </Button>
                  ) : null}
                  <Tooltip content="Confirm the selected source before validation and launch.">
                    <span className="inline-flex">
                      <Button type="button" onClick={confirmLaunch} disabled={!canLaunch}>
                        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'bundle' ? <FileArchive className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {running ? 'Launching...' : 'Launch'}
                      </Button>
                    </span>
                  </Tooltip>
                </div>
              </div>
            </div>
          </Tabs>
        </CardContent>
      </Card>
      <LaunchProgressModal
        events={progressEvents}
        progress={launchProgress}
        open={progressModalOpen && (running || progressEvents.length > 0 || Boolean(launchProgress))}
        running={running}
        onClose={() => setProgressModalOpen(false)}
      />
    </div>
  );
}
