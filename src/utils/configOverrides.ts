export type ConfigOverrides = Record<string, unknown>;

export type ConfigOverrideParseResult =
  | { ok: true; value: ConfigOverrides; count: number }
  | { ok: false; error: string };

const setConfigPath = (target: ConfigOverrides, dottedPath: string, value: unknown) => {
  const parts = dottedPath.split('.');
  let cursor = target;

  parts.slice(0, -1).forEach((part) => {
    const current = cursor[part];
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as ConfigOverrides;
  });

  cursor[parts[parts.length - 1]] = value;
};

export const parseConfigOverrideAssignments = (source: string): ConfigOverrideParseResult => {
  const overrides: ConfigOverrides = {};
  let count = 0;

  for (const [index, assignment] of source.split(/\r?\n/).entries()) {
    if (!assignment.trim()) continue;

    const separator = assignment.indexOf('=');
    if (separator < 0) {
      return {
        ok: false,
        error: `Line ${index + 1}: expected dotted.path=value.`,
      };
    }

    const rawPath = assignment.slice(0, separator);
    const rawValue = assignment.slice(separator + 1);
    const path = rawPath.trim();
    if (!path || path.split('.').some((part) => !part)) {
      return {
        ok: false,
        error: `Line ${index + 1}: expected non-empty dotted path segments.`,
      };
    }

    let value: unknown = rawValue;
    try {
      value = JSON.parse(rawValue) as unknown;
    } catch {
      // Match mn-cli --set: values that are not JSON remain strings.
    }
    setConfigPath(overrides, path, value);
    count += 1;
  }

  return { ok: true, value: overrides, count };
};
