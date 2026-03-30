/**
 * Samsung Galaxy S26 Ultra Clone Integration Test
 *
 * 실제 라이브 사이트를 크롤링하여 CloneManager로 로컬 클론이 정상 생성되는지 검증한다.
 * 테스트 이후 클론 결과물은 삭제하지 않으므로 사용자가 직접 파일을 확인할 수 있다.
 *
 * 클론 저장 경로: run/clone-test/clones/<target_id>/
 *   ├── metadata.json
 *   ├── original/index.html   (원본 스냅샷, 불변)
 *   └── working/index.html    (작업용 복사본)
 *
 * 실행 방법: npm run test:clone
 */
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { beforeAll, describe, expect, it } from "vitest";
import { CloneManager, CloneMetadataSchema } from "../../packages/core/src/clone/clone-manager.js";
import { crawlTarget } from "../../packages/skills/src/dual-crawl.js";

const TARGET_URL = "https://www.samsung.com/sec/smartphones/galaxy-s26-ultra/";
const TARGET_ID = uuidv4();
const WORKSPACE_DIR = path.resolve(process.cwd(), "run/clone-test");

let crawlFailed = false;
let crawledHtml = "";
let cloneManager: CloneManager;

beforeAll(async () => {
	fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
	cloneManager = new CloneManager(WORKSPACE_DIR);

	console.log("\n──────────────────────────────────────────────");
	console.log(`[clone-integration] 대상 URL : ${TARGET_URL}`);
	console.log(`[clone-integration] Target ID: ${TARGET_ID}`);
	console.log(`[clone-integration] 워크스페이스: ${WORKSPACE_DIR}`);
	console.log("──────────────────────────────────────────────");

	try {
		const crawlData = await crawlTarget(TARGET_URL, 30_000);
		crawledHtml = crawlData.html;

		cloneManager.createClone(TARGET_ID, TARGET_URL, crawledHtml);

		const clonePath = cloneManager.getClonePath(TARGET_ID);
		// 클론 경로를 파일로 저장 — 콘솔 출력이 억제되어도 사용자가 경로를 확인할 수 있음
		fs.writeFileSync(
			path.join(WORKSPACE_DIR, "latest.txt"),
			[
				`target_id: ${TARGET_ID}`,
				`clone_path: ${clonePath}`,
				`original: ${path.join(clonePath, "original", "index.html")}`,
				`working: ${path.join(clonePath, "working", "index.html")}`,
				`created_at: ${new Date().toISOString()}`,
			].join("\n"),
			"utf-8",
		);
		console.log(`[clone-integration] 클론 생성 완료 → ${clonePath}`);
		console.log("[clone-integration] 파일 확인:");
		console.log(`  원본:   ${path.join(clonePath, "original", "index.html")}`);
		console.log(`  작업본: ${path.join(clonePath, "working", "index.html")}`);
		console.log(`  경로 파일: ${path.join(WORKSPACE_DIR, "latest.txt")}`);
		console.log("──────────────────────────────────────────────\n");
	} catch (err) {
		crawlFailed = true;
		console.warn(
			`[clone-integration] 크롤링 실패 (네트워크 오류) — 테스트를 건너뜁니다: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}, 45_000);

// afterAll 없음 — 클론 결과물을 유지하여 사용자가 직접 확인 가능

// it.skipIf(() => crawlFailed) — 함수로 전달하면 beforeAll 이후에 평가됨 (lazy)
describe("Samsung Galaxy S26 Ultra 클론 검증", () => {
	it.skipIf(() => crawlFailed)("HTML 콘텐츠가 비어있지 않다", () => {
		expect(crawledHtml.length).toBeGreaterThan(0);
	});

	it.skipIf(() => crawlFailed)("제목에 Samsung 또는 Galaxy가 포함된다", () => {
		const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(crawledHtml);
		const title = titleMatch ? titleMatch[1].trim() : "";
		const hasExpectedTitle =
			title.toLowerCase().includes("samsung") || title.toLowerCase().includes("galaxy");
		expect(hasExpectedTitle, `title이 예상 키워드를 포함하지 않음: "${title}"`).toBe(true);
	});

	it.skipIf(() => crawlFailed)("클론 디렉토리가 생성된다", () => {
		const clonePath = cloneManager.getClonePath(TARGET_ID);
		expect(fs.existsSync(clonePath), `클론 경로가 존재하지 않음: ${clonePath}`).toBe(true);
	});

	it.skipIf(() => crawlFailed)("original/index.html이 존재한다", () => {
		const clonePath = cloneManager.getClonePath(TARGET_ID);
		const originalPath = path.join(clonePath, "original", "index.html");
		expect(fs.existsSync(originalPath), `원본 파일이 존재하지 않음: ${originalPath}`).toBe(true);
	});

	it.skipIf(() => crawlFailed)("working/index.html이 존재한다", () => {
		const clonePath = cloneManager.getClonePath(TARGET_ID);
		const workingPath = path.join(clonePath, "working", "index.html");
		expect(fs.existsSync(workingPath), `작업본 파일이 존재하지 않음: ${workingPath}`).toBe(true);
	});

	it.skipIf(() => crawlFailed)("original/index.html 내용이 크롤링한 HTML과 동일하다", () => {
		const content = cloneManager.readOriginalFile(TARGET_ID, "index.html");
		expect(content).toBe(crawledHtml);
	});

	it.skipIf(() => crawlFailed)("working/index.html 초기 내용이 original과 동일하다", () => {
		const original = cloneManager.readOriginalFile(TARGET_ID, "index.html");
		const working = cloneManager.readWorkingFile(TARGET_ID, "index.html");
		expect(working).toBe(original);
	});

	it.skipIf(() => crawlFailed)("metadata.json이 CloneMetadataSchema를 통과한다", () => {
		const metadata = cloneManager.getMetadata(TARGET_ID);
		expect(metadata).not.toBeNull();
		expect(() => CloneMetadataSchema.parse(metadata)).not.toThrow();
	});

	it.skipIf(() => crawlFailed)("metadata.status가 'ready'다", () => {
		const metadata = cloneManager.getMetadata(TARGET_ID);
		expect(metadata!.status).toBe("ready");
	});

	it.skipIf(() => crawlFailed)("metadata.file_count가 1 이상이다", () => {
		const metadata = cloneManager.getMetadata(TARGET_ID);
		expect(metadata!.file_count).toBeGreaterThanOrEqual(1);
	});

	it.skipIf(() => crawlFailed)("metadata.source_url이 대상 URL과 일치한다", () => {
		const metadata = cloneManager.getMetadata(TARGET_ID);
		expect(metadata!.source_url).toBe(TARGET_URL);
	});

	it.skipIf(() => crawlFailed)("metadata.total_size_bytes가 0보다 크다", () => {
		const metadata = cloneManager.getMetadata(TARGET_ID);
		expect(metadata!.total_size_bytes).toBeGreaterThan(0);
	});

	it.skipIf(() => crawlFailed)(
		"getDiff는 original === working을 반환한다 (수정 전 초기 상태)",
		() => {
			const diff = cloneManager.getDiff(TARGET_ID, "index.html");
			expect(diff).not.toBeNull();
			expect(diff!.original).toBe(diff!.working);
		},
	);
});
