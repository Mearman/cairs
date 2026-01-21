// CAIRS Types Unit Tests

import assert from "node:assert";
import { describe, it } from "node:test";
import { emptyValueEnv } from "../src/env.js";
import {
	boolType,
	boolVal,
	closureVal,
	errorVal,
	floatType,
	floatVal,
	fnType,
	hashValue,
	intType,
	intVal,
	isClosure,
	isError,
	isPrimitiveType,
	listType,
	listVal,
	mapType,
	mapVal,
	opaqueType,
	opaqueVal,
	optionType,
	optionVal,
	setType,
	setVal,
	stringType,
	stringVal,
	typeEqual,
} from "../src/types.js";

describe("Type Constructors", () => {
	it("should create primitive types", () => {
		assert.deepStrictEqual(boolType, { kind: "bool" });
		assert.deepStrictEqual(intType, { kind: "int" });
		assert.deepStrictEqual(floatType, { kind: "float" });
		assert.deepStrictEqual(stringType, { kind: "string" });
	});

	it("should create set type", () => {
		const t = setType(intType);
		assert.deepStrictEqual(t, { kind: "set", of: intType });
	});

	it("should create list type", () => {
		const t = listType(boolType);
		assert.deepStrictEqual(t, { kind: "list", of: boolType });
	});

	it("should create map type", () => {
		const t = mapType(stringType, intType);
		assert.deepStrictEqual(t, { kind: "map", key: stringType, value: intType });
	});

	it("should create option type", () => {
		const t = optionType(floatType);
		assert.deepStrictEqual(t, { kind: "option", of: floatType });
	});

	it("should create opaque type", () => {
		const t = opaqueType("MyType");
		assert.deepStrictEqual(t, { kind: "opaque", name: "MyType" });
	});

	it("should create function type", () => {
		const t = fnType([intType, intType], boolType);
		assert.strictEqual(t.kind, "fn");
		assert.strictEqual(t.params.length, 2);
		assert.deepStrictEqual(t.params[0], intType);
		assert.deepStrictEqual(t.params[1], intType);
		assert.deepStrictEqual(t.returns, boolType);
	});
});

describe("Value Constructors", () => {
	it("should create primitive values", () => {
		assert.deepStrictEqual(boolVal(true), { kind: "bool", value: true });
		assert.deepStrictEqual(intVal(42), { kind: "int", value: 42 });
		assert.deepStrictEqual(floatVal(3.14), { kind: "float", value: 3.14 });
		assert.deepStrictEqual(stringVal("hello"), {
			kind: "string",
			value: "hello",
		});
	});

	it("should create list value", () => {
		const v = listVal([intVal(1), intVal(2), intVal(3)]);
		assert.strictEqual(v.kind, "list");
		assert.strictEqual(v.value.length, 3);
	});

	it("should create set value", () => {
		const v = setVal(new Set(["hash1", "hash2"]));
		assert.strictEqual(v.kind, "set");
		assert.strictEqual(v.value.size, 2);
	});

	it("should create map value", () => {
		const v = mapVal(
			new Map([
				["k1", intVal(1)],
				["k2", intVal(2)],
			]),
		);
		assert.strictEqual(v.kind, "map");
		assert.strictEqual(v.value.size, 2);
	});

	it("should create option value", () => {
		const some = optionVal(intVal(42));
		assert.strictEqual(some.kind, "option");
		assert.deepStrictEqual(some.value, intVal(42));

		const none = optionVal(null);
		assert.strictEqual(none.kind, "option");
		assert.strictEqual(none.value, null);
	});

	it("should create opaque value", () => {
		const v = opaqueVal("Custom", { data: "test" });
		assert.strictEqual(v.kind, "opaque");
		assert.strictEqual(v.name, "Custom");
		assert.deepStrictEqual(v.value, { data: "test" });
	});

	it("should create closure value", () => {
		const env = emptyValueEnv();
		const body = { kind: "lit" as const, type: intType, value: 42 };
		const v = closureVal(["x"], body, env);
		assert.strictEqual(v.kind, "closure");
		assert.deepStrictEqual(v.params, ["x"]);
		assert.deepStrictEqual(v.body, body);
	});

	it("should create error value", () => {
		const v = errorVal("TestError", "Something went wrong");
		assert.strictEqual(v.kind, "error");
		assert.strictEqual(v.code, "TestError");
		assert.strictEqual(v.message, "Something went wrong");
	});
});

describe("Type Guards", () => {
	it("should identify error values", () => {
		const err = errorVal("Error", "msg");
		assert.strictEqual(isError(err), true);

		const val = intVal(42);
		assert.strictEqual(isError(val), false);
	});

	it("should identify closure values", () => {
		const env = emptyValueEnv();
		const body = { kind: "lit" as const, type: intType, value: 42 };
		const closure = closureVal(["x"], body, env);
		assert.strictEqual(isClosure(closure), true);

		const val = intVal(42);
		assert.strictEqual(isClosure(val), false);
	});

	it("should identify primitive types", () => {
		assert.strictEqual(isPrimitiveType(boolType), true);
		assert.strictEqual(isPrimitiveType(intType), true);
		assert.strictEqual(isPrimitiveType(floatType), true);
		assert.strictEqual(isPrimitiveType(stringType), true);
		assert.strictEqual(isPrimitiveType(setType(intType)), false);
		assert.strictEqual(isPrimitiveType(listType(intType)), false);
	});
});

describe("Type Equality", () => {
	it("should compare primitive types", () => {
		assert.strictEqual(typeEqual(boolType, boolType), true);
		assert.strictEqual(typeEqual(intType, intType), true);
		assert.strictEqual(typeEqual(boolType, intType), false);
	});

	it("should compare complex types", () => {
		const set1 = setType(intType);
		const set2 = setType(intType);
		const set3 = setType(boolType);
		assert.strictEqual(typeEqual(set1, set2), true);
		assert.strictEqual(typeEqual(set1, set3), false);

		const list1 = listType(floatType);
		const list2 = listType(floatType);
		assert.strictEqual(typeEqual(list1, list2), true);

		const map1 = mapType(stringType, intType);
		const map2 = mapType(stringType, intType);
		const map3 = mapType(intType, stringType);
		assert.strictEqual(typeEqual(map1, map2), true);
		assert.strictEqual(typeEqual(map1, map3), false);
	});

	it("should compare function types", () => {
		const fn1 = fnType([intType, intType], boolType);
		const fn2 = fnType([intType, intType], boolType);
		const fn3 = fnType([intType], boolType);
		assert.strictEqual(typeEqual(fn1, fn2), true);
		assert.strictEqual(typeEqual(fn1, fn3), false);
	});
});

describe("Hash Value", () => {
	it("should hash primitive values", () => {
		const h1 = hashValue(intVal(42));
		const h2 = hashValue(intVal(42));
		const h3 = hashValue(intVal(43));
		assert.strictEqual(h1, h2);
		assert.notStrictEqual(h1, h3);
	});

	it("should hash string values", () => {
		const h1 = hashValue(stringVal("test"));
		const h2 = hashValue(stringVal("test"));
		assert.strictEqual(h1, h2);
	});

	it("should hash option values", () => {
		const none = optionVal(null);
		const some = optionVal(intVal(42));
		assert.strictEqual(hashValue(none), "o:none");
		assert.ok(hashValue(some).startsWith("o:some:"));
	});
});
