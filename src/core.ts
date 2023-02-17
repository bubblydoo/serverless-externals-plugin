import Arborist, { Edge, NodeOrLink, Graph, Node } from "@npmcli/arborist";
import path from "path";
import treeverse from "treeverse";
import semver from "semver";
import { prettyJson } from "./util/pretty-json.js";
import { promises as fs } from "fs";
import { mergeMaps } from "./util/merge-maps.js";

export interface ExternalsConfigRef {
  file?: string;
}

export interface ExternalsConfig {
  modules?: string[];
  packaging?: {
    /** Module names that are excluded because they're included in the Serverless function in a different way. */
    exclude?: string[];
    /** Locations of imported modules that should always be included. Used for peer dependencies. Same format as Arborist locations. */
    forceIncludeModuleRoots?: string[];
  }
  report?: string | boolean;
}

export interface ExternalsReportRef {
  report?: string;
}

export interface ExternalsReport {
  isReport: true;
  /** Locations of top-level imported modules, e.g. `node_modules/db-errors`. Same format as Arborist locations. */
  importedModuleRoots: string[];
  /** Original config */
  config: ExternalsConfig;
  /** Locations of node_modules paths, in order of priority */
  nodeModulesTreePaths: string[]
}

export const resolveExternalsConfig = async (
  configOrRef: ExternalsConfig | ExternalsConfigRef,
  root: string
): Promise<ExternalsConfig> => {
  if ('file' in configOrRef) {
    const filePath = path.resolve(root, configOrRef.file);
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  }
  return configOrRef as any;
};

export const resolveExternalsReport = async (
  ref: ExternalsReportRef,
  root: string
): Promise<ExternalsReport> => {
  if (!('report' in ref)) throw new Error("No `externals.report` field");
  const filePath = path.resolve(root, ref.report);
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
};

export const isConfigReport = (
  config: ExternalsConfig | ExternalsReport
): config is ExternalsReport => {
  return "isReport" in config && config.isReport;
};

export const buildDependencyGraph = async (root: string) => {
  const arb = new Arborist({
    path: path.resolve(root),
  });
  const graph = await arb.loadActual();
  return graph;
};

export const buildExternalDependencyListFromReport = async (
  graphs: RelativeGraph[],
  report: ExternalsReport,
  childrenFilter: (edge: Edge) => boolean = () => true,
  moduleFilter: (node: NodeOrLink) => boolean = () => true,
  options: { warn?: (str: string) => void } = {}
) => {
  const externalNodes = new Set<NodeOrLink>();

  const graphsRelativeInventory = mergeMaps(graphs.map((g) => g.relativeInventory));

  for (const importedModuleRoot of report.importedModuleRoots) {
    const rootExternalNode = graphsRelativeInventory.get(importedModuleRoot);
    if (!rootExternalNode) throw new Error(`Can't find ${importedModuleRoot} in tree`);
    externalNodes.add(rootExternalNode);
    const nodes = findAllNodeChildren(rootExternalNode.edgesOut, childrenFilter, options);
    for (const node of nodes) externalNodes.add(node);
  }

  return new Set(Array.from(externalNodes).filter(moduleFilter));
};

export const buildExternalDependencyListFromConfig = async (
  graphsEdgesOut: Graph["edgesOut"],
  config: ExternalsConfig,
  childrenFilter: (edge: Edge) => boolean = () => true,
  moduleFilter: (node: NodeOrLink) => boolean = () => true,
  options: { warn?: (str: string) => void } = {}
) => {
  const externalNodes = new Set<NodeOrLink>();

  // warn when root external nodes would be filtered out
  Array.from(graphsEdgesOut.values()).forEach((edge) => {
    if (!verifyEdge(edge, options.warn)) return;

    if (doesNodePairMatchConfig(config.modules, edge.from, edge.to) && !childrenFilter(edge)) {
      options?.warn?.(
        `Root external node will be filtered out by module filter: ${edge.to.location} (probably because it's in devDependencies)`
      );
    }
  });

  // depth-first search for matching edges
  treeverse.depth({
    tree: null,
    getChildren: (edge: Edge) => {
      if (edge && !verifyEdge(edge)) return [];
      const edgeEdgesOut = edge === null ? graphsEdgesOut : edge.to.edgesOut;
      return Array.from(edgeEdgesOut.values()).filter(childrenFilter);
    },
    visit: (edge: Edge) => {
      if (edge === null) return;
      if (!verifyEdge(edge, options.warn)) return;

      if (doesNodePairMatchConfig(config.modules, edge.from, edge.to)) {
        externalNodes.add(edge.to);
      }
    },
  });

  // include every dependency of external nodes
  Array.from(externalNodes).forEach((rootExternalNode) => {
    const nodes = findAllNodeChildren(rootExternalNode.edgesOut, childrenFilter, options);
    for (const node of nodes) externalNodes.add(node);
  });

  return new Set(Array.from(externalNodes).filter(moduleFilter));
};

const findAllNodeChildren = (
  graphsEdgesOut: Node["edgesOut"],
  childrenFilter: (edge: Edge) => boolean = () => true,
  options: { warn?: (str: string) => void } = {}
) => {
  const externalNodes = new Set<NodeOrLink>();

  // depth-first find every dependency of node
  Array.from(graphsEdgesOut.values())
    .filter(childrenFilter)
    .forEach((rootEdge) => {
      treeverse.depth({
        tree: rootEdge,
        getChildren: (edge: Edge) => {
          if (edge && !verifyEdge(edge)) return [];
          return Array.from(edge.to.edgesOut.values()).filter(childrenFilter);
        },
        visit: (edge: Edge) => {
          if (!verifyEdge(edge, options.warn)) return;

          externalNodes.add(edge.to);
        },
      });
    });

  return externalNodes;
};

const verifyEdge = (edge: Edge, warn?: (str: string) => void) => {
  if (edge.missing) {
    warn?.(`Dependency is missing, skipping:\n${prettyJson(edge)}`);
    return false;
  }
  if (edge.invalid) {
    warn?.(`Dependency is invalid, skipping:\n${prettyJson(edge)}`);
    return false;
  }
  if (!edge.to) {
    // peerOptional and optional edges seem to often have no edge.to
    if (edge.type !== "peerOptional" && edge.type !== "optional") {
      warn?.(`Edge has no to node, skipping:\n${prettyJson(edge)}`);
    }
    return false;
  }
  return true;
};

const doesNodePairMatchConfig = (modules: string[], from: NodeOrLink, to: NodeOrLink) => {
  return modules.some((spec) => {
    const [specName, specVersionRange] = spec.split(/(?!^@)@/); // regex to avoid splitting on first @org
    if (specName === to.name) {
      if (!specVersionRange) return true;
      return semver.satisfies(to.version, specVersionRange);
    }
    return false;
  });
};

export function makeInventoryRelative(inventory: Graph["inventory"], mainRoot: string, root: string) {
  if (mainRoot === root) return inventory;
  const diff = path.relative(mainRoot, root);
  return new Map([...inventory.entries()].map(([k, v]) => [path.join(diff, k), v]));
}

export type RelativeGraph = { orig: Graph, relativeInventory: Graph["inventory"] };

export async function buildRelativeDependencyGraphs(roots: string[], mainRoot: string) {
  const graphs: RelativeGraph[] = await Promise.all(roots.map(async (root) => {
    const orig = await buildDependencyGraph(root);
    const relativeInventory = makeInventoryRelative(orig.inventory, mainRoot, root);
    return { orig, relativeInventory };
  }));
  return graphs;
}
