declare module "@npmcli/arborist" {
  class Types {
    dev: boolean;
    optional: boolean;
    peer: boolean;
    peerOptional: boolean;
    devOptional: boolean;
    peerLocal: boolean;
  }

  class BaseNode extends Types {
    name: string;
    parent: Node;
    edgesIn: Map<string, Edge>;
    edgesOut: Map<string, Edge>;
    isRoot: boolean;
    location: string;
    version: string;
    package: any;
    path: string;
    realpath: string;
    isLink: boolean;
    dummy: boolean;
    extraneous: boolean;
    root: Node;
  }

  export class Node extends BaseNode {
    isLink: false;
  }

  export class Link extends BaseNode {
    isLink: true;
    target: Node;
  }

  export type NodeOrLink = Node | Link;

  export class Edge extends Types {
    to: NodeOrLink;
    from: NodeOrLink;
    valid: boolean;
    missing: boolean;
    invalid: boolean;
    workspace: boolean;
    type: "prod" | "dev" | "peer" | "optional" | "peerOptional" | "workspace";
    spec: any;
    error: "DETACHED" | "MISSING" | "PEER LOCAL" | "INVALID" | null;
    reload: () => any;
  }

  export class Graph extends Node {
    inventory: Map<string, NodeOrLink>;
    workspaces: Map<string, NodeOrLink>;
  }

  export class Arborist {
    constructor(options: { path: string });

    loadActual(): Promise<Graph>;
  }

  export default Arborist;
}
