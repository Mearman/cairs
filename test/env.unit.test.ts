// CAIRS Environment Tests
// Tests for type environment, value environment, and definitions

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	emptyTypeEnv,
	extendTypeEnv,
	extendTypeEnvMany,
	lookupType,
	emptyValueEnv,
	extendValueEnv,
	extendValueEnvMany,
	lookupValue,
	emptyDefs,
	defKey,
	registerDef,
	lookupDef,
} from "../src/env.js";
import { intType, boolType, stringType, intVal, boolVal, stringVal } from "../src/types.js";
import type { AIRDef } from "../src/types.js";

describe("Type Environment", () => {
	it("should create an empty type environment", () => {
		const env = emptyTypeEnv();
		assert.strictEqual(env.size, 0);
	});

	it("should extend type environment with a single binding", () => {
		const env = emptyTypeEnv();
		const extended = extendTypeEnv(env, "x", intType);

		assert.strictEqual(extended.size, 1);
		assert.deepStrictEqual(lookupType(extended, "x"), intType);
		// Original should be unchanged
		assert.strictEqual(env.size, 0);
	});

	it("should extend type environment with multiple bindings", () => {
		const env = emptyTypeEnv();
		const extended = extendTypeEnvMany(env, [
			["x", intType],
			["y", boolType],
			["z", stringType],
		]);

		assert.strictEqual(extended.size, 3);
		assert.deepStrictEqual(lookupType(extended, "x"), intType);
		assert.deepStrictEqual(lookupType(extended, "y"), boolType);
		assert.deepStrictEqual(lookupType(extended, "z"), stringType);
	});

	it("should return undefined for missing bindings", () => {
		const env = extendTypeEnv(emptyTypeEnv(), "x", intType);
		assert.strictEqual(lookupType(env, "y"), undefined);
	});

	it("should shadow existing bindings", () => {
		const env1 = extendTypeEnv(emptyTypeEnv(), "x", intType);
		const env2 = extendTypeEnv(env1, "x", boolType);

		assert.deepStrictEqual(lookupType(env1, "x"), intType);
		assert.deepStrictEqual(lookupType(env2, "x"), boolType);
	});
});

describe("Value Environment", () => {
	it("should create an empty value environment", () => {
		const env = emptyValueEnv();
		assert.strictEqual(env.size, 0);
	});

	it("should extend value environment with a single binding", () => {
		const env = emptyValueEnv();
		const extended = extendValueEnv(env, "x", intVal(42));

		assert.strictEqual(extended.size, 1);
		assert.deepStrictEqual(lookupValue(extended, "x"), intVal(42));
		// Original should be unchanged
		assert.strictEqual(env.size, 0);
	});

	it("should extend value environment with multiple bindings", () => {
		const env = emptyValueEnv();
		const extended = extendValueEnvMany(env, [
			["x", intVal(1)],
			["y", boolVal(true)],
			["z", stringVal("hello")],
		]);

		assert.strictEqual(extended.size, 3);
		assert.deepStrictEqual(lookupValue(extended, "x"), intVal(1));
		assert.deepStrictEqual(lookupValue(extended, "y"), boolVal(true));
		assert.deepStrictEqual(lookupValue(extended, "z"), stringVal("hello"));
	});

	it("should return undefined for missing bindings", () => {
		const env = extendValueEnv(emptyValueEnv(), "x", intVal(42));
		assert.strictEqual(lookupValue(env, "y"), undefined);
	});

	it("should shadow existing bindings", () => {
		const env1 = extendValueEnv(emptyValueEnv(), "x", intVal(1));
		const env2 = extendValueEnv(env1, "x", intVal(2));

		assert.deepStrictEqual(lookupValue(env1, "x"), intVal(1));
		assert.deepStrictEqual(lookupValue(env2, "x"), intVal(2));
	});
});

describe("Definitions", () => {
	const testDef: AIRDef = {
		ns: "math",
		name: "double",
		params: ["x"],
		result: intType,
		body: { kind: "var", name: "x" },
	};

	it("should create an empty definitions map", () => {
		const defs = emptyDefs();
		assert.strictEqual(defs.size, 0);
	});

	it("should create qualified key from namespace and name", () => {
		assert.strictEqual(defKey("math", "double"), "math:double");
		assert.strictEqual(defKey("core", "add"), "core:add");
	});

	it("should register and lookup a definition", () => {
		const defs = registerDef(emptyDefs(), testDef);

		assert.strictEqual(defs.size, 1);
		assert.deepStrictEqual(lookupDef(defs, "math", "double"), testDef);
	});

	it("should return undefined for missing definitions", () => {
		const defs = registerDef(emptyDefs(), testDef);
		assert.strictEqual(lookupDef(defs, "math", "triple"), undefined);
		assert.strictEqual(lookupDef(defs, "other", "double"), undefined);
	});

	it("should not modify original definitions map", () => {
		const defs1 = emptyDefs();
		const defs2 = registerDef(defs1, testDef);

		assert.strictEqual(defs1.size, 0);
		assert.strictEqual(defs2.size, 1);
	});

	it("should register multiple definitions", () => {
		const def2: AIRDef = {
			ns: "math",
			name: "triple",
			params: ["x"],
			result: intType,
			body: { kind: "var", name: "x" },
		};

		let defs = emptyDefs();
		defs = registerDef(defs, testDef);
		defs = registerDef(defs, def2);

		assert.strictEqual(defs.size, 2);
		assert.deepStrictEqual(lookupDef(defs, "math", "double"), testDef);
		assert.deepStrictEqual(lookupDef(defs, "math", "triple"), def2);
	});
});
