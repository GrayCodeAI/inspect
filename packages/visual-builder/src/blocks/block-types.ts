export enum TestBlockType {
  NAVIGATE = "NAVIGATE",
  CLICK = "CLICK",
  FILL = "FILL",
  SELECT = "SELECT",
  CHECK = "CHECK",
  ASSERT = "ASSERT",
  WAIT = "WAIT",
  CONDITIONAL = "CONDITIONAL",
  LOOP = "LOOP",
  SUBCHAIN = "SUBCHAIN",
  COMMENT = "COMMENT",
}

export interface BlockPort {
  id: string;
  name: string;
  type: "flow" | "data";
  connectedTo: string[];
}

export interface TestBlock {
  id: string;
  type: TestBlockType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
  inputs: BlockPort[];
  outputs: BlockPort[];
}

export interface BlockConnection {
  id: string;
  sourceBlockId: string;
  sourcePortId: string;
  targetBlockId: string;
  targetPortId: string;
}

export interface TestPlanGraph {
  id: string;
  name: string;
  blocks: TestBlock[];
  connections: BlockConnection[];
  viewport: { x: number; y: number; zoom: number };
}

export interface PortDefinition {
  name: string;
  type: "flow" | "string" | "number" | "boolean" | "element";
  required: boolean;
}

export interface BlockDefinition {
  type: TestBlockType;
  name: string;
  description: string;
  category: "navigation" | "interaction" | "assertion" | "control-flow" | "utility";
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  defaultData: Record<string, unknown>;
}
