/**
 * Judge Module - Index
 *
 * LLM-based evaluation and judgment of agent outputs.
 */

export {
  LLMJudge,
  EVALUATION_TEMPLATES,
  DEFAULT_LLM_JUDGE_CONFIG,
  type LLMJudgeConfig,
  type LLMProvider,
  type EvaluationCriterion,
  type EvaluationResult,
  type CriterionScore,
  type CalibrationExample,
  type EvaluationTemplate,
  createLLMJudge,
  createJudgeFromTemplate,
} from "./llm-judge";
