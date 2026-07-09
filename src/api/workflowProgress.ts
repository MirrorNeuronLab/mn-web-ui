const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const asRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const toRecordArray = (value: unknown): Record<string, unknown>[] => (
  Array.isArray(value) ? value.filter(isRecord) : []
);

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
};

const firstBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', '1'].includes(normalized)) return true;
      if (['false', 'no', '0'].includes(normalized)) return false;
    }
  }
  return undefined;
};

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const nestedId = (value: unknown) => {
  const record = asRecord(value);
  return firstString(record.id, record.step_id, record.stepId, record.node_id, record.nodeId, record.name, record.label);
};

const stringArray = (value: unknown) => (
  Array.isArray(value)
    ? uniqueStrings(value.map((item) => firstString(item, nestedId(item))))
    : []
);

const normalizeStatus = (value: unknown, fallback = 'pending') => {
  const status = firstString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['done', 'complete', 'completed', 'success', 'succeeded'].includes(status)) return 'done';
  if (['running', 'active', 'in_progress', 'working', 'launching'].includes(status)) return 'running';
  if (['failed', 'failure', 'error', 'blocked'].includes(status)) return 'failed';
  if (['cancelled', 'canceled', 'stopped'].includes(status)) return 'cancelled';
  if (['ready', 'queued', 'pending', 'scheduled', 'waiting', 'validated', 'planned'].includes(status)) return 'ready';
  if (['idle', 'observed'].includes(status)) return 'idle';
  return firstString(value, fallback) || fallback;
};

const normalizeWorkflowKind = (value: unknown) => {
  const kind = firstString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (['service', 'live', 'stream', 'streaming', 'watcher', 'daemon'].includes(kind)) return 'service';
  return 'batch';
};

const normalizeWorkflowStatus = (value: unknown, fallback = 'unknown') => {
  const status = firstString(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (['done', 'complete', 'completed', 'success', 'succeeded'].includes(status)) return 'completed';
  if (['running', 'active', 'in_progress', 'working', 'launching'].includes(status)) return 'running';
  if (['failed', 'failure', 'error', 'blocked'].includes(status)) return 'failed';
  if (['cancelled', 'canceled', 'stopped'].includes(status)) return 'cancelled';
  if (['ready', 'queued', 'pending', 'scheduled', 'waiting', 'validated', 'planned'].includes(status)) return 'pending';
  if (['idle', 'observed'].includes(status)) return 'idle';
  return firstString(value, fallback) || fallback;
};

const normalizeProgress = (raw: number | undefined, status: string, done?: number, total?: number) => {
  if (raw !== undefined) {
    const value = raw > 1 ? raw / 100 : raw;
    return Math.max(0, Math.min(1, value));
  }
  if (done !== undefined && total !== undefined && total > 0) {
    return Math.max(0, Math.min(1, done / total));
  }
  if (['done', 'failed', 'cancelled'].includes(status)) return 1;
  if (status === 'running') return 0.5;
  if (status === 'ready') return 0.1;
  return 0;
};

const normalizeActivity = (value: unknown) => {
  const record = asRecord(value);
  if (!Object.keys(record).length) return undefined;
  const payload = asRecord(record.payload);
  return {
    ...record,
    timestamp: firstString(record.timestamp, record.ts, record.created_at, record.createdAt, record.time),
    type: firstString(record.type, record.event, record.kind, 'event'),
    category: firstString(record.category, payload.category),
    step_id: firstString(record.step_id, record.stepId, record.step, payload.step_id, payload.stepId, payload.step),
    agent_id: firstString(record.agent_id, record.agentId, record.worker, payload.agent_id, payload.agentId, payload.worker),
    status: firstString(record.status, record.state, payload.status, payload.state),
    message: firstString(record.message, record.detail, payload.message, payload.detail, payload.reason),
    tool_name: firstString(record.tool_name, record.toolName, payload.tool_name, payload.toolName),
    target: firstString(record.target, payload.target),
    result_summary: firstString(record.result_summary, record.resultSummary, payload.result_summary, payload.resultSummary),
    duration_ms: firstNumber(record.duration_ms, record.durationMs, payload.duration_ms, payload.durationMs),
  };
};

const normalizeActivities = (value: unknown): Record<string, unknown>[] => toRecordArray(value)
  .map(normalizeActivity)
  .filter(Boolean) as Record<string, unknown>[];

const normalizeAgent = (value: unknown, index: number) => {
  const record = asRecord(value);
  const nestedProgress = asRecord(record.progress);
  const status = normalizeStatus(record.status || record.state, 'pending');
  const itemsDone = firstNumber(record.items_done, record.itemsDone, record.done_count, record.doneCount);
  const itemsTotal = firstNumber(record.items_total, record.itemsTotal, record.total_count, record.totalCount);
  const progressValue = normalizeProgress(firstNumber(
    record.progress,
    record.progress_percent,
    record.progressPercent,
    record.percent,
    record.completion,
    record.completion_percent,
    record.completionPercent,
    nestedProgress.percent,
    nestedProgress.progress_percent,
    nestedProgress.progressPercent,
  ), status, itemsDone, itemsTotal);

  return {
    ...record,
    id: firstString(record.id, record.agent_id, record.agentId, record.node_id, record.nodeId, record.name, `agent-${index + 1}`),
    display_name: firstString(record.display_name, record.displayName, record.agent_name, record.agentName, record.name, record.label, record.alias),
    role: firstString(record.role, record.assignment, record.task, record.agent_type, record.agentType, 'worker'),
    working_on: firstString(
      record.working_on,
      record.workingOn,
      record.current_task,
      record.currentTask,
      record.current_work,
      record.currentWork,
      record.status_reason,
      record.statusReason,
      record.phase,
      record.task,
      record.role,
      'worker',
    ),
    assigned_node: firstString(record.assigned_node, record.assignedNode, record.node),
    status,
    progress: progressValue,
    progress_source: firstString(record.progress_source, record.progressSource, progressValue > 0 ? 'explicit' : ''),
    items_done: itemsDone,
    items_total: itemsTotal,
    live: firstBoolean(record.live, record['live?'], record.active) ?? false,
    mailbox_depth: firstNumber(record.mailbox_depth, record.mailboxDepth, record.queue_depth, record.queueDepth, asRecord(record.mailbox).depth),
    tokens: firstNumber(record.tokens, record.total_tokens, record.totalTokens, asRecord(record.usage).tokens),
    tokens_used: firstNumber(record.tokens_used, record.tokensUsed, record.total_tokens, record.totalTokens, asRecord(record.usage).tokens_used, asRecord(record.usage).tokensUsed),
    token_budget: firstNumber(record.token_budget, record.tokenBudget, record.max_tokens, record.maxTokens, asRecord(record.usage).token_budget, asRecord(record.usage).tokenBudget),
    tools: firstNumber(record.tools, record.tool_count, record.toolCount),
    elapsed_seconds: firstNumber(record.elapsed_seconds, record.elapsedSeconds, record.duration_seconds, record.durationSeconds) || 0,
    started_at: firstString(record.started_at, record.startedAt, record.created_at, record.createdAt) || undefined,
    ended_at: firstString(record.ended_at, record.endedAt, record.finished_at, record.finishedAt, record.completed_at, record.completedAt) || undefined,
    last_event_at: firstString(record.last_event_at, record.lastEventAt, record.updated_at, record.updatedAt) || undefined,
    status_reason: firstString(record.status_reason, record.statusReason),
    activity_summary: firstString(record.activity_summary, record.activitySummary, record.message, record.detail),
    last_activity: normalizeActivity(record.last_activity || record.lastActivity),
    recent_events: normalizeActivities(record.recent_events || record.recentEvents || record.events),
  };
};

const stepAssociationIds = (step: Record<string, unknown>, index: number) => uniqueStrings([
  firstString(step.id, step.step_id, step.stepId, step.workflow_step_id, step.workflowStepId),
  firstString(step.node_id, step.nodeId, step.phase, step.name, step.label),
  `step-${index + 1}`,
]);

const agentStepIds = (agent: Record<string, unknown>) => uniqueStrings([
  firstString(agent.step_id, agent.stepId),
  firstString(agent.current_step_id, agent.currentStepId),
  firstString(agent.workflow_step_id, agent.workflowStepId),
  firstString(agent.phase_id, agent.phaseId),
  firstString(agent.stage_id, agent.stageId),
  firstString(agent.node_id, agent.nodeId),
  nestedId(agent.step),
  nestedId(agent.current_step || agent.currentStep),
  nestedId(agent.workflow_step || agent.workflowStep),
]);

const agentsForStep = (
  topLevelAgents: Record<string, unknown>[],
  step: Record<string, unknown>,
  index: number,
  currentStepIds: string[],
) => {
  const selectedIds = new Set(stepAssociationIds(step, index));
  const matches = topLevelAgents.filter((agent) => agentStepIds(agent).some((id) => selectedIds.has(id)));
  if (matches.length) return matches;
  const hasAgentAssociations = topLevelAgents.some((agent) => agentStepIds(agent).length > 0);
  const selectedIsCurrent = stepAssociationIds(step, index).some((id) => currentStepIds.includes(id)) || Boolean(step.current);
  if (!hasAgentAssociations && (selectedIsCurrent || normalizeStatus(step.status) === 'running')) return topLevelAgents;
  return [];
};

const normalizeStep = (
  value: unknown,
  index: number,
  currentStepIds: string[],
  topLevelAgents: Record<string, unknown>[],
) => {
  const record = asRecord(value);
  const rawAgents = toRecordArray(record.agents);
  const status = normalizeStatus(record.status || record.state, 'pending');
  const ids = stepAssociationIds(record, index);
  const id = ids[0] || `step-${index + 1}`;
  const current = Boolean(record.current) || ids.some((candidate) => currentStepIds.includes(candidate));
  const agents = (rawAgents.length ? rawAgents.map(normalizeAgent) : agentsForStep(topLevelAgents, { ...record, id, current, status }, index, currentStepIds)) as Record<string, unknown>[];
  const agentCount = asRecord(record.agent_count || record.agentCount);
  const doneCount = firstNumber(record.done_count, record.doneCount, record.completed_count, record.completedCount, record.completed, agentCount.done, agentCount.completed);
  const runningCount = firstNumber(record.running_count, record.runningCount, agentCount.running);
  const readyCount = firstNumber(record.ready_count, record.readyCount, agentCount.ready);
  const idleCount = firstNumber(record.idle_count, record.idleCount, agentCount.idle);
  const failedCount = firstNumber(record.failed_count, record.failedCount, agentCount.failed);
  const totalCount = firstNumber(record.total_count, record.totalCount, record.total, record.agent_total, record.agentTotal, agentCount.total, agents.length || undefined);

  return {
    ...record,
    id,
    label: firstString(record.label, record.name, record.phase, id.replace(/_/g, ' ')),
    goal: firstString(record.goal, record.description, record.summary),
    status,
    current,
    parents: stringArray(record.parents || record.parent_ids || record.parentIds),
    children: stringArray(record.children || record.child_ids || record.childIds),
    requires: stringArray(record.requires),
    provides: stringArray(record.provides),
    layer: firstNumber(record.layer),
    done_count: doneCount ?? (['done', 'failed', 'cancelled'].includes(status) ? totalCount || 1 : 0),
    running_count: runningCount ?? (status === 'running' ? Math.max(1, agents.filter((agent) => normalizeStatus(agent.status) === 'running').length) : 0),
    idle_count: idleCount ?? agents.filter((agent) => normalizeStatus(agent.status) === 'idle').length,
    ready_count: readyCount ?? agents.filter((agent) => normalizeStatus(agent.status) === 'ready').length,
    failed_count: failedCount ?? agents.filter((agent) => normalizeStatus(agent.status) === 'failed').length,
    total_count: totalCount ?? Math.max(agents.length, 1),
    live: firstBoolean(record.live, record['live?'], record.active) ?? false,
    elapsed_seconds: firstNumber(record.elapsed_seconds, record.elapsedSeconds, record.duration_seconds, record.durationSeconds) || 0,
    started_at: firstString(record.started_at, record.startedAt, record.created_at, record.createdAt) || undefined,
    ended_at: firstString(record.ended_at, record.endedAt, record.finished_at, record.finishedAt, record.completed_at, record.completedAt) || undefined,
    last_event_at: firstString(record.last_event_at, record.lastEventAt, record.updated_at, record.updatedAt) || undefined,
    progress_source: firstString(record.progress_source, record.progressSource),
    activity_summary: firstString(record.activity_summary, record.activitySummary, record.message, record.detail),
    last_activity: normalizeActivity(record.last_activity || record.lastActivity),
    recent_events: normalizeActivities(record.recent_events || record.recentEvents || record.events),
    agents,
  };
};

const looksLikeWorkflowProgress = (value: unknown) => {
  const record = asRecord(value);
  if (!Object.keys(record).length) return false;
  return Boolean(
    Array.isArray(record.steps) ||
    Array.isArray(record.phases) ||
    Array.isArray(record.agents) ||
    record.current_step_id ||
    record.currentStepId ||
    record.workflow_id ||
    record.workflowId ||
    record.job_id ||
    record.jobId ||
    record.status ||
    record.state
  );
};

const unwrapWorkflowProgressPayload = (value: unknown): unknown => {
  const record = asRecord(value);
  if (!Object.keys(record).length) return value;
  const data = asRecord(record.data);
  const patch = asRecord(record.patch);
  const candidates = [
    record.workflow_progress,
    record.workflowProgress,
    record.snapshot,
    record.progress,
    data.workflow_progress,
    data.workflowProgress,
    data.snapshot,
    data.progress,
    patch.workflow_progress,
    patch.workflowProgress,
    patch.snapshot,
    patch.latest,
    data,
  ];
  return candidates.find(looksLikeWorkflowProgress) || value;
};

const normalizeEdges = (value: unknown): Record<string, unknown>[] => toRecordArray(value)
  .map((edge, index) => {
    const from = firstString(edge.from, edge.source, edge.source_id, edge.sourceId);
    const to = firstString(edge.to, edge.target, edge.target_id, edge.targetId);
    if (!from || !to) return null;
    return {
      ...edge,
      from,
      to,
      event: firstString(edge.event, edge.label, edge.type, edge.message_type, edge.messageType, `edge-${index + 1}`),
    };
  })
  .filter(Boolean) as Record<string, unknown>[];

const normalizeAgentCount = (
  value: unknown,
  steps: Record<string, unknown>[],
  topLevelAgents: Record<string, unknown>[],
) => {
  const record = asRecord(value);
  const agents = topLevelAgents.length ? topLevelAgents : steps.flatMap((step) => toRecordArray(step.agents));
  const counts = agents.reduce<{ done: number; running: number; idle: number; ready: number; failed: number; total: number }>((acc, agent) => {
    const status = normalizeStatus(agent.status, 'idle');
    if (status === 'done') acc.done += 1;
    else if (status === 'running') acc.running += 1;
    else if (status === 'failed') acc.failed += 1;
    else if (status === 'ready') acc.ready += 1;
    else acc.idle += 1;
    acc.total += 1;
    return acc;
  }, { done: 0, running: 0, idle: 0, ready: 0, failed: 0, total: 0 });

  return {
    done: firstNumber(record.done, record.completed) ?? counts.done,
    running: firstNumber(record.running, record.active) ?? counts.running,
    idle: firstNumber(record.idle) ?? counts.idle,
    ready: firstNumber(record.ready, record.pending) ?? counts.ready,
    failed: firstNumber(record.failed, record.error) ?? counts.failed,
    total: firstNumber(record.total, record.count) ?? counts.total,
  };
};

export const normalizeWorkflowProgressPayload = (value: unknown): unknown => {
  const unwrapped = unwrapWorkflowProgressPayload(value);
  const record = asRecord(unwrapped);
  if (!Object.keys(record).length) return value;

  const topLevelAgents = toRecordArray(record.agents).map(normalizeAgent);
  const explicitCurrentIds = uniqueStrings([
    ...stringArray(record.current_step_ids || record.currentStepIds),
    firstString(record.current_step_id, record.currentStepId),
    nestedId(record.current_step || record.currentStep),
  ]);
  const rawSteps = toRecordArray(record.steps).length ? toRecordArray(record.steps) : toRecordArray(record.phases);
  let steps = rawSteps.map((step, index) => normalizeStep(step, index, explicitCurrentIds, topLevelAgents));
  const currentFromPayload = normalizeStep(record.current_step || record.currentStep, steps.length, explicitCurrentIds, topLevelAgents);
  const hasPayloadCurrentStep = Boolean(record.current_step || record.currentStep);
  if (hasPayloadCurrentStep) {
    const matchingIndex = steps.findIndex((step) => step.id === currentFromPayload.id);
    if (matchingIndex >= 0) {
      steps = steps.map((step, index) => (
        index === matchingIndex
          ? {
            ...step,
            ...currentFromPayload,
            agents: toRecordArray(currentFromPayload.agents).length ? currentFromPayload.agents : step.agents,
            current: true,
          }
          : step
      ));
    } else {
      steps = [...steps, { ...currentFromPayload, current: true }];
    }
  }

  const runningStep = steps.find((step) => normalizeStatus(step.status) === 'running');
  const currentStepIds = uniqueStrings([
    ...explicitCurrentIds,
    ...steps.filter((step) => Boolean(step.current)).map((step) => firstString(step.id)),
    runningStep ? firstString(runningStep.id) : '',
  ]);
  steps = steps.map((step) => ({
    ...step,
    current: Boolean(step.current) || currentStepIds.includes(firstString(step.id)),
  }));
  const currentStep = steps.find((step) => currentStepIds.includes(firstString(step.id))) || steps.find((step) => Boolean(step.current)) || null;
  const generatedAt = firstString(record.generated_at, record.generatedAt, record.updated_at, record.updatedAt);

  return {
    ...record,
    schema_version: record.schema_version ?? record.schemaVersion ?? 1,
    job_id: firstString(record.job_id, record.jobId) || 'unknown',
    workflow_id: firstString(record.workflow_id, record.workflowId, record.id, record.name) || 'blueprint',
    name: firstString(record.name, record.label, record.workflow_id, record.workflowId, 'Blueprint'),
    description: firstString(record.description, record.summary),
    status: normalizeWorkflowStatus(record.status || record.state, 'unknown'),
    sequence: firstNumber(record.sequence, record.version_number, record.versionNumber),
    workflow_kind: normalizeWorkflowKind(record.workflow_kind || record.workflowKind || record.kind || record.type),
    progress_source: firstString(record.progress_source, record.progressSource, record.source),
    generated_at: generatedAt || undefined,
    submitted_at: firstString(record.submitted_at, record.submittedAt, record.started_at, record.startedAt) || undefined,
    elapsed_seconds: firstNumber(record.elapsed_seconds, record.elapsedSeconds, record.duration_seconds, record.durationSeconds) || 0,
    agent_count: normalizeAgentCount(record.agent_count || record.agentCount, steps, topLevelAgents),
    current_step_id: currentStepIds[0] || null,
    current_step_ids: currentStepIds,
    current_step: currentStep,
    steps,
    edges: normalizeEdges(record.edges),
    layers: Array.isArray(record.layers) ? record.layers.map(stringArray).filter((layer) => layer.length) : undefined,
    messages: Array.isArray(record.messages) ? record.messages.map((message) => firstString(message)).filter(Boolean) : [],
    recent_events: normalizeActivities(record.recent_events || record.recentEvents || record.events),
    agents: topLevelAgents,
  };
};
