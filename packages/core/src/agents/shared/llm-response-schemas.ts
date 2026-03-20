/**
 * Zod schemas for LLM response validation across pipeline stages.
 * Each schema defines the expected JSON structure from LLM calls.
 *
 * NOTE: No .default() used — all fields are required in both input and output.
 * LLM prompts instruct to always include all fields.
 */
import { z } from "zod";

// ── ANALYZING: Content Quality Assessment ────────────────────

export const BrandRecognitionSchema = z.object({
	score: z.number().min(0).max(100),
	identified_brand: z.string(),
	identified_products: z.array(z.string()),
	reasoning: z.string(),
});

export const ContentQualitySchema = z.object({
	score: z.number().min(0).max(100),
	clarity: z.number().min(0).max(100),
	completeness: z.number().min(0).max(100),
	factual_density: z.number().min(0).max(100),
	reasoning: z.string(),
});

export const InformationGapSchema = z.object({
	category: z.string(),
	description: z.string(),
	importance: z.enum(["critical", "high", "medium", "low"]),
});

export const LLMConsumptionIssueSchema = z.object({
	issue: z.string(),
	recommendation: z.string(),
});

export const ContentQualityAssessmentSchema = z.object({
	brand_recognition: BrandRecognitionSchema,
	content_quality: ContentQualitySchema,
	information_gaps: z.array(InformationGapSchema),
	llm_consumption_issues: z.array(LLMConsumptionIssueSchema),
	overall_assessment: z.string(),
});

export type ContentQualityAssessment = z.infer<typeof ContentQualityAssessmentSchema>;

// ── STRATEGIZING: LLM Strategy Response ─────────────────────

export const StrategyTaskSchema = z.object({
	change_type: z.string(),
	title: z.string(),
	description: z.string(),
	target_element: z.string().nullable(),
	priority: z.enum(["critical", "high", "medium", "low"]),
	expected_impact: z.string().optional(),
	specific_data: z.record(z.unknown()).optional(),
});

export const StrategyLLMResponseSchema = z.object({
	strategy_rationale: z.string(),
	tasks: z.array(StrategyTaskSchema),
	estimated_delta: z.number(),
	confidence: z.number().min(0).max(1),
});

export type StrategyLLMResponse = z.infer<typeof StrategyLLMResponseSchema>;

// ── VALIDATING: Quality Verdict ─────────────────────────────

export const ValidationVerdictSchema = z.object({
	improved_aspects: z.array(z.string()),
	remaining_issues: z.array(z.string()),
	llm_friendliness_verdict: z.enum([
		"much_better",
		"better",
		"marginally_better",
		"no_change",
		"worse",
	]),
	specific_recommendations: z.array(z.string()),
	confidence: z.number().min(0).max(1),
});

export type ValidationVerdict = z.infer<typeof ValidationVerdictSchema>;
