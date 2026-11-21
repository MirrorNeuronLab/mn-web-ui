let idempotencyCounter = 0;

export const newIdempotencyKey = (): string => {
  try {
    const randomUUID = (globalThis.crypto as Crypto | undefined)?.randomUUID;
    if (typeof randomUUID === "function")
      return randomUUID.call(globalThis.crypto);
    const bytes = (
      globalThis.crypto as Crypto | undefined
    )?.getRandomValues?.bind(globalThis.crypto);
    if (bytes) {
      const buffer = new Uint8Array(16);
      bytes(buffer);
      const hex = [...buffer]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // fall through to counter fallback
  }
  idempotencyCounter += 1;
  return `idempotency-${Date.now().toString(36)}-${idempotencyCounter}`;
};

// Preparation can include dependency/model downloads. Reads remain bounded at
// 30 seconds; explicit launches and uploads have a separate, longer deadline.
export const PREPARATION_TIMEOUT_MS = 30 * 60_000;
