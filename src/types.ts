// CAIRS Type Definitions
// Implements Value, Type, and Expression AST domains

//==============================================================================
// Error Codes
//==============================================================================

export const ErrorCodes = {
	TypeError: "TypeError",
	ArityError: "ArityError",
	DomainError: "DomainError",
	DivideByZero: "DivideByZero",
	UnknownOperator: "UnknownOperator",
	UnknownDefinition: "UnknownDefinition",
	UnboundIdentifier: "UnboundIdentifier",
	NonTermination: "NonTermination",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

//==============================================================================
// Type Domain (Γ - static types)
//==============================================================================

// Forward declarations for EIR types (must be before Type union)
export interface RefType {
	kind: "ref";
	of: Type;
}

export interface VoidType {
	kind: "void";
}

export type Type =
	| BoolType
	| IntType
	| FloatType
	| StringType
	| SetType
	| ListType
	| MapType
	| OptionType
	| OpaqueType
	| FnType // CIR only
	| RefType // EIR reference cell type
	| VoidType; // EIR void type

export interface BoolType {
	kind: "bool";
}

export interface IntType {
	kind: "int";
}

export interface FloatType {
	kind: "float";
}

export interface StringType {
	kind: "string";
}

export interface SetType {
	kind: "set";
	of: Type;
}

export interface ListType {
	kind: "list";
	of: Type;
}

export interface MapType {
	kind: "map";
	key: Type;
	value: Type;
}

export interface OptionType {
	kind: "option";
	of: Type;
}

export interface OpaqueType {
	kind: "opaque";
	name: string;
}

export interface FnType {
	kind: "fn";
	params: Type[];
	returns: Type;
}

//==============================================================================
// Value Domain (v - runtime values)
//==============================================================================

// Forward declarations for EIR values (must be before Value union)
export interface VoidVal {
	kind: "void";
}

export interface RefCellVal {
	kind: "refCell";
	value: Value;
}

export type Value =
	| BoolVal
	| IntVal
	| FloatVal
	| StringVal
	| ListVal
	| SetVal
	| MapVal
	| OptionVal
	| OpaqueVal
	| ClosureVal // CIR only
	| VoidVal // EIR void value
	| RefCellVal // EIR reference cell value
	| ErrorVal; // Err(code, message?, meta?)

export interface BoolVal {
	kind: "bool";
	value: boolean;
}

export interface IntVal {
	kind: "int";
	value: number;
}

export interface FloatVal {
	kind: "float";
	value: number;
}

export interface StringVal {
	kind: "string";
	value: string;
}

export interface ListVal {
	kind: "list";
	value: Value[];
}

export interface SetVal {
	kind: "set";
	value: Set<string>;
}

export interface MapVal {
	kind: "map";
	value: Map<string, Value>;
}

export interface OptionVal {
	kind: "option";
	value: Value | null;
}

export interface OpaqueVal {
	kind: "opaque";
	name: string;
	value: unknown;
}

export interface ClosureVal {
	kind: "closure";
	params: string[];
	body: Expr;
	env: ValueEnv;
}

export interface ErrorVal {
	kind: "error";
	code: string;
	message?: string;
	meta?: Map<string, Value>;
}

//==============================================================================
// EIR Evaluation State and Effects
//==============================================================================

/**
 * Effect represents a side effect operation in EIR
 */
export interface Effect {
	op: string;
	args: Value[];
}

/**
 * Evaluation state for EIR programs
 * EIR requires mutable state for sequencing, loops, and effects
 */
export interface EvalState {
	env: ValueEnv;
	refCells: Map<string, Value>;
	effects: Effect[];
	steps: number;
	maxSteps: number;
}

/**
 * Create an empty evaluation state
 */
export function emptyEvalState(): EvalState {
	return {
		env: new Map(),
		refCells: new Map(),
		effects: [],
		steps: 0,
		maxSteps: 10000,
	};
}

/**
 * Create an evaluation state with initial values
 */
export function createEvalState(
	env?: ValueEnv,
	refCells?: Map<string, Value>,
	maxSteps?: number,
): EvalState {
	return {
		env: env ?? new Map<string, Value>(),
		refCells: refCells ?? new Map<string, Value>(),
		effects: [],
		steps: 0,
		maxSteps: maxSteps ?? 10000,
	};
}

//==============================================================================
// Expression AST (e - syntactic expressions)
//==============================================================================

export type Expr =
	| LitExpr
	| RefExpr
	| VarExpr
	| CallExpr
	| IfExpr
	| LetExpr
	| AirRefExpr
	| PredicateExpr
	| LambdaExpr // CIR only
	| CallFnExpr // CIR only (distinguished from operator Call)
	| FixExpr; // CIR only

export interface LitExpr {
	kind: "lit";
	type: Type;
	value: unknown;
}

export interface RefExpr {
	kind: "ref";
	id: string;
}

export interface VarExpr {
	kind: "var";
	name: string;
}

export interface CallExpr {
	kind: "call";
	ns: string;
	name: string;
	args: string[];
}

export interface IfExpr {
	kind: "if";
	cond: string;
	then: string;
	else: string;
	type: Type;
}

export interface LetExpr {
	kind: "let";
	name: string;
	value: string;
	body: string;
}

export interface AirRefExpr {
	kind: "airRef";
	ns: string;
	name: string;
	args: string[];
}

export interface PredicateExpr {
	kind: "predicate";
	name: string;
	value: string;
}

export interface LambdaExpr {
	kind: "lambda";
	params: string[];
	body: string;
	type: Type;
}

export interface CallFnExpr {
	kind: "callExpr";
	fn: string;
	args: string[];
}

export interface FixExpr {
	kind: "fix";
	fn: string;
	type: Type;
}

//==============================================================================
// AIR Definition (airDef)
//==============================================================================

export interface AIRDef {
	ns: string;
	name: string;
	params: string[];
	result: Type;
	body: Expr;
}

//==============================================================================
// Document Structure
//==============================================================================

export interface FunctionSignature {
	ns: string;
	name: string;
	params: Type[];
	returns: Type;
	pure: boolean;
}

/** Expression-only node type (used by ExprNode) */
export interface Node<E = Expr> {
	id: string;
	expr: E;
}

export interface AIRDocument {
	version: string;
	capabilities?: string[];
	functionSigs?: FunctionSignature[];
	airDefs: AIRDef[];
	nodes: AirHybridNode[];
	result: string;
}

export interface CIRDocument {
	version: string;
	capabilities?: string[];
	functionSigs?: FunctionSignature[];
	airDefs: AIRDef[];
	nodes: CirHybridNode[];
	result: string;
}

//==============================================================================
// EIR Types (Expression-based Imperative Representation)
// Extends CIR with sequencing, mutation, effects, and loops
//==============================================================================

// EIR-specific expression types
export interface EirSeqExpr {
	kind: "seq";
	first: string; // node id reference
	then: string; // node id reference
}

export interface EirAssignExpr {
	kind: "assign";
	target: string; // mutable target identifier
	value: string; // node id reference
}

export interface EirWhileExpr {
	kind: "while";
	cond: string;
	body: string;
}

export interface EirForExpr {
	kind: "for";
	var: string;
	init: string;
	cond: string;
	update: string;
	body: string;
}

export interface EirIterExpr {
	kind: "iter";
	var: string;
	iter: string;
	body: string;
}

export interface EirEffectExpr {
	kind: "effect";
	op: string;
	args: string[];
}

export interface EirRefCellExpr {
	kind: "refCell";
	target: string;
}

export interface EirDerefExpr {
	kind: "deref";
	target: string;
}

// EIR expression type - extends CIR expressions
export type EirExpr = Expr | EirSeqExpr | EirAssignExpr | EirWhileExpr | EirForExpr | EirIterExpr | EirEffectExpr | EirRefCellExpr | EirDerefExpr;

// EIR expression-only node type alias
export type EirNode = Node<EirExpr>;

export interface EIRDocument {
	version: string;
	capabilities?: string[];
	functionSigs?: FunctionSignature[];
	airDefs: AIRDef[];
	// EIR documents can use seq, assign, loop (while/for/iter), effect, refCell, deref
	// Hybrid nodes allow mixing expression and block nodes
	nodes: EirHybridNode[];
	result: string;
}

//==============================================================================
// LIR Types (Low-level Intermediate Representation)
// CFG-based representation with basic blocks, instructions, terminators
//==============================================================================

// LIR Instructions
export interface LirInsAssign {
	kind: "assign";
	target: string;
	value: Expr; // Can be CIR expression
}

export interface LirInsCall {
	kind: "call";
	target: string;
	callee: string;
	args: string[];
}

export interface LirInsOp {
	kind: "op";
	target: string;
	ns: string;
	name: string;
	args: string[];
}

export interface LirInsPhi {
	kind: "phi";
	target: string;
	sources: { block: string; id: string }[];
}

export interface LirInsEffect {
	kind: "effect";
	op: string;
	args: string[];
}

export interface LirInsAssignRef {
	kind: "assignRef";
	target: string; // ref cell identifier
	value: string; // node id to assign
}

export type LirInstruction =
	| LirInsAssign
	| LirInsCall
	| LirInsOp
	| LirInsPhi
	| LirInsEffect
	| LirInsAssignRef;

// LIR Terminators
export interface LirTermJump {
	kind: "jump";
	to: string;
}

export interface LirTermBranch {
	kind: "branch";
	cond: string;
	then: string;
	else: string;
}

export interface LirTermReturn {
	kind: "return";
	value?: string;
}

export interface LirTermExit {
	kind: "exit";
	code?: string;
}

export type LirTerminator =
	| LirTermJump
	| LirTermBranch
	| LirTermReturn
	| LirTermExit;

// LIR Basic Block
export interface LirBlock {
	id: string;
	instructions: LirInstruction[];
	terminator: LirTerminator;
}

//==============================================================================
// Layer-Specific Block Instruction Types
//==============================================================================

// AIR blocks: pure operations only
export interface AirInsAssign {
	kind: "assign";
	target: string;
	value: Expr; // AIR expressions only
}

export interface AirInsOp {
	kind: "op";
	target: string;
	ns: string;
	name: string;
	args: string[];
}

export type AirInsPhi = LirInsPhi; // Phi nodes for CFG merge points

export type AirInstruction = AirInsAssign | AirInsOp | AirInsPhi;

// CIR blocks: extend AIR (lambda/callExpr/fix allowed in assign values)
export type CirInstruction = AirInstruction;

// EIR blocks: extend CIR with effect and assignRef
export type EirInsEffect = LirInsEffect;
export type EirInsAssignRef = LirInsAssignRef;
export type EirInstruction = CirInstruction | EirInsEffect | EirInsAssignRef;

// Layer-specific block types
export interface AirBlock {
	id: string;
	instructions: AirInstruction[];
	terminator: LirTerminator;
}

export interface CirBlock {
	id: string;
	instructions: CirInstruction[];
	terminator: LirTerminator;
}

export interface EirBlock {
	id: string;
	instructions: EirInstruction[];
	terminator: LirTerminator;
}

//==============================================================================
// Hybrid Node Types
// Nodes can contain either an expression (expr) OR a block structure (blocks+entry)
//==============================================================================

/** Expression-based node (traditional AIR/CIR/EIR structure) */
export interface ExprNode<E = Expr> {
	id: string;
	type?: Type;
	expr: E;
}

/** Block-based node (CFG structure) */
export interface BlockNode<B = LirBlock> {
	id: string;
	type?: Type;
	blocks: B[];
	entry: string;
}

/** Hybrid node - either expression-based or block-based */
export type HybridNode<E = Expr, B = LirBlock> = ExprNode<E> | BlockNode<B>;

/** AIR hybrid node: expression or AIR blocks */
export type AirHybridNode = HybridNode<Expr, AirBlock>;

/** CIR hybrid node: CIR expression or CIR blocks */
export type CirHybridNode = HybridNode<Expr, CirBlock>;

/** EIR hybrid node: EIR expression or EIR blocks */
export type EirHybridNode = HybridNode<EirExpr, EirBlock>;

/** LIR hybrid node: typically block-based but can reference expr nodes */
export type LirHybridNode = HybridNode;

//==============================================================================
// Type Guards for Hybrid Nodes
//==============================================================================

/** Check if a node is block-based (has blocks and entry) */
export function isBlockNode<E, B>(node: HybridNode<E, B>): node is BlockNode<B> {
	return "blocks" in node && "entry" in node && Array.isArray(node.blocks);
}

/** Check if a node is expression-based (has expr) */
export function isExprNode<E, B>(node: HybridNode<E, B>): node is ExprNode<E> {
	return "expr" in node && !("blocks" in node);
}

//==============================================================================
// LIR Document
//==============================================================================

/** LIR document - uses unified nodes/result structure */
export interface LIRDocument {
	version: string;
	capabilities?: string[];
	functionSigs?: FunctionSignature[];
	airDefs?: AIRDef[];
	nodes: LirHybridNode[];
	result: string;
}

//==============================================================================
// Related Types
//==============================================================================

import type { ValueEnv } from "./env.js";

//==============================================================================
// Value Hashing for Set/Map keys
//==============================================================================

export function hashValue(v: Value): string {
	switch (v.kind) {
	case "bool":
		return "b:" + String(v.value);
	case "int":
		return "i:" + String(v.value);
	case "float":
		return "f:" + String(v.value);
	case "string":
		return "s:" + v.value;
	case "option":
		return v.value === null ? "o:none" : "o:some:" + hashValue(v.value);
	default:
		// Complex types use object identity
		return "ref:" + Math.random().toString(36).slice(2);
	}
}

//==============================================================================
// Type Guards
//==============================================================================

export function isError(v: Value): v is ErrorVal {
	return v.kind === "error";
}

export function isClosure(v: Value): v is ClosureVal {
	return v.kind === "closure";
}

export function isRefCell(v: Value): v is RefCellVal {
	return v.kind === "refCell";
}

export function isVoid(v: Value): v is VoidVal {
	return v.kind === "void";
}

export function isPrimitiveType(t: Type): boolean {
	return (
		t.kind === "bool" ||
		t.kind === "int" ||
		t.kind === "float" ||
		t.kind === "string" ||
		t.kind === "void"
	);
}

//==============================================================================
// Type Equality
//==============================================================================

export function typeEqual(a: Type, b: Type): boolean {
	if (a.kind !== b.kind) return false;

	switch (a.kind) {
	case "bool":
	case "int":
	case "float":
	case "string":
	case "void":
		return true;
	case "set":
	case "list":
	case "option":
	case "ref":
		return typeEqual(a.of, (b as SetType | ListType | OptionType | RefType).of);
	case "map":
		return (
			typeEqual(a.key, (b as MapType).key) &&
				typeEqual(a.value, (b as MapType).value)
		);
	case "opaque":
		return a.name === (b as OpaqueType).name;
	case "fn": {
		const fnB = b as FnType;
		if (a.params.length !== fnB.params.length) return false;
		if (!a.params.every((p, i) => typeEqual(p, fnB.params[i]!))) {
			return false;
		}
		return typeEqual(a.returns, fnB.returns);
	}
	}
}

//==============================================================================
// Value Constructors
//==============================================================================

export const boolVal = (value: boolean): BoolVal => ({ kind: "bool", value });
export const intVal = (value: number): IntVal => ({ kind: "int", value });
export const floatVal = (value: number): FloatVal => ({ kind: "float", value });
export const stringVal = (value: string): StringVal => ({
	kind: "string",
	value,
});
export const listVal = (value: Value[]): ListVal => ({ kind: "list", value });
export const setVal = (value: Set<string>): SetVal => ({ kind: "set", value });
export const mapVal = (value: Map<string, Value>): MapVal => ({
	kind: "map",
	value,
});
export const optionVal = (value: Value | null): OptionVal => ({
	kind: "option",
	value,
});
export const opaqueVal = (name: string, value: unknown): OpaqueVal => ({
	kind: "opaque",
	name,
	value,
});
export const closureVal = (
	params: string[],
	body: Expr,
	env: ValueEnv,
): ClosureVal => ({ kind: "closure", params, body, env });
export const errorVal = (
	code: string,
	message?: string,
	meta?: Map<string, Value>,
): ErrorVal => {
	const result: ErrorVal = { kind: "error", code };
	if (message !== undefined) result.message = message;
	if (meta !== undefined) result.meta = meta;
	return result;
};

// EIR value constructors
export const voidVal = (): VoidVal => ({ kind: "void" });
export const refCellVal = (value: Value): RefCellVal => ({
	kind: "refCell",
	value,
});

//==============================================================================
// Type Constructors
//==============================================================================

export const boolType: BoolType = { kind: "bool" };
export const intType: IntType = { kind: "int" };
export const floatType: FloatType = { kind: "float" };
export const stringType: StringType = { kind: "string" };
export const setType = (of: Type): SetType => ({ kind: "set", of });
export const listType = (of: Type): ListType => ({ kind: "list", of });
export const mapType = (key: Type, value: Type): MapType => ({
	kind: "map",
	key,
	value,
});
export const optionType = (of: Type): OptionType => ({ kind: "option", of });
export const opaqueType = (name: string): OpaqueType => ({
	kind: "opaque",
	name,
});
export const fnType = (params: Type[], returns: Type): FnType => ({
	kind: "fn",
	params,
	returns,
});

// EIR type constructors
export const voidType: VoidType = { kind: "void" };
export const refType = (of: Type): RefType => ({ kind: "ref", of });
