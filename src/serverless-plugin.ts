import { Graph, NodeOrLink } from "@npmcli/arborist";
import Serverless, { Options } from "serverless";
import Plugin, { Hooks } from "serverless/classes/Plugin.js";
import {
  buildDependencyGraph,
  buildExternalDependencyListFromReport,
  ExternalsConfig,
  ExternalsReport,
  ExternalsReportRef,
  resolveExternalsReport,
} from "./core.js";
import { dependenciesChildrenFilter } from "./default-filter.js";

interface FunctionPackage {
  individually: boolean;
  artifact: string;
  functionPackage: Serverless.Package;
  runtime: string;
  isNode: boolean;
  functionName: string;
  functionObject: (Serverless.FunctionDefinitionHandler | Serverless.FunctionDefinitionImage) & {
    externals?: ExternalsReportRef;
  };
}

class ExternalsPlugin implements Plugin {
  hooks: Hooks;

  constructor(private serverless: Serverless, private options: Options) {
    const delayedHooks: Hooks = {
      "before:package:createDeploymentArtifacts": this.package.bind(this),
      "before:package:function:package": this.package.bind(this),
    };

    const schema = {
      type: "object",
      properties: {
        externals: {
          type: "object",
          properties: {
            report: {
              type: "string",
            },
          },
        },
      },
    };

    serverless.configSchemaHandler.defineFunctionProperties(
      serverless.service.provider.name,
      schema
    );
    serverless.configSchemaHandler.defineCustomProperties(schema);

    this.hooks = {
      // Use delayed hooks to guarantee we are **last** to run so other things
      // like the Serverless Enterprise plugin run before us.
      initialize: () => {
        const hooks = serverless.pluginManager.hooks as any;
        Object.keys(delayedHooks).forEach((event) => {
          hooks[event] = (hooks[event] || []).concat({
            pluginName: this.constructor.name,
            hook: delayedHooks[event],
          });
        });
      },
      "externalsPlugin:package:package": this.package.bind(this),
    };
  }

  async packageFunction(fnPkg: FunctionPackage, graph: Graph, root: string) {
    const obj = fnPkg.functionObject;
    const subject = `"${fnPkg.functionName}"`;
    obj.package = obj.package || {};
    obj.package.patterns = obj.package.patterns || [];
    obj.package.patterns = [
      ...obj.package.patterns,
      ...(await this.generatePatternsFromReport(obj.externals, graph, root, subject)),
    ];
  }

  async packageService(fnObjs: FunctionPackage["functionObject"][], graph: Graph, root: string) {
    const service = this.serverless.service;
    const subject = "service";
    service.package = service.package || {};
    service.package.patterns = service.package.patterns || [];
    service.package.patterns = [
      ...service.package.patterns,
      ...(await this.generatePatternsFromReport(service.custom?.externals, graph, root, subject)),
    ];
  }

  private async generatePatternsFromReport(
    ref: ExternalsReportRef,
    graph: Graph,
    root: string,
    logSubject: string
  ): Promise<string[]> {
    if (!ref) {
      this.warn(
        `No externals detected for ${logSubject}, skipping externals bundling. You might want to set package.patterns = ['!node_modules/**'] to exclude all node_modules.`
      );
      return [];
    }

    const report = await resolveExternalsReport(ref, root);

    const resolvedConfig = report.config;

    if (!resolvedConfig?.modules) {
      this.warn(
        `Empty externals list detected for ${logSubject}, skipping externals bundling. You might want to set package.patterns = ['!node_modules/**'] to exclude all node_modules.`
      );
      return [];
    }

    const dependencyList = await buildExternalDependencyListFromReportHelper(report, graph);

    this.log(
      `Setting package patterns for ${logSubject} for ${dependencyList.size} external modules`
    );

    const patternsList = generatePatternsList(dependencyList);

    return patternsList;
  }

  async package() {
    // Attribution: Below code was mostly taken from serverless-jetpack

    const { service } = this.serverless;
    const servicePackage = service.package;
    const serviceIsNode = (service.provider.runtime || "").startsWith("node");
    const options = this.options;

    const singleFunctionName = options?.function;

    // Functions.
    const fnsPkgs: FunctionPackage[] = this.serverless.service
      .getAllFunctions()
      // Limit to single function if provided.
      .filter((functionName) => !singleFunctionName || singleFunctionName === functionName)
      // Convert to more useful format.
      .map((functionName) => ({
        functionName,
        functionObject: service.getFunction(functionName),
      }))
      .map((obj) => ({
        ...obj,
        functionPackage: obj.functionObject.package || {},
        runtime: obj.functionObject.runtime,
        isNode: (obj.functionObject.runtime || "").startsWith("node"),
      }))
      .map((obj) => ({
        ...obj,
        // disable: !!obj.functionPackage.disable,
        individually: !!obj.functionPackage.individually,
        artifact: obj.functionPackage.artifact,
      }));

    // Get list of individual functions to package.
    const individualPkgs = fnsPkgs.filter((obj) => servicePackage.individually || obj.individually);
    const fnsPkgsToPackage = individualPkgs.filter(
      (obj) =>
        // Enabled
        !obj.artifact &&
        // Function runtime is node or unspecified + service-level node.
        (obj.isNode || (!obj.runtime && serviceIsNode))
    );
    const numFns = fnsPkgsToPackage.length;

    if (numFns < individualPkgs.length) {
      this.log(`Skipping individual packaging for ${individualPkgs.length - numFns} functions`);
    }

    // We recreate the logic from `packager#packageService` for deciding whether
    // to package the service or not.
    const serviceFnsToPkg =
      !servicePackage.individually &&
      !servicePackage.artifact &&
      // Service must be Node.js
      serviceIsNode &&
      // Don't package service if we specify a single function **and** have a match
      (!singleFunctionName || !numFns) &&
      // Otherwise, have some functions left that need to use the service package.
      fnsPkgs.filter((obj) => !(obj.individually || obj.artifact));
    const shouldPackageService = !!serviceFnsToPkg.length;

    const tasks: (() => Promise<void>)[] = [];

    // Package entire service if applicable.
    if (shouldPackageService) {
      tasks.push(() =>
        this.packageService(
          serviceFnsToPkg.map((o) => o.functionObject),
          graph,
          root
        )
      );
    } else if (!numFns) {
      // Detect if we did nothing...
      this.log("No matching service or functions to package.");
    }

    service.package.excludeDevDependencies = false;

    const root = this.serverless.config.servicePath;
    const graph = await buildDependencyGraph(root);

    tasks.push(...fnsPkgsToPackage.map((obj) => () => this.packageFunction(obj, graph, root)));

    await Promise.all(tasks.map((t) => t()));
  }

  private log(msg: string) {
    this.serverless.cli.log(msg, "Externals Plugin");
  }

  private warn(msg: string) {
    this.serverless.cli.log(msg, "Externals Plugin", { color: "orange" });
  }
}

// From serverless-jetpack docs:
//
// # Better! Never even read the files from disk during globbing in the first place!
// include:
//   - "!**/node_modules/aws-sdk/**"

/**
 * From a list of all external dependencies (including nested deps),
 * generates a list of Serverless package patterns
 *
 * e.g.:
 * `./node_modules/pkg2/**`
 * `!./node_modules/pkg2/node_modules`
 * `./node_modules/pkg2/node_modules/pkg3/**`
 * `!./node_modules/pkg2/node_modules/pkg3/node_modules`
 */
const generatePatternsList = (dependencyList: Set<NodeOrLink>) => {
  const patternsList = ["!./node_modules/**"];
  dependencyList.forEach((node) => {
    patternsList.push(`./${node.location}/**`);
    patternsList.push(`!./${node.location}/node_modules`);
  });
  return patternsList;
};

const getModuleFilter = (resolvedConfig: ExternalsConfig) => {
  return (node: NodeOrLink) => {
    if (!node) return false; // happens with peerOptional, already warned in Rollup plugin
    if (resolvedConfig.packaging?.exclude?.includes(node.name)) return false;
    return true;
  };
};

const buildExternalDependencyListFromReportHelper = async (
  report: ExternalsReport,
  graph: Graph
) => {
  return await buildExternalDependencyListFromReport(
    graph,
    report,
    dependenciesChildrenFilter,
    getModuleFilter(report.config),
    { warn: console.warn.bind(console) }
  );
};

export default ExternalsPlugin;
