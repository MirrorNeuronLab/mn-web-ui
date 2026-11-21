import { apiErrorMessage } from "../utils/apiErrors";
import { isRecord } from "../utils/records";
import api from "./client";
import { parseOrThrow } from "./parsing";
import { operationPath } from "./routes";
import { type Operation, OperationSchema } from "./schemas/operations";

export const fetchOperation = (id: string) =>
  api
    .get(operationPath(id))
    .then((r) =>
      parseOrThrow(OperationSchema, r.data, `fetchOperation(${id})`),
    );

export const waitForOperation = async (
  initial: Operation,
  load: (id: string) => Promise<Operation>,
  {
    timeoutMs = 5 * 60_000,
    intervalMs = 500,
  }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<Operation> => {
  const deadline = Date.now() + timeoutMs;
  let operation = initial;
  while (true) {
    const status = operation.status.toLowerCase();
    if (["completed", "succeeded"].includes(status)) return operation;
    if (["failed", "cancelled", "canceled", "interrupted"].includes(status)) {
      const detail = isRecord(operation.error) ? operation.error : {};
      throw new Error(
        apiErrorMessage(
          { response: { data: detail } },
          "The operation did not complete. Reload the job and try again.",
        ),
      );
    }
    if (!["pending", "running", "accepted", "queued"].includes(status)) {
      throw new Error(
        "The API returned an unknown operation state. Reload the job and try again.",
      );
    }
    if (Date.now() >= deadline)
      throw new Error(
        "The operation is still pending. Reload the job to check its result before trying again.",
      );
    await new Promise<void>((resolve) =>
      globalThis.setTimeout(
        resolve,
        Math.min(intervalMs, Math.max(0, deadline - Date.now())),
      ),
    );
    operation = await load(operation.operation_id);
  }
};
