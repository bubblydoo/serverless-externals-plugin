import { NodeOrLink } from "@npmcli/arborist";

export const printExternalNodes = (nodes: Set<NodeOrLink>) => {
  console.log("Modules that will be kept external:");
  const strings = Array.from(nodes).map((node) => {
    return `${node.location}@${node.version}`;
  });
  console.log(strings.map((s) => `- ${s}`).join("\n"));
};

export const printExternalNodesWithDifferentVersions = (nodes: Set<NodeOrLink>) => {
  /**
   * e.g. `pkg3 -> Node { node_modules/pkg3 }, Node { node_modules/pkg2/node_modules/pkg3 }`
   */
  const allNodesForPackage = new Map<string, Set<NodeOrLink>>();
  nodes.forEach((n) => allNodesForPackage.set(n.name, new Set()));
  nodes.forEach((n) => allNodesForPackage.get(n.name).add(n));

  Array.from(allNodesForPackage.entries()).forEach(([name, nodes]) => {
    const versions = new Set<string>(Array.from(nodes).map((n) => n.version));
    if (versions.size > 1) {
      const versionsStr = Array.from(nodes)
        .map((node) => `- ${node.location}@${node.version}`)
        .join("\n");
      console.log(`Multiple versions will be external for ${name}:\n${versionsStr}`);
    }
  });
};
