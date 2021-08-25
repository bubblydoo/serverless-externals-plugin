import { Edge } from "@npmcli/arborist";

export const dependenciesChildrenFilter = (edge: Edge) => {
  return !edge.dev;
};
