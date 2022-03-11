import Arborist, { Node, Edge, NodeOrLink, Graph } from "@npmcli/arborist";
import path from "path";
import { depth } from "treeverse";
import semver from "semver";
import { prettyJson } from "./util/pretty-json";
import { promises as fs } from "fs";

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
  graph: Graph,
  report: ExternalsReport,
  childrenFilter: (edge: Edge) => boolean = () => true,
  moduleFilter: (node: NodeOrLink) => boolean = () => true,
  options: { warn?: (str: string) => void } = {}
) => {
  const externalNodes = new Set<NodeOrLink>();

  for (const importedModuleRoot of report.importedModuleRoots) {
    const rootExternalNode = graph.inventory.get(importedModuleRoot);
    externalNodes.add(rootExternalNode);
    const nodes = findAllNodeChildren(rootExternalNode, childrenFilter, options);
    for (const node of nodes) externalNodes.add(node);
  }

  return new Set(Array.from(externalNodes).filter(moduleFilter));
};

export const buildExternalDependencyListFromConfig = async (
  graph: Graph,
  config: ExternalsConfig,
  childrenFilter: (edge: Edge) => boolean = () => true,
  moduleFilter: (node: NodeOrLink) => boolean = () => true,
  options: { warn?: (str: string) => void } = {}
) => {
  const externalNodes = new Set<NodeOrLink>();

  // warn when root external nodes would be filtered out
  Array.from(graph.edgesOut.values()).forEach((edge) => {
    if (doesNodePairMatchConfig(config.modules, edge.from, edge.to) && !childrenFilter(edge)) {
      options?.warn?.(
        `Root external node will be filtered out by module filter: ${edge.to.location} (probably because it's in devDependencies)`
      );
    }
  });

  // depth-first search for matching edges
  depth({
    tree: null,
    getChildren: (edge: Edge) => {
      if (edge && !verifyEdge(edge)) return [];
      const edgesOut = edge === null ? graph.edgesOut : edge.to.edgesOut;
      return Array.from(edgesOut.values()).filter(childrenFilter);
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
    const nodes = findAllNodeChildren(rootExternalNode, childrenFilter, options);
    for (const node of nodes) externalNodes.add(node);
  });

  return new Set(Array.from(externalNodes).filter(moduleFilter));
};

const findAllNodeChildren = (
  node: NodeOrLink,
  childrenFilter: (edge: Edge) => boolean = () => true,
  options: { warn?: (str: string) => void } = {}
) => {
  const externalNodes = new Set<NodeOrLink>();

  // depth-first find every dependency of node
  Array.from(node.edgesOut.values())
    .filter(childrenFilter)
    .forEach((rootEdge) => {
      depth({
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
    // peerOptional edges seem to often have no edge.to
    if (edge.type !== "peerOptional") {
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
