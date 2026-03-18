/**
 * Validation Agent
 *
 * 최적화 후 클론 파일을 재분석하여 점수 변화를 측정.
 * Before-After 비교 결과를 생성하고, 추가 사이클 필요 여부 결정.
 */
import type { CrawlData } from "./types.js";

// ── Types ───────────────────────────────────────────────────

export interface ValidationInput {
	target_id: string;
	target_url: string;
	/** 최적화 전 점수 */
	before_score: number;
	before_grade: string;
	before_dimensions: Array<{
		id: string;
		label: string;
		score: number;
		weight: number;
		details: string[];
	}>;
	/** 목표 점수 (기본 80) */
	target_score?: number;
	/** 현재 사이클 번호 */
	cycle_number: number;
	/** 최대 사이클 수 */
	max_cycles?: number;
}

export interface ValidationOutput {
	after_score: number;
	after_grade: string;
	after_dimensions: Array<{
		id: string;
		label: string;
		score: number;
		weight: number;
		details: string[];
	}>;
	delta: number;
	improved: boolean;
	/** 추가 사이클 필요 여부 */
	needs_more_cycles: boolean;
	stop_reason: string | null;
	dimension_deltas: Array<{
		id: string;
		label: string;
		before: number;
		after: number;
		delta: number;
	}>;
}

// ── Validation Agent 실행 ────────────────────────────────────

export async function runValidation(
	input: ValidationInput,
	deps: {
		/** 클론 파일을 CrawlData로 변환 (로컬 파일 기반) */
		crawlClone: () => Promise<CrawlData>;
		/** GEO 점수 계산 */
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
	},
): Promise<ValidationOutput> {
	// 1. 클론 재크롤링 + 재채점
	const crawlData = await deps.crawlClone();
	const afterScores = deps.scoreTarget(crawlData);

	// 2. Before-After 비교
	const delta = afterScores.overall_score - input.before_score;
	const improved = delta > 0;

	// 3. 차원별 비교
	const dimensionDeltas = afterScores.dimensions.map((after) => {
		const before = input.before_dimensions.find((d) => d.id === after.id);
		return {
			id: after.id,
			label: after.label,
			before: before?.score ?? 0,
			after: after.score,
			delta: after.score - (before?.score ?? 0),
		};
	});

	// 4. 추가 사이클 필요 여부 판정
	const targetScore = input.target_score ?? 80;
	const maxCycles = input.max_cycles ?? 10;

	let needsMoreCycles = true;
	let stopReason: string | null = null;

	if (afterScores.overall_score >= targetScore) {
		needsMoreCycles = false;
		stopReason = `score_sufficient: ${afterScores.overall_score} >= ${targetScore}`;
	} else if (delta < 2 && input.cycle_number > 0) {
		needsMoreCycles = false;
		stopReason = `no_more_improvements: delta=${delta.toFixed(1)} < 2`;
	} else if (input.cycle_number >= maxCycles - 1) {
		needsMoreCycles = false;
		stopReason = `max_cycles: ${input.cycle_number + 1} >= ${maxCycles}`;
	}

	return {
		after_score: afterScores.overall_score,
		after_grade: afterScores.grade,
		after_dimensions: afterScores.dimensions,
		delta,
		improved,
		needs_more_cycles: needsMoreCycles,
		stop_reason: stopReason,
		dimension_deltas: dimensionDeltas,
	};
}
