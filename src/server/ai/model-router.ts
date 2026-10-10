export const AI_TASK_TYPES = [
  "classification",
  "summary",
  "routine_check",
  "seo_analysis",
  "metrics_interpretation",
  "planning",
  "strategy",
  "important_decision",
  "complex_problem",
] as const;

export type AiTaskType = (typeof AI_TASK_TYPES)[number];
export type AiModelTier = "simple" | "standard" | "complex";
export type AiModelSelection = { tier: AiModelTier; model: string; maxOutputTokens: number };
export type AiModelSettings = {
  simpleModel: string;
  standardModel: string;
  complexModel: string;
  simpleMaxOutputTokens: number;
  standardMaxOutputTokens: number;
  complexMaxOutputTokens: number;
};

const tierByTask: Record<AiTaskType, AiModelTier> = {
  classification: "simple",
  summary: "simple",
  routine_check: "simple",
  seo_analysis: "standard",
  metrics_interpretation: "standard",
  planning: "standard",
  strategy: "complex",
  important_decision: "complex",
  complex_problem: "complex",
};

/** The application, never a model response, determines the permitted model tier. */
export function selectAiModel(taskType: AiTaskType, settings: AiModelSettings): AiModelSelection {
  const tier = tierByTask[taskType];
  if (tier === "simple")
    return { tier, model: settings.simpleModel, maxOutputTokens: settings.simpleMaxOutputTokens };
  if (tier === "standard")
    return {
      tier,
      model: settings.standardModel,
      maxOutputTokens: settings.standardMaxOutputTokens,
    };
  return { tier, model: settings.complexModel, maxOutputTokens: settings.complexMaxOutputTokens };
}
