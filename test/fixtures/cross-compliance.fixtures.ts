// SPIRAL Cross-Implementation Compliance Test Suite
// Shared fixtures for TypeScript and Python implementations

import { readFileSync } from "fs";
import { resolve } from "path";

//==============================================================================
// Test Fixture Definition
//==============================================================================

/**
 * A test fixture consists of:
 * - The SPIRAL document (JSON path)
 * - Optional inputs for interactive examples
 * - Expected normalized output
 * - Test metadata
 */
export interface ComplianceFixture {
	/** Unique fixture identifier */
	id: string;

	/** Path to the SPIRAL document */
	documentPath: string;

	/** Path to inputs file (for interactive examples) */
	inputsPath?: string;

	/** Expected output (normalized for comparison) */
	expected: ExpectedOutput;

	/** Fixture metadata */
	metadata: {
		layer: "AIR" | "CIR" | "EIR" | "PIR" | "LIR";
		category: string;
		description: string;
	};
}

/**
 * Expected output - normalized form that works across implementations
 */
export interface ExpectedOutput {
	/** The result value */
	value: unknown;

	/** Whether to compare structurally (true) or string representation (false) */
	structural: boolean;

	/** Tolerance for floating point comparisons (optional) */
	tolerance?: number;

	/** Expected error (if any) */
	error?: {
		code: string;
		messagePattern?: string;
	};
}

//==============================================================================
// Fixture Registry
//==============================================================================

/**
 * Registry of all compliance fixtures
 *
 * Fixtures are organized by layer and category. Each fixture defines:
 * 1. The SPIRAL document to execute
 * 2. Input values (if applicable)
 * 3. Expected output value
 *
 * Both TypeScript and Python implementations should produce identical results
 * for each fixture (within tolerance for floating-point values).
 */
export const COMPLIANCE_FIXTURES: ComplianceFixture[] = [
	//==========================================================================
	// AIR Fixtures - Primitive Recursive, Always Terminates
	//==========================================================================

	{
		id: "air-arithmetic-add",
		documentPath: "examples/air/basics/arithmetic/arithmetic.air.json",
		expected: {
			value: { kind: "int", value: 72 },
			structural: true,
		},
		metadata: {
			layer: "AIR",
			category: "basics",
			description: "Arithmetic operations (add, sub, mul, div)",
		},
	},

	{
		id: "air-comparisons-lt",
		documentPath: "examples/air/basics/comparisons/comparisons.air.json",
		expected: {
			value: { kind: "bool", value: false },
			structural: true,
		},
		metadata: {
			layer: "AIR",
			category: "basics",
			description: "Comparison operations (eq, lt, gt, le, ge)",
		},
	},

	{
		id: "air-boolean-logic",
		documentPath: "examples/air/basics/boolean-logic/boolean-logic.air.json",
		expected: {
			value: { kind: "bool", value: true },
			structural: true,
		},
		metadata: {
			layer: "AIR",
			category: "basics",
			description: "Boolean operations (and, or, not)",
		},
	},

	{
		id: "air-list-length",
		documentPath: "examples/air/data-structures/list-length/list-length.air.json",
		expected: {
			value: { kind: "int", value: 3 },
			structural: true,
		},
		metadata: {
			layer: "AIR",
			category: "data-structures",
			description: "List length operation",
		},
	},

	{
		id: "air-list-nth",
		documentPath: "examples/air/data-structures/list-nth/list-nth.air.json",
		expected: {
			value: { kind: "int", value: 30 },
			structural: true,
		},
		metadata: {
			layer: "AIR",
			category: "data-structures",
			description: "List nth element access",
		},
	},

	{
		id: "air-list-concat",
		documentPath: "examples/air/data-structures/list-concat/list-concat.air.json",
		expected: {
			value: {
				kind: "list",
				value: [
					{ kind: "int", value: 1 },
					{ kind: "int", value: 2 },
					{ kind: "int", value: 3 },
					{ kind: "int", value: 4 },
					{ kind: "int", value: 1 },
					{ kind: "int", value: 2 },
					{ kind: "int", value: 3 },
					{ kind: "int", value: 5 },
				],
			},
			structural: true,
		},
		metadata: {
			layer: "AIR",
			category: "data-structures",
			description: "List concatenation",
		},
	},

	{
		id: "air-simple-if",
		documentPath: "examples/air/control-flow/simple-if/simple-if.air.json",
		expected: {
			value: { kind: "int", value: 100 },
			structural: true,
		},
		metadata: {
			layer: "AIR",
			category: "control-flow",
			description: "Simple conditional expression",
		},
	},

	//==========================================================================
	// CIR Fixtures - Turing-Complete with Lambdas
	//==========================================================================

	{
		id: "cir-identity-lambda",
		documentPath: "examples/cir/basics/identity-lambda/identity-lambda.cir.json",
		expected: {
			value: { kind: "int", value: 42 },
			structural: true,
		},
		metadata: {
			layer: "CIR",
			category: "basics",
			description: "Identity lambda function",
		},
	},

	{
		id: "cir-closures",
		documentPath: "examples/cir/basics/closures/closures.cir.json",
		expected: {
			value: { kind: "int", value: 15 },
			structural: true,
		},
		metadata: {
			layer: "CIR",
			category: "basics",
			description: "Closure capturing environment",
		},
	},

	{
		id: "cir-fix-factorial",
		documentPath: "examples/cir/fixpoint/fix-factorial/fix-factorial.cir.json",
		expected: {
			value: { kind: "int", value: 120 },
			structural: true,
		},
		metadata: {
			layer: "CIR",
			category: "fixpoint",
			description: "Factorial via fixpoint combinator",
		},
	},

	//==========================================================================
	// EIR Fixtures - Execution with Effects
	//==========================================================================

	{
		id: "eir-sequencing",
		documentPath: "examples/eir/basics/sequencing/sequencing.eir.json",
		expected: {
			value: { kind: "int", value: 45 },
			structural: true,
		},
		metadata: {
			layer: "EIR",
			category: "basics",
			description: "Sequential execution",
		},
	},

	{
		id: "eir-assignment",
		documentPath: "examples/eir/basics/assignment/assignment.eir.json",
		expected: {
			value: { kind: "int", value: 5 },
			structural: true,
		},
		metadata: {
			layer: "EIR",
			category: "basics",
			description: "Variable assignment",
		},
	},

	{
		id: "eir-while-loop",
		documentPath: "examples/eir/loops/while-loop/while-loop.eir.json",
		expected: {
			value: { kind: "int", value: 5 },
			structural: true,
		},
		metadata: {
			layer: "EIR",
			category: "loops",
			description: "While loop iteration",
		},
	},

	//==========================================================================
	// LIR Fixtures - CFG-Based Evaluation
	//==========================================================================

	{
		id: "lir-straight-line",
		documentPath: "examples/lir/basics/straight-line/straight-line.lir.json",
		expected: {
			value: { kind: "int", value: 35 },
			structural: true,
		},
		metadata: {
			layer: "LIR",
			category: "basics",
			description: "Straight-line code execution",
		},
	},

	{
		id: "lir-conditional",
		documentPath: "examples/lir/basics/conditional/conditional.lir.json",
		expected: {
			value: { kind: "string", value: "x is greater" },
			structural: true,
		},
		metadata: {
			layer: "LIR",
			category: "basics",
			description: "Conditional branch execution",
		},
	},

	{
		id: "lir-factorial",
		documentPath: "examples/lir/algorithms/factorial/factorial.lir.json",
		expected: {
			value: { kind: "int", value: 120 },
			structural: true,
		},
		metadata: {
			layer: "LIR",
			category: "algorithms",
			description: "Factorial algorithm",
		},
	},
];

//==============================================================================
// Fixture Loading Utilities
//==============================================================================

/**
 * Load a fixture's SPIRAL document
 */
export function loadFixtureDocument(fixture: ComplianceFixture): unknown {
	const path = resolve(fixture.documentPath);
	const content = readFileSync(path, "utf-8");
	return JSON.parse(content);
}

/**
 * Load a fixture's inputs (if provided)
 */
export function loadFixtureInputs(fixture: ComplianceFixture): unknown | undefined {
	if (!fixture.inputsPath) {
		return undefined;
	}
	const path = resolve(fixture.inputsPath);
	const content = readFileSync(path, "utf-8");
	return JSON.parse(content);
}

/**
 * Get fixtures by layer
 */
export function getFixturesByLayer(layer: ComplianceFixture["metadata"]["layer"]): ComplianceFixture[] {
	return COMPLIANCE_FIXTURES.filter((f) => f.metadata.layer === layer);
}

/**
 * Get fixtures by category
 */
export function getFixturesByCategory(category: string): ComplianceFixture[] {
	return COMPLIANCE_FIXTURES.filter((f) => f.metadata.category === category);
}

/**
 * Get fixture by ID
 */
export function getFixtureById(id: string): ComplianceFixture | undefined {
	return COMPLIANCE_FIXTURES.find((f) => f.id === id);
}
