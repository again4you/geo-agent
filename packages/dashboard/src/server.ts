import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { trimTrailingSlash } from "hono/trailing-slash";
import { targetsRouter, initTargetsRouter } from "./routes/targets.js";
import { settingsRouter } from "./routes/settings.js";
import {
	loadSettings,
	initWorkspace,
	createDatabase,
	type AppSettings,
	type GeoDatabase,
} from "@geo-agent/core";

const app = new Hono();

// Global error handler — catches JSON parse errors, etc.
app.onError((err, c) => {
	if (err instanceof SyntaxError && err.message.includes("JSON")) {
		return c.json({ error: "Invalid JSON in request body" }, 400);
	}
	console.error("Unhandled error:", err);
	return c.json({ error: "Internal Server Error" }, 500);
});

// Middleware
app.use(trimTrailingSlash());
app.use("*", cors());

// Health check
app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

// API routes
app.route("/api/targets", targetsRouter);
app.route("/api/settings", settingsRouter);

// Root redirect
app.get("/", (c) => c.json({
	name: "GEO Agent Dashboard",
	version: "0.1.0",
	endpoints: [
		"/health",
		"/api/targets",
		"/api/settings/agents/prompts",
		"/api/settings/llm-providers",
	],
}));

export { app };

/**
 * Starts the dashboard server.
 */
export async function startServer(port?: number): Promise<{ settings: AppSettings; db: GeoDatabase }> {
	const settings = loadSettings();
	initWorkspace(settings);
	const db = createDatabase(settings);

	// Initialize route dependencies with shared DB connection
	initTargetsRouter(db);

	const serverPort = port ?? settings.port;

	console.log(`GEO Agent Dashboard starting on http://localhost:${serverPort}`);

	return new Promise((resolve, reject) => {
		const server = serve({
			fetch: app.fetch,
			port: serverPort,
		});

		server.on("error", (err: NodeJS.ErrnoException) => {
			if (err.code === "EADDRINUSE") {
				console.error(`Error: Port ${serverPort} is already in use. Please choose a different port or stop the existing process.`);
			} else {
				console.error(`Server error: ${err.message}`);
			}
			reject(err);
		});

		server.on("listening", () => {
			console.log(`GEO Agent Dashboard running on http://localhost:${serverPort}`);
			resolve({ settings, db });
		});
	});
}
