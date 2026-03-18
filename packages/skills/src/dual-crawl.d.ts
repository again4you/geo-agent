/**
 * Dual Crawl Skill — Target URL에서 HTML, robots.txt, sitemap.xml, 구조화 데이터 수집
 *
 * "Dual" = 두 관점에서 크롤링:
 * 1. 사용자 관점 (HTML 페이지 콘텐츠)
 * 2. 봇 관점 (robots.txt, llms.txt, sitemap.xml, JSON-LD)
 */
import type { Skill } from "./index.js";
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
	links: {
		href: string;
		rel: string;
		text: string;
	}[];
	headers: Record<string, string>;
}
declare function getBaseUrl(url: string): string;
declare function extractTitle(html: string): string;
declare function extractMetaTags(html: string): Record<string, string>;
declare function extractCanonical(html: string): string | null;
declare function extractJsonLd(html: string): Record<string, unknown>[];
declare function extractLinks(html: string): {
	href: string;
	rel: string;
	text: string;
}[];
export declare function crawlTarget(url: string, timeoutMs?: number): Promise<CrawlData>;
export declare const dualCrawlSkill: Skill;
export declare const _parsers: {
	extractTitle: typeof extractTitle;
	extractMetaTags: typeof extractMetaTags;
	extractCanonical: typeof extractCanonical;
	extractJsonLd: typeof extractJsonLd;
	extractLinks: typeof extractLinks;
	getBaseUrl: typeof getBaseUrl;
};
//# sourceMappingURL=dual-crawl.d.ts.map
