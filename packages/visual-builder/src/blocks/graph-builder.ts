// Placeholder for TestPlan type - to be defined based on workflow package
interface TestPlan {
  id: string;
  name: string;
  steps: unknown[];
}
import { BLOCK_DEFINITIONS } from "./block-definitions";
import {
  type BlockConnection,
  type BlockPort,
  type TestBlock,
  TestBlockType,
  type TestPlanGraph,
} from "./block-types";

interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

const hasCycle = (
  graph: TestPlanGraph,
  startBlockId: string,
  visited: Set<string> = new Set(),
  recursionStack: Set<string> = new Set(),
): boolean => {
  visited.add(startBlockId);
  recursionStack.add(startBlockId);

  const outgoingConnections = graph.connections.filter(
    (connection) => connection.sourceBlockId === startBlockId,
  );

  for (const connection of outgoingConnections) {
    const targetId = connection.targetBlockId;

    if (!visited.has(targetId)) {
      if (hasCycle(graph, targetId, visited, recursionStack)) {
        return true;
      }
    } else if (recursionStack.has(targetId)) {
      return true;
    }
  }

  recursionStack.delete(startBlockId);
  return false;
};

const createPortsFromDefinition = (
  type: TestBlockType,
): { inputs: BlockPort[]; outputs: BlockPort[] } => {
  const definition = BLOCK_DEFINITIONS[type];

  const inputs = definition.inputs.map((portDef) => ({
    id: generateId(),
    name: portDef.name,
    type: portDef.type as "flow" | "data",
    connectedTo: [] as string[],
  }));

  const outputs = definition.outputs.map((portDef) => ({
    id: generateId(),
    name: portDef.name,
    type: portDef.type as "flow" | "data",
    connectedTo: [] as string[],
  }));

  return { inputs, outputs };
};

export class TestPlanGraphBuilder {
  createGraph = (name: string): TestPlanGraph => {
    return {
      id: generateId(),
      name,
      blocks: [],
      connections: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  };

  addBlock = (
    graph: TestPlanGraph,
    type: TestBlockType,
    position: { x: number; y: number },
  ): TestBlock => {
    const definition = BLOCK_DEFINITIONS[type];
    const { inputs, outputs } = createPortsFromDefinition(type);

    const block: TestBlock = {
      id: generateId(),
      type,
      position,
      data: { ...definition.defaultData },
      inputs,
      outputs,
    };

    graph.blocks.push(block);
    return block;
  };

  removeBlock = (graph: TestPlanGraph, blockId: string): void => {
    const blockIndex = graph.blocks.findIndex((block) => block.id === blockId);
    if (blockIndex === -1) return;

    graph.connections = graph.connections.filter(
      (connection) => connection.sourceBlockId !== blockId && connection.targetBlockId !== blockId,
    );

    graph.blocks.splice(blockIndex, 1);
  };

  moveBlock = (graph: TestPlanGraph, blockId: string, position: { x: number; y: number }): void => {
    const block = graph.blocks.find((b) => b.id === blockId);
    if (block) {
      block.position = position;
    }
  };

  updateBlockData = (
    graph: TestPlanGraph,
    blockId: string,
    data: Record<string, unknown>,
  ): void => {
    const block = graph.blocks.find((b) => b.id === blockId);
    if (block) {
      block.data = { ...block.data, ...data };
    }
  };

  connect = (
    graph: TestPlanGraph,
    sourceBlockId: string,
    sourcePortId: string,
    targetBlockId: string,
    targetPortId: string,
  ): BlockConnection => {
    const connection: BlockConnection = {
      id: generateId(),
      sourceBlockId,
      sourcePortId,
      targetBlockId,
      targetPortId,
    };

    graph.connections.push(connection);

    const sourceBlock = graph.blocks.find((b) => b.id === sourceBlockId);
    const targetBlock = graph.blocks.find((b) => b.id === targetBlockId);

    if (sourceBlock) {
      const port = sourceBlock.outputs.find((p) => p.id === sourcePortId);
      if (port) {
        port.connectedTo.push(connection.id);
      }
    }

    if (targetBlock) {
      const port = targetBlock.inputs.find((p) => p.id === targetPortId);
      if (port) {
        port.connectedTo.push(connection.id);
      }
    }

    return connection;
  };

  disconnect = (graph: TestPlanGraph, connectionId: string): void => {
    const connectionIndex = graph.connections.findIndex((c) => c.id === connectionId);
    if (connectionIndex === -1) return;

    const connection = graph.connections[connectionIndex];

    const sourceBlock = graph.blocks.find((b) => b.id === connection.sourceBlockId);
    const targetBlock = graph.blocks.find((b) => b.id === connection.targetBlockId);

    if (sourceBlock) {
      const port = sourceBlock.outputs.find((p) => p.id === connection.sourcePortId);
      if (port) {
        port.connectedTo = port.connectedTo.filter((id) => id !== connectionId);
      }
    }

    if (targetBlock) {
      const port = targetBlock.inputs.find((p) => p.id === connection.targetPortId);
      if (port) {
        port.connectedTo = port.connectedTo.filter((id) => id !== connectionId);
      }
    }

    graph.connections.splice(connectionIndex, 1);
  };

  validateGraph = (graph: TestPlanGraph): ValidationResult => {
    const errors: string[] = [];

    for (const block of graph.blocks) {
      const definition = BLOCK_DEFINITIONS[block.type];

      for (const inputDef of definition.inputs) {
        if (inputDef.required) {
          const port = block.inputs.find((p) => p.name === inputDef.name);
          if (port && port.connectedTo.length === 0) {
            errors.push(
              `Block "${block.id}" is missing required connection for input "${inputDef.name}"`,
            );
          }
        }
      }
    }

    const visited = new Set<string>();
    for (const block of graph.blocks) {
      if (!visited.has(block.id)) {
        if (hasCycle(graph, block.id, visited)) {
          errors.push("Graph contains a cycle");
          break;
        }
      }
    }

    for (const connection of graph.connections) {
      const sourceBlock = graph.blocks.find((b) => b.id === connection.sourceBlockId);
      const targetBlock = graph.blocks.find((b) => b.id === connection.targetBlockId);

      if (!sourceBlock) {
        errors.push(`Connection ${connection.id} references non-existent source block`);
      }

      if (!targetBlock) {
        errors.push(`Connection ${connection.id} references non-existent target block`);
      }

      if (sourceBlock && targetBlock) {
        const sourcePort = sourceBlock.outputs.find((p) => p.id === connection.sourcePortId);
        const targetPort = targetBlock.inputs.find((p) => p.id === connection.targetPortId);

        if (!sourcePort) {
          errors.push(`Connection ${connection.id} references non-existent source port`);
        }

        if (!targetPort) {
          errors.push(`Connection ${connection.id} references non-existent target port`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  toTestPlan = (_graph: TestPlanGraph): TestPlan => {
    throw new Error("Not implemented");
  };

  fromTestPlan = (_testPlan: TestPlan): TestPlanGraph => {
    throw new Error("Not implemented");
  };

  exportToJson = (graph: TestPlanGraph): string => {
    return JSON.stringify(graph, null, 2);
  };

  importFromJson = (json: string): TestPlanGraph => {
    return JSON.parse(json) as TestPlanGraph;
  };
}
