import { Option, Schema } from "effect";

export const StepType = Schema.Union([
  Schema.Literal("Given"),
  Schema.Literal("When"),
  Schema.Literal("Then"),
  Schema.Literal("And"),
  Schema.Literal("But"),
  Schema.Literal("Background"),
]);

export const Step = Schema.Struct({
  type: StepType,
  text: Schema.String,
  line: Schema.Number,
});

export const Scenario = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.String),
  steps: Schema.Array(Step),
  line: Schema.Number,
});

export const ScenarioOutline = Schema.Struct({
  name: Schema.String,
  tags: Schema.Array(Schema.String),
  steps: Schema.Array(Step),
  examples: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      headers: Schema.Array(Schema.String),
      rows: Schema.Array(Schema.Array(Schema.String)),
    }),
  ),
  line: Schema.Number,
});

export const Background = Schema.Struct({
  steps: Schema.Array(Step),
  line: Schema.Number,
});

export const Feature = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  tags: Schema.Array(Schema.String),
  background: Schema.Option(Background),
  scenarios: Schema.Array(Scenario),
  scenarioOutlines: Schema.Array(ScenarioOutline),
  line: Schema.Number,
});

export type Step = typeof Step.Type;
export type Scenario = typeof Scenario.Type;
export type ScenarioOutline = typeof ScenarioOutline.Type;
export type Background = typeof Background.Type;
export type Feature = typeof Feature.Type;

export function parseFeature(content: string, _file: string): Feature {
  const lines = content.split("\n");
  let name = "";
  let description = "";
  const featureTags: string[] = [];
  const scenarios: Array<{
    name: string;
    tags: string[];
    steps: Step[];
    line: number;
  }> = [];
  const scenarioOutlines: Array<{
    name: string;
    tags: string[];
    steps: Step[];
    examples: Array<{
      name: string;
      headers: string[];
      rows: string[][];
    }>;
    line: number;
  }> = [];
  let currentTags: string[] = [];
  let inScenario = false;
  let inOutline = false;
  let currentScenarioSteps: Step[] = [];
  let currentScenarioName = "";
  let currentScenarioIndex = -1;
  let inExamples = false;
  // eslint-disable-next-line no-useless-assignment
  let currentLine = 0;
  let currentExampleName = "";
  let currentExampleHeaders: string[] = [];
  let currentExampleRows: string[][] = [];

  const flushExamples = () => {
    if (currentExampleName && currentExampleHeaders.length > 0) {
      const lastOutline = scenarioOutlines[scenarioOutlines.length - 1];
      if (lastOutline) {
        lastOutline.examples.push({
          name: currentExampleName,
          headers: [...currentExampleHeaders],
          rows: [...currentExampleRows],
        });
      }
    }
    inExamples = false;
    currentExampleName = "";
    currentExampleHeaders = [];
    currentExampleRows = [];
  };

  const flushScenario = () => {
    if (!currentScenarioName) return;
    if (inOutline) {
      flushExamples();
      const lastOutline = scenarioOutlines[scenarioOutlines.length - 1];
      if (lastOutline) {
        lastOutline.steps = [...currentScenarioSteps];
      }
    }
    // Regular scenarios are pushed immediately when encountered,
    // so flushScenario only needs to handle outline steps
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;

    // Tags can appear anywhere before a scenario/feature
    if (line.startsWith("@")) {
      const tagMatches = line.match(/@(\S+)/g);
      if (tagMatches) {
        for (const tag of tagMatches) {
          currentTags.push(tag.slice(1)); // Remove the @ prefix
        }
      }
      continue;
    }

    // Feature header
    if (line.startsWith("Feature:")) {
      featureTags.push(...currentTags);
      currentTags = [];
      name = line.replace("Feature:", "").trim();
      continue;
    }

    // Examples block
    if (line.startsWith("Examples:")) {
      flushExamples();
      inExamples = true;
      currentExampleName = line.replace("Examples:", "").trim();
      continue;
    }

    // Example table rows
    if (inExamples && line.startsWith("|")) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (currentExampleHeaders.length === 0) {
        currentExampleHeaders = cells;
      } else {
        currentExampleRows.push(cells);
      }
      continue;
    }

    // Non-table line while in examples - flush examples
    if (inExamples) {
      flushExamples();
    }

    // Scenario Outline header
    if (line.startsWith("Scenario Outline:")) {
      flushScenario();
      const outlineTags = [...currentTags];
      currentScenarioName = line.replace("Scenario Outline:", "").trim();
      currentTags = [];
      currentScenarioSteps = [];
      inScenario = true;
      inOutline = true;
      currentLine = i;

      scenarioOutlines.push({
        name: currentScenarioName,
        tags: outlineTags,
        steps: [],
        examples: [],
        line: currentLine,
      });
      continue;
    }

    // Scenario header
    if (line.startsWith("Scenario:")) {
      flushScenario();
      const scenarioTags = [...currentTags];
      currentScenarioName = line.replace("Scenario:", "").trim();
      currentTags = [];
      currentScenarioSteps = [];
      inScenario = true;
      inOutline = false;
      currentLine = i;

      // Push scenario immediately with its tags (steps will be updated as they're parsed)
      currentScenarioIndex = scenarios.length;
      scenarios.push({
        name: currentScenarioName,
        tags: scenarioTags,
        steps: [],
        line: currentLine,
      });
      continue;
    }

    // Step lines
    const stepMatch = line.match(/^(Given|When|Then|And|But)\s+(.+)$/);
    if (stepMatch && inScenario && !inOutline) {
      const step: Step = {
        type: stepMatch[1] as Step["type"],
        text: stepMatch[2],
        line: i,
      };
      currentScenarioSteps.push(step);
      // Update the scenario's steps in place
      if (currentScenarioIndex >= 0) {
        scenarios[currentScenarioIndex].steps.push(step);
      }
      continue;
    }

    if (stepMatch && inScenario && inOutline) {
      currentScenarioSteps.push({
        type: stepMatch[1] as Step["type"],
        text: stepMatch[2],
        line: i,
      });
      continue;
    }

    // Description lines (before any scenario)
    if (!inScenario && line && !line.startsWith("Feature:")) {
      description += (description ? "\n" : "") + line;
    }
  }

  // Flush last scenario/outline
  flushScenario();

  return Feature.makeUnsafe({
    name,
    description,
    tags: featureTags,
    background: Option.none(),
    scenarios,
    scenarioOutlines: scenarioOutlines as ScenarioOutline[],
    line: 0,
  });
}
