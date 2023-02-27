import { Edge, Graph, NodeOrLink } from "@npmcli/arborist";
import { Plugin } from "rollup";
import {
  buildExternalDependencyListFromConfig,
  ExternalsConfig,
  ExternalsReport,
  RelativeGraph,
  resolveExternalsConfig,
  buildRelativeDependencyGraphs,
} from "./core.js";
import {
  printExternalNodes,
  printExternalNodesWithDifferentVersions,
  printReport,
} from "./print.js";
import builtinModules from "builtin-modules";
import { prettyJson } from "./util/pretty-json.js";
import path from "path";
import { dependenciesChildrenFilter } from "./default-filter.js";
import findUp from "find-up";
import { promises as fs } from "fs";
import { mergeMaps } from "./util/merge-maps.js";

/** Defer id resolving to other plugins or default behavior */
const RESOLVE_ID_DEFER: null = null;

const rollupPlugin = (
  root: string | string[],
  config: ExternalsConfig,
  { logExternalNodes, logReport } = { logExternalNodes: false, logReport: false }
): Plugin => {
  const roots = Array.isArray(root) ? root : [root];
  const mainRoot = roots[0];
  let graphs: RelativeGraph[];
  let externalNodes = new Set<NodeOrLink>();
  let resolvedConfig: ExternalsConfig;
  let graphsEdgesOut: Graph["edgesOut"];
  let graphsInventory: Graph["inventory"];
  let graphsRelativeInventory: Graph["inventory"];

  const plugin: Plugin = {
    name: "serverless-externals-plugin",
    async buildStart() {
      graphs = await buildRelativeDependencyGraphs(roots, mainRoot);
      graphsEdgesOut = mergeMaps<string, Edge>(graphs.map((g) => g.orig.edgesOut), (v) => v.missing);
      graphsInventory = mergeMaps(graphs.map((g) => g.orig.inventory));
      graphsRelativeInventory = mergeMaps(graphs.map((g) => g.relativeInventory));

      resolvedConfig = await resolveExternalsConfig(config, roots[0]);
      externalNodes = await buildExternalDependencyListFromConfig(
        graphsEdgesOut,
        resolvedConfig,
        dependenciesChildrenFilter,
        () => true,
        {
          warn: this.warn.bind(this),
        }
      );

      if (logExternalNodes) {
        printExternalNodes(externalNodes);
        printExternalNodesWithDifferentVersions(externalNodes);
      }
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
          const fromInventoryKey = getRelativeDirPath(roots[0], fromPackageDir);
          fromNode = graphsRelativeInventory.get(fromInventoryKey);
        } else {
          this.error(`Couldn't find package dir for ${importer}`);
        }
      }

      const { importeeModuleId = "", importeeExportInsideModuleId = "" } = !isImporteePath
        ? analyzeImporteeName(importee)
        : {};

      if (!isImporteePath) {
        if (builtinModules.includes(importeeModuleId)) {
          return RESOLVE_ID_DEFER;
        }
        // if it's a workspace, then the edge might be missing, so we import from the graphs
        const importeeEdge = (fromNode.isRoot ? graphsEdgesOut : fromNode.edgesOut).get(importeeModuleId);
        if (!importeeEdge) {
          if (importeeModuleId !== importee && !importee.includes(`${importeeModuleId}/`)) {
            // only warn when a module isn't trying to import itself, which happens frequently
            this.warn(`No edge found for: ${prettyJson(importeeModuleId)} (from ${importee})`);
          }
          return RESOLVE_ID_DEFER;
        }
        toNode = importeeEdge.to;
      } else {
        const toPackageDir = await pkgDir(importee);
        if (toPackageDir === roots[0]) {
          // it's an entrypoint
          return RESOLVE_ID_DEFER;
        } else if (toPackageDir) {
          // it's a node module (possibly through a link)
          const toInventoryKey = getRelativeDirPath(roots[0], toPackageDir);
          toNode = graphsRelativeInventory.get(toInventoryKey);
          if (!toNode) {
            // When a rogue package.json is included somewhere in the dist of a module
            // e.g. see https://github.com/aws/aws-sdk-js-v3/issues/2740
            this.error(
              `Module's package.json doesn't belong to current node_modules tree: ${importee}`
            );
          }
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
    async generateBundle(_options, bundle) {
      if (resolvedConfig.report === false) return;
      const originalImports: string[] = [];
      for (const fileName in bundle) {
        const chunk = bundle[fileName];
        if (chunk.type !== "chunk") continue;
        const imports = chunk.imports;
        originalImports.push(...imports);
      }
      const imports = new Set<string>(resolvedConfig.packaging?.forceIncludeModuleRoots || []);
      for (const originalImportee of originalImports) {
        /** should likely never be true */
        const isOriginalImporteePath = originalImportee.startsWith("/");
        if (isOriginalImporteePath) continue;

        const { importeeModuleId } = analyzeImporteeName(originalImportee);
        if (builtinModules.includes(importeeModuleId)) continue;

        /** e.g. pkg3 or pkg2/node_modules/pkg3, but no path imports */
        const originalImportModuleRoot = extractModuleRootFromImport(originalImportee);
        if (resolvedConfig.packaging?.exclude?.includes(originalImportModuleRoot)) continue;
        const node = graphsInventory.get(`node_modules/${originalImportModuleRoot}`);
        if (!node) {
          this.warn(`No module found for: ${prettyJson(originalImportee)}`);
          continue;
        }
        if (node.path === mainRoot) continue;
        imports.add(getRelativeDirPath(mainRoot, node.path));
      }
      const report: ExternalsReport = {
        isReport: true,
        importedModuleRoots: Array.from(imports),
        config: resolvedConfig,
        nodeModulesTreePaths: roots.map(r => path.join(path.relative(mainRoot, r), 'node_modules')),
      };
      const reportFileName =
        typeof resolvedConfig.report === "string"
          ? resolvedConfig.report
          : `node-externals-report.json`;
      this.emitFile({
        type: "asset",
        fileName: reportFileName,
        source: JSON.stringify(report, null, 2),
      });
      if (logReport) {
        printReport(imports, reportFileName);
      }
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

/**
 * Find the nearest dir with package.json,
 * but only if that package.json has a 'name' field
 * This skips the `{"type": "module"}` and `{"type": "module"}` packages
 *
 * @see https://github.com/sindresorhus/pkg-dir/blob/main/index.js
 */
async function pkgDir(cwd: string) {
  const filePath = await findUp(async (dir) => {
    const file = path.join(dir, 'package.json');
    const contents = await fs.readFile(file).catch((e) => null);
    if (!contents) return;
    if (JSON.parse(contents).name) return file;
  }, { cwd });

  return filePath && path.dirname(filePath);
}


/**
 * Turn `pkg2/node_modules/pkg3/stuff` into `pkg2/node_modules/pkg3`
 */
function extractModuleRootFromImport(moduleName: string) {
  const parts = moduleName.split('/');
  let i = 0;
  const keep = [];
  for (const part of parts) {
    if (part !== "node_modules" && i % 2 === 1) break;
    keep.push(part);
    i++;
  }
  return keep.join('/');
}
