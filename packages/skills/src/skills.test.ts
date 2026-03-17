import { describe, it, expect } from "vitest";
import { createSkillRegistry } from "./index.js";
import type { SkillMetadata, SkillRegistry } from "./index.js";

// ─── createSkillRegistry ──────────────────────────────────────────

describe("createSkillRegistry", () => {
	it("returns an object with listSkills and getSkill methods", () => {
		const registry = createSkillRegistry();

		expect(typeof registry.listSkills).toBe("function");
		expect(typeof registry.getSkill).toBe("function");
	});

	it("listSkills() returns an empty array initially", () => {
		const registry = createSkillRegistry();
		const skills = registry.listSkills();

		expect(Array.isArray(skills)).toBe(true);
		expect(skills).toHaveLength(0);
		expect(skills).toEqual([]);
	});

	it("getSkill() returns null for a non-existent skill", () => {
		const registry = createSkillRegistry();
		const result = registry.getSkill("non-existent-skill");

		expect(result).toBeNull();
	});

	it("getSkill() with empty string returns null", () => {
		const registry = createSkillRegistry();
		const result = registry.getSkill("");

		expect(result).toBeNull();
	});

	it("multiple createSkillRegistry() calls return independent instances", () => {
		const registry1 = createSkillRegistry();
		const registry2 = createSkillRegistry();

		// They should be separate objects
		expect(registry1).not.toBe(registry2);

		// Both should start empty
		expect(registry1.listSkills()).toHaveLength(0);
		expect(registry2.listSkills()).toHaveLength(0);

		// Their listSkills() return values should be separate array instances
		const list1 = registry1.listSkills();
		const list2 = registry2.listSkills();
		expect(list1).not.toBe(list2);
	});
});

// ─── SkillRegistry interface shape ────────────────────────────────

describe("SkillRegistry interface", () => {
	it("listSkills returns SkillMetadata[] (empty array satisfies this)", () => {
		const registry = createSkillRegistry();
		const skills: SkillMetadata[] = registry.listSkills();

		expect(skills).toEqual([]);
	});

	it("getSkill returns SkillMetadata | null", () => {
		const registry = createSkillRegistry();
		const result: SkillMetadata | null = registry.getSkill("anything");

		expect(result).toBeNull();
	});

	it("registry satisfies the SkillRegistry interface", () => {
		const registry: SkillRegistry = createSkillRegistry();

		expect(registry).toBeDefined();
		expect(typeof registry.listSkills).toBe("function");
		expect(typeof registry.getSkill).toBe("function");
	});
});
