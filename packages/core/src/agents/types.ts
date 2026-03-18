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
