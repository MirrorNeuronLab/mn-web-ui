import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBlueprints, fetchLaunchProgress, launchBlueprintJob, uploadBundle } from '../api';
import type { Blueprint, LaunchProgressEvent } from '../api';
import { CheckCircle, FileArchive, FolderInput, Loader2, Play, UploadCloud, Workflow, XCircle } from 'lucide-react';
import { confirmActionToast } from '../components/ui/confirm-toast';
import { Tooltip } from '../components/ui/tooltip';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Progress } from '../components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';
import { cn } from '../lib/utils';

type LaunchMode = 'blueprint' | 'path' | 'bundle';

type UploadedBundle = {
  bundle_path: string;
  manifest: Record<string, unknown> & { graph_id?: string; job_name?: string };
};

type ApiError = {
  response?: {
    data?: {
      error?: string;
      detail?: string | { error?: string; message?: string };
      validation?: {
        errors?: string[];
        issues?: Array<{ message?: string; help?: string; location?: { path?: string } }>;
      };
      errors?: Array<{ message?: string; help?: string; location?: { path?: string } }>;
    };
  };
  message?: string;
};

const modeTabs: Array<{ id: LaunchMode; label: string; description: string }> = [
  { id: 'blueprint', label: 'Blueprint', description: 'Choose an installed blueprint from the catalog.' },
  { id: 'path', label: 'File system path', description: 'Run a local blueprint folder on this machine.' },
  { id: 'bundle', label: 'ZIP bundle', description: 'Upload a zipped bundle with manifest.json and payloads/.' },
];

const launchPhases = [
  { id: 'resolve_source', label: 'Resolve blueprint source' },
  { id: 'model_install', label: 'Install required runtime models' },
  { id: 'validation', label: 'Validate blueprint and inputs' },
  { id: 'submit', label: 'Submit job to runtime' },
  { id: 'launch', label: 'Open job progress' },
] as const;

const makeProgressId = () => `launch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const latestEventsByPhase = (events: LaunchProgressEvent[]) => events.reduce<Record<string, LaunchProgressEvent>>((acc, event) => {
  if (event.phase) acc[event.phase] = event;
  return acc;
}, {});

const normalizedStatus = (value: unknown) => String(value || 'pending').trim().toLowerCase();

function LaunchProgressModal({
  events,
  open,
  running,
  onClose,
}: {
  events: LaunchProgressEvent[];
  open: boolean;
  running: boolean;
  onClose: () => void;
}) {
  const byPhase = latestEventsByPhase(events);
  const completedCount = launchPhases.filter((phase) => {
    const status = normalizedStatus(byPhase[phase.id]?.status);
    return status === 'completed' || status === 'skipped';
  }).length;
  const hasActivePhase = launchPhases.some((phase) => normalizedStatus(byPhase[phase.id]?.status) === 'running');
  const progressValue = Math.min(
    100,
    Math.round(((completedCount + (hasActivePhase ? 0.45 : 0)) / launchPhases.length) * 100),
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
          {launchPhases.map((phase) => {
            const event = byPhase[phase.id];
            const status = normalizedStatus(event?.status);
            const failed = status === 'failed';
            const completed = status === 'completed';
            const active = status === 'running';
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
                  {showMessage && event?.message ? (
                    <div className="mt-0.5 text-xs leading-5 text-neutral-500">{event.message}</div>
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

const issueText = (issue: { message?: string; help?: string; location?: { path?: string } }) => {
  const path = issue.location?.path ? `${issue.location.path}: ` : '';
  return `${path}${issue.message || issue.help || 'Validation issue'}`;
};

const errorMessage = (err: unknown, fallback: string) => {
  const apiError = err as ApiError;
  const data = apiError.response?.data;
  const validationErrors = data?.validation?.errors || [];
  if (validationErrors.length > 0) return validationErrors.join('\n');
  const validationIssues = data?.validation?.issues || data?.errors || [];
  if (validationIssues.length > 0) return validationIssues.map(issueText).join('\n');
  if (data?.error) return data.error;
  if (typeof data?.detail === 'string') return data.detail;
  if (data?.detail?.error) return data.detail.error;
  if (data?.detail?.message) return data.detail.message;
  return apiError.message || fallback;
};

export default function RunJob() {
  const [mode, setMode] = useState<LaunchMode>('blueprint');
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');
  const [pathValue, setPathValue] = useState('');
  const [bundleData, setBundleData] = useState<UploadedBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingBlueprints, setLoadingBlueprints] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progressId, setProgressId] = useState<string | null>(null);
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
          setBlueprints(response.blueprints || []);
          setSelectedBlueprintId((current) => current || response.blueprints?.[0]?.id || '');
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(errorMessage(err, 'Failed to load blueprints'));
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

  const refreshLaunchProgress = useCallback(async (id: string) => {
    try {
      const progress = await fetchLaunchProgress(id);
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
        if (!cancelled) setProgressEvents(progress.events || []);
      } catch {
        // The launch request is still the source of truth; a missed progress poll is harmless.
      }
    };
    void loadProgress();
    const timer = window.setInterval(loadProgress, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [progressId, running]);

  const canLaunch =
    !running &&
    ((mode === 'blueprint' && Boolean(selectedBlueprintId)) ||
      (mode === 'path' && Boolean(pathValue.trim())) ||
      (mode === 'bundle' && Boolean(bundleData?.bundle_path)));

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const selectedFile = e.target.files[0];

    confirmActionToast({
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
        description: String(result.manifest.graph_id || result.manifest.job_name || selectedFile.name),
      }),
      error: (err) => ({
        title: 'Upload failed',
        description: errorMessage(err, 'Failed to upload bundle'),
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
          const message = errorMessage(err, 'Failed to upload bundle');
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
    if (mode === 'blueprint') return { source: 'catalog', blueprint_id: selectedBlueprintId, progress_id: launchProgressId };
    if (mode === 'path') return { source: 'path', path: pathValue.trim(), progress_id: launchProgressId };
    return { source: 'bundle', _bundle_path: bundleData?.bundle_path, progress_id: launchProgressId };
  };

  const launchSummary = () => {
    if (mode === 'blueprint') return selectedBlueprint?.name || selectedBlueprintId;
    if (mode === 'path') return pathValue.trim();
    return String(bundleData?.manifest.graph_id || bundleData?.manifest.job_name || bundleData?.bundle_path || 'uploaded bundle');
  };

  const confirmLaunch = () => {
    if (!canLaunch) return;

    const summary = launchSummary();
    const launchProgressId = makeProgressId();
    confirmActionToast({
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
        description: errorMessage(err, 'Failed to validate and launch job'),
      }),
      onConfirm: async () => {
        setRunning(true);
        setError(null);
        setProgressId(launchProgressId);
        setProgressModalOpen(true);
        setProgressEvents([{
          ts: new Date().toISOString(),
          phase: 'resolve_source',
          status: 'running',
          message: 'Starting launch.',
        }]);
        try {
          const res = await launchBlueprintJob(launchPayload(launchProgressId));
          await refreshLaunchProgress(res.progress_id || launchProgressId);
          const jobId = res.job_id || res.id;
          if (!jobId) throw new Error('Launch succeeded but no job id was returned.');
          setRunning(false);
          navigate(`/jobs/${jobId}`);
          return jobId;
        } catch (err: unknown) {
          await refreshLaunchProgress(launchProgressId);
          const message = errorMessage(err, 'Failed to validate and launch job');
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
                      placeholder="/Users/homer/Projects/mirror-neuron-set/otterdesk-blueprints/video_watch_assistant"
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
                            Workflow ID: <strong className="font-mono">{bundleData.manifest.graph_id || bundleData.manifest.job_name || 'bundle'}</strong>
                          </p>
                          <p className="mt-1 font-mono text-xs text-neutral-500">{bundleData.bundle_path}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {error ? (
                <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-neutral-200 pt-4">
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
          </Tabs>
        </CardContent>
      </Card>
      <LaunchProgressModal
        events={progressEvents}
        open={progressModalOpen && (running || progressEvents.length > 0)}
        running={running}
        onClose={() => setProgressModalOpen(false)}
      />
    </div>
  );
}
