// CAIRS Effects Tests
// Tests for effect registry and built-in effects

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	emptyEffectRegistry,
	registerEffect,
	lookupEffect,
	createDefaultEffectRegistry,
	ioEffects,
	stateEffects,
	defaultEffectRegistry,
} from "../src/effects.js";
import { intType, stringType, voidType, intVal, stringVal } from "../src/types.js";
import type { EffectOp } from "../src/effects.js";

describe("Effect Registry", () => {
	describe("emptyEffectRegistry", () => {
		it("should create an empty registry", () => {
			const registry = emptyEffectRegistry();
			assert.strictEqual(registry.size, 0);
		});
	});

	describe("registerEffect", () => {
		it("should register an effect operation", () => {
			const registry = emptyEffectRegistry();
			const op: EffectOp = {
				name: "test",
				params: [intType],
				returns: voidType,
				pure: false,
				fn: () => ({ kind: "void" }),
			};

			const newRegistry = registerEffect(registry, op);

			assert.strictEqual(newRegistry.size, 1);
			assert.strictEqual(registry.size, 0); // Original unchanged
		});

		it("should allow multiple effects", () => {
			let registry = emptyEffectRegistry();
			const op1: EffectOp = {
				name: "op1",
				params: [],
				returns: voidType,
				pure: false,
				fn: () => ({ kind: "void" }),
			};
			const op2: EffectOp = {
				name: "op2",
				params: [],
				returns: voidType,
				pure: false,
				fn: () => ({ kind: "void" }),
			};

			registry = registerEffect(registry, op1);
			registry = registerEffect(registry, op2);

			assert.strictEqual(registry.size, 2);
		});
	});

	describe("lookupEffect", () => {
		it("should find registered effect", () => {
			const op: EffectOp = {
				name: "test",
				params: [stringType],
				returns: voidType,
				pure: false,
				fn: () => ({ kind: "void" }),
			};
			const registry = registerEffect(emptyEffectRegistry(), op);

			const result = lookupEffect(registry, "test");

			assert.ok(result);
			assert.strictEqual(result.name, "test");
		});

		it("should return undefined for missing effect", () => {
			const registry = emptyEffectRegistry();

			const result = lookupEffect(registry, "missing");

			assert.strictEqual(result, undefined);
		});
	});
});

describe("Built-in Effects", () => {
	describe("ioEffects", () => {
		it("should include print effect", () => {
			const print = ioEffects.find((e) => e.name === "print");
			assert.ok(print);
			assert.deepStrictEqual(print.params, [stringType]);
			assert.deepStrictEqual(print.returns, voidType);
			assert.strictEqual(print.pure, false);
		});

		it("print effect should return void", () => {
			const print = ioEffects.find((e) => e.name === "print");
			assert.ok(print);

			const result = print.fn(stringVal("hello"));
			assert.deepStrictEqual(result, { kind: "void" });
		});

		it("should include printInt effect", () => {
			const printInt = ioEffects.find((e) => e.name === "printInt");
			assert.ok(printInt);
			assert.deepStrictEqual(printInt.params, [intType]);
			assert.deepStrictEqual(printInt.returns, voidType);
		});

		it("printInt effect should return void", () => {
			const printInt = ioEffects.find((e) => e.name === "printInt");
			assert.ok(printInt);

			const result = printInt.fn(intVal(42));
			assert.deepStrictEqual(result, { kind: "void" });
		});
	});

	describe("stateEffects", () => {
		it("should include getState effect", () => {
			const getState = stateEffects.find((e) => e.name === "getState");
			assert.ok(getState);
			assert.deepStrictEqual(getState.params, []);
			assert.deepStrictEqual(getState.returns, stringType);
		});

		it("getState effect should return mock state", () => {
			const getState = stateEffects.find((e) => e.name === "getState");
			assert.ok(getState);

			const result = getState.fn();
			assert.deepStrictEqual(result, { kind: "string", value: "mock-state" });
		});

		it("should include setState effect", () => {
			const setState = stateEffects.find((e) => e.name === "setState");
			assert.ok(setState);
			assert.deepStrictEqual(setState.params, [stringType]);
			assert.deepStrictEqual(setState.returns, voidType);
		});

		it("setState effect should return void", () => {
			const setState = stateEffects.find((e) => e.name === "setState");
			assert.ok(setState);

			const result = setState.fn(stringVal("new-state"));
			assert.deepStrictEqual(result, { kind: "void" });
		});
	});
});

describe("createDefaultEffectRegistry", () => {
	it("should include all IO effects", () => {
		const registry = createDefaultEffectRegistry();

		for (const op of ioEffects) {
			const found = lookupEffect(registry, op.name);
			assert.ok(found, `Missing IO effect: ${op.name}`);
		}
	});

	it("should include all state effects", () => {
		const registry = createDefaultEffectRegistry();

		for (const op of stateEffects) {
			const found = lookupEffect(registry, op.name);
			assert.ok(found, `Missing state effect: ${op.name}`);
		}
	});

	it("should have correct total count", () => {
		const registry = createDefaultEffectRegistry();
		const expectedCount = ioEffects.length + stateEffects.length;
		assert.strictEqual(registry.size, expectedCount);
	});
});

describe("defaultEffectRegistry", () => {
	it("should be pre-populated", () => {
		assert.ok(defaultEffectRegistry.size > 0);
	});

	it("should contain print effect", () => {
		const print = lookupEffect(defaultEffectRegistry, "print");
		assert.ok(print);
	});

	it("should contain getState effect", () => {
		const getState = lookupEffect(defaultEffectRegistry, "getState");
		assert.ok(getState);
	});
});
