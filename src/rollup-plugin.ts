import { Graph, NodeOrLink } from "@npmcli/arborist";
import pkgDir from "pkg-dir";
import { Plugin } from "rollup";
import {
  buildDependencyGraph,
  buildExternalDependencyList,
  ExternalsConfig,
  resolveExternalsConfig,
} from "./core";
import { printExternalNodes, printExternalNodesWithDifferentVersions } from "./print";
import builtinModules from "builtin-modules";
import { prettyJson } from "./util/pretty-json";
import path from "path";
import { dependenciesChildrenFilter } from "./default-filter";

/** Defer id resolving to other plugins or default behavior */
const RESOLVE_ID_DEFER: null = null;

const rollupPlugin = (root: string, config: ExternalsConfig): Plugin => {
  let graph: Graph;
  let externalNodes = new Set<NodeOrLink>();
  const plugin: Plugin = {
    name: "serverless-externals-plugin",
    async buildStart() {
      graph = await buildDependencyGraph(root);
      const resolvedConfig = await resolveExternalsConfig(config, root);
      externalNodes = await buildExternalDependencyList(
        graph,
        resolvedConfig,
        dependenciesChildrenFilter,
        {
          warn: this.warn.bind(this),
        }
      );

      printExternalNodes(externalNodes);
      printExternalNodesWithDifferentVersions(externalNodes);
    },
    async resolveId(importee: string, importer: string | undefined) {
      // ?commonjs-proxy, ?commonjs-require and ?commonjs-external start with \0,
      // these are for internal use by the commonjs plugin
      if (importee.startsWith("\0") || importer?.startsWith("\0")) return RESOLVE_ID_DEFER;

      // importees in node_modules are always absolute paths
      if (importee.startsWith(".")) return RESOLVE_ID_DEFER;

      let fromNode: NodeOrLink;
      let toNode: NodeOrLink;

      /**
       * Whether importee is an absolute path (e.g. /Code/project/index.js)
       * and not a module/file name (e.g. pkg3 or ./index.js)
       */
      const isImporteePath = importee.startsWith("/");
      // importer is either an absolute path or undefined

      if (!isImporteePath && !importer) {
        // usually this is only the first function call, e.g. id = index.js
        return RESOLVE_ID_DEFER;
      }

      if (importer) {
        const fromPackageDir = await pkgDir(importer);
        if (fromPackageDir) {
          const fromInventoryKey = getRelativeDirPath(root, fromPackageDir);
          fromNode = graph.inventory.get(fromInventoryKey);
        } else {
          this.error(`Couldn't find package dir for ${importer}`);
        }
      }

      const { importeeModuleId = "", importeeExportInsideModuleId = "" } = !isImporteePath
        ? analyzeImporteeName(importee)
        : {};

      if (!isImporteePath) {
        const importeeEdge = fromNode.edgesOut.get(importeeModuleId);
        if (!importeeEdge) {
          // if no edge is found, it's probably a builtin module
          if (!builtinModules.includes(importeeModuleId)) {
            // only warn when it's not a builtin module
            this.warn(`No edge found for: ${prettyJson(importeeModuleId)} (from ${importee})`);
          }
          return RESOLVE_ID_DEFER;
        }
        toNode = importeeEdge.to;
      } else {
        const toPackageDir = await pkgDir(importee);
        if (toPackageDir === root) {
          // it's an entrypoint
          return RESOLVE_ID_DEFER;
        } else if (toPackageDir) {
          // it's a node module (possibly through a link)
          const toInventoryKey = getRelativeDirPath(root, toPackageDir);
          toNode = graph.inventory.get(toInventoryKey);
        } else {
          this.error(`Couldn't find package dir for ${importee}`);
        }
      }

      if (!toNode) {
        this.error(`No to node for: ${importer} > ${importee}`);
      }

      let fromNodeName = fromNode?.name || "*";
      if (!fromNode && !toNode.isRoot) fromNodeName = "?";

      const isExternal = externalNodes.has(toNode);
      // console.log(`${fromNodeName} > ${toNode?.name}`, isExternal ? "external" : "not external");

      // if not external, defer resolving to other plugins
      if (!isExternal) return RESOLVE_ID_DEFER;

      /** e.g. `pkg2/node_modules/@org/pkg4/stuff` */
      let toNodeLocation = `${toNode.location}${importeeExportInsideModuleId}`;

      if (toNodeLocation.startsWith("node_modules/")) {
        toNodeLocation = toNodeLocation.slice("node_modules/".length);
      } else {
        this.warn(`toNode.location doesn't start with node_modules/: ${toNodeLocation}`);
      }
      return { id: toNodeLocation, external: "relative" };
    },
  };

  return plugin;
};

/**
 * Transforms absolute path to relative path (Arborist location)
 * e.g. `/Code/project/node_modules/pkg1` -> `node_modules/pkg1`
 * e.g. `/Code/pkg2` -> `../pkg2` (for linked modules)
 */
const getRelativeDirPath = (root: string, dest: string) => {
  return path.relative(root, dest);
};

/**
 * Analyze an importee name
 * e.g. `@org/abc/stuff` -> `moduleId = '@org/abc', exportInside = '/stuff'`
 */
const analyzeImporteeName = (importee: string) => {
  let importeeOrg: string = null;
  const hasOrg = importee.startsWith("@");
  const splitIndex = hasOrg ? importee.replace("/", " ").indexOf("/") : importee.indexOf("/");
  const importeeParts = splitIndex < 0 ? [importee] : splitAt(importee, splitIndex);
  if (importeeOrg) importeeParts[0] = `${importeeOrg}/${importeeParts[0]}`;
  /**  e.g. module id of `pkg3/stuff` -> `pkg3` */
  const importeeModuleId = importeeParts[0];
  /**  e.g. export inside of module id of `pkg3/stuff` -> `/stuff` */
  const importeeExportInsideModuleId = importeeParts[1] || "";
  return {
    importeeModuleId,
    importeeExportInsideModuleId,
  };
};

const splitAt = (x: string, index: number) => [x.slice(0, index), x.slice(index)];

export default rollupPlugin;
