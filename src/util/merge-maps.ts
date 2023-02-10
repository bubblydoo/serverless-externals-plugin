export function mergeMaps<K, V, T extends Map<K, V> = Map<K, V>>(maps: T[], skip?: (v: V, k: K, current: T) => boolean): T {
  const reversedMaps = [...maps].reverse();
  const mergedMaps = reversedMaps.slice(1).reduce((merged, current) => {
    const mergedCopy = new Map(merged) as T;
    for (const [k, v] of current.entries()) {
      if (skip?.(v, k, current)) continue;
      mergedCopy.set(k, v);
    }
    return mergedCopy;
  }, reversedMaps[0]);
  return mergedMaps;
}
