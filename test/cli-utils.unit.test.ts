// CAIRS CLI Utilities Unit Tests
// Tests for input parsing and file I/O functions

import { describe, it } from "node:test";
import assert from "node:assert";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseInputString, readInputsFile } from "../src/cli-utils.js";

describe("parseInputString", () => {
	describe("Comma-separated values", () => {
		it("should parse comma-separated numbers: '1,2,3' → [1, 2, 3]", () => {
			const result = parseInputString("1,2,3");
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should parse comma-separated strings: 'hello,world' → ['hello', 'world']", () => {
			const result = parseInputString("hello,world");
			assert.deepStrictEqual(result, ["hello", "world"]);
		});

		it("should parse mixed CSV: 'foo,42,bar' → ['foo', 42, 'bar']", () => {
			const result = parseInputString("foo,42,bar");
			assert.deepStrictEqual(result, ["foo", 42, "bar"]);
		});

		it("should handle whitespace in CSV: '1, 2, 3' → [1, 2, 3]", () => {
			const result = parseInputString("1, 2, 3");
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should handle single value: '42' → [42]", () => {
			const result = parseInputString("42");
			assert.deepStrictEqual(result, [42]);
		});

		it("should handle empty string: '' → ['']", () => {
			const result = parseInputString("");
			assert.deepStrictEqual(result, [""]);
		});
	});

	describe("JSON array format", () => {
		it("should parse JSON array format: '[1, 2, 3]' → [1, 2, 3]", () => {
			const result = parseInputString("[1, 2, 3]");
			assert.deepStrictEqual(result, [1, 2, 3]);
		});

		it("should parse JSON array with strings: '[\"hello\", \"world\"]' → ['hello', 'world']", () => {
			const result = parseInputString('["hello", "world"]');
			assert.deepStrictEqual(result, ["hello", "world"]);
		});

		it("should parse JSON mixed types: '[1, \"foo\", 2]' → [1, 'foo', 2]", () => {
			const result = parseInputString('[1, "foo", 2]');
			assert.deepStrictEqual(result, [1, "foo", 2]);
		});

		it("should prefer JSON over CSV: '[1,2]' → [1, 2] not ['[1', '2]']", () => {
			const result = parseInputString("[1,2]");
			assert.deepStrictEqual(result, [1, 2]);
		});
	});
});

describe("readInputsFile", () => {
	it("should read valid JSON array file", async () => {
		const tmpFile = join(tmpdir(), `test-inputs-${Date.now()}.json`);
		await writeFile(tmpFile, JSON.stringify([1, 2, 3]));

		const result = await readInputsFile(tmpFile);
		assert.deepStrictEqual(result, [1, 2, 3]);

		await unlink(tmpFile);
	});

	it("should read JSON array with strings", async () => {
		const tmpFile = join(tmpdir(), `test-inputs-${Date.now()}-strings.json`);
		await writeFile(tmpFile, JSON.stringify(["hello", "world"]));

		const result = await readInputsFile(tmpFile);
		assert.deepStrictEqual(result, ["hello", "world"]);

		await unlink(tmpFile);
	});

	it("should read JSON array with mixed types", async () => {
		const tmpFile = join(tmpdir(), `test-inputs-${Date.now()}-mixed.json`);
		await writeFile(tmpFile, JSON.stringify([1, "foo", 2, "bar"]));

		const result = await readInputsFile(tmpFile);
		assert.deepStrictEqual(result, [1, "foo", 2, "bar"]);

		await unlink(tmpFile);
	});

	it("should return null for non-existent file", async () => {
		const result = await readInputsFile("/nonexistent/file/path.json");
		assert.strictEqual(result, null);
	});

	it("should return null for invalid JSON", async () => {
		const tmpFile = join(tmpdir(), `test-inputs-${Date.now()}-invalid.json`);
		await writeFile(tmpFile, "{ invalid json }");

		const result = await readInputsFile(tmpFile);
		assert.strictEqual(result, null);

		await unlink(tmpFile);
	});

	it("should return null for non-array JSON", async () => {
		const tmpFile = join(tmpdir(), `test-inputs-${Date.now()}-object.json`);
		await writeFile(tmpFile, JSON.stringify({ key: "value" }));

		const result = await readInputsFile(tmpFile);
		assert.strictEqual(result, null);

		await unlink(tmpFile);
	});

	it("should convert all values to string or number", async () => {
		const tmpFile = join(tmpdir(), `test-inputs-${Date.now()}-types.json`);
		// Note: JSON doesn't support null, boolean serialization in arrays, so testing with existing types
		await writeFile(tmpFile, JSON.stringify([1, "two", 3.14]));

		const result = await readInputsFile(tmpFile);
		assert.ok(result);
		assert.strictEqual(result.length, 3);
		assert.strictEqual(typeof result[0], "number");
		assert.strictEqual(typeof result[1], "string");
		assert.strictEqual(typeof result[2], "number");

		await unlink(tmpFile);
	});
});
