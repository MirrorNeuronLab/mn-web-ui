import { useCallback, useEffect, useMemo, useState } from 'react';
import { addClusterNode, fetchJobs, fetchSystemSummary, removeClusterNode } from '../api';
import type { Job, SystemSummary } from '../api';
import { Activity, BriefcaseBusiness, Cpu, Eye, EyeOff, Loader2, Plus, Server, Trash2 } from 'lucide-react';
import { confirmActionToast } from '../components/ui/confirm-toast';
import { Tooltip } from '../components/ui/tooltip';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';
import { cn } from '../lib/utils';

type PoolStats = {
  capacity?: number;
  available?: number;
  in_use?: number;
  queued?: number;
  active?: number;
};

const activeStatuses = new Set(['running', 'pending', 'paused']);

export default function Dashboard() {
  const [summary, setSummary] = useState<SystemSummary | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [addNodeDialogOpen, setAddNodeDialogOpen] = useState(false);
  const [remoteNodeHost, setRemoteNodeHost] = useState('');
  const [remoteNodeToken, setRemoteNodeToken] = useState('');
  const [addingNode, setAddingNode] = useState(false);
  const [removingNodeName, setRemovingNodeName] = useState<string | null>(null);

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

    if (!isValidRemoteNodeHost(host) || !isValidRemoteNodeToken(token)) return;

    setAddNodeDialogOpen(false);
    confirmActionToast({
      id: `cluster-add-${host}`,
      title: 'Add this peer node?',
      description: `This box will connect to ${host} using the provided exposure token.`,
      confirmLabel: 'Add node',
      cancelLabel: 'Keep form open',
      onCancel: () => setAddNodeDialogOpen(true),
      loading: {
        title: 'Adding node',
        description: host,
      },
      success: (result: Awaited<ReturnType<typeof addClusterNode>>) => ({
        title: 'Node added',
        description: result.message || `${result.node_name || host} was added to this box.`,
      }),
      error: (error) => ({
        title: 'Add failed',
        description: apiErrorMessage(error, `Could not add ${host}.`),
      }),
      onConfirm: async () => {
        setAddingNode(true);
        try {
          const result = await addClusterNode({ host, token });
          await loadDashboard();
          setRemoteNodeHost('');
          setRemoteNodeToken('');
          setAddNodeDialogOpen(false);
          return result;
        } catch (error) {
          console.error('Failed to add cluster node', error);
          throw error;
        } finally {
          setAddingNode(false);
        }
      },
    });
  };

  const handleRemoveClusterNode = async (nodeName: string) => {
    if (!nodeName || nodeName === 'unknown' || removingNodeName) return;

    confirmActionToast({
      id: `cluster-remove-${nodeName}`,
      title: 'Remove this peer node?',
      description: `${nodeName} will be disconnected from this box and removed from the runtime resource list.`,
      confirmLabel: 'Remove node',
      cancelLabel: 'Keep node',
      loading: {
        title: 'Removing node',
        description: nodeName,
      },
      success: (result: Awaited<ReturnType<typeof removeClusterNode>>) => ({
        title: 'Node removed',
        description: result.message || `${nodeName} was removed from this box.`,
      }),
      error: (error) => ({
        title: 'Remove failed',
        description: apiErrorMessage(error, `Could not remove ${nodeName}.`),
      }),
      onConfirm: async () => {
        setRemovingNodeName(nodeName);
        try {
          const result = await removeClusterNode(nodeName);
          await loadDashboard();
          return result;
        } catch (error) {
          console.error('Failed to remove cluster node', error);
          throw error;
        } finally {
          setRemovingNodeName(null);
        }
      },
    });
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
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-6 h-7 w-20" />
              <Skeleton className="mt-6 h-4 w-44" />
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="p-5">
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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

      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 border-b border-neutral-200 px-5 py-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-semibold tracking-tight text-neutral-950">Runtime Resources</h2>
            <p className="mt-1 text-xs text-neutral-500">Add exposed peer nodes to this box, or remove them from this box.</p>
          </div>
          <Tooltip content="Add a remote node exposed with mn node expose.">
            <Button
              type="button"
              size="sm"
              onClick={() => setAddNodeDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add node
            </Button>
          </Tooltip>
        </CardHeader>
        <CardContent className="divide-y divide-neutral-100 p-0">
          {(summary?.nodes || []).length === 0 ? (
            <div className="px-5 py-8 text-xs text-neutral-500">No cluster nodes reported yet.</div>
          ) : (
            summary?.nodes.map((node, index) => (
              <div key={`${node.name}-${index}`} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Server className="h-4 w-4 text-neutral-500" />
                    <div>
                      <div className="text-sm font-medium text-neutral-950">{node.name}</div>
                      <div className="text-xs text-neutral-500">{node.self ? 'Local node' : 'Peer node'}</div>
                    </div>
                  </div>
                  {!node.self ? (
                    <Tooltip content="Disconnect this peer node after confirmation.">
                      <span className="inline-flex">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveClusterNode(node.name)}
                          disabled={removingNodeName === node.name}
                        >
                          {removingNodeName === node.name ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                          Remove
                        </Button>
                      </span>
                    </Tooltip>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {Object.entries(node.executor_pools || {}).length === 0 ? (
                    <div className="rounded-md border border-neutral-200 p-3 text-xs text-neutral-500">
                      No executor pools reported.
                    </div>
                  ) : (
                    Object.entries(node.executor_pools || {}).map(([poolName, stats]) => (
                      <div key={poolName} className="rounded-md border border-neutral-200 p-3">
                        <div className="text-xs font-medium text-neutral-950">Pool: {poolName}</div>
                        <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
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
        </CardContent>
      </Card>

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
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-neutral-500">
        <span>{label}</span>
        <Icon className="h-4 w-4 text-neutral-500" />
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight text-neutral-950">{value}</div>
      <div className="mt-5 text-xs font-medium text-neutral-950">{headline}</div>
      <div className="mt-1 text-xs text-neutral-500">{detail}</div>
    </Card>
  );
}

function PoolMetric({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 font-medium text-neutral-950">{value ?? 0}</div>
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !adding) onClose();
      }}
    >
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0" showClose={!adding}>
        <DialogHeader className="border-b border-neutral-100 p-4 pr-12">
          <div>
            <DialogTitle>Add Node to This Box</DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Add a remote node exposed with mn node expose.
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) onSubmit();
          }}
        >
          <div className="space-y-3 p-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-800">Remote host or IP</span>
              <Input
                value={host}
                onChange={(event) => onHostChange(event.target.value)}
                placeholder="192.168.1.42"
                autoComplete="off"
                autoFocus
                aria-invalid={Boolean(hostError)}
                aria-describedby={hostError ? 'remote-node-host-error' : undefined}
                className={cn(hostError ? 'border-red-400 focus-visible:ring-red-100' : '')}
              />
              {hostError ? (
                <span id="remote-node-host-error" className="text-xs text-red-600">{hostError}</span>
              ) : (
                <span className="text-xs text-neutral-500">Host reachable from this machine.</span>
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-neutral-800">Token</span>
              <div className="relative">
                <Input
                  value={token}
                  onChange={(event) => onTokenChange(event.target.value)}
                  placeholder="Token from mn node expose"
                  autoComplete="off"
                  aria-label="Token from mn node expose"
                  aria-invalid={Boolean(tokenError)}
                  aria-describedby={tokenError ? 'remote-node-token-error' : undefined}
                  type={tokenVisible ? 'text' : 'password'}
                  className={cn('pr-10', tokenError ? 'border-red-400 focus-visible:ring-red-100' : '')}
                />
                <Tooltip content={tokenVisible ? 'Hide the token value.' : 'Show the token value before adding.'}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setTokenVisible((current) => !current)}
                    className="absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2 text-neutral-500"
                    aria-label={tokenVisible ? 'Hide token' : 'Show token'}
                  >
                    {tokenVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </Tooltip>
              </div>
              {tokenError ? (
                <span id="remote-node-token-error" className="text-xs text-red-600">{tokenError}</span>
              ) : (
                <span className="text-xs text-neutral-500">Use the eye button to check the token before adding.</span>
              )}
            </label>
          </div>

          <DialogFooter className="border-t border-neutral-100 bg-neutral-50 p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={adding}
            >
              Cancel
            </Button>
            <Tooltip content="Review this node connection before adding it.">
              <span className="inline-flex">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canSubmit}
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {adding ? 'Adding...' : 'Add node'}
                </Button>
              </span>
            </Tooltip>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
