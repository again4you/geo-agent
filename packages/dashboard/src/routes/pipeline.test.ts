import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const testDir = path.join(os.tmpdir(), `geo-pipeline-route-test-${Date.now()}`);

// Set env before any imports that use loadSettings
process.env.GEO_WORKSPACE = testDir;

// Ensure workspace directories exist
fs.mkdirSync(path.join(testDir, "data"), { recursive: true });
fs.mkdirSync(path.join(testDir, "prompts"), { recursive: true });

const dbPath = path.join(testDir, "data", "geo-agent.db");

// Import app and initialize routers with shared DB
const { app } = await import("../server.js");
const { initTargetsRouter } = await import("./targets.js");
const { initPipelineRouter } = await import("./pipeline.js");
const { createDatabase, loadSettings, ensureTables } = await import("@geo-agent/core");

const settings = loadSettings();
const db = createDatabase(settings);
await ensureTables(db);
initTargetsRouter(db);
initPipelineRouter(db);

// ── Helpers ────────────────────────────────────────────────────

async function clearAll(): Promise<void> {
	const client = createClient({ url: `file:${dbPath}` });
	await client.execute("DELETE FROM pipeline_runs");
	await client.execute("DELETE FROM targets");
	client.close();
}

async function createTarget(body: Record<string, unknown> = {}): Promise<Response> {
	const payload = {
		url: "https://example.com",
		name: "Test Target",
		...body,
	};
	return app.request("/api/targets", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
}

async function getTargetId(): Promise<string> {
	const res = await createTarget();
	const body = await res.json();
	return body.id;
}

async function createPipeline(targetId: string): Promise<Response> {
	return app.request(`/api/targets/${targetId}/pipeline`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
	});
}

// ── Lifecycle ─────────────────────────────────────────────────

afterAll(() => {
	try {
		fs.rmSync(testDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors on Windows
	}
});

beforeEach(async () => {
	await clearAll();
});

// ══════════════════════════════════════════════════════════════
// POST /api/targets/:id/pipeline — create pipeline
// ══════════════════════════════════════════════════════════════

describe("POST /api/targets/:id/pipeline", () => {
	it("returns 201 with a new pipeline in INIT stage", async () => {
		const targetId = await getTargetId();
		const res = await createPipeline(targetId);
		expect(res.status).toBe(201);

		const body = await res.json();
		expect(body.pipeline_id).toBeDefined();
		expect(typeof body.pipeline_id).toBe("string");
		expect(body.target_id).toBe(targetId);
		expect(body.stage).toBe("INIT");
	});

	it("created pipeline has expected default fields", async () => {
		const targetId = await getTargetId();
		const res = await createPipeline(targetId);
		const body = await res.json();

		expect(body.retry_count).toBe(0);
		expect(body.started_at).toBeDefined();
		expect(body.updated_at).toBeDefined();
		expect(body.completed_at).toBeNull();
		expect(body.error_message).toBeNull();
		expect(body.resumable).toBe(false);
	});

	it("can create multiple pipelines for the same target", async () => {
		const targetId = await getTargetId();
		const res1 = await createPipeline(targetId);
		const res2 = await createPipeline(targetId);
		expect(res1.status).toBe(201);
		expect(res2.status).toBe(201);

		const body1 = await res1.json();
		const body2 = await res2.json();
		expect(body1.pipeline_id).not.toBe(body2.pipeline_id);
	});
});

// ══════════════════════════════════════════════════════════════
// GET /api/targets/:id/pipeline — list pipelines
// ══════════════════════════════════════════════════════════════

describe("GET /api/targets/:id/pipeline", () => {
	it("returns empty array when no pipelines exist", async () => {
		const targetId = await getTargetId();
		const res = await app.request(`/api/targets/${targetId}/pipeline`, { method: "GET" });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toEqual([]);
	});

	it("returns all pipelines for a target", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);
		await createPipeline(targetId);
		await createPipeline(targetId);

		const res = await app.request(`/api/targets/${targetId}/pipeline`, { method: "GET" });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body).toHaveLength(3);
		for (const p of body) {
			expect(p.target_id).toBe(targetId);
		}
	});

	it("does not return pipelines from other targets", async () => {
		const targetId1 = await getTargetId();
		const res2 = await createTarget({ name: "Other Target", url: "https://other.com" });
		const targetId2 = (await res2.json()).id;

		await createPipeline(targetId1);
		await createPipeline(targetId2);

		const res = await app.request(`/api/targets/${targetId1}/pipeline`, { method: "GET" });
		const body = await res.json();
		expect(body).toHaveLength(1);
		expect(body[0].target_id).toBe(targetId1);
	});
});

// ══════════════════════════════════════════════════════════════
// GET /api/targets/:id/pipeline/latest — latest pipeline
// ══════════════════════════════════════════════════════════════

describe("GET /api/targets/:id/pipeline/latest", () => {
	it("returns 404 when no pipelines exist", async () => {
		const targetId = await getTargetId();
		const res = await app.request(`/api/targets/${targetId}/pipeline/latest`, { method: "GET" });
		expect(res.status).toBe(404);

		const body = await res.json();
		expect(body.error).toBe("No pipeline found for this target");
	});

	it("returns the most recently created pipeline", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);
		const secondRes = await createPipeline(targetId);
		const secondPipeline = await secondRes.json();

		const res = await app.request(`/api/targets/${targetId}/pipeline/latest`, { method: "GET" });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.pipeline_id).toBe(secondPipeline.pipeline_id);
	});

	it("returns single pipeline object (not array)", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);

		const res = await app.request(`/api/targets/${targetId}/pipeline/latest`, { method: "GET" });
		const body = await res.json();

		expect(body.pipeline_id).toBeDefined();
		expect(body.stage).toBeDefined();
		expect(Array.isArray(body)).toBe(false);
	});
});

// ══════════════════════════════════════════════════════════════
// PUT /api/targets/:id/pipeline/:pipelineId/stage — update stage
// ══════════════════════════════════════════════════════════════

describe("PUT /api/targets/:id/pipeline/:pipelineId/stage", () => {
	it("updates stage from INIT to ANALYZING", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		const res = await app.request(
			`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stage: "ANALYZING" }),
			},
		);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.stage).toBe("ANALYZING");
		expect(body.pipeline_id).toBe(pipeline.pipeline_id);
	});

	it("updates updated_at timestamp on stage change", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();
		const originalUpdatedAt = pipeline.updated_at;

		// Small delay to ensure timestamp difference
		await new Promise((r) => setTimeout(r, 10));

		const res = await app.request(
			`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stage: "ANALYZING" }),
			},
		);
		const body = await res.json();
		expect(body.updated_at).not.toBe(originalUpdatedAt);
	});

	it("returns 400 when stage is missing from body", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		const res = await app.request(
			`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({}),
			},
		);
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toBe("stage is required");
	});

	it("returns 404 for non-existent pipeline ID", async () => {
		const targetId = await getTargetId();

		const res = await app.request(
			`/api/targets/${targetId}/pipeline/00000000-0000-0000-0000-000000000000/stage`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stage: "ANALYZING" }),
			},
		);
		expect(res.status).toBe(404);

		const body = await res.json();
		expect(body.error).toBe("Pipeline not found");
	});

	it("sets completed_at when stage is COMPLETED", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();
		expect(pipeline.completed_at).toBeNull();

		const res = await app.request(
			`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stage: "COMPLETED" }),
			},
		);
		const body = await res.json();
		expect(body.completed_at).not.toBeNull();
	});

	it("sets completed_at when stage is FAILED", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		const res = await app.request(
			`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`,
			{
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ stage: "FAILED" }),
			},
		);
		const body = await res.json();
		expect(body.completed_at).not.toBeNull();
	});
});

// ══════════════════════════════════════════════════════════════
// POST /api/targets/:id/cycle/stop — manual stop
// ══════════════════════════════════════════════════════════════

describe("POST /api/targets/:id/cycle/stop", () => {
	it("stops an active pipeline and returns stopped:true", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);

		const res = await app.request(`/api/targets/${targetId}/cycle/stop`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.stopped).toBe(true);
		expect(body.pipeline).toBeDefined();
		expect(body.pipeline.stage).toBe("COMPLETED");
	});

	it("returns 404 when no pipeline exists for the target", async () => {
		const targetId = await getTargetId();

		const res = await app.request(`/api/targets/${targetId}/cycle/stop`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(404);

		const body = await res.json();
		expect(body.error).toBe("No active pipeline");
	});

	it("returns 400 when pipeline is already COMPLETED", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		// First, set to COMPLETED
		await app.request(`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "COMPLETED" }),
		});

		// Then try to stop again
		const res = await app.request(`/api/targets/${targetId}/cycle/stop`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toBe("Pipeline already terminated");
	});

	it("returns 400 when pipeline is already FAILED", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		await app.request(`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "FAILED" }),
		});

		const res = await app.request(`/api/targets/${targetId}/cycle/stop`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(400);

		const body = await res.json();
		expect(body.error).toBe("Pipeline already terminated");
	});

	it("stops pipeline in ANALYZING stage", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		await app.request(`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "ANALYZING" }),
		});

		const res = await app.request(`/api/targets/${targetId}/cycle/stop`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.stopped).toBe(true);
		expect(body.pipeline.stage).toBe("COMPLETED");
	});
});

// ══════════════════════════════════════════════════════════════
// GET /api/targets/:id/cycle/status — cycle status
// ══════════════════════════════════════════════════════════════

describe("GET /api/targets/:id/cycle/status", () => {
	it("returns 404 when no pipeline exists", async () => {
		const targetId = await getTargetId();

		const res = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		expect(res.status).toBe(404);

		const body = await res.json();
		expect(body.error).toBe("No active pipeline");
	});

	it("returns status with all expected fields", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);

		const res = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(body.pipeline_id).toBeDefined();
		expect(body.stage).toBe("INIT");
		expect(body.is_terminal).toBe(false);
		expect(body.retry_count).toBe(0);
		expect(body.started_at).toBeDefined();
		expect(body.updated_at).toBeDefined();
	});

	it("is_terminal is false for INIT stage", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);

		const res = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		const body = await res.json();
		expect(body.is_terminal).toBe(false);
	});

	it("is_terminal is false for ANALYZING stage", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		await app.request(`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "ANALYZING" }),
		});

		const res = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		const body = await res.json();
		expect(body.is_terminal).toBe(false);
		expect(body.stage).toBe("ANALYZING");
	});

	it("is_terminal is true for COMPLETED stage", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		await app.request(`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "COMPLETED" }),
		});

		const res = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		const body = await res.json();
		expect(body.is_terminal).toBe(true);
		expect(body.stage).toBe("COMPLETED");
	});

	it("is_terminal is true for FAILED stage", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();

		await app.request(`/api/targets/${targetId}/pipeline/${pipeline.pipeline_id}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "FAILED" }),
		});

		const res = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		const body = await res.json();
		expect(body.is_terminal).toBe(true);
		expect(body.stage).toBe("FAILED");
	});

	it("reflects latest pipeline status after stop", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);

		await app.request(`/api/targets/${targetId}/cycle/stop`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});

		const res = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		const body = await res.json();
		expect(body.stage).toBe("COMPLETED");
		expect(body.is_terminal).toBe(true);
	});
});

// ══════════════════════════════════════════════════════════════
// Pipeline lifecycle — end-to-end flows
// ══════════════════════════════════════════════════════════════

describe("Pipeline lifecycle", () => {
	it("full stage progression: INIT -> ANALYZING -> COMPLETED", async () => {
		const targetId = await getTargetId();
		const createRes = await createPipeline(targetId);
		const pipeline = await createRes.json();
		const pid = pipeline.pipeline_id;

		// INIT -> ANALYZING
		await app.request(`/api/targets/${targetId}/pipeline/${pid}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "ANALYZING" }),
		});

		// ANALYZING -> COMPLETED
		const res = await app.request(`/api/targets/${targetId}/pipeline/${pid}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "COMPLETED" }),
		});

		const body = await res.json();
		expect(body.stage).toBe("COMPLETED");
		expect(body.completed_at).not.toBeNull();
	});

	it("create pipeline -> stop -> status shows terminal", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);

		// Stop
		const stopRes = await app.request(`/api/targets/${targetId}/cycle/stop`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
		});
		expect(stopRes.status).toBe(200);

		// Status
		const statusRes = await app.request(`/api/targets/${targetId}/cycle/status`, { method: "GET" });
		const status = await statusRes.json();
		expect(status.is_terminal).toBe(true);
		expect(status.stage).toBe("COMPLETED");
	});

	it("latest returns most recent after multiple creates", async () => {
		const targetId = await getTargetId();
		await createPipeline(targetId);

		// Advance first pipeline to COMPLETED
		const listRes1 = await app.request(`/api/targets/${targetId}/pipeline`, { method: "GET" });
		const list1 = await listRes1.json();
		await app.request(`/api/targets/${targetId}/pipeline/${list1[0].pipeline_id}/stage`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ stage: "COMPLETED" }),
		});

		// Create second pipeline
		const secondRes = await createPipeline(targetId);
		const second = await secondRes.json();

		// Latest should be the second one (in INIT)
		const latestRes = await app.request(`/api/targets/${targetId}/pipeline/latest`, {
			method: "GET",
		});
		const latest = await latestRes.json();
		expect(latest.pipeline_id).toBe(second.pipeline_id);
		expect(latest.stage).toBe("INIT");
	});
});
