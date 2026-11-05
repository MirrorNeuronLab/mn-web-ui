import { z } from "zod";

export const RuntimeSignalSchema = z
  .object({
    schema: z.literal("mn.runtime.event.v1"),
    event_id: z.string().optional(),
    type: z.string(),
    channel: z.enum(["errors", "responses"]),
    sequence: z.number().int().positive(),
    revision: z.number().int().positive().optional(),
    observed_ms: z.number(),
    payload: z.record(z.string(), z.unknown()),
  })
  .passthrough();
export type RuntimeSignal = z.infer<typeof RuntimeSignalSchema>;

const pause = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
  });

/** Independent stream per protected channel. Transport errors never terminate a run. */
export async function streamRuntimeSignals(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal,
  receive: (event: RuntimeSignal) => void,
  availability: (message: string | null) => void,
) {
  let cursor = 0;
  let failures = 0;
  while (!signal.aborted && failures <= 10) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(url, {
        headers: { ...headers, "Last-Event-ID": String(cursor) },
        signal,
      });
      if (!response.ok || !response.body)
        throw new Error(`Signal transport unavailable (${response.status}).`);
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done)
          throw new Error("Signal connection interrupted; reconnecting.");
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 1_048_576)
          throw new Error("Signal frame exceeded its bound.");
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || "";
        for (const frame of frames) {
          if (frame.startsWith(":")) {
            availability(null);
            failures = 0;
            continue;
          }
          const lines = frame.split(/\r?\n/);
          const name = lines
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim();
          const data = lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          const parsed: unknown = JSON.parse(data);
          if (name === "stream.unavailable") {
            const notice = z.object({ code: z.string() }).parse(parsed);
            if (notice.code === "replay_required") cursor = 0;
            throw new Error(
              notice.code === "replay_required"
                ? "Signal replay gap; resynchronizing."
                : "Signal transport unavailable; reconnecting.",
            );
          }
          if (name !== "runtime.signal") continue;
          const event = RuntimeSignalSchema.parse(parsed);
          const eventId = lines
            .find((line) => line.startsWith("id:"))
            ?.slice(3)
            .trim();
          if (eventId !== String(event.sequence))
            throw new Error("Signal replay position is invalid.");
          if (event.sequence <= cursor) continue;
          receive(event);
          cursor = event.sequence;
          failures = 0;
          availability(null);
        }
      }
    } catch (error) {
      if (signal.aborted) return;
      failures += 1;
      availability(
        error instanceof Error
          ? error.message
          : "Signal transport unavailable.",
      );
    } finally {
      try {
        await reader?.cancel();
      } catch {
        /* Already disconnected. */
      }
      reader?.releaseLock();
    }
    await pause(Math.min(250 * 2 ** failures, 5_000), signal);
  }
}

export function mergeRuntimeSignal(
  events: RuntimeSignal[],
  incoming: RuntimeSignal,
): RuntimeSignal[] {
  const identity = incoming.payload.incident_id || incoming.payload.command_id;
  if (typeof identity !== "string")
    throw new Error("Signal correlation is missing.");
  const index = events.findIndex(
    (event) =>
      event.channel === incoming.channel &&
      (event.payload.incident_id || event.payload.command_id) === identity,
  );
  if (
    index >= 0 &&
    (events[index].sequence > incoming.sequence ||
      (events[index].sequence === incoming.sequence &&
        (events[index].revision || 1) >= (incoming.revision || 1)))
  )
    return events;
  if (index < 0 && events.length >= 15_000)
    throw new Error(
      "Signal projection is full; resynchronization is required.",
    );
  return index < 0
    ? [...events, incoming]
    : events.map((event, i) => (i === index ? incoming : event));
}
