import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBlueprints, launchBlueprintJob, uploadBundle } from '../api';
import type { Blueprint, LaunchProgressEvent, LaunchProgressPhase, LaunchProgressResponse } from '../api';
import { CheckCircle, FileArchive, Loader2, Play, UploadCloud, Workflow, XCircle } from 'lucide-react';
import { confirmActionDialog } from '../components/ui/confirm-action';
import { Tooltip } from '../components/ui/tooltip';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '../lib/utils';
import { apiErrorMessage } from '../utils/apiErrors';
import { parseConfigOverrideAssignments } from '../utils/configOverrides';

type LaunchMode = 'blueprint' | 'bundle';

type UploadedBundle = {
  bundle_id: string;
};

const modeTabs: Array<{ id: LaunchMode; label: string; description: string }> = [
  { id: 'blueprint', label: 'Blueprint', description: 'Choose an installed blueprint from the catalog.' },
  { id: 'bundle', label: 'ZIP bundle', description: 'Upload a zipped bundle with manifest.json and payloads/.' },
];

const launchPhases = [
  { id: 'resolve_source', label: 'Resolve blueprint source' },
  { id: 'requirements', label: 'Check runtime requirements' },
  { id: 'model_install', label: 'Validate runtime model declarations' },
  { id: 'validation', label: 'Validate blueprint and inputs' },
  { id: 'submit', label: 'Submit job to runtime' },
  { id: 'open_job_progress', label: 'Open run progress' },
] as const;

type LaunchProgressItem = {
  id: string;
  label: string;
  status: string;
  message: string;
  detail: string | undefined;
  expectation: string | undefined;
};

const FAILED_LAUNCH_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled']);
const COMPLETED_LAUNCH_STATUSES = new Set(['completed', 'succeeded', 'success']);

const stringValue = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
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

const progressRunId = (progress: LaunchProgressResponse | null | undefined) => (
  stringValue(progress?.run_id)
);

const launchResponseRunId = (response: { run_id?: string | null; id?: string | null }) => (
  stringValue(response.run_id) || stringValue(response.id)
);

const phaseId = (phase: LaunchProgressPhase) => (
  normalizedKey(phase.id || phase.phase || phase.name || phase.label)
);

const labelFromPhase = (phase: LaunchProgressPhase, id: string) => (
  stringValue(phase.label) || stringValue(phase.name) || id.replace(/_/g, ' ')
);

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

  const runIsReady = Boolean(progressRunId(progress));
  if (backendItems.length > 0) {
    return runIsReady
      ? [
        ...backendItems,
        {
          id: 'open_job_progress',
          label: 'Open run progress',
          status: 'completed',
          message: 'Execution run is ready.',
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
    !runIsReady &&
    !progress.completed &&
    !hasConcreteEvent &&
    (progressStatus === 'launching' || progressStatus === 'running' || progressStatus === 'pending')
  );

  return launchPhases.map((phase) => {
    if (phase.id === 'open_job_progress') {
      return {
        id: phase.id,
        label: phase.label,
        status: runIsReady ? 'completed' : 'pending',
        message: runIsReady ? 'Execution run is ready.' : '',
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

export default function RunJob() {
  const [mode, setMode] = useState<LaunchMode>('blueprint');
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');
  const [bundleData, setBundleData] = useState<UploadedBundle | null>(null);
  const [configAssignments, setConfigAssignments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progressEvents, setProgressEvents] = useState<LaunchProgressEvent[]>([]);
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
          setBlueprints(response.items || []);
          setSelectedBlueprintId((current) => current || response.items?.[0]?.id || '');
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

  const canLaunch =
    !running &&
    parsedConfigOverrides.ok &&
    ((mode === 'blueprint' && Boolean(selectedBlueprintId)) ||
      (mode === 'bundle' && Boolean(bundleData?.bundle_id)));

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
        description: `${selectedFile.name} · ${result.bundle_id}`,
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

  const launchPayload = () => {
    const config_overrides = parsedConfigOverrides.ok && parsedConfigOverrides.count
      ? parsedConfigOverrides.value
      : undefined;
    if (mode === 'blueprint') return { source: 'catalog', blueprint_id: selectedBlueprintId, config_overrides };
    return { source: 'bundle', bundle_id: bundleData?.bundle_id, config_overrides };
  };

  const launchSummary = () => {
    if (mode === 'blueprint') return selectedBlueprint?.name || selectedBlueprintId;
    return bundleData?.bundle_id || 'uploaded bundle';
  };

  const confirmLaunch = () => {
    if (!canLaunch) return;

    const summary = launchSummary();
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
      success: (runId: string) => ({
        title: 'Run launched',
        description: runId,
      }),
      error: (err) => ({
        title: 'Launch failed',
        description: apiErrorMessage(err, 'Failed to validate and launch job'),
      }),
      onConfirm: async () => {
        setRunning(true);
        setError(null);
        setProgressModalOpen(true);
        setProgressEvents([{
          ts: new Date().toISOString(),
          phase: 'resolve_source',
          status: 'running',
          message: 'Starting launch.',
        }]);
        try {
          const response = await launchBlueprintJob(launchPayload());
          const runId = launchResponseRunId(response);
          if (!runId) throw new Error('Run creation did not return a run id.');
          setProgressEvents((events) => [...events, {
            ts: new Date().toISOString(),
            phase: 'submit',
            status: 'completed',
            message: 'Run accepted by the runtime.',
          }]);
          setRunning(false);
          navigate(`/runs/${encodeURIComponent(runId)}`);
          return runId;
        } catch (err: unknown) {
          const message = apiErrorMessage(err, 'Failed to validate and launch job');
          setError(message);
          setProgressEvents((events) => [...events, {
            ts: new Date().toISOString(),
            phase: 'submit',
            status: 'failed',
            message,
          }]);
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
    setProgressEvents([]);
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
                            Bundle ID: <strong className="font-mono">{bundleData.bundle_id}</strong>
                          </p>
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
        progress={null}
        open={progressModalOpen && (running || progressEvents.length > 0)}
        running={running}
        onClose={() => setProgressModalOpen(false)}
      />
    </div>
  );
}
