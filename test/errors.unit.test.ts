// CAIRS Error Tests
// Tests for error classes, validation results, and exhaustiveness checking

import { describe, it } from "node:test";
import assert from "node:assert";
import {
	ErrorCodes,
	CAIRSError,
	validResult,
	invalidResult,
	combineResults,
	exhaustive,
} from "../src/errors.js";
import { intType, boolType, listType, fnType } from "../src/types.js";

describe("ErrorCodes", () => {
	it("should have all expected error codes", () => {
		assert.strictEqual(ErrorCodes.TypeError, "TypeError");
		assert.strictEqual(ErrorCodes.ArityError, "ArityError");
		assert.strictEqual(ErrorCodes.DomainError, "DomainError");
		assert.strictEqual(ErrorCodes.DivideByZero, "DivideByZero");
		assert.strictEqual(ErrorCodes.UnknownOperator, "UnknownOperator");
		assert.strictEqual(ErrorCodes.UnknownDefinition, "UnknownDefinition");
		assert.strictEqual(ErrorCodes.UnboundIdentifier, "UnboundIdentifier");
		assert.strictEqual(ErrorCodes.NonTermination, "NonTermination");
		assert.strictEqual(ErrorCodes.ValidationError, "ValidationError");
	});
});

describe("CAIRSError", () => {
	describe("constructor", () => {
		it("should create error with code and message", () => {
			const error = new CAIRSError(ErrorCodes.TypeError, "Test error");

			assert.strictEqual(error.code, ErrorCodes.TypeError);
			assert.strictEqual(error.message, "Test error");
			assert.strictEqual(error.name, "CAIRSError");
			assert.strictEqual(error.meta, undefined);
		});

		it("should create error with meta", () => {
			const meta = new Map([["key", { kind: "int", value: 42 } as const]]);
			const error = new CAIRSError(ErrorCodes.DomainError, "With meta", meta);

			assert.strictEqual(error.meta, meta);
		});
	});

	describe("toValue", () => {
		it("should convert error to value representation", () => {
			const error = new CAIRSError(ErrorCodes.TypeError, "Test");
			const value = error.toValue();

			assert.strictEqual(value.kind, "error");
			assert.strictEqual(value.code, ErrorCodes.TypeError);
		});

		it("should include meta in value if present", () => {
			const meta = new Map([["key", { kind: "int", value: 42 } as const]]);
			const error = new CAIRSError(ErrorCodes.DomainError, "Test", meta);
			const value = error.toValue();

			assert.strictEqual(value.meta, meta);
		});
	});

	describe("factory methods", () => {
		it("should create TypeError", () => {
			const error = CAIRSError.typeError(intType, boolType);

			assert.strictEqual(error.code, ErrorCodes.TypeError);
			assert.ok(error.message.includes("expected int"));
			assert.ok(error.message.includes("got bool"));
		});

		it("should create TypeError with context", () => {
			const error = CAIRSError.typeError(intType, boolType, "in argument");

			assert.ok(error.message.includes("in argument"));
		});

		it("should create ArityError", () => {
			const error = CAIRSError.arityError(2, 3, "add");

			assert.strictEqual(error.code, ErrorCodes.ArityError);
			assert.ok(error.message.includes("add"));
			assert.ok(error.message.includes("2"));
			assert.ok(error.message.includes("3"));
		});

		it("should create DomainError", () => {
			const error = CAIRSError.domainError("Index out of bounds");

			assert.strictEqual(error.code, ErrorCodes.DomainError);
			assert.ok(error.message.includes("Index out of bounds"));
		});

		it("should create DivideByZero error", () => {
			const error = CAIRSError.divideByZero();

			assert.strictEqual(error.code, ErrorCodes.DivideByZero);
			assert.ok(error.message.includes("Division by zero"));
		});

		it("should create UnknownOperator error", () => {
			const error = CAIRSError.unknownOperator("math", "sqrt");

			assert.strictEqual(error.code, ErrorCodes.UnknownOperator);
			assert.ok(error.message.includes("math:sqrt"));
		});

		it("should create UnknownDefinition error", () => {
			const error = CAIRSError.unknownDefinition("lib", "foo");

			assert.strictEqual(error.code, ErrorCodes.UnknownDefinition);
			assert.ok(error.message.includes("lib:foo"));
		});

		it("should create UnboundIdentifier error", () => {
			const error = CAIRSError.unboundIdentifier("x");

			assert.strictEqual(error.code, ErrorCodes.UnboundIdentifier);
			assert.ok(error.message.includes("x"));
		});

		it("should create NonTermination error", () => {
			const error = CAIRSError.nonTermination();

			assert.strictEqual(error.code, ErrorCodes.NonTermination);
		});

		it("should create ValidationError", () => {
			const error = CAIRSError.validation("nodes[0]", "missing id");

			assert.strictEqual(error.code, ErrorCodes.ValidationError);
			assert.ok(error.message.includes("nodes[0]"));
			assert.ok(error.message.includes("missing id"));
		});

		it("should create ValidationError with value", () => {
			const error = CAIRSError.validation("type", "invalid", { kind: "foo" });

			assert.ok(error.message.includes("foo"));
		});
	});

	describe("type formatting", () => {
		it("should format complex types in errors", () => {
			const listInt = listType(intType);
			const error = CAIRSError.typeError(listInt, boolType);

			assert.ok(error.message.includes("list<int>"));
		});

		it("should format function types in errors", () => {
			const fn = fnType([intType, intType], intType);
			const error = CAIRSError.typeError(fn, boolType);

			assert.ok(error.message.includes("fn(int, int) -> int"));
		});
	});
});

describe("ValidationResult", () => {
	describe("validResult", () => {
		it("should create successful validation result", () => {
			const result = validResult({ test: "value" });

			assert.strictEqual(result.valid, true);
			assert.deepStrictEqual(result.errors, []);
			assert.deepStrictEqual(result.value, { test: "value" });
		});
	});

	describe("invalidResult", () => {
		it("should create failed validation result", () => {
			const errors = [{ path: "root", message: "Invalid" }];
			const result = invalidResult(errors);

			assert.strictEqual(result.valid, false);
			assert.deepStrictEqual(result.errors, errors);
			assert.strictEqual(result.value, undefined);
		});
	});

	describe("combineResults", () => {
		it("should combine multiple valid results", () => {
			const r1 = validResult(1);
			const r2 = validResult(2);
			const r3 = validResult(3);

			const combined = combineResults([r1, r2, r3]);

			assert.strictEqual(combined.valid, true);
			assert.deepStrictEqual(combined.value, [1, 2, 3]);
		});

		it("should combine results with any invalid", () => {
			const r1 = validResult(1);
			const r2 = invalidResult<number>([{ path: "x", message: "bad" }]);
			const r3 = validResult(3);

			const combined = combineResults([r1, r2, r3]);

			assert.strictEqual(combined.valid, false);
			assert.strictEqual(combined.errors.length, 1);
		});

		it("should aggregate all errors", () => {
			const r1 = invalidResult<number>([{ path: "a", message: "error1" }]);
			const r2 = invalidResult<number>([{ path: "b", message: "error2" }]);

			const combined = combineResults([r1, r2]);

			assert.strictEqual(combined.valid, false);
			assert.strictEqual(combined.errors.length, 2);
		});

		it("should handle empty array", () => {
			const combined = combineResults<number>([]);

			assert.strictEqual(combined.valid, true);
			assert.deepStrictEqual(combined.value, []);
		});
	});
});

describe("exhaustive", () => {
	it("should throw on unexpected value", () => {
		// This tests runtime behavior - we can't actually call it with a valid
		// value at compile time, but we can test the error message format
		const value = "unexpected" as never;

		assert.throws(
			() => exhaustive(value),
			/Unexpected value/,
		);
	});
});
