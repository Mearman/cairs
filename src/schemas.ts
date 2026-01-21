// CAIRS JSON Schemas
// JSON Schema definitions for AIR and CIR documents

//==============================================================================
// Type Schema Components
//==============================================================================

const boolTypeSchema = {
	type: "object",
	required: ["kind"],
	properties: {
		kind: { const: "bool" },
	},
	additionalProperties: false,
};

const intTypeSchema = {
	type: "object",
	required: ["kind"],
	properties: {
		kind: { const: "int" },
	},
	additionalProperties: false,
};

const floatTypeSchema = {
	type: "object",
	required: ["kind"],
	properties: {
		kind: { const: "float" },
	},
	additionalProperties: false,
};

const stringTypeSchema = {
	type: "object",
	required: ["kind"],
	properties: {
		kind: { const: "string" },
	},
	additionalProperties: false,
};

const setTypeSchema = {
	type: "object",
	required: ["kind", "of"],
	properties: {
		kind: { const: "set" },
		of: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const listTypeSchema = {
	type: "object",
	required: ["kind", "of"],
	properties: {
		kind: { const: "list" },
		of: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const mapTypeSchema = {
	type: "object",
	required: ["kind", "key", "value"],
	properties: {
		kind: { const: "map" },
		key: { $ref: "#/definitions/type" },
		value: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const optionTypeSchema = {
	type: "object",
	required: ["kind", "of"],
	properties: {
		kind: { const: "option" },
		of: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const opaqueTypeSchema = {
	type: "object",
	required: ["kind", "name"],
	properties: {
		kind: { const: "opaque" },
		name: { type: "string" },
	},
	additionalProperties: false,
};

const fnTypeSchema = {
	type: "object",
	required: ["kind", "params", "returns"],
	properties: {
		kind: { const: "fn" },
		params: {
			type: "array",
			items: { $ref: "#/definitions/type" },
		},
		returns: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const typeSchema = {
	oneOf: [
		boolTypeSchema,
		intTypeSchema,
		floatTypeSchema,
		stringTypeSchema,
		setTypeSchema,
		listTypeSchema,
		mapTypeSchema,
		optionTypeSchema,
		opaqueTypeSchema,
		fnTypeSchema,
	],
};

//==============================================================================
// Expression Schema Components
//==============================================================================

const litExprSchema = {
	type: "object",
	required: ["kind", "type", "value"],
	properties: {
		kind: { const: "lit" },
		type: { $ref: "#/definitions/type" },
		value: true,
	},
	additionalProperties: false,
};

const refExprSchema = {
	type: "object",
	required: ["kind", "id"],
	properties: {
		kind: { const: "ref" },
		id: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
	},
	additionalProperties: false,
};

const varExprSchema = {
	type: "object",
	required: ["kind", "name"],
	properties: {
		kind: { const: "var" },
		name: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
	},
	additionalProperties: false,
};

const callExprSchema = {
	type: "object",
	required: ["kind", "ns", "name", "args"],
	properties: {
		kind: { const: "call" },
		ns: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		name: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		args: {
			type: "array",
			items: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		},
	},
	additionalProperties: false,
};

const ifExprSchema = {
	type: "object",
	required: ["kind", "cond", "then", "else", "type"],
	properties: {
		kind: { const: "if" },
		cond: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		then: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		else: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		type: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const letExprSchema = {
	type: "object",
	required: ["kind", "name", "value", "body"],
	properties: {
		kind: { const: "let" },
		name: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		value: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		body: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
	},
	additionalProperties: false,
};

const airRefExprSchema = {
	type: "object",
	required: ["kind", "ns", "name", "args"],
	properties: {
		kind: { const: "airRef" },
		ns: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		name: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		args: {
			type: "array",
			items: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		},
	},
	additionalProperties: false,
};

const predicateExprSchema = {
	type: "object",
	required: ["kind", "name", "value"],
	properties: {
		kind: { const: "predicate" },
		name: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		value: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
	},
	additionalProperties: false,
};

// CIR-only expressions
const lambdaExprSchema = {
	type: "object",
	required: ["kind", "params", "body", "type"],
	properties: {
		kind: { const: "lambda" },
		params: {
			type: "array",
			items: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		},
		body: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		type: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const callFnExprSchema = {
	type: "object",
	required: ["kind", "fn", "args"],
	properties: {
		kind: { const: "callExpr" },
		fn: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		args: {
			type: "array",
			items: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		},
	},
	additionalProperties: false,
};

const fixExprSchema = {
	type: "object",
	required: ["kind", "fn", "type"],
	properties: {
		kind: { const: "fix" },
		fn: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		type: { $ref: "#/definitions/type" },
	},
	additionalProperties: false,
};

const airExprSchema = {
	oneOf: [
		litExprSchema,
		refExprSchema,
		varExprSchema,
		callExprSchema,
		ifExprSchema,
		letExprSchema,
		airRefExprSchema,
		predicateExprSchema,
	],
};

const cirExprSchema = {
	oneOf: [
		litExprSchema,
		refExprSchema,
		varExprSchema,
		callExprSchema,
		ifExprSchema,
		letExprSchema,
		airRefExprSchema,
		predicateExprSchema,
		lambdaExprSchema,
		callFnExprSchema,
		fixExprSchema,
	],
};

//==============================================================================
// AIR Definition Schema
//==============================================================================

const airDefSchema = {
	type: "object",
	required: ["ns", "name", "params", "result", "body"],
	properties: {
		ns: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		name: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		params: {
			type: "array",
			items: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		},
		result: { $ref: "#/definitions/type" },
		body: { $ref: "#/definitions/expr" },
	},
	additionalProperties: false,
};

//==============================================================================
// Node Schema
//==============================================================================

const nodeSchema = {
	type: "object",
	required: ["id", "expr"],
	properties: {
		id: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		expr: { $ref: "#/definitions/expr" },
	},
	additionalProperties: false,
};

//==============================================================================
// Function Signature Schema
//==============================================================================

const functionSigSchema = {
	type: "object",
	required: ["ns", "name", "params", "returns", "pure"],
	properties: {
		ns: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		name: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
		params: {
			type: "array",
			items: { $ref: "#/definitions/type" },
		},
		returns: { $ref: "#/definitions/type" },
		pure: { type: "boolean" },
	},
	additionalProperties: false,
};

//==============================================================================
// Full Document Schemas
//==============================================================================

const definitions = {
	type: typeSchema,
	expr: airExprSchema,
	airDef: airDefSchema,
	node: nodeSchema,
	functionSig: functionSigSchema,
};

export const airSchema = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "AIR Document",
	type: "object",
	required: ["version", "nodes", "result", "airDefs"],
	properties: {
		version: {
			type: "string",
			pattern: "^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.]+)?$",
			description: "Semantic version",
		},
		capabilities: {
			type: "array",
			items: { type: "string" },
			description: "Optional capability declarations",
		},
		functionSigs: {
			type: "array",
			items: { $ref: "#/definitions/functionSig" },
			description: "Operator signatures",
		},
		airDefs: {
			type: "array",
			items: { $ref: "#/definitions/airDef" },
			description: "AIR definitions",
		},
		nodes: {
			type: "array",
			items: { $ref: "#/definitions/node" },
			description: "Expression nodes",
		},
		result: {
			type: "string",
			pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$",
			description: "Reference to result node",
		},
	},
	additionalProperties: false,
	definitions,
};

export const cirSchema = {
	$schema: "http://json-schema.org/draft-07/schema#",
	title: "CIR Document",
	type: "object",
	required: ["version", "nodes", "result", "airDefs"],
	properties: {
		version: {
			type: "string",
			pattern: "^\\d+\\.\\d+\\.\\d+(-[a-zA-Z0-9.]+)?$",
			description: "Semantic version",
		},
		capabilities: {
			type: "array",
			items: { type: "string" },
			description: "Optional capability declarations",
		},
		functionSigs: {
			type: "array",
			items: { $ref: "#/definitions/functionSig" },
			description: "Operator signatures",
		},
		airDefs: {
			type: "array",
			items: { $ref: "#/definitions/airDef" },
			description: "AIR definitions",
		},
		nodes: {
			type: "array",
			items: {
				type: "object",
				required: ["id", "expr"],
				properties: {
					id: { type: "string", pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$" },
					expr: { $ref: "#/definitions/expr" },
				},
				additionalProperties: false,
			},
			description: "Expression nodes (includes CIR expressions)",
		},
		result: {
			type: "string",
			pattern: "^[a-zA-Z_][a-zA-Z0-9_]*$",
			description: "Reference to result node",
		},
	},
	additionalProperties: false,
	definitions: {
		...definitions,
		expr: cirExprSchema,
	},
};

//==============================================================================
// Schema Type Guards
//==============================================================================

export function isAIRSchema(obj: unknown): obj is Record<string, unknown> {
	return typeof obj === "object" && obj !== null && "$schema" in obj;
}

export function isCIRSchema(obj: unknown): obj is Record<string, unknown> {
	return typeof obj === "object" && obj !== null && "$schema" in obj;
}
