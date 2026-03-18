import { describe, expect, it, vi } from "vitest";
import {
	PROBE_DEFINITIONS,
	type ProbeContext,
	type SyntheticProbeRunResult,
	runProbes,
} from "./synthetic-probes.js";

const defaultContext: ProbeContext = {
	site_name: "Samsung",
	site_url: "https://www.samsung.com",
	site_type: "manufacturer",
	topics: ["스마트폰", "Galaxy", "가전"],
	products: ["Galaxy S25 Ultra", "Galaxy Z Fold6"],
	prices: ["₩1,799,000"],
	brand: "Samsung",
};

function mockChatLLM(content: string) {
	return vi.fn().mockResolvedValue({
		content,
		model: "gpt-4o",
		provider: "openai",
		usage: { prompt_tokens: 50, completion_tokens: 100, total_tokens: 150 },
		latency_ms: 500,
		cost_usd: 0.001,
	});
}

describe("Synthetic Probes", () => {
	describe("PROBE_DEFINITIONS", () => {
		it("has 8 probe definitions", () => {
			expect(PROBE_DEFINITIONS).toHaveLength(8);
		});

		it("each probe has id, name, category, generateQuery", () => {
			for (const probe of PROBE_DEFINITIONS) {
				expect(probe.id).toMatch(/^P-0[1-8]$/);
				expect(probe.name).toBeTruthy();
				expect(["citation", "accuracy", "recognition", "recommendation"]).toContain(probe.category);
				expect(typeof probe.generateQuery).toBe("function");
			}
		});

		it("generates queries with context", () => {
			for (const probe of PROBE_DEFINITIONS) {
				const query = probe.generateQuery(defaultContext);
				expect(query.length).toBeGreaterThan(5);
			}
		});

		it("generates queries without products/topics", () => {
			const emptyCtx: ProbeContext = {
				...defaultContext,
				products: [],
				topics: [],
				prices: [],
			};
			for (const probe of PROBE_DEFINITIONS) {
				const query = probe.generateQuery(emptyCtx);
				expect(query.length).toBeGreaterThan(5);
			}
		});
	});

	describe("runProbes — basic execution", () => {
		it("runs all 8 probes", async () => {
			const chat = mockChatLLM(
				"Samsung Galaxy S25 Ultra는 삼성의 최신 스마트폰입니다. samsung.com에서 확인하세요.",
			);
			const result = await runProbes(defaultContext, { chatLLM: chat }, { delayMs: 0 });

			expect(result.probes).toHaveLength(8);
			expect(chat).toHaveBeenCalledTimes(8);
		});

		it("runs selected probes only", async () => {
			const chat = mockChatLLM("Samsung response");
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01", "P-04"], delayMs: 0 },
			);

			expect(result.probes).toHaveLength(2);
			expect(result.probes[0].probe_id).toBe("P-01");
			expect(result.probes[1].probe_id).toBe("P-04");
		});
	});

	describe("runProbes — citation detection", () => {
		it("detects citation by domain name", async () => {
			const chat = mockChatLLM("자세한 정보는 samsung.com에서 확인하세요.");
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01"], delayMs: 0 },
			);
			expect(result.probes[0].cited).toBe(true);
		});

		it("detects citation by site name", async () => {
			const chat = mockChatLLM("Samsung에서 출시한 제품입니다.");
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01"], delayMs: 0 },
			);
			expect(result.probes[0].cited).toBe(true);
		});

		it("detects citation by brand name", async () => {
			const chat = mockChatLLM("삼성전자의 Samsung Galaxy 시리즈입니다.");
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01"], delayMs: 0 },
			);
			expect(result.probes[0].cited).toBe(true);
		});

		it("reports no citation when not mentioned", async () => {
			const chat = mockChatLLM("최신 스마트폰은 다양한 기능을 제공합니다.");
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01"], delayMs: 0 },
			);
			expect(result.probes[0].cited).toBe(false);
		});
	});

	describe("runProbes — verdict determination", () => {
		it("PASS when cited and high accuracy", async () => {
			const chat = mockChatLLM(
				"Samsung Galaxy S25 Ultra는 삼성의 플래그십 스마트폰으로, 가전 분야에서도 유명합니다. samsung.com에서 Galaxy S25 Ultra의 상세 스펙을 확인할 수 있습니다. 스마트폰 시장에서 Galaxy 브랜드는 높은 인지도를 자랑합니다.",
			);
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-04"], delayMs: 0 },
			);
			expect(result.probes[0].verdict).toBe("PASS");
		});

		it("FAIL when not cited and low accuracy", async () => {
			const chat = mockChatLLM("일반적인 정보입니다.");
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01"], delayMs: 0 },
			);
			expect(result.probes[0].verdict).toBe("FAIL");
		});
	});

	describe("runProbes — summary", () => {
		it("computes correct summary stats", async () => {
			const chat = mockChatLLM("Samsung Galaxy S25 Ultra 관련 정보입니다.");
			const result = await runProbes(defaultContext, { chatLLM: chat }, { delayMs: 0 });

			expect(result.summary.total).toBe(8);
			expect(result.summary.pass + result.summary.partial + result.summary.fail).toBe(8);
			expect(result.summary.citation_rate).toBeGreaterThanOrEqual(0);
			expect(result.summary.citation_rate).toBeLessThanOrEqual(1);
			expect(result.summary.average_accuracy).toBeGreaterThanOrEqual(0);
		});
	});

	describe("runProbes — error handling", () => {
		it("handles LLM call failure as FAIL verdict", async () => {
			const chat = vi.fn().mockRejectedValue(new Error("API timeout"));
			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01"], delayMs: 0 },
			);

			expect(result.probes[0].verdict).toBe("FAIL");
			expect(result.probes[0].response).toContain("API timeout");
			expect(result.probes[0].accuracy).toBe(0);
		});

		it("continues after individual probe failure", async () => {
			let callCount = 0;
			const chat = vi.fn().mockImplementation(async () => {
				callCount++;
				if (callCount === 1) throw new Error("First call fails");
				return {
					content: "Samsung response",
					model: "gpt-4o",
					provider: "openai",
					usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
					latency_ms: 100,
					cost_usd: 0.001,
				};
			});

			const result = await runProbes(
				defaultContext,
				{ chatLLM: chat },
				{ probeIds: ["P-01", "P-02"], delayMs: 0 },
			);

			expect(result.probes).toHaveLength(2);
			expect(result.probes[0].verdict).toBe("FAIL");
			expect(result.probes[1].verdict).not.toBe("FAIL");
		});
	});

	describe("runProbes — accuracy estimation", () => {
		it("higher accuracy with more topic matches", async () => {
			const chatWithTopics = mockChatLLM(
				"Samsung Galaxy S25 Ultra 스마트폰은 가전 분야의 Galaxy 시리즈입니다.",
			);
			const chatNoTopics = mockChatLLM("일반적인 제품 정보입니다.");

			const r1 = await runProbes(
				defaultContext,
				{ chatLLM: chatWithTopics },
				{ probeIds: ["P-01"], delayMs: 0 },
			);
			const r2 = await runProbes(
				defaultContext,
				{ chatLLM: chatNoTopics },
				{ probeIds: ["P-01"], delayMs: 0 },
			);

			expect(r1.probes[0].accuracy).toBeGreaterThan(r2.probes[0].accuracy);
		});

		it("higher accuracy with longer responses", async () => {
			const longResponse = `${"Samsung ".repeat(100)}Galaxy S25 Ultra 스마트폰`;
			const shortResponse = "Samsung";

			const r1 = await runProbes(
				defaultContext,
				{ chatLLM: mockChatLLM(longResponse) },
				{ probeIds: ["P-01"], delayMs: 0 },
			);
			const r2 = await runProbes(
				defaultContext,
				{ chatLLM: mockChatLLM(shortResponse) },
				{ probeIds: ["P-01"], delayMs: 0 },
			);

			expect(r1.probes[0].accuracy).toBeGreaterThanOrEqual(r2.probes[0].accuracy);
		});
	});
});
