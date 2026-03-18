/**
 * Analysis Agent
 *
 * 파이프라인 첫 단계: Target URL을 크롤링하고 정적 분석 + 사이트 분류 + GEO 채점을 수행.
 * 결과: AnalysisReport (DB 저장 가능) + GeoScoreData + ClassificationResult
 *
 * LLM 호출 없이 동작하는 정적 분석 전용 에이전트.
 * Synthetic Probes (LLM 필요)는 별도 단계에서 보강.
 */
import { v4 as uuidv4 } from "uuid";
import type { AnalysisReport } from "../models/analysis-report.js";
import type { GeoScore } from "../models/geo-score.js";
import type { CrawlData } from "./types.js";

// ── Analysis Agent Input/Output ─────────────────────────────

export interface AnalysisInput {
	target_id: string;
	target_url: string;
	/** 크롤링 타임아웃 (ms, 기본: 15000) */
	crawl_timeout?: number;
}

export interface AnalysisOutput {
	report: AnalysisReport;
	crawl_data: CrawlData;
	classification: {
		site_type: string;
		confidence: number;
		matched_signals: string[];
	};
	geo_scores: {
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
}

// ── Helper: CrawlData → AnalysisReport 변환 ─────────────────

function computeStructureQuality(html: string) {
	const semanticTags = ["article", "section", "main", "nav", "aside", "header", "footer"];
	const semanticCount = semanticTags.filter((tag) =>
		new RegExp(`<${tag}[\\s>]`, "i").test(html),
	).length;
	const totalTags = (html.match(/<[a-z][a-z0-9]*[\s>]/gi) || []).length || 1;

	// Div nesting depth (approximate)
	let maxDepth = 0;
	let currentDepth = 0;
	const divPattern = /<\/?div[\s>]/gi;
	let m = divPattern.exec(html);
	while (m) {
		if (m[0].startsWith("</")) {
			currentDepth = Math.max(0, currentDepth - 1);
		} else {
			currentDepth++;
			maxDepth = Math.max(maxDepth, currentDepth);
		}
		m = divPattern.exec(html);
	}

	const textContent = html
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const textRatio = textContent.length / Math.max(html.length, 1);

	const h1Count = (html.match(/<h1[\s>]/gi) || []).length;
	const h2Count = (html.match(/<h2[\s>]/gi) || []).length;
	const headingValid = h1Count === 1 && h2Count > 0;

	return {
		semantic_tag_ratio: Math.min(semanticCount / 7, 1),
		div_nesting_depth: maxDepth,
		text_to_markup_ratio: Math.round(textRatio * 1000) / 1000,
		heading_hierarchy_valid: headingValid,
	};
}

function computeContentAnalysis(html: string, topics: string[]) {
	const textContent = html
		.replace(/<[^>]+>/g, "")
		.replace(/\s+/g, " ")
		.trim();
	const words = textContent.split(/\s+/);
	const wordCount = words.length;

	// Content density: text bytes vs total bytes
	const density = Math.round((textContent.length / Math.max(html.length, 1)) * 100);

	// Simple readability heuristic
	const avgWordLen = words.reduce((sum, w) => sum + w.length, 0) / Math.max(wordCount, 1);
	const readability = avgWordLen > 7 ? "technical" : avgWordLen > 5 ? "general" : "simplified";

	// Topic alignment: check how many target topics appear in content
	const lowerText = textContent.toLowerCase();
	const found = topics.filter((t) => lowerText.includes(t.toLowerCase()));

	return {
		word_count: wordCount,
		content_density: Math.min(density, 100),
		readability_level: readability as "technical" | "general" | "simplified",
		key_topics_found: found,
		topic_alignment: topics.length > 0 ? found.length / topics.length : 0,
	};
}

function buildGeoScore(scoreData: {
	overall_score: number;
	dimensions: Array<{ id: string; score: number }>;
}): GeoScore {
	// Map dimension scores to GeoScore fields
	const dimMap: Record<string, number> = {};
	for (const d of scoreData.dimensions) {
		dimMap[d.id] = d.score;
	}

	return {
		total: scoreData.overall_score,
		citation_rate: 0, // LLM 종속 — 초기 분석에서는 0
		citation_accuracy: 0,
		info_recognition_score: 0,
		coverage: dimMap.S3 ?? 0, // 콘텐츠 기계가독성 → coverage 근사
		rank_position: 0,
		structured_score: dimMap.S2 ?? 0, // 구조화 데이터 → structured_score
		measured_at: new Date().toISOString(),
		llm_breakdown: {},
	};
}

// ── Analysis Agent 실행 함수 ─────────────────────────────────

export async function runAnalysis(
	input: AnalysisInput,
	deps: {
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
	},
): Promise<AnalysisOutput> {
	// 1. Crawl
	const crawlData = await deps.crawlTarget(input.target_url, input.crawl_timeout ?? 15000);

	// 2. Classify
	const classification = deps.classifySite(crawlData.html, crawlData.url);

	// 3. Score (static)
	const geoScores = deps.scoreTarget(crawlData);

	// 4. Build AnalysisReport
	const structureQuality = computeStructureQuality(crawlData.html);
	const contentAnalysis = computeContentAnalysis(crawlData.html, []);

	const report: AnalysisReport = {
		report_id: uuidv4(),
		target_id: input.target_id,
		url: input.target_url,
		analyzed_at: new Date().toISOString(),

		machine_readability: {
			grade:
				geoScores.overall_score >= 75
					? "A"
					: geoScores.overall_score >= 55
						? "B"
						: geoScores.overall_score >= 35
							? "C"
							: "F",
			js_dependency_ratio: 0, // 정적 분석에서는 JS 실행하지 않으므로 0
			structure_quality: structureQuality,
			crawler_access: [
				{
					user_agent: "GEO-Agent/1.0",
					http_status: crawlData.status_code,
					blocked_by_robots_txt: false,
					content_accessible: crawlData.status_code === 200,
				},
			],
		},

		content_analysis: contentAnalysis,

		structured_data: {
			json_ld_present: crawlData.json_ld.length > 0,
			json_ld_types: crawlData.json_ld
				.map((ld) => String((ld as Record<string, unknown>)["@type"] ?? ""))
				.filter(Boolean),
			schema_completeness: Math.min(crawlData.json_ld.length / 5, 1),
			og_tags_present: Object.keys(crawlData.meta_tags).some((k) => k.startsWith("og:")),
			meta_description: crawlData.meta_tags.description ?? null,
		},

		extracted_info_items: [],
		current_geo_score: buildGeoScore(geoScores),
		competitor_gaps: [],
		llm_status: [],
	};

	return {
		report,
		crawl_data: crawlData,
		classification,
		geo_scores: geoScores,
	};
}
