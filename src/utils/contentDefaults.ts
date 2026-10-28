const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function safeRecordArray<T>(value: unknown): T[] {
  return Array.isArray(value)
    ? value.filter((item) => isPlainObject(item)) as T[]
    : [];
}

/**
 * Merge an API/local-storage content snapshot with its built-in schema defaults.
 * This protects every route from older or partially corrupted CMS documents
 * (for example, `sections: null` where the UI expects an array) while retaining
 * intentional empty arrays and all custom object keys.
 */
export function mergeContentDefaults<T>(defaults: T, incoming: unknown): T {
  if (Array.isArray(defaults)) {
    return (Array.isArray(incoming) ? incoming : defaults) as T;
  }

  if (isPlainObject(defaults)) {
    if (!isPlainObject(incoming)) return defaults;
    const result: Record<string, unknown> = { ...incoming };
    for (const [key, defaultValue] of Object.entries(defaults)) {
      result[key] = mergeContentDefaults(defaultValue, incoming[key]);
    }
    return result as T;
  }

  if (defaults === null || defaults === undefined) {
    return (incoming ?? defaults) as T;
  }
  if (typeof defaults === 'string') return (typeof incoming === 'string' ? incoming : defaults) as T;
  if (typeof defaults === 'number') return (typeof incoming === 'number' && Number.isFinite(incoming) ? incoming : defaults) as T;
  if (typeof defaults === 'boolean') return (typeof incoming === 'boolean' ? incoming : defaults) as T;
  return (incoming === undefined ? defaults : incoming) as T;
}

/**
 * Reconcile the CMS product collection against the products supported by this
 * build. Older saved CMS snapshots may contain a completely different catalog;
 * letting that id set through makes /products show retired, unrelated offers.
 *
 * Keep edits to known products, restore any missing supported products, and
 * discard unknown ids. An old non-empty catalog with no supported ids is
 * treated as a stale snapshot and replaced with the current defaults. A truly
 * empty array remains intentional (for example, the admin temporarily hid all
 * products).
 */
export function reconcileProductCatalog<T extends { id: string }>(defaults: T[], incoming: unknown): T[] {
  if (!Array.isArray(incoming)) return defaults;
  if (incoming.length === 0) return incoming as T[];

  const defaultsById = new Map(defaults.map((product) => [product.id, product]));
  const incomingById = new Map<string, unknown>();
  for (const item of incoming) {
    if (isPlainObject(item) && typeof item.id === 'string') incomingById.set(item.id, item);
  }

  const hasSupportedProduct = [...incomingById.keys()].some((id) => defaultsById.has(id));
  if (!hasSupportedProduct) return defaults;

  return defaults.map((product) => {
    const savedProduct = incomingById.get(product.id);
    return savedProduct === undefined ? product : mergeContentDefaults(product, savedProduct);
  });
}
