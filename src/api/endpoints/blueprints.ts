import { isRecord } from "../../utils/records";
import api from "../client";
import {
  collectPages,
  parseOrThrow,
  parsePage,
  ValidationError,
} from "../parsing";
import { newIdempotencyKey, PREPARATION_TIMEOUT_MS } from "../requests";
import { blueprintPath } from "../routes";
import {
  BlueprintLaunchResponseSchema,
  BlueprintSchema,
  LaunchBodySchema,
  UploadedBundleSchema,
} from "../schemas/blueprints";
import { createJob, startStableJobRun } from "./jobs";

export const fetchBlueprints = () =>
  collectPages(
    (token) =>
      api
        .get("/blueprints", {
          params: { page_token: token },
        })
        .then((r) => parsePage(BlueprintSchema, r.data, "fetchBlueprints")),
    "Blueprints",
  );

export const uploadBundle = (file: File) => {
  const formData = new FormData();
  formData.append("bundle", file);
  return api
    .post("/bundles", formData, { timeout: PREPARATION_TIMEOUT_MS })
    .then((r) => parseOrThrow(UploadedBundleSchema, r.data, "uploadBundle"));
};

const parseLaunchResponse = (data: unknown) => {
  const result = BlueprintLaunchResponseSchema.safeParse(data);
  if (!result.success) {
    console.error("launchBlueprintJob returned invalid data.");
    throw new ValidationError(
      "launchBlueprintJob",
      "The server returned an invalid launch response. Try again.",
    );
  }
  return result.data;
};

export const launchBlueprintJob = (
  payload: unknown,
  options: { progressId?: string; idempotencyKey?: string } = {},
) => {
  const record = isRecord(payload) ? payload : {};
  if (record.source === "bundle") {
    const bundleId =
      typeof record.bundle_id === "string" ? record.bundle_id.trim() : "";
    if (!bundleId)
      return Promise.reject(new Error("Bundle launch requires a bundle id."));
    const launchKey = options.idempotencyKey || newIdempotencyKey();
    return createJob(
      {
        bundle_id: bundleId,
        ...(isRecord(record.config_overrides)
          ? { resolved_configuration: record.config_overrides }
          : {}),
      },
      launchKey,
      options.progressId,
    ).then((job) => {
      const jobId =
        isRecord(job) && typeof job.job_id === "string" ? job.job_id : "";
      if (!jobId) throw new Error("Job creation did not return a job id.");
      // Both stages retain their identity across a lost-response retry. Keys
      // are scoped by endpoint, so the same reviewed launch key is safe here.
      return startStableJobRun(jobId, {}, false, launchKey).then((run) =>
        parseLaunchResponse(run),
      );
    });
  }
  if (record.source !== "catalog")
    return Promise.reject(
      new Error("Host filesystem paths are not accepted by the REST API."),
    );

  const blueprintId =
    typeof record.blueprint_id === "string" ? record.blueprint_id.trim() : "";
  if (!blueprintId)
    return Promise.reject(
      new Error("Catalog blueprint launch requires a blueprint id."),
    );
  const body = LaunchBodySchema.parse({
    config_overrides: isRecord(record.config_overrides)
      ? record.config_overrides
      : {},
  });
  return api
    .post(blueprintPath(blueprintId, "/runs"), body, {
      timeout: PREPARATION_TIMEOUT_MS,
      headers: {
        "Idempotency-Key": options.idempotencyKey || newIdempotencyKey(),
        ...(options.progressId
          ? { "X-Launch-Progress-ID": options.progressId }
          : {}),
      },
    })
    .then((r) => parseLaunchResponse(r.data));
};
