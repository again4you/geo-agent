/**
 * Agent shared types
 *
 * skills 패키지의 타입을 core에서 직접 import하지 않고,
 * 의존성 역전(DI)을 위한 인터페이스 정의.
 */

/** Dual Crawl 결과 (skills/dual-crawl.ts의 CrawlData와 호환) */
export interface CrawlData {
	html: string;
	url: string;
	status_code: number;
	content_type: string;
	response_time_ms: number;
	robots_txt: string | null;
	llms_txt: string | null;
	sitemap_xml: string | null;
	json_ld: Record<string, unknown>[];
	meta_tags: Record<string, string>;
	title: string;
	canonical_url: string | null;
	links: Array<{ href: string; rel: string; text: string }>;
	headers: Record<string, string>;
}

/** Multi-page crawl result (skills/dual-crawl.ts와 호환) */
export interface MultiPageCrawlResult {
	homepage: CrawlData;
	pages: Array<{ url: string; path: string; crawl_data: CrawlData }>;
	total_pages: number;
	crawl_duration_ms: number;
}

/** 개별 페이지 GEO 채점 결과 */
export interface PageScoreResult {
	url: string;
	filename: string;
	scores: {
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

/** 멀티 페이지 분석 집계 결과 */
export interface MultiPageAnalysisResult {
	homepage_scores: PageScoreResult;
	page_scores: PageScoreResult[];
	aggregate_score: number;
	aggregate_grade: string;
	per_dimension_averages: Array<{ id: string; label: string; avg_score: number }>;
}
