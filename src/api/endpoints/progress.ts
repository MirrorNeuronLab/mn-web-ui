import api, { getApiBaseUrl, getAuthHeader } from "../client";
import { parseOrThrow } from "../parsing";
import { routeId, runPath } from "../routes";
import {
  LaunchProgressResponseSchema,
  WorkflowProgressSchema,
} from "../schemas/workflow";
import { createWorkflowProgressStreamer } from "../streaming";

export const fetchWorkflowProgress = (id: string) =>
  api
    .get(runPath(id, "/workflow-progress"))
    .then((r) =>
      parseOrThrow(
        WorkflowProgressSchema,
        r.data,
        `fetchWorkflowProgress(${id})`,
      ),
    );

export const fetchLaunchProgress = (id: string) =>
  api
    .get(`/launch-progress/${routeId(id)}`)
    .then((r) =>
      parseOrThrow(
        LaunchProgressResponseSchema,
        r.data,
        `fetchLaunchProgress(${id})`,
      ),
    );

const workflowProgressStreamUrl = (id: string) =>
  `${getApiBaseUrl()}${runPath(id, "/events/stream")}`;

export const streamWorkflowProgress = createWorkflowProgressStreamer({
  schema: WorkflowProgressSchema,
  streamUrl: workflowProgressStreamUrl,
  authHeader: getAuthHeader,
  validationLabel: (id) => `streamWorkflowProgress(${id})`,
});
