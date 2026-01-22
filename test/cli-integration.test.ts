// CAIRS CLI Integration Tests
// Tests for argument parsing and CLI option handling

import { describe, it } from "node:test";
import assert from "node:assert";
import { parseArgs } from "../src/cli-utils.js";

describe("parseArgs Argument Parsing", () => {
	describe("Flag Parsing", () => {
		it("should parse --inputs flag", () => {
			const result = parseArgs(["example.air", "--inputs", "1,2,3"]);

			assert.strictEqual(result.path, "example.air");
			assert.strictEqual(result.options.inputs, "1,2,3");
		});

		it("should parse --inputs-file flag", () => {
			const result = parseArgs(["example.eir", "--inputs-file", "./inputs.json"]);

			assert.strictEqual(result.path, "example.eir");
			assert.strictEqual(result.options.inputsFile, "./inputs.json");
		});

		it("should handle both input flags", () => {
			const result = parseArgs(["example.eir", "--inputs", "1,2", "--inputs-file", "alt.json"]);

			assert.strictEqual(result.options.inputs, "1,2");
			assert.strictEqual(result.options.inputsFile, "alt.json");
		});

		it("should parse --verbose flag", () => {
			const result = parseArgs(["example.air", "--verbose"]);

			assert.strictEqual(result.path, "example.air");
			assert.strictEqual(result.options.verbose, true);
		});

		it("should parse multiple flags", () => {
			const result = parseArgs(["example.air", "--verbose", "--validate", "--inputs", "42"]);

			assert.strictEqual(result.options.verbose, true);
			assert.strictEqual(result.options.validate, true);
			assert.strictEqual(result.options.inputs, "42");
		});
	});

	describe("Flag Argument Handling", () => {
		it("should handle missing argument after --inputs", () => {
			const result = parseArgs(["example.air", "--inputs"]);

			assert.strictEqual(result.path, "example.air");
			assert.strictEqual(result.options.inputs, undefined);
		});

		it("should handle missing argument after --inputs-file", () => {
			const result = parseArgs(["example.air", "--inputs-file"]);

			assert.strictEqual(result.path, "example.air");
			assert.strictEqual(result.options.inputsFile, undefined);
		});

		it("should ignore flags starting with dash in path position", () => {
			const result = parseArgs(["--verbose", "--inputs", "1,2"]);

			assert.strictEqual(result.path, null);
			assert.strictEqual(result.options.verbose, true);
			assert.strictEqual(result.options.inputs, "1,2");
		});

		it("should handle subcommand style (validate, list)", () => {
			const validateResult = parseArgs(["validate"]);
			assert.strictEqual(validateResult.options.validate, true);

			const listResult = parseArgs(["list"]);
			assert.strictEqual(listResult.options.list, true);
		});
	});

	describe("Short Flags", () => {
		it("should parse -v for --verbose", () => {
			const result = parseArgs(["example.air", "-v"]);
			assert.strictEqual(result.options.verbose, true);
		});

		it("should parse -l for --list", () => {
			const result = parseArgs(["-l"]);
			assert.strictEqual(result.options.list, true);
		});

		it("should parse -h for --help", () => {
			const result = parseArgs(["-h"]);
			assert.strictEqual(result.options.help, true);
		});
	});

	describe("Path Resolution", () => {
		it("should extract path from first non-flag argument", () => {
			const result = parseArgs(["air/basics/arithmetic", "--verbose"]);
			assert.strictEqual(result.path, "air/basics/arithmetic");
		});

		it("should handle paths with slashes", () => {
			const result = parseArgs(["cir/algorithms/factorial", "--inputs", "5"]);
			assert.strictEqual(result.path, "cir/algorithms/factorial");
		});

		it("should handle explicit .json extension", () => {
			const result = parseArgs(["example.air.json"]);
			assert.strictEqual(result.path, "example.air.json");
		});

		it("should return null path when only flags provided", () => {
			const result = parseArgs(["--verbose", "--list"]);
			assert.strictEqual(result.path, null);
		});

		it("should handle inputs as single-word value", () => {
			const result = parseArgs(["eir/interactive/add", "--inputs", "[1,2]"]);
			assert.strictEqual(result.path, "eir/interactive/add");
			assert.strictEqual(result.options.inputs, "[1,2]");
		});
	});

	describe("Complex Scenarios", () => {
		it("should handle full example command with all options", () => {
			const result = parseArgs([
				"eir/interactive/add-two-ints",
				"--verbose",
				"--inputs",
				"3,4",
				"--validate",
			]);

			assert.strictEqual(result.path, "eir/interactive/add-two-ints");
			assert.strictEqual(result.options.verbose, true);
			assert.strictEqual(result.options.validate, true);
			assert.strictEqual(result.options.inputs, "3,4");
		});

		it("should handle JSON array inputs with spaces", () => {
			const result = parseArgs(["example.eir", "--inputs", "[1, 2, 3]"]);
			assert.strictEqual(result.options.inputs, "[1, 2, 3]");
		});

		it("should handle file path with special characters", () => {
			const result = parseArgs(["example.air", "--inputs-file", "./test-fixtures/inputs.json"]);
			assert.strictEqual(result.options.inputsFile, "./test-fixtures/inputs.json");
		});
	});

	describe("Python Synthesis Flag", () => {
		it("should parse --synth flag", () => {
			const result = parseArgs(["air/basics/arithmetic", "--synth"]);

			assert.strictEqual(result.path, "air/basics/arithmetic");
			assert.strictEqual(result.options.synth, true);
		});

		it("should combine --synth with other flags", () => {
			const result = parseArgs(["cir/algorithms/factorial", "--synth", "--verbose"]);

			assert.strictEqual(result.path, "cir/algorithms/factorial");
			assert.strictEqual(result.options.synth, true);
			assert.strictEqual(result.options.verbose, true);
		});

		it("should handle --synth with --validate (synthesis only)", () => {
			const result = parseArgs(["eir/loops/while-loop", "--synth", "--validate"]);

			assert.strictEqual(result.path, "eir/loops/while-loop");
			assert.strictEqual(result.options.synth, true);
			assert.strictEqual(result.options.validate, true);
		});

		it("should handle LIR examples with --synth", () => {
			const result = parseArgs(["lir/control-flow/while-cfg", "--synth"]);

			assert.strictEqual(result.path, "lir/control-flow/while-cfg");
			assert.strictEqual(result.options.synth, true);
		});
	});
});
