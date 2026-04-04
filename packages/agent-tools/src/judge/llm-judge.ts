/**
 * LLM Judge
 *
 * Evaluates agent outputs and results using LLM-based assessment.
 * Inspired by Phidata and other evaluation frameworks.
 */

import { EventEmitter } from "events";

export interface LLMJudgeConfig {
  /** LLM provider */
  provider: LLMProvider;
  /** Evaluation model */
  model: string;
  /** Temperature for evaluation */
  temperature: number;
  /** Max tokens per evaluation */
  maxTokens: number;
  /** Evaluation timeout (ms) */
  timeout: number;
  /** Evaluation criteria */
  criteria: EvaluationCriterion[];
  /** Enable explanation */
  includeExplanation: boolean;
  /** Calibration examples */
  calibrationExamples?: CalibrationExample[];
  /** On evaluation complete */
  onEvaluation?: (result: EvaluationResult) => void;
}

export interface LLMProvider {
  chat(
    messages: Array<{ role: string; content: string }>,
    options: { model: string; temperature: number; maxTokens: number },
  ): Promise<{ content: string }>;
}

export interface EvaluationCriterion {
  name: string;
  description: string;
  weight: number;
  scale: "binary" | "1-5" | "1-10" | "percentage";
  rubric?: Record<string, string>;
}

export interface CalibrationExample {
  input: string;
  output: string;
  expectedScore: number;
  explanation: string;
}

export interface EvaluationResult {
  id: string;
  timestamp: number;
  input: string;
  output: string;
  task: string;
  scores: Record<string, CriterionScore>;
  overallScore: number;
  passed: boolean;
  explanation?: string;
  metadata: {
    model: string;
    duration: number;
    tokensUsed: number;
  };
}

export interface CriterionScore {
  criterion: string;
  score: number;
  maxScore: number;
  normalizedScore: number; // 0-1
  explanation?: string;
}

export interface EvaluationBatch {
  id: string;
  items: EvaluationItem[];
  results: EvaluationResult[];
  aggregate: AggregateMetrics;
}

export interface EvaluationItem {
  id: string;
  input: string;
  output: string;
  task: string;
  expected?: string;
  metadata?: Record<string, unknown>;
}

export interface AggregateMetrics {
  totalEvaluations: number;
  passRate: number;
  averageScore: number;
  scoreDistribution: Record<string, number>;
  byCriterion: Record<string, { average: number; min: number; max: number }>;
}

export interface EvaluationTemplate {
  name: string;
  description: string;
  criteria: EvaluationCriterion[];
  systemPrompt: string;
  evaluationPrompt: string;
}

export const DEFAULT_LLM_JUDGE_CONFIG: LLMJudgeConfig = {
  provider: null as unknown as LLMProvider, // Must be provided
  model: "claude-sonnet-4-6",
  temperature: 0.1,
  maxTokens: 2000,
  timeout: 30000,
  includeExplanation: true,
  criteria: [
    {
      name: "accuracy",
      description: "How accurate is the output compared to the expected result?",
      weight: 0.4,
      scale: "1-10",
    },
    {
      name: "completeness",
      description: "Does the output fully address all aspects of the input?",
      weight: 0.3,
      scale: "1-10",
    },
    {
      name: "clarity",
      description: "Is the output clear and well-structured?",
      weight: 0.2,
      scale: "1-10",
    },
    {
      name: "safety",
      description: "Is the output safe and free from harmful content?",
      weight: 0.1,
      scale: "binary",
    },
  ],
};

// Pre-built evaluation templates
export const EVALUATION_TEMPLATES: Record<string, EvaluationTemplate> = {
  qa: {
    name: "Question Answering",
    description: "Evaluates question answering tasks",
    criteria: [
      {
        name: "correctness",
        description: "Is the answer factually correct?",
        weight: 0.5,
        scale: "binary",
      },
      {
        name: "completeness",
        description: "Does the answer fully address the question?",
        weight: 0.3,
        scale: "1-10",
      },
      {
        name: "conciseness",
        description: "Is the answer appropriately concise?",
        weight: 0.2,
        scale: "1-10",
      },
    ],
    systemPrompt: `You are an expert evaluator of question answering systems.
Evaluate the answer based on the criteria provided.
Be objective and consistent in your assessments.`,
    evaluationPrompt: `Question: {{input}}
Answer: {{output}}
{{#if expected}}
Expected Answer: {{expected}}
{{/if}}

Evaluate the answer on the following criteria:
{{criteria}}

Provide scores and brief explanations.`,
  },

  code: {
    name: "Code Generation",
    description: "Evaluates code generation tasks",
    criteria: [
      {
        name: "correctness",
        description: "Does the code work as intended?",
        weight: 0.4,
        scale: "binary",
      },
      {
        name: "quality",
        description: "Is the code well-structured and readable?",
        weight: 0.3,
        scale: "1-10",
      },
      {
        name: "efficiency",
        description: "Is the code efficient?",
        weight: 0.2,
        scale: "1-10",
      },
      {
        name: "safety",
        description: "Is the code secure?",
        weight: 0.1,
        scale: "binary",
      },
    ],
    systemPrompt: `You are an expert software engineer and code reviewer.
Evaluate the code based on correctness, quality, efficiency, and safety.
Be thorough in your assessment.`,
    evaluationPrompt: `Task: {{input}}
Generated Code:
\`\`\`
{{output}}
\`\`\`
{{#if expected}}
Expected Code:
\`\`\`
{{expected}}
\`\`\`
{{/if}}

Evaluate the code on the following criteria:
{{criteria}}

Provide scores and brief explanations.`,
  },

  browser: {
    name: "Browser Automation",
    description: "Evaluates browser automation task completion",
    criteria: [
      {
        name: "task_completion",
        description: "Was the task fully completed?",
        weight: 0.5,
        scale: "binary",
      },
      {
        name: "efficiency",
        description: "Were the steps taken efficient?",
        weight: 0.25,
        scale: "1-10",
      },
      {
        name: "correctness",
        description: "Were the actions correct?",
        weight: 0.25,
        scale: "1-10",
      },
    ],
    systemPrompt: `You are an expert in browser automation testing.
Evaluate whether the agent successfully completed the given task.
Consider efficiency and correctness of actions.`,
    evaluationPrompt: `Task: {{input}}
Agent Actions:
{{output}}

Evaluate the task completion on the following criteria:
{{criteria}}

Provide scores and brief explanations.`,
  },
};

/**
 * LLM Judge for evaluating agent outputs
 */
export class LLMJudge extends EventEmitter {
  private config: LLMJudgeConfig;
  private evaluationHistory: EvaluationResult[] = [];
  private calibrationScores: Map<string, number> = new Map();

  constructor(config: Partial<LLMJudgeConfig> = {}) {
    super();
    this.config = { ...DEFAULT_LLM_JUDGE_CONFIG, ...config };

    if (!this.config.provider) {
      throw new Error("LLM provider is required");
    }
  }

  /**
   * Evaluate a single item
   */
  async evaluate(item: EvaluationItem): Promise<EvaluationResult> {
    const startTime = Date.now();
    const evaluationId = `eval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Build evaluation prompt
    const prompt = this.buildEvaluationPrompt(item);

    try {
      // Call LLM for evaluation
      const response = await Promise.race([
        this.config.provider.chat(
          [
            { role: "system", content: this.buildSystemPrompt() },
            { role: "user", content: prompt },
          ],
          {
            model: this.config.model,
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
          },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Evaluation timeout")), this.config.timeout),
        ),
      ]);

      // Parse evaluation response
      const parsed = this.parseEvaluationResponse(response.content);

      // Calculate overall score
      const overallScore = this.calculateOverallScore(parsed.scores);
      const passed = overallScore >= 0.7; // 70% threshold

      const result: EvaluationResult = {
        id: evaluationId,
        timestamp: Date.now(),
        input: item.input,
        output: item.output,
        task: item.task,
        scores: parsed.scores,
        overallScore,
        passed,
        explanation: parsed.explanation,
        metadata: {
          model: this.config.model,
          duration: Date.now() - startTime,
          tokensUsed: this.estimateTokens(response.content),
        },
      };

      this.evaluationHistory.push(result);
      this.emit("evaluation:complete", result);
      this.config.onEvaluation?.(result);

      return result;
    } catch (error) {
      this.emit("evaluation:error", { evaluationId, error });
      throw error;
    }
  }

  /**
   * Evaluate a batch of items
   */
  async evaluateBatch(items: EvaluationItem[]): Promise<EvaluationBatch> {
    const batchId = `batch-${Date.now()}`;

    // Evaluate in parallel with concurrency limit
    const concurrencyLimit = 5;
    const results: EvaluationResult[] = [];

    for (let i = 0; i < items.length; i += concurrencyLimit) {
      const batch = items.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(batch.map((item) => this.evaluate(item)));
      results.push(...batchResults);
    }

    // Calculate aggregate metrics
    const aggregate = this.calculateAggregateMetrics(results);

    const batch: EvaluationBatch = {
      id: batchId,
      items,
      results,
      aggregate,
    };

    this.emit("batch:complete", batch);

    return batch;
  }

  /**
   * Calibrate judge with known examples
   */
  async calibrate(examples: CalibrationExample[]): Promise<{
    calibrated: boolean;
    accuracy: number;
    adjustments: Record<string, number>;
  }> {
    let correct = 0;
    const adjustments: Record<string, number> = {};

    for (const example of examples) {
      const result = await this.evaluate({
        id: `cal-${Date.now()}`,
        input: example.input,
        output: example.output,
        task: "calibration",
      });

      const withinTolerance = Math.abs(result.overallScore - example.expectedScore) <= 0.2;

      if (withinTolerance) {
        correct++;
      } else {
        // Calculate adjustment needed
        const adjustment = example.expectedScore - result.overallScore;
        adjustments[example.input.slice(0, 50)] = adjustment;
      }
    }

    const accuracy = correct / examples.length;

    return {
      calibrated: accuracy >= 0.8,
      accuracy,
      adjustments,
    };
  }

  /**
   * Build system prompt
   */
  private buildSystemPrompt(): string {
    const criteria = this.config.criteria
      .map((c) => `- ${c.name} (${c.scale}): ${c.description} (weight: ${c.weight})`)
      .join("\n");

    return `You are an expert evaluator. Assess the output based on the following criteria:

${criteria}

Respond with a JSON object containing:
{
  "scores": {
    "<criterion_name>": {
      "score": <number>,
      "explanation": "<brief explanation>"
    }
  }${this.config.includeExplanation ? ',\n  "explanation": "<overall explanation>"' : ""}
}

Be consistent and objective in your evaluations.`;
  }

  /**
   * Build evaluation prompt for item
   */
  private buildEvaluationPrompt(item: EvaluationItem): string {
    return `Task: ${item.task}

Input:
${item.input}

Output:
${item.output}

${item.expected ? `Expected Output:\n${item.expected}\n\n` : ""}Evaluate the output and provide scores for each criterion.`;
  }

  /**
   * Parse evaluation response
   */
  private parseEvaluationResponse(content: string): {
    scores: Record<string, CriterionScore>;
    explanation?: string;
  } {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in response");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const scores: Record<string, CriterionScore> = {};

      for (const criterion of this.config.criteria) {
        const criterionData = parsed.scores?.[criterion.name];
        if (criterionData) {
          const score = criterionData.score || criterionData;
          const maxScore = this.getMaxScore(criterion.scale);

          scores[criterion.name] = {
            criterion: criterion.name,
            score,
            maxScore,
            normalizedScore: score / maxScore,
            explanation: criterionData.explanation,
          };
        }
      }

      return {
        scores,
        explanation: parsed.explanation,
      };
    } catch {
      // Fallback: try to extract scores from text
      return this.fallbackParse(content);
    }
  }

  /**
   * Fallback parsing for non-JSON responses
   */
  private fallbackParse(content: string): {
    scores: Record<string, CriterionScore>;
    explanation?: string;
  } {
    const scores: Record<string, CriterionScore> = {};

    for (const criterion of this.config.criteria) {
      const regex = new RegExp(`${criterion.name}[:\\s]+(\\d+(?:\\.\\d+)?)`, "i");
      const match = content.match(regex);
      const score = match ? parseFloat(match[1]) : 5;
      const maxScore = this.getMaxScore(criterion.scale);

      scores[criterion.name] = {
        criterion: criterion.name,
        score,
        maxScore,
        normalizedScore: score / maxScore,
      };
    }

    return { scores, explanation: content.slice(0, 500) };
  }

  /**
   * Get max score for scale
   */
  private getMaxScore(scale: string): number {
    switch (scale) {
      case "binary":
        return 1;
      case "1-5":
        return 5;
      case "1-10":
        return 10;
      case "percentage":
        return 100;
      default:
        return 10;
    }
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(scores: Record<string, CriterionScore>): number {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const criterion of this.config.criteria) {
      const score = scores[criterion.name];
      if (score) {
        totalWeight += criterion.weight;
        weightedScore += score.normalizedScore * criterion.weight;
      }
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  /**
   * Calculate aggregate metrics
   */
  private calculateAggregateMetrics(results: EvaluationResult[]): AggregateMetrics {
    const totalEvaluations = results.length;
    const passedCount = results.filter((r) => r.passed).length;
    const averageScore = results.reduce((sum, r) => sum + r.overallScore, 0) / totalEvaluations;

    // Score distribution
    const scoreDistribution: Record<string, number> = {
      "0.0-0.2": 0,
      "0.2-0.4": 0,
      "0.4-0.6": 0,
      "0.6-0.8": 0,
      "0.8-1.0": 0,
    };

    for (const result of results) {
      const score = result.overallScore;
      if (score < 0.2) scoreDistribution["0.0-0.2"]++;
      else if (score < 0.4) scoreDistribution["0.2-0.4"]++;
      else if (score < 0.6) scoreDistribution["0.4-0.6"]++;
      else if (score < 0.8) scoreDistribution["0.6-0.8"]++;
      else scoreDistribution["0.8-1.0"]++;
    }

    // By criterion
    const byCriterion: AggregateMetrics["byCriterion"] = {};
    for (const criterion of this.config.criteria) {
      const criterionScores = results
        .map((r) => r.scores[criterion.name]?.normalizedScore)
        .filter((s): s is number => s !== undefined);

      byCriterion[criterion.name] = {
        average: criterionScores.reduce((a, b) => a + b, 0) / criterionScores.length,
        min: Math.min(...criterionScores),
        max: Math.max(...criterionScores),
      };
    }

    return {
      totalEvaluations,
      passRate: passedCount / totalEvaluations,
      averageScore,
      scoreDistribution,
      byCriterion,
    };
  }

  /**
   * Estimate token count
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get evaluation history
   */
  getHistory(): EvaluationResult[] {
    return [...this.evaluationHistory];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalEvaluations: number;
    averagePassRate: number;
    averageScore: number;
  } {
    if (this.evaluationHistory.length === 0) {
      return { totalEvaluations: 0, averagePassRate: 0, averageScore: 0 };
    }

    const passed = this.evaluationHistory.filter((e) => e.passed).length;

    return {
      totalEvaluations: this.evaluationHistory.length,
      averagePassRate: passed / this.evaluationHistory.length,
      averageScore:
        this.evaluationHistory.reduce((sum, e) => sum + e.overallScore, 0) /
        this.evaluationHistory.length,
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.evaluationHistory = [];
  }
}

/**
 * Create judge from template
 */
export function createJudgeFromTemplate(
  templateName: keyof typeof EVALUATION_TEMPLATES,
  provider: LLMProvider,
): LLMJudge {
  const template = EVALUATION_TEMPLATES[templateName];
  return new LLMJudge({
    provider,
    criteria: template.criteria,
  });
}

/**
 * Convenience function
 */
export function createLLMJudge(provider: LLMProvider, config?: Partial<LLMJudgeConfig>): LLMJudge {
  return new LLMJudge({ ...config, provider });
}
