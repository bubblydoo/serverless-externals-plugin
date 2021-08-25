import Arborist, { Node, Edge, NodeOrLink, Graph } from "@npmcli/arborist";
import path from "path";
import { depth } from "treeverse";
import semver from "semver";
import { prettyJson } from "./util/pretty-json";
import { promises as fs } from "fs";

export interface ExternalsConfig extends ResolvedExternalsConfig {
  file?: string;
}

export interface ResolvedExternalsConfig {
  modules?: string[];
}

export const resolveExternalsConfig = async (config: ExternalsConfig, root: string) => {
  if (config.file) {
    const filePath = path.resolve(root, config.file);
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  }
  return config;
};

export const buildDependencyGraph = async (root: string) => {
  const arb = new Arborist({
    path: path.resolve(root),
  });
  const graph = await arb.loadActual();
  return graph;
};

export const buildExternalDependencyList = async (
  graph: Graph,
  config: ResolvedExternalsConfig,
  childrenFilter: (edge: Edge) => boolean = () => true,
  options: { warn?: (str: string) => void } = {}
) => {
  const externalNodes = new Set<NodeOrLink>();

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

      if (doesNodePairMatchConfig(config, edge.from, edge.to)) {
        externalNodes.add(edge.to);
      }
    },
  });

  // depth-first include every dependency of external nodes
  Array.from(externalNodes).forEach((rootExternalNode) => {
    Array.from(rootExternalNode.edgesOut.values()).forEach((rootEdge) => {
      depth({
        tree: rootEdge,
        getChildren: (edge: Edge) => {
          if (edge && !verifyEdge(edge)) return [];
          return Array.from(edge.to.edgesOut.values());
        },
        visit: (edge: Edge) => {
          if (!verifyEdge(edge, options.warn)) return;

          externalNodes.add(edge.to);
        },
      });
    });
  });

  return externalNodes;
};

const doesNodePairMatchConfig = (
  config: ResolvedExternalsConfig,
  from: NodeOrLink,
  to: NodeOrLink
) => {
  return config.modules.some((spec) => {
    const [specName, specVersionRange] = spec.split(/(?!^@)@/); // regex to avoid splitting on first @org
    if (specName === to.name) {
      if (!specVersionRange) return true;
      return semver.satisfies(to.version, specVersionRange);
    }
    return false;
  });
};
