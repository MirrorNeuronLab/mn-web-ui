import { useCallback, useEffect, useMemo, useState } from 'react';
import { addClusterNode, fetchJobs, fetchSystemSummary, removeClusterNode } from '../api';
import type { Job, SystemSummary } from '../api';
import { Activity, BriefcaseBusiness, Cpu, Eye, EyeOff, Loader2, Plus, Server, Trash2, X } from 'lucide-react';

type PoolStats = {
  capacity?: number;
  available?: number;
  in_use?: number;
  queued?: number;
  active?: number;
};

const activeStatuses = new Set(['running', 'pending', 'paused']);

type ClusterActionMessage = {
  tone: 'success' | 'error';
  text: string;
};

export default function Dashboard() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addNodeDialogOpen, setAddNodeDialogOpen] = useState(false);
  const [remoteNodeHost, setRemoteNodeHost] = useState('');
  const [remoteNodeToken, setRemoteNodeToken] = useState('');
  const [addingNode, setAddingNode] = useState(false);
  const [removingNodeName, setRemovingNodeName] = useState<string | null>(null);
  const [clusterActionMessage, setClusterActionMessage] = useState<ClusterActionMessage | null>(null);

  const loadDashboard = useCallback(async () => {
    const [summaryResult, jobsResult] = await Promise.allSettled([
      fetchSystemSummary(),
      fetchJobs(),
    ]);

    if (summaryResult.status === 'fulfilled') {
      setSummary(summaryResult.value);
    } else {
      console.error('Failed to load system summary', summaryResult.reason);
      setSummary({ nodes: [], jobs: [] });
    }

    if (jobsResult.status === 'fulfilled') {
      setJobs(jobsResult.value);
    } else {
      console.error('Failed to load jobs', jobsResult.reason);
      setJobs(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);
    const refreshTimer = window.setInterval(() => {
      void loadDashboard();
    }, 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(refreshTimer);
    };
  }, [loadDashboard]);

  const handleAddClusterNode = async () => {
    const host = remoteNodeHost.trim();
    const token = remoteNodeToken.trim();
    if (!host || !token || addingNode) return;

    if (!isValidRemoteNodeHost(host)) {
      setClusterActionMessage({ tone: 'error', text: 'Use a host name or IP address without spaces.' });
      return;
    }

    if (!isValidRemoteNodeToken(token)) {
      setClusterActionMessage({ tone: 'error', text: 'Paste the token from the remote node.' });
      return;
    }

    setAddingNode(true);
    setClusterActionMessage(null);
    try {
      const result = await addClusterNode({ host, token });
      await loadDashboard();
      setRemoteNodeHost('');
      setRemoteNodeToken('');
      setAddNodeDialogOpen(false);
      setClusterActionMessage({
        tone: 'success',
        text: result.message || `${result.node_name || host} was added to this box.`,
      });
    } catch (error) {
      setClusterActionMessage({ tone: 'error', text: apiErrorMessage(error, `Could not add ${host}.`) });
    } finally {
      setAddingNode(false);
    }
  };

  const handleRemoveClusterNode = async (nodeName: string) => {
    if (!nodeName || nodeName === 'unknown' || removingNodeName) return;

    setRemovingNodeName(nodeName);
    setClusterActionMessage(null);
    try {
      const result = await removeClusterNode(nodeName);
      await loadDashboard();
      setClusterActionMessage({
        tone: 'success',
        text: result.message || `${nodeName} was removed from this box.`,
      });
    } catch (error) {
      setClusterActionMessage({ tone: 'error', text: apiErrorMessage(error, `Could not remove ${nodeName}.`) });
    } finally {
      setRemovingNodeName(null);
    }
  };

  const metricJobs = useMemo<Partial<Job>[]>(() => jobs ?? summary?.jobs ?? [], [jobs, summary]);

  const executorSlots = useMemo(() => {
    const pools = summary?.nodes.flatMap((node) => Object.values(node.executor_pools || {}) as PoolStats[]) || [];
    const reportedCapacity = pools.reduce((total, pool) => total + (pool.capacity ?? 0), 0);
    const reportedActive = pools.reduce((total, pool) => total + (pool.active ?? pool.in_use ?? 0), 0);
    const activeFromJobs = metricJobs.reduce((total, job) => total + numberValue(job.active_executors), 0);
    const requestedFromJobs = metricJobs.reduce((total, job) => total + numberValue(job.executor_count), 0);
    const active = Math.max(reportedActive, activeFromJobs);
    const capacity = reportedCapacity || Math.max(8, requestedFromJobs + 4, active + 4);

    return {
      active,
      capacity,
      available: Math.max(capacity - active, 0),
      queued: pools.reduce((total, pool) => total + (pool.queued ?? 0), 0),
    };
  }, [metricJobs, summary]);

  const totalJobs = metricJobs.length;
  const activeJobs = metricJobs.filter((job) => activeStatuses.has(job.status ?? '')).length;
  const clusterNodes = summary?.nodes.length || 0;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-lg border border-neutral-200 bg-white p-6">
              <div className="h-4 w-28 rounded bg-neutral-100" />
              <div className="mt-8 h-8 w-20 rounded bg-neutral-100" />
              <div className="mt-8 h-4 w-44 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
        <div className="h-64 rounded-lg border border-neutral-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={BriefcaseBusiness}
          label="Total Jobs"
          value={totalJobs.toLocaleString()}
          headline="All submitted workflow runs"
          detail={`${clusterNodes} cluster node${clusterNodes === 1 ? '' : 's'} connected`}
        />
        <MetricCard
          icon={Activity}
          label="Active Jobs"
          value={activeJobs.toLocaleString()}
          headline="Running, pending, or paused"
          detail={`${Math.max(totalJobs - activeJobs, 0)} terminal or idle jobs`}
        />
        <MetricCard
          icon={Cpu}
          label="Executor Slots"
          value={`${executorSlots.available}/${executorSlots.capacity}`}
          headline={`${executorSlots.active} in use right now`}
          detail={`Mock capacity from current usage${executorSlots.queued ? `, ${executorSlots.queued} queued` : ''}`}
        />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-neutral-200 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-950">Runtime Resources</h2>
            <p className="mt-1 text-sm text-neutral-500">Add exposed peer nodes to this box, or remove them from this box.</p>
          </div>
          <button
            type="button"
            onClick={() => setAddNodeDialogOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            <Plus className="h-4 w-4" />
            Add node
          </button>
        </div>
        {clusterActionMessage ? (
          <div className={`border-b px-6 py-3 text-sm ${
            clusterActionMessage.tone === 'success'
              ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
              : 'border-red-100 bg-red-50 text-red-800'
          }`}>
            {clusterActionMessage.text}
          </div>
        ) : null}
        <div className="divide-y divide-neutral-100">
          {(summary?.nodes || []).length === 0 ? (
            <div className="px-6 py-10 text-sm text-neutral-500">No cluster nodes reported yet.</div>
          ) : (
            summary?.nodes.map((node, index) => (
              <div key={`${node.name}-${index}`} className="px-6 py-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-neutral-500" />
                    <div>
                      <div className="font-medium text-neutral-950">{node.name}</div>
                      <div className="text-sm text-neutral-500">{node.self ? 'Local node' : 'Peer node'}</div>
                    </div>
                  </div>
                  {!node.self ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveClusterNode(node.name)}
                      disabled={removingNodeName === node.name}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {removingNodeName === node.name ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {Object.entries(node.executor_pools || {}).length === 0 ? (
                    <div className="rounded-lg border border-neutral-200 p-4 text-sm text-neutral-500">
                      No executor pools reported.
                    </div>
                  ) : (
                    Object.entries(node.executor_pools || {}).map(([poolName, stats]) => (
                      <div key={poolName} className="rounded-lg border border-neutral-200 p-4">
                        <div className="text-sm font-medium text-neutral-950">Pool: {poolName}</div>
                        <div className="mt-3 grid grid-cols-4 gap-3 text-sm">
                          <PoolMetric label="Capacity" value={stats.capacity} />
                          <PoolMetric label="Avail" value={stats.available} />
                          <PoolMetric label="Active" value={stats.active} />
                          <PoolMetric label="Queued" value={stats.queued} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AddClusterNodeDialog
        host={remoteNodeHost}
        adding={addingNode}
        onClose={() => {
          if (addingNode) return;
          setAddNodeDialogOpen(false);
          setRemoteNodeHost('');
          setRemoteNodeToken('');
        }}
        onHostChange={setRemoteNodeHost}
        onSubmit={handleAddClusterNode}
        onTokenChange={setRemoteNodeToken}
        open={addNodeDialogOpen}
        token={remoteNodeToken}
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  headline,
  detail,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  value: string;
  headline: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 text-sm font-medium text-neutral-500">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-neutral-500" />
      </div>
      <div className="mt-6 text-4xl font-semibold tracking-tight text-neutral-950">{value}</div>
      <div className="mt-8 text-sm font-medium text-neutral-950">{headline}</div>
      <div className="mt-2 text-sm text-neutral-500">{detail}</div>
    </div>
  );
}

function PoolMetric({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 font-medium text-neutral-950">{value ?? 0}</div>
    </div>
  );
}

function AddClusterNodeDialog({
  adding,
  host,
  onClose,
  onHostChange,
  onSubmit,
  onTokenChange,
  open,
  token,
}: {
  adding: boolean;
  host: string;
  onClose: () => void;
  onHostChange: (value: string) => void;
  onSubmit: () => void;
  onTokenChange: (value: string) => void;
  open: boolean;
  token: string;
}) {
  const [tokenVisible, setTokenVisible] = useState(false);
  if (!open) return null;

  const trimmedHost = host.trim();
  const trimmedToken = token.trim();
  const hostError = trimmedHost && !isValidRemoteNodeHost(trimmedHost)
    ? 'Use a host name or IP address without spaces.'
    : '';
  const tokenError = trimmedToken && !isValidRemoteNodeToken(trimmedToken)
    ? 'Paste the token from the remote node.'
    : '';
  const canSubmit = Boolean(trimmedHost && trimmedToken && !hostError && !tokenError && !adding);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-cluster-node-title"
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 p-5">
          <div>
            <h3 id="add-cluster-node-title" className="text-lg font-semibold text-neutral-950">Add Node to This Box</h3>
            <p className="mt-1 text-sm text-neutral-500">Add a remote node exposed with mn node expose.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={adding}
            className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }}
        >
          <div className="space-y-4 p-5">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-800">Remote host or IP</span>
              <input
                value={host}
                onChange={(event) => onHostChange(event.target.value)}
                placeholder="192.168.1.42"
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(hostError)}
                aria-describedby={hostError ? 'remote-node-host-error' : undefined}
                className={`h-10 w-full rounded-lg border bg-white px-3 text-sm text-neutral-950 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10 ${
                  hostError ? 'border-red-400' : 'border-neutral-200'
                }`}
              />
              {hostError ? (
                <span id="remote-node-host-error" className="text-xs text-red-600">{hostError}</span>
              ) : (
                <span className="text-xs text-neutral-500">Host reachable from this machine.</span>
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-neutral-800">Token</span>
              <div className="relative">
                <input
                  value={token}
                  onChange={(event) => onTokenChange(event.target.value)}
                  placeholder="Token from mn node expose"
                  autoComplete="off"
                  aria-label="Token from mn node expose"
                  aria-invalid={Boolean(tokenError)}
                  aria-describedby={tokenError ? 'remote-node-token-error' : undefined}
                  type={tokenVisible ? 'text' : 'password'}
                  className={`h-10 w-full rounded-lg border bg-white px-3 pr-11 text-sm text-neutral-950 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10 ${
                    tokenError ? 'border-red-400' : 'border-neutral-200'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setTokenVisible((current) => !current)}
                  className="absolute right-1.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                  aria-label={tokenVisible ? 'Hide token' : 'Show token'}
                >
                  {tokenVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {tokenError ? (
                <span id="remote-node-token-error" className="text-xs text-red-600">{tokenError}</span>
              ) : (
                <span className="text-xs text-neutral-500">Use the eye button to check the token before adding.</span>
              )}
            </label>
          </div>

          <div className="flex justify-end gap-3 border-t border-neutral-100 bg-neutral-50 p-4">
            <button
              type="button"
              onClick={onClose}
              disabled={adding}
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {adding ? 'Adding...' : 'Add node'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function isValidRemoteNodeHost(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed)
    && trimmed.length <= 253
    && !trimmed.startsWith('-')
    && !/\s/.test(trimmed)
    && !/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
}

function isValidRemoteNodeToken(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed.length <= 4096 && !/\s/.test(trimmed);
}

function apiErrorMessage(error: unknown, fallback: string) {
  const responseData = error && typeof error === 'object' && 'response' in error
    ? (error as { response?: { data?: unknown } }).response?.data
    : null;

  if (responseData && typeof responseData === 'object' && !Array.isArray(responseData)) {
    const record = responseData as Record<string, unknown>;
    const detail = stringValue(record.detail) || stringValue(record.message) || stringValue(record.error);
    if (detail) return detail;
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
