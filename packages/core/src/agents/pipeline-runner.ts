import { CloneManager } from "../clone/clone-manager.js";
import type { LLMRequest, LLMResponse } from "../llm/geo-llm-client.js";
/**
 * Pipeline Runner — Orchestrator에 모든 Agent를 등록하고 E2E 파이프라인 실행
 *
 * 사용법:
 *   const result = await runPipeline({ target_id, target_url, workspace_dir });
 *
 * 파이프라인 흐름:
 *   ANALYZING → CLONING → STRATEGIZING → OPTIMIZING → VALIDATING → REPORTING → COMPLETED
 *   (VALIDATING에서 점수 미달 시 → STRATEGIZING 루프백)
 */
import { Orchestrator, type StageContext } from "../pipeline/orchestrator.js";
import { ArchiveBuilder } from "../report/archive-builder.js";
import { generateDashboardHtml } from "../report/dashboard-html-generator.js";
import { ReportBuilder } from "../report/report-generator.js";
import { type AnalysisOutput, runAnalysis } from "./analysis-agent.js";
import { type OptimizationResult, runOptimization } from "./optimization-agent.js";
import { type StrategyOutput, runStrategy } from "./strategy-agent.js";
import type { CrawlData } from "./types.js";
import { type ValidationOutput, runValidation } from "./validation-agent.js";

// ── Pipeline Config ─────────────────────────────────────────

export interface PipelineConfig {
	target_id: string;
	target_url: string;
	workspace_dir: string;
	/** 목표 점수 (기본 80) */
	target_score?: number;
	/** 최대 사이클 수 (기본 10) */
	max_cycles?: number;
	/** 최대 재시도 수 (기본 3) */
	max_retries?: number;
	/** 타임아웃 ms (기본 30분) */
	timeout_ms?: number;
}

export interface PipelineResult {
	success: boolean;
	final_score: number;
	initial_score: number;
	delta: number;
	cycles_completed: number;
	report_path: string | null;
	dashboard_html: string | null;
	error?: string;
}

// ── Pipeline Dependencies (DI) ──────────────────────────────

export interface PipelineDeps {
	crawlTarget: (url: string, timeout?: number) => Promise<CrawlData>;
	scoreTarget: (data: CrawlData) => {
		overall_score: number;
		grade: string;
		dimensions: Array<{
			id: string;
			label: string;
			score: number;
			weight: number;
			details: string[];
		}>;
	};
	classifySite: (
		html: string,
		url: string,
	) => {
		site_type: string;
		confidence: number;
		matched_signals: string[];
		all_signals: Array<{ site_type: string; confidence: number; signals: string[] }>;
	};
	chatLLM?: (req: LLMRequest) => Promise<LLMResponse>;
}

// ── Pipeline Runner ──────────────────────────────────────────

export async function runPipeline(
	config: PipelineConfig,
	deps: PipelineDeps,
): Promise<PipelineResult> {
	// Shared state across stages
	let analysisOutput: AnalysisOutput | null = null;
	let strategyOutput: StrategyOutput | null = null;
	let optimizationResult: OptimizationResult | null = null;
	let validationOutput: ValidationOutput | null = null;
	let cloneManager: CloneManager | null = null;
	let currentScore = 0;
	let currentGrade = "";
	let currentDimensions: Array<{
		id: string;
		label: string;
		score: number;
		weight: number;
		details: string[];
	}> = [];
	let initialScore = 0;
	let cycleCount = 0;

	const orchestrator = new Orchestrator({
		maxRetries: config.max_retries ?? 3,
		timeoutMs: config.timeout_ms ?? 30 * 60 * 1000,
		maxCycles: config.max_cycles ?? 10,
	});

	// ── ANALYZING ────────────────────────────────────────────
	orchestrator.registerHandler("ANALYZING", async (ctx: StageContext) => {
		analysisOutput = await runAnalysis(
			{ target_id: config.target_id, target_url: config.target_url },
			deps,
		);
		ctx.setRef("analysis", analysisOutput.report.report_id);
		currentScore = analysisOutput.geo_scores.overall_score;
		currentGrade = analysisOutput.geo_scores.grade;
		currentDimensions = analysisOutput.geo_scores.dimensions;
		initialScore = currentScore;
	});

	// ── CLONING ──────────────────────────────────────────────
	orchestrator.registerHandler("CLONING", async () => {
		if (!analysisOutput) throw new Error("Analysis output missing");
		cloneManager = new CloneManager(config.workspace_dir);
		await cloneManager.createClone(
			config.target_id,
			config.target_url,
			analysisOutput.crawl_data.html,
		);
	});

	// ── STRATEGIZING ─────────────────────────────────────────
	orchestrator.registerHandler("STRATEGIZING", async (ctx: StageContext) => {
		if (!analysisOutput) throw new Error("Analysis output missing");
		strategyOutput = await runStrategy(
			{
				target_id: config.target_id,
				analysis_report: analysisOutput.report,
				use_llm: !!deps.chatLLM,
			},
			deps.chatLLM ? { chatLLM: deps.chatLLM } : undefined,
		);
		ctx.setRef("optimization", strategyOutput.plan.plan_id);
	});

	// ── OPTIMIZING ───────────────────────────────────────────
	orchestrator.registerHandler("OPTIMIZING", async () => {
		if (!strategyOutput || !cloneManager) throw new Error("Strategy or clone missing");

		const tid = config.target_id;
		optimizationResult = await runOptimization(
			{
				plan: strategyOutput.plan,
				readFile: async (p) => cloneManager!.readWorkingFile(tid, p) ?? "",
				writeFile: async (p, c) => cloneManager!.writeWorkingFile(tid, p, c),
				listFiles: async () => cloneManager!.listWorkingFiles(tid),
			},
			deps.chatLLM ? { chatLLM: deps.chatLLM } : undefined,
		);
	});

	// ── VALIDATING ───────────────────────────────────────────
	orchestrator.registerHandler("VALIDATING", async (ctx: StageContext) => {
		if (!cloneManager) throw new Error("Clone missing");

		validationOutput = await runValidation(
			{
				target_id: config.target_id,
				target_url: config.target_url,
				before_score: currentScore,
				before_grade: currentGrade,
				before_dimensions: currentDimensions,
				target_score: config.target_score ?? 80,
				cycle_number: cycleCount,
				max_cycles: config.max_cycles ?? 10,
			},
			{
				crawlClone: async () => {
					// 클론의 working HTML을 CrawlData로 변환
					const html = cloneManager!.readWorkingFile(config.target_id, "index.html") ?? "";
					return {
						html,
						url: config.target_url,
						status_code: 200,
						content_type: "text/html",
						response_time_ms: 0,
						robots_txt: cloneManager!.readWorkingFile(config.target_id, "robots.txt") ?? null,
						llms_txt: cloneManager!.readWorkingFile(config.target_id, "llms.txt") ?? null,
						sitemap_xml: null,
						json_ld: [],
						meta_tags: {},
						title: "",
						canonical_url: null,
						links: [],
						headers: {},
					};
				},
				scoreTarget: deps.scoreTarget,
			},
		);

		ctx.setRef("validation", `validation-cycle-${cycleCount}`);
		currentScore = validationOutput.after_score;
		currentGrade = validationOutput.after_grade;
		currentDimensions = validationOutput.after_dimensions;

		if (validationOutput.needs_more_cycles) {
			cycleCount++;
			cloneManager.incrementCycle(config.target_id);
			ctx.setNextStage("STRATEGIZING");
		}
		// else: proceed to REPORTING (default)
	});

	// ── REPORTING ────────────────────────────────────────────
	let reportPath: string | null = null;
	let dashboardHtml: string | null = null;

	orchestrator.registerHandler("REPORTING", async () => {
		const builder = new ReportBuilder(
			`report-${config.target_id}-${Date.now()}`,
			config.target_id,
			config.target_url,
		);

		builder
			.setSiteType(analysisOutput?.classification.site_type ?? "generic")
			.setCycleCount(cycleCount)
			.setOverallScores(initialScore, currentScore)
			.setGrades(analysisOutput?.geo_scores.grade ?? "Unknown", currentGrade);

		// Add dimension comparisons
		for (const dim of currentDimensions) {
			const before = analysisOutput?.geo_scores.dimensions.find((d) => d.id === dim.id);
			builder.addScoreComparison(`${dim.id} ${dim.label}`, before?.score ?? 0, dim.score);
		}

		// Add changes from optimization
		if (optimizationResult) {
			for (const taskId of optimizationResult.applied_tasks) {
				const task = strategyOutput?.plan.tasks.find((t) => t.task_id === taskId);
				if (task) {
					builder.addChange({
						file_path: task.target_element ?? "unknown",
						change_type: "modified",
						summary: task.title,
						impact_score: 0,
						affected_dimensions: [],
						diff_preview: "",
					});
				}
			}
		}

		builder.addKeyImprovement(
			`점수 ${initialScore} → ${currentScore} (+${currentScore - initialScore})`,
		);
		if (validationOutput?.stop_reason) {
			builder.addRemainingIssue(`중단 사유: ${validationOutput.stop_reason}`);
		}

		const report = builder.build();
		dashboardHtml = generateDashboardHtml({ report });

		// Save archive if workspace available
		try {
			const archiveBuilder = new ArchiveBuilder(config.workspace_dir);
			const origFiles = new Map<string, string>();
			const optFiles = new Map<string, string>();

			if (cloneManager) {
				const origHtml = cloneManager.readOriginalFile(config.target_id, "index.html");
				if (origHtml) origFiles.set("index.html", origHtml);
				const workHtml = cloneManager.readWorkingFile(config.target_id, "index.html");
				if (workHtml) optFiles.set("index.html", workHtml);
			}

			const archiveResult = archiveBuilder.build(report, origFiles, optFiles, new Map());
			reportPath = archiveResult.archive_path;
		} catch {
			// Archive generation failure is non-fatal
		}
	});

	// ── Execute Pipeline ─────────────────────────────────────
	try {
		const result = await orchestrator.run(config.target_id);

		return {
			success: result.finalState.stage === "COMPLETED",
			final_score: currentScore,
			initial_score: initialScore,
			delta: currentScore - initialScore,
			cycles_completed: cycleCount,
			report_path: reportPath,
			dashboard_html: dashboardHtml,
			error: result.finalState.error_message ?? undefined,
		};
	} catch (err) {
		return {
			success: false,
			final_score: currentScore,
			initial_score: initialScore,
			delta: currentScore - initialScore,
			cycles_completed: cycleCount,
			report_path: null,
			dashboard_html: null,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
