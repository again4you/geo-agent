// ── URL helpers ─────────────────────────────────────────────
function getBaseUrl(url) {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}`;
}
// ── Fetch helper with timeout ───────────────────────────────
async function safeFetch(url, timeoutMs = 10000) {
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
		const headers = {};
		res.headers.forEach((v, k) => {
			headers[k] = v;
		});
		return { body, status: res.status, headers };
	} catch {
		return null;
	}
}
// ── HTML parsers (regex-based, no external dependency) ──────
function extractTitle(html) {
	const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
	return match ? match[1].trim() : "";
}
function extractMetaTags(html) {
	const tags = {};
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
function extractCanonical(html) {
	const match = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
	return match ? match[1] : null;
}
function extractJsonLd(html) {
	const results = [];
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
function extractLinks(html) {
	const links = [];
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
export async function crawlTarget(url, timeoutMs = 10000) {
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
// ── Skill wrapper ───────────────────────────────────────────
export const dualCrawlSkill = {
	metadata: {
		name: "dual-crawl",
		version: "1.0.0",
		description: "Target URL을 크롤링하여 HTML, 구조화 데이터, robots.txt 등을 수집",
		author: "geo-agent",
		tags: ["crawling", "data-collection"],
		tier: "bundled",
	},
	async execute(context, params) {
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
//# sourceMappingURL=dual-crawl.js.map
