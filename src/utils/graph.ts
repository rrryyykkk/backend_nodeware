export interface Edge {
  from: string; // taskId yang menunggu
  to: string;   // dependsOnId (prasyarat)
}

/**
 * Mendeteksi apakah penambahan edge (newEdge: taskId -> dependsOnId)
 * akan menyebabkan siklus (cycle) dalam dependency graph.
 *
 * Di sistem ini:
 * taskId "menunggu" dependsOnId. Artinya dependsOnId harus selesai DULU baru taskId bisa jalan.
 * Jika dependsOnId secara langsung/tidak langsung juga menunggu taskId, maka terjadi dead-lock / circular dependency!
 *
 * Mengembalikan path siklus jika ada: e.g. ["t1", "t3", "t1"], atau null jika aman.
 */
export function detectCycle(
  existingEdges: Edge[],
  newEdge: Edge,
  idToPublicIdMap?: Record<string, string>,
): string[] | null {
  // Bangun adjacency list: node -> array of nodes yang ditunggu (prerequisites)
  const adj: Map<string, string[]> = new Map();

  for (const edge of existingEdges) {
    const list = adj.get(edge.from) || [];
    list.push(edge.to);
    adj.set(edge.from, list);
  }

  // Tambahkan edge baru
  const newEdgeList = adj.get(newEdge.from) || [];
  newEdgeList.push(newEdge.to);
  adj.set(newEdge.from, newEdgeList);

  // Jika self-dependency
  if (newEdge.from === newEdge.to) {
    const pub = idToPublicIdMap?.[newEdge.from] ?? newEdge.from;
    return [pub, pub];
  }

  // Cari apakah ada path dari newEdge.to kembali ke newEdge.from
  const visited: Set<string> = new Set();
  const path: string[] = [];

  function dfs(curr: string, target: string): boolean {
    visited.add(curr);
    path.push(curr);

    if (curr === target) {
      return true;
    }

    const neighbors = adj.get(curr) || [];
    for (const next of neighbors) {
      if (next === target) {
        path.push(next);
        return true;
      }
      if (!visited.has(next)) {
        if (dfs(next, target)) {
          return true;
        }
      }
    }

    path.pop();
    return false;
  }

  if (dfs(newEdge.to, newEdge.from)) {
    // Path terbentuk dari newEdge.to ke newEdge.from.
    // Siklus lengkap: newEdge.from -> newEdge.to -> ... -> newEdge.from
    const fullPath = [newEdge.from, ...path];
    return fullPath.map((id) => idToPublicIdMap?.[id] ?? id);
  }

  return null;
}
