import { TestBlockType, type BlockDefinition } from "./block-types";

export const BLOCK_DEFINITIONS: Record<TestBlockType, BlockDefinition> = {
  [TestBlockType.NAVIGATE]: {
    type: TestBlockType.NAVIGATE,
    name: "Navigate",
    description: "Navigate to a URL",
    category: "navigation",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "url", type: "string", required: true },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { url: "" },
  },

  [TestBlockType.CLICK]: {
    type: TestBlockType.CLICK,
    name: "Click",
    description: "Click on an element",
    category: "interaction",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "target", type: "element", required: true },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { target: "" },
  },

  [TestBlockType.FILL]: {
    type: TestBlockType.FILL,
    name: "Fill",
    description: "Fill an input field with a value",
    category: "interaction",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "target", type: "element", required: true },
      { name: "value", type: "string", required: true },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { target: "", value: "" },
  },

  [TestBlockType.SELECT]: {
    type: TestBlockType.SELECT,
    name: "Select",
    description: "Select an option from a dropdown",
    category: "interaction",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "target", type: "element", required: true },
      { name: "option", type: "string", required: true },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { target: "", option: "" },
  },

  [TestBlockType.CHECK]: {
    type: TestBlockType.CHECK,
    name: "Check/Uncheck",
    description: "Check or uncheck a checkbox",
    category: "interaction",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "target", type: "element", required: true },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { target: "", checked: true },
  },

  [TestBlockType.ASSERT]: {
    type: TestBlockType.ASSERT,
    name: "Assert",
    description: "Assert that a condition is true",
    category: "assertion",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "type", type: "string", required: true },
      { name: "target", type: "element", required: false },
      { name: "expected", type: "string", required: false },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { type: "visible", target: "", expected: "" },
  },

  [TestBlockType.WAIT]: {
    type: TestBlockType.WAIT,
    name: "Wait",
    description: "Wait for a duration or element",
    category: "interaction",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "duration", type: "number", required: false },
      { name: "selector", type: "element", required: false },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { duration: 1000, selector: "" },
  },

  [TestBlockType.CONDITIONAL]: {
    type: TestBlockType.CONDITIONAL,
    name: "Conditional",
    description: "Execute different branches based on a condition",
    category: "control-flow",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "condition", type: "string", required: true },
    ],
    outputs: [
      { name: "then", type: "flow", required: false },
      { name: "else", type: "flow", required: false },
    ],
    defaultData: { condition: "" },
  },

  [TestBlockType.LOOP]: {
    type: TestBlockType.LOOP,
    name: "Loop",
    description: "Execute a block of steps repeatedly",
    category: "control-flow",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "loopType", type: "string", required: true },
      { name: "condition", type: "string", required: false },
      { name: "items", type: "string", required: false },
    ],
    outputs: [{ name: "body", type: "flow", required: false }],
    defaultData: { loopType: "while", condition: "", items: "" },
  },

  [TestBlockType.SUBCHAIN]: {
    type: TestBlockType.SUBCHAIN,
    name: "Subchain",
    description: "Execute another test chain",
    category: "control-flow",
    inputs: [
      { name: "flow", type: "flow", required: true },
      { name: "chainId", type: "string", required: true },
    ],
    outputs: [{ name: "flow", type: "flow", required: false }],
    defaultData: { chainId: "" },
  },

  [TestBlockType.COMMENT]: {
    type: TestBlockType.COMMENT,
    name: "Comment",
    description: "Add a comment to the test plan",
    category: "utility",
    inputs: [],
    outputs: [],
    defaultData: { text: "" },
  },
};
