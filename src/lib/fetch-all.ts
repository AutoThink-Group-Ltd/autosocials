/** Loads every row of a query in batches of 1,000 (the backend's per-request cap). */
export async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, batch = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += batch) {
    const { data, error } = await build(from, from + batch - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < batch) return out;
  }
}
