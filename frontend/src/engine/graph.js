// Prerequisite-graph utilities.
// buildGraph precomputes, for every skill:
//   children[s]      direct dependents (edges out of s)
//   parents[s]       direct prerequisites (edges into s)
//   descendants[s]   everything reachable downstream (transitive dependents)
//   ancestors[s]     everything upstream (transitive prerequisites)
// Under the root-cause model, hypothesis h_s says the student is impaired on s AND all descendants(s),
// so impairedSet(graph, s) is the workhorse the diagnosis layer calls.

export function buildGraph(skillIds, edges) {
  const children = Object.fromEntries(skillIds.map((s) => [s, []]));
  const parents = Object.fromEntries(skillIds.map((s) => [s, []]));

  for (const [pre, dep] of edges) {
    if (!(pre in children) || !(dep in children)) {
      throw new Error(`edge references unknown skill: ${pre} -> ${dep}`);
    }
    children[pre].push(dep);
    parents[dep].push(pre);
  }

  const reach = (start, adj) => {
    const seen = new Set();
    const stack = [...adj[start]];
    while (stack.length) {
      const node = stack.pop();
      if (seen.has(node)) continue;
      seen.add(node);
      for (const next of adj[node]) stack.push(next);
    }
    return [...seen];
  };

  const descendants = {};
  const ancestors = {};
  for (const s of skillIds) {
    descendants[s] = reach(s, children);
    ancestors[s] = reach(s, parents);
  }

  return { children, parents, descendants, ancestors, skillIds };
}

// Skills a student would be impaired on if `skill` were the single true gap.
export function impairedSet(graph, skill) {
  return new Set([skill, ...graph.descendants[skill]]);
}
