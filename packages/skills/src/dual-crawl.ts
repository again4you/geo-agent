/**
 * Dual Crawl Skill — Target URL에서 HTML, robots.txt, sitemap.xml, 구조화 데이터 수집
 *
 * "Dual" = 두 관점에서 크롤링:
 * 1. 사용자 관점 (HTML 페이지 콘텐츠)
 * 2. 봇 관점 (robots.txt, llms.txt, sitemap.xml, JSON-LD)
 */
import type { Skill, SkillExecutionContext, SkillResult } from "./index.js";

// ── Crawl Result Types ──────────────────────────────────────

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
	links: { href: string; rel: string; text: string }[];
	headers: Record<string, string>;
}

// ── URL helpers ─────────────────────────────────────────────

function getBaseUrl(url: string): string {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}`;
}

// ── Fetch helper with timeout ───────────────────────────────

async function safeFetch(
	url: string,
	timeoutMs = 10000,
): Promise<{ body: string; status: number; headers: Record<string, string> } | null> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const res = await fetch(url, {
			signal: controller.signal,
			headers: {
				"User-Agent": "GEO-Agent/1.0 (Generative Engine Optimization)",
				Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			},
		});
		clearTimeout(timer);
		const body = await res.text();
		const headers: Record<string, string> = {};
		res.headers.forEach((v, k) => {
			headers[k] = v;
		});
		return { body, status: res.status, headers };
	} catch {
		return null;
	}
}

// ── HTML parsers (regex-based, no external dependency) ──────

function extractTitle(html: string): string {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	return match ? match[1].trim() : "";
}

function extractMetaTags(html: string): Record<string, string> {
	const tags: Record<string, string> = {};
	const regex =
		/<meta\s+(?:[^>]*?\s+)?(?:name|property)=["']([^"']+)["'][^>]*?\s+content=["']([^"']*)["'][^>]*>/gi;
	let match = regex.exec(html);
	while (match) {
		tags[match[1]] = match[2];
		match = regex.exec(html);
	}
	// Also match reversed order (content before name)
	const regex2 =
		/<meta\s+(?:[^>]*?\s+)?content=["']([^"']*)["'][^>]*?\s+(?:name|property)=["']([^"']+)["'][^>]*>/gi;
	let match2 = regex2.exec(html);
	while (match2) {
		tags[match2[2]] = match2[1];
		match2 = regex2.exec(html);
	}
	return tags;
}

function extractCanonical(html: string): string | null {
	const match = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
	return match ? match[1] : null;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
	const results: Record<string, unknown>[] = [];
	const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match = regex.exec(html);
	while (match) {
		try {
			const parsed = JSON.parse(match[1]);
			if (Array.isArray(parsed)) {
				results.push(...parsed);
			} else {
				results.push(parsed);
			}
		} catch {
			// Invalid JSON-LD, skip
		}
		match = regex.exec(html);
	}
	return results;
}

function extractLinks(html: string): { href: string; rel: string; text: string }[] {
	const links: { href: string; rel: string; text: string }[] = [];
	const regex =
		/<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["'](?:\s+[^>]*?rel=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/a>/gi;
	let match = regex.exec(html);
	while (match && links.length < 200) {
		links.push({
			href: match[1],
			rel: match[2] || "",
			text: match[3]
				.replace(/<[^>]+>/g, "")
				.trim()
				.slice(0, 100),
		});
		match = regex.exec(html);
	}
	return links;
}

// ── Main crawl function ─────────────────────────────────────

export async function crawlTarget(url: string, timeoutMs = 10000): Promise<CrawlData> {
	const baseUrl = getBaseUrl(url);

	// 1. Fetch main page
	const startTime = Date.now();
	const mainPage = await safeFetch(url, timeoutMs);
	const responseTime = Date.now() - startTime;

	if (!mainPage) {
		throw new Error(`Failed to fetch ${url}`);
	}

	const html = mainPage.body;

	// 2. Fetch bot-facing resources in parallel
	const [robotsRes, llmsRes, sitemapRes] = await Promise.all([
		safeFetch(`${baseUrl}/robots.txt`, 5000),
		safeFetch(`${baseUrl}/llms.txt`, 5000),
		safeFetch(`${baseUrl}/sitemap.xml`, 5000),
	]);

	return {
		html,
		url,
		status_code: mainPage.status,
		content_type: mainPage.headers["content-type"] ?? "text/html",
		response_time_ms: responseTime,
		robots_txt: robotsRes?.status === 200 ? robotsRes.body : null,
		llms_txt: llmsRes?.status === 200 ? llmsRes.body : null,
		sitemap_xml: sitemapRes?.status === 200 ? sitemapRes.body : null,
		json_ld: extractJsonLd(html),
		meta_tags: extractMetaTags(html),
		title: extractTitle(html),
		canonical_url: extractCanonical(html),
		links: extractLinks(html),
		headers: mainPage.headers,
	};
}

// ── Multi-page crawling ─────────────────────────────────────

export interface MultiPageCrawlResult {
	homepage: CrawlData;
	pages: Array<{ url: string; path: string; crawl_data: CrawlData }>;
	total_pages: number;
	crawl_duration_ms: number;
}

/** Asset/non-content file extensions to skip */
const SKIP_EXTENSIONS = /\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|woff2?|ttf|eot|mp4|mp3|webp|avif)(\?|$)/i;

/** URL patterns indicating product/category pages (prioritized in crawl order) */
const PRODUCT_PATTERNS = [
	/\/(products?|smartphones?|phones?|tablets?|laptops?|tvs?|televisions?)\//i,
	/\/(category|categories|catalog|shop|store|buy)\//i,
	/\/(home-appliances?|refrigerators?|washers?|computers?|monitors?)\//i,
	/\/(vehicles?|cars?|suv|models?|solutions?|services?)\//i,
	/\/(features?|specifications?|compare|specs)\//i,
];

/**
 * Convert a page URL to a safe filename for clone storage.
 */
export function urlToFilename(pageUrl: string, baseUrl: string): string {
	try {
		const parsed = new URL(pageUrl, baseUrl);
		let p = parsed.pathname.replace(/^\/+|\/+$/g, "");
		if (!p) return "index.html";
		// Replace path separators with hyphens, remove unsafe chars
		p = p.replace(/\//g, "-").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
		if (!p.endsWith(".html")) p += ".html";
		return p;
	} catch {
		return `page-${Date.now()}.html`;
	}
}

/**
 * Crawl the homepage, discover internal links, and crawl up to maxPages total.
 * Link discovery: extract <a href> from homepage HTML, filter to same host,
 * prioritize product/category URLs, crawl in parallel (5 concurrent).
 */
export async function crawlMultiplePages(
	url: string,
	maxPages = 20,
	timeoutMs = 10000,
): Promise<MultiPageCrawlResult> {
	const startTime = Date.now();

	// 1. Crawl homepage (full crawl with robots/llms/sitemap)
	const homepage = await crawlTarget(url, timeoutMs);
	const baseUrl = getBaseUrl(url);

	if (maxPages <= 1) {
		return {
			homepage,
			pages: [],
			total_pages: 1,
			crawl_duration_ms: Date.now() - startTime,
		};
	}

	// 2. Discover internal links from homepage
	const seen = new Set<string>([new URL(url).pathname]);
	const prioritized: string[] = [];
	const secondary: string[] = [];

	for (const link of homepage.links) {
		try {
			const resolved = new URL(link.href, url);
			// Same host only
			if (resolved.host !== new URL(url).host) continue;
			// Skip assets
			if (SKIP_EXTENSIONS.test(resolved.pathname)) continue;
			// Skip anchors and query-only
			const path = resolved.pathname;
			if (seen.has(path)) continue;
			seen.add(path);

			const fullUrl = resolved.href.split("#")[0]; // strip fragment
			if (PRODUCT_PATTERNS.some((p) => p.test(path))) {
				prioritized.push(fullUrl);
			} else {
				secondary.push(fullUrl);
			}
		} catch {
			// Invalid URL, skip
		}
	}

	// 3. Select up to maxPages-1 URLs (prioritized first)
	const toFetch = [...prioritized, ...secondary].slice(0, maxPages - 1);

	// 4. Crawl in parallel with concurrency limit of 5
	const pages: Array<{ url: string; path: string; crawl_data: CrawlData }> = [];
	const concurrency = 5;

	for (let i = 0; i < toFetch.length; i += concurrency) {
		const batch = toFetch.slice(i, i + concurrency);
		const results = await Promise.allSettled(
			batch.map(async (pageUrl) => {
				const res = await safeFetch(pageUrl, timeoutMs);
				if (!res || res.status >= 400) return null;

				const html = res.body;
				const crawlData: CrawlData = {
					html,
					url: pageUrl,
					status_code: res.status,
					content_type: res.headers["content-type"] ?? "text/html",
					response_time_ms: 0,
					// Share bot-facing resources from homepage
					robots_txt: homepage.robots_txt,
					llms_txt: homepage.llms_txt,
					sitemap_xml: homepage.sitemap_xml,
					json_ld: extractJsonLd(html),
					meta_tags: extractMetaTags(html),
					title: extractTitle(html),
					canonical_url: extractCanonical(html),
					links: extractLinks(html),
					headers: res.headers,
				};
				return {
					url: pageUrl,
					path: urlToFilename(pageUrl, baseUrl),
					crawl_data: crawlData,
				};
			}),
		);

		for (const result of results) {
			if (result.status === "fulfilled" && result.value) {
				pages.push(result.value);
			}
		}
	}

	return {
		homepage,
		pages,
		total_pages: 1 + pages.length,
		crawl_duration_ms: Date.now() - startTime,
	};
}

// ── Skill wrapper ───────────────────────────────────────────

export const dualCrawlSkill: Skill = {
	metadata: {
		name: "dual-crawl",
		version: "1.0.0",
		description: "Target URL을 크롤링하여 HTML, 구조화 데이터, robots.txt 등을 수집",
		author: "geo-agent",
		tags: ["crawling", "data-collection"],
		tier: "bundled",
	},
	async execute(
		context: SkillExecutionContext,
		params: Record<string, unknown>,
	): Promise<SkillResult> {
		const startTime = Date.now();
		try {
			const timeout = typeof params.timeout === "number" ? params.timeout : 10000;
			const data = await crawlTarget(context.target_url, timeout);
			return {
				success: true,
				data,
				duration_ms: Date.now() - startTime,
			};
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
				duration_ms: Date.now() - startTime,
			};
		}
	},
};

// ── Pure parsing exports (testable without network) ─────────

export const _parsers = {
	extractTitle,
	extractMetaTags,
	extractCanonical,
	extractJsonLd,
	extractLinks,
	getBaseUrl,
};
