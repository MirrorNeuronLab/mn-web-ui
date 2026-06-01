import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBlueprints, launchBlueprintJob, uploadBundle } from '../api';
import type { Blueprint } from '../api';
import { CheckCircle, FileArchive, FolderInput, Loader2, Play, UploadCloud, Workflow } from 'lucide-react';

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
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
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
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedBlueprint = useMemo(
    () => blueprints.find((blueprint) => blueprint.id === selectedBlueprintId),
    [blueprints, selectedBlueprintId],
  );

  const canLaunch =
    !running &&
    ((mode === 'blueprint' && Boolean(selectedBlueprintId)) ||
      (mode === 'path' && Boolean(pathValue.trim())) ||
      (mode === 'bundle' && Boolean(bundleData?.bundle_path)));

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const selectedFile = e.target.files[0];
    setUploading(true);
    setError(null);
    setBundleData(null);
    try {
      const res = await uploadBundle(selectedFile);
      setBundleData(res);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to upload bundle'));
    } finally {
      setUploading(false);
    }
  };

  const launchPayload = () => {
    if (mode === 'blueprint') return { source: 'catalog', blueprint_id: selectedBlueprintId };
    if (mode === 'path') return { source: 'path', path: pathValue.trim() };
    return { source: 'bundle', _bundle_path: bundleData?.bundle_path };
  };

  const handleLaunch = async () => {
    if (!canLaunch) return;
    try {
      setRunning(true);
      setError(null);
      const res = await launchBlueprintJob(launchPayload());
      const jobId = res.job_id || res.id;
      if (!jobId) throw new Error('Launch succeeded but no job id was returned.');
      navigate(`/jobs/${jobId}`);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Failed to validate and launch job'));
      setRunning(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 bg-neutral-50/50 px-6 py-4">
          <h2 className="font-semibold text-neutral-950">Run a job</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Pick one source. The API validates with <span className="font-mono">mn blueprint validate</span>, then launches with <span className="font-mono">mn blueprint run --detached</span>.
          </p>
        </div>

        <div className="border-b border-neutral-200 px-6 pt-4">
          <div className="flex flex-wrap gap-2">
            {modeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setMode(tab.id);
                  setError(null);
                }}
                className={`rounded-md border px-4 py-2 text-sm font-medium ${mode === tab.id ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="py-3 text-sm text-neutral-500">{modeTabs.find((tab) => tab.id === mode)?.description}</p>
        </div>

        <div className="space-y-6 p-6">
          {mode === 'blueprint' ? (
            <div className="space-y-4">
              <label className="block text-sm font-medium text-neutral-700" htmlFor="blueprint-select">Blueprint</label>
              <div className="flex items-center gap-3">
                <Workflow className="h-5 w-5 text-neutral-400" />
                <select
                  id="blueprint-select"
                  value={selectedBlueprintId}
                  onChange={(event) => setSelectedBlueprintId(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
                  disabled={loadingBlueprints || running}
                >
                  {blueprints.map((blueprint) => (
                    <option key={blueprint.id} value={blueprint.id}>
                      {blueprint.name || blueprint.id}
                    </option>
                  ))}
                </select>
              </div>
              {loadingBlueprints ? <div className="text-sm text-neutral-500">Loading blueprints...</div> : null}
              {!loadingBlueprints && blueprints.length === 0 ? <div className="text-sm text-neutral-500">No blueprints available.</div> : null}
              {selectedBlueprint ? (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                  <div className="font-medium text-neutral-950">{selectedBlueprint.name || selectedBlueprint.id}</div>
                  {selectedBlueprint.description ? <div className="mt-1">{selectedBlueprint.description}</div> : null}
                  <div className="mt-2 font-mono text-xs text-neutral-500">{selectedBlueprint.id}</div>
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === 'path' ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-neutral-700" htmlFor="path-input">Blueprint folder path</label>
              <div className="flex items-center gap-3">
                <FolderInput className="h-5 w-5 text-neutral-400" />
                <input
                  id="path-input"
                  type="text"
                  value={pathValue}
                  onChange={(event) => setPathValue(event.target.value)}
                  placeholder="/Users/homer/Projects/mirror-neuron-set/otterdesk-blueprints/video_watch_assistant"
                  className="h-10 min-w-0 flex-1 rounded-md border border-neutral-300 px-3 font-mono text-sm text-neutral-950 focus:border-neutral-950 focus:outline-none"
                  disabled={running}
                />
              </div>
            </div>
          ) : null}

          {mode === 'bundle' ? (
            <div className="space-y-4">
              {!bundleData ? (
                <div className="relative rounded-xl border-2 border-dashed border-neutral-300 p-8 text-center transition-colors hover:bg-neutral-50">
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleFileChange}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    disabled={uploading || running}
                  />
                  <UploadCloud className={`mx-auto mb-4 h-12 w-12 ${uploading ? 'animate-bounce text-neutral-500' : 'text-neutral-400'}`} />
                  {uploading ? (
                    <div className="flex items-center justify-center text-neutral-950">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      <p className="text-sm font-medium">Uploading bundle...</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-neutral-700">Click to upload or drag and drop</p>
                      <p className="mt-1 text-xs text-neutral-500">.zip files only</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-neutral-700" />
                    <div>
                      <h3 className="text-sm font-medium text-neutral-950">Bundle uploaded</h3>
                      <p className="mt-1 text-xs text-neutral-700">
                        Graph ID: <strong className="font-mono">{bundleData.manifest.graph_id || bundleData.manifest.job_name || 'bundle'}</strong>
                      </p>
                      <p className="mt-1 font-mono text-xs text-neutral-500">{bundleData.bundle_path}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {error ? (
            <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-3 border-t border-neutral-200 pt-5">
            {mode === 'bundle' && bundleData ? (
              <button
                type="button"
                onClick={() => {
                  setBundleData(null);
                  setError(null);
                }}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
                disabled={running}
              >
                Choose another ZIP
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleLaunch}
              disabled={!canLaunch}
              className="flex items-center rounded-md bg-neutral-950 px-6 py-2 font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === 'bundle' ? <FileArchive className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {running ? 'Validating...' : 'Launch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
