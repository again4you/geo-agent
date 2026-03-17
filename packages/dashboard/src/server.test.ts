import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import net from "node:net";

const testDir = path.join(os.tmpdir(), `geo-server-test-${Date.now()}`);
process.env.GEO_WORKSPACE = testDir;

// Ensure workspace directories exist
fs.mkdirSync(path.join(testDir, "data"), { recursive: true });
fs.mkdirSync(path.join(testDir, "prompts"), { recursive: true });

// createDatabase() now auto-creates tables, no manual setup needed
const { startServer } = await import("./server.js");

afterAll(() => {
	try {
		fs.rmSync(testDir, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors on Windows
	}
});

describe("BUG #3 [FIXED]: EADDRINUSE handling", () => {
	it("startServer() rejects with EADDRINUSE when port is occupied", async () => {
		// Occupy a port first
		const blocker = net.createServer();
		const port = await new Promise<number>((resolve) => {
			blocker.listen(0, () => {
				const addr = blocker.address() as net.AddressInfo;
				resolve(addr.port);
			});
		});

		try {
			// Try to start the server on the same port — should reject, not crash
			await expect(startServer(port)).rejects.toThrow();
		} finally {
			blocker.close();
		}
	});
});
