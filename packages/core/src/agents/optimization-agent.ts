import type { LLMRequest, LLMResponse } from "../llm/geo-llm-client.js";
/**
 * Optimization Agent
 *
 * OptimizationPlan의 태스크를 Clone 파일에 실제로 적용.
 * - 규칙 기반 수정 (LLM 없이): 메타태그, JSON-LD, llms.txt 등 구조적 수정
 * - LLM 강화 수정 (선택): 콘텐츠 개선, 설명 보강 등
 */
import type { OptimizationPlan, OptimizationTask } from "../models/optimization-plan.js";
import { safeLLMCall, extractVisibleText, extractTitle, escapeHtml } from "./llm-helpers.js";

// ── Types ───────────────────────────────────────────────────

export interface OptimizationInput {
	plan: OptimizationPlan;
	/** Clone의 working 파일 읽기 */
	readFile: (filePath: string) => Promise<string>;
	/** Clone의 working 파일 쓰기 */
	writeFile: (filePath: string, content: string) => Promise<void>;
	/** Clone의 working 파일 목록 */
	listFiles: () => Promise<string[]>;
}

export interface OptimizationResult {
	applied_tasks: string[];
	skipped_tasks: string[];
	failed_tasks: Array<{ task_id: string; error: string }>;
	files_modified: string[];
}

// ── Rule-based optimizers ────────────────────────────────────

type TaskOptimizer = (
	task: OptimizationTask,
	input: OptimizationInput,
	deps?: { chatLLM?: (req: LLMRequest) => Promise<LLMResponse> },
) => Promise<{ success: boolean; files_modified: string[]; error?: string }>;

/** Helper: get all HTML files from clone */
async function getHtmlFiles(input: OptimizationInput): Promise<string[]> {
	const files = await input.listFiles();
	const htmlFiles = files.filter((f) => f.endsWith(".html") || f.endsWith(".htm"));
	return htmlFiles.length > 0 ? htmlFiles : ["index.html"];
}

async function optimizeMetadata(
	task: OptimizationTask,
	input: OptimizationInput,
	deps?: { chatLLM?: (req: LLMRequest) => Promise<LLMResponse> },
): Promise<{ success: boolean; files_modified: string[]; error?: string }> {
	const htmlFiles = await getHtmlFiles(input);
	const modified: string[] = [];

	try {
		// robots.txt는 전역 파일 — 한 번만 생성
		if (task.title.includes("robots.txt") || task.title.includes("봇 허용")) {
			await input.writeFile(
				"robots.txt",
				"User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n",
			);
			modified.push("robots.txt");
		}

		// 모든 HTML 파일에 메타태그 적용
		for (const htmlFile of htmlFiles) {
			let html = await input.readFile(htmlFile);
			let fileModified = false;

			if (task.title.includes("Meta description") || task.title.includes("메타")) {
				if (!/<meta\s+name=["']description["']/i.test(html)) {
					const fallbackDesc = "Optimized page description for LLM discoverability";
					let description = fallbackDesc;

					if (deps?.chatLLM) {
						const pageText = extractVisibleText(html).slice(0, 1500);
						const pageTitle = extractTitle(html);
						const { result } = await safeLLMCall(
							deps.chatLLM,
							{
								prompt: `Write a concise meta description (max 160 characters) for this web page.\n\nTitle: ${pageTitle}\n\nContent excerpt:\n${pageText}`,
								system_instruction:
									"You are an SEO expert specializing in LLM discoverability. Write a single meta description that is factual, keyword-rich, and optimized for AI engines. Output ONLY the description text, no quotes or labels. Keep it under 160 characters.",
								json_mode: false,
								temperature: 0.3,
								max_tokens: 200,
							},
							(content) => {
								const trimmed = content.trim().replace(/^["']|["']$/g, "");
								return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
							},
							fallbackDesc,
						);
						description = result;
					}

					html = html.replace(
						"</head>",
						`<meta name="description" content="${escapeHtml(description)}">\n</head>`,
					);
					fileModified = true;
				}
			}

			if (task.title.includes("Open Graph") || task.title.includes("OG")) {
				if (!/<meta\s+property=["']og:/i.test(html)) {
					const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "Page";
					let ogDescription = "";

					if (deps?.chatLLM) {
						const pageText = extractVisibleText(html).slice(0, 1500);
						const { result } = await safeLLMCall(
							deps.chatLLM,
							{
								prompt: `Write a compelling Open Graph description (max 200 characters) for social sharing of this page.\n\nTitle: ${title.trim()}\n\nContent excerpt:\n${pageText}`,
								system_instruction:
									"You are a social media optimization expert. Write a single OG description that encourages clicks and shares. Output ONLY the description text, no quotes or labels. Keep it under 200 characters.",
								json_mode: false,
								temperature: 0.3,
								max_tokens: 200,
							},
							(content) => content.trim().replace(/^["']|["']$/g, ""),
							"",
						);
						ogDescription = result;
					}

					const ogDescTag = ogDescription
						? `\n<meta property="og:description" content="${escapeHtml(ogDescription)}">`
						: "";
					html = html.replace(
						"</head>",
						`<meta property="og:title" content="${escapeHtml(title.trim())}">\n<meta property="og:type" content="website">${ogDescTag}\n</head>`,
					);
					fileModified = true;
				}
			}

			if (fileModified) {
				await input.writeFile(htmlFile, html);
				modified.push(htmlFile);
			}
		}

		return { success: modified.length > 0, files_modified: modified };
	} catch (err) {
		return { success: false, files_modified: [], error: (err as Error).message };
	}
}

async function optimizeSchemaMarkup(
	_task: OptimizationTask,
	input: OptimizationInput,
	deps?: { chatLLM?: (req: LLMRequest) => Promise<LLMResponse> },
): Promise<{ success: boolean; files_modified: string[]; error?: string }> {
	const htmlFiles = await getHtmlFiles(input);
	const modified: string[] = [];

	try {
		for (const htmlFile of htmlFiles) {
			let html = await input.readFile(htmlFile);

			if (!/<script\s+type=["']application\/ld\+json["']/i.test(html)) {
				const pageTitle = extractTitle(html) || "Page";
				const metaDesc =
					(html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [])[1] ||
					"";

				const fallbackJsonLd = {
					"@context": "https://schema.org",
					"@type": "WebPage",
					name: pageTitle,
					description: metaDesc,
				};

				let jsonLdStr = JSON.stringify(fallbackJsonLd);

				if (deps?.chatLLM) {
					const pageText = extractVisibleText(html).slice(0, 1500);
					// Check for existing JSON-LD in other script tags (partial matches)
					const existingLdMatches = html.match(
						/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
					);
					const existingLd = existingLdMatches ? existingLdMatches.join("\n") : "None";

					const { result } = await safeLLMCall(
						deps.chatLLM,
						{
							prompt: `Generate a rich JSON-LD (schema.org) structured data object for this web page.\n\nTitle: ${pageTitle}\nMeta description: ${metaDesc}\nExisting JSON-LD: ${existingLd}\n\nContent excerpt:\n${pageText}`,
							system_instruction:
								"You are a structured data expert. Generate a single JSON-LD object using schema.org vocabulary. Choose the most appropriate @type (WebPage, Product, Article, Organization, etc.) based on the content. Include as many relevant properties as the content supports (name, description, url, image, author, datePublished, etc.). Output ONLY valid JSON, no markdown fences or explanation.",
							json_mode: true,
							temperature: 0.3,
							max_tokens: 800,
						},
						(content) => {
							// Validate it's parseable JSON with @context
							const parsed = JSON.parse(content.trim());
							if (!parsed["@context"]) {
								parsed["@context"] = "https://schema.org";
							}
							return JSON.stringify(parsed);
						},
						jsonLdStr,
					);
					jsonLdStr = result;
				}

				html = html.replace(
					"</head>",
					`<script type="application/ld+json">${jsonLdStr}</script>\n</head>`,
				);
				await input.writeFile(htmlFile, html);
				modified.push(htmlFile);
			}
		}

		return { success: modified.length > 0, files_modified: modified };
	} catch (err) {
		return { success: false, files_modified: [], error: (err as Error).message };
	}
}

async function optimizeLlmsTxt(
	_task: OptimizationTask,
	input: OptimizationInput,
	deps?: { chatLLM?: (req: LLMRequest) => Promise<LLMResponse> },
): Promise<{ success: boolean; files_modified: string[]; error?: string }> {
	const fallbackContent =
		"# Site Information\n\nThis site provides information about products and services.\n\n## Key Content\n- Products and specifications\n- Pricing information\n- Company information\n";

	try {
		let content = fallbackContent;

		if (deps?.chatLLM) {
			// Gather summaries from available HTML pages
			const htmlFiles = await getHtmlFiles(input);
			const pageSummaries: string[] = [];

			for (const htmlFile of htmlFiles.slice(0, 5)) {
				try {
					const html = await input.readFile(htmlFile);
					const title = extractTitle(html) || htmlFile;
					const text = extractVisibleText(html).slice(0, 300);
					pageSummaries.push(`- ${htmlFile}: "${title}" — ${text}`);
				} catch {
					pageSummaries.push(`- ${htmlFile}: (could not read)`);
				}
			}

			const { result } = await safeLLMCall(
				deps.chatLLM,
				{
					prompt: `Generate an llms.txt file for a website with these pages:\n\n${pageSummaries.join("\n")}\n\nTotal pages: ${htmlFiles.length}`,
					system_instruction:
						"You are a GEO (Generative Engine Optimization) expert. Generate an llms.txt file that helps LLMs understand this site. Use markdown format with: a top-level heading with the site name, a brief description, then sections for key content areas, important pages, and any structured data available. Be specific to the actual site content — do not use generic boilerplate. Output ONLY the llms.txt content.",
					json_mode: false,
					temperature: 0.3,
					max_tokens: 500,
				},
				(c) => c.trim(),
				fallbackContent,
			);
			content = result;
		}

		await input.writeFile("llms.txt", content);
		return { success: true, files_modified: ["llms.txt"] };
	} catch (err) {
		return { success: false, files_modified: [], error: (err as Error).message };
	}
}

async function optimizeSemanticStructure(
	task: OptimizationTask,
	input: OptimizationInput,
	deps?: { chatLLM?: (req: LLMRequest) => Promise<LLMResponse> },
): Promise<{ success: boolean; files_modified: string[]; error?: string }> {
	const htmlFiles = await getHtmlFiles(input);
	const modified: string[] = [];

	try {
		for (const htmlFile of htmlFiles) {
			let html = await input.readFile(htmlFile);
			let fileModified = false;

			// Add H1 if missing
			if (task.title.includes("헤딩") && !/<h1[\s>]/i.test(html)) {
				const title =
					(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.trim() || "Page Title";

				let heading = title;

				if (deps?.chatLLM) {
					const pageText = extractVisibleText(html).slice(0, 1000);
					const { result } = await safeLLMCall(
						deps.chatLLM,
						{
							prompt: `Suggest a clear, descriptive H1 heading for this web page.\n\nCurrent title tag: ${title}\n\nContent excerpt:\n${pageText}`,
							system_instruction:
								"You are a web content expert. Write a single H1 heading that is clear, descriptive, and optimized for both users and LLM engines. It should accurately represent the page content. Output ONLY the heading text — no HTML tags, no quotes, no explanation. Keep it under 80 characters.",
							json_mode: false,
							temperature: 0.3,
							max_tokens: 100,
						},
						(content) => {
							const trimmed = content.trim().replace(/^["'#]+|["']+$/g, "");
							return trimmed || title;
						},
						title,
					);
					heading = result;
				}

				html = html.replace(/<body[^>]*>/i, (match) => `${match}\n<h1>${escapeHtml(heading)}</h1>`);
				fileModified = true;
			}

			if (fileModified) {
				await input.writeFile(htmlFile, html);
				modified.push(htmlFile);
			}
		}

		return { success: modified.length > 0, files_modified: modified };
	} catch (err) {
		return { success: false, files_modified: [], error: (err as Error).message };
	}
}

// ── Task type → optimizer mapping ────────────────────────────

const OPTIMIZERS: Record<string, TaskOptimizer> = {
	METADATA: optimizeMetadata,
	SCHEMA_MARKUP: optimizeSchemaMarkup,
	LLMS_TXT: optimizeLlmsTxt,
	SEMANTIC_STRUCTURE: optimizeSemanticStructure,
};

// ── Optimization Agent 실행 ──────────────────────────────────

export async function runOptimization(
	input: OptimizationInput,
	deps?: {
		chatLLM?: (req: LLMRequest) => Promise<LLMResponse>;
	},
): Promise<OptimizationResult> {
	const result: OptimizationResult = {
		applied_tasks: [],
		skipped_tasks: [],
		failed_tasks: [],
		files_modified: [],
	};

	for (const task of input.plan.tasks) {
		if (task.status !== "pending") {
			result.skipped_tasks.push(task.task_id);
			continue;
		}

		const optimizer = OPTIMIZERS[task.change_type];
		if (!optimizer) {
			result.skipped_tasks.push(task.task_id);
			continue;
		}

		const optimizeResult = await optimizer(task, input, deps);

		if (optimizeResult.success) {
			result.applied_tasks.push(task.task_id);
			for (const f of optimizeResult.files_modified) {
				if (!result.files_modified.includes(f)) {
					result.files_modified.push(f);
				}
			}
		} else if (optimizeResult.error) {
			result.failed_tasks.push({ task_id: task.task_id, error: optimizeResult.error });
		} else {
			result.skipped_tasks.push(task.task_id);
		}
	}

	return result;
}
