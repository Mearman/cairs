// CAIRS LIR Evaluator
// Executes Control Flow Graph (CFG) based LIR programs

import { CAIRSError, ErrorCodes, exhaustive } from "../errors.js";
import {
	emptyValueEnv,
	extendValueEnv,
	lookupValue,
	type ValueEnv,
} from "../env.js";
import {
	lookupOperator,
	type OperatorRegistry,
} from "../domains/registry.js";
import { lookupEffect, type EffectRegistry } from "../effects.js";
import type {
	Expr,
	LIRDocument,
	LirBlock,
	LirInstruction,
	LirTerminator,
	Value,
} from "../types.js";
import { errorVal, intVal, voidVal } from "../types.js";

//==============================================================================
// LIR Evaluation Options
//==============================================================================

export interface LIREvalOptions {
  maxSteps?: number;
  trace?: boolean;
  effects?: EffectRegistry;
}

//==============================================================================
// LIR Runtime State
//==============================================================================

interface LIRRuntimeState {
  vars: ValueEnv; // Variable bindings (SSA form)
  returnValue?: Value;
  effects: { op: string; args: Value[] }[];
  steps: number;
  maxSteps: number;
  predecessor?: string; // Track which block we came from (for phi node resolution)
}

//==============================================================================
// LIR Evaluator
//==============================================================================

/**
 * Evaluate an LIR program (CFG-based execution).
 *
 * LIR execution follows control flow through basic blocks:
 * - Start at entry block
 * - Execute instructions sequentially
 * - Execute terminator to determine next block
 * - Continue until return/exit terminator
 */
export function evaluateLIR(
	doc: LIRDocument,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
	inputs?: ValueEnv,
	options?: LIREvalOptions,
): { result: Value; state: LIRRuntimeState } {
	const state: LIRRuntimeState = {
		vars: inputs ?? emptyValueEnv(),
		effects: [],
		steps: 0,
		maxSteps: options?.maxSteps ?? 10000,
	};

	// Validate entry block exists
	const entryBlock = doc.blocks.find((b) => b.id === doc.entry);
	if (!entryBlock) {
		return {
			result: errorVal(
				ErrorCodes.ValidationError,
				"Entry block not found: " + doc.entry,
			),
			state,
		};
	}

	// Execute CFG starting from entry
	let currentBlockId = doc.entry;
	const executedBlocks = new Set<string>();

	while (currentBlockId) {
		// Set the predecessor for phi node resolution
		// (state.predecessor is already set from the previous iteration, or undefined for entry)

		// Check for infinite loops (basic detection)
		if (executedBlocks.has(currentBlockId)) {
			// Allow revisiting blocks in loops, but track for potential infinite loops
			state.steps++;
			if (state.steps > state.maxSteps) {
				return {
					result: errorVal(ErrorCodes.NonTermination, "LIR execution exceeded maximum steps"),
					state,
				};
			}
		} else {
			executedBlocks.add(currentBlockId);
		}

		// Find current block
		const currentBlock = doc.blocks.find((b) => b.id === currentBlockId);
		if (!currentBlock) {
			return {
				result: errorVal(
					ErrorCodes.ValidationError,
					"Block not found: " + currentBlockId,
				),
				state,
			};
		}

		// Execute instructions
		const insResult = executeBlock(
			currentBlock,
			state,
			registry,
			effectRegistry,
		);
		if (insResult) {
			// Error during instruction execution
			return { result: insResult, state };
		}

		// Execute terminator to get next block
		const termResult = executeTerminator(
			currentBlock.terminator,
			state,
			registry,
			effectRegistry,
			doc,
		);
		if (typeof termResult === "object") {
			// Return value or error
			return { result: termResult, state };
		}
		// Update predecessor before moving to next block
		state.predecessor = currentBlockId;
		currentBlockId = termResult;
	}

	// If we exit the loop without a return, return void
	return {
		result: state.returnValue ?? voidVal(),
		state,
	};
}

/**
 * Execute all instructions in a basic block.
 * Returns undefined on success, or an error Value on failure.
 */
function executeBlock(
	block: LirBlock,
	state: LIRRuntimeState,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
): Value | undefined {
	for (const ins of block.instructions) {
		state.steps++;
		if (state.steps > state.maxSteps) {
			return errorVal(ErrorCodes.NonTermination, "Block execution exceeded maximum steps");
		}

		const result = executeInstruction(ins, state, registry, effectRegistry);
		if (result) {
			return result; // Error
		}
	}
	return undefined; // Success
}

/**
 * Execute a single LIR instruction.
 * Returns undefined on success, or an error Value on failure.
 */
function executeInstruction(
	ins: LirInstruction,
	state: LIRRuntimeState,
	registry: OperatorRegistry,
	effectRegistry: EffectRegistry,
): Value | undefined {
	switch (ins.kind) {
	case "assign": {
		// LirInsAssign: target = value (CIR expression)
		// For simplicity, we only handle literal and var expressions
		const value = evaluateExpr(ins.value, state.vars);
		if (value.kind === "error") {
			return value;
		}
		state.vars = extendValueEnv(state.vars, ins.target, value);
		return undefined;
	}

	case "call": {
		// LirInsCall: target = callee(args)
		const argValues: Value[] = [];
		for (const argId of ins.args) {
			const argValue = lookupValue(state.vars, argId);
			if (!argValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Argument not found: " + argId,
				);
			}
			if (argValue.kind === "error") {
				return argValue;
			}
			argValues.push(argValue);
		}

		// For now, calls are not fully implemented (would require function definitions)
		// Store the result as an error indicating not implemented
		state.vars = extendValueEnv(
			state.vars,
			ins.target,
			errorVal(ErrorCodes.DomainError, "Call not yet implemented in LIR"),
		);
		return undefined;
	}

	case "op": {
		// LirInsOp: target = ns:name(args)
		const argValues: Value[] = [];
		for (const argId of ins.args) {
			const argValue = lookupValue(state.vars, argId);
			if (!argValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Argument not found: " + argId,
				);
			}
			if (argValue.kind === "error") {
				return argValue;
			}
			argValues.push(argValue);
		}

		const op = lookupOperator(registry, ins.ns, ins.name);
		if (!op) {
			return errorVal(
				ErrorCodes.UnknownOperator,
				"Unknown operator: " + ins.ns + ":" + ins.name,
			);
		}

		if (op.params.length !== argValues.length) {
			return errorVal(
				ErrorCodes.ArityError,
				`Operator ${ins.ns}:${ins.name} expects ${op.params.length} args, got ${argValues.length}`,
			);
		}

		try {
			const result = op.fn(...argValues);
			state.vars = extendValueEnv(state.vars, ins.target, result);
			return undefined;
		} catch (e) {
			if (e instanceof CAIRSError) {
				return e.toValue();
			}
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}

	case "phi": {
		// LirInsPhi: target = phi(sources)
		// Phi nodes merge values from different control flow predecessors.
		// We select the value from the source whose block matches our predecessor.
		let phiValue: Value | undefined;

		// First, try to find a source matching the predecessor block
		if (state.predecessor) {
			for (const source of ins.sources) {
				if (source.block === state.predecessor) {
					const value = lookupValue(state.vars, source.id);
					if (value && value.kind !== "error") {
						phiValue = value;
						break;
					}
				}
			}
		}

		// Fallback: when no predecessor match, we need to find which source's id variable exists
		// This handles cases where the LIR file might have incomplete phi source information
		if (!phiValue) {
			// Try sources in order, but only use a source if its variable exists
			for (const source of ins.sources) {
				const value = lookupValue(state.vars, source.id);
				if (value && value.kind !== "error") {
					// Found a valid source - use it
					phiValue = value;
					break;
				}
			}
		}

		if (!phiValue) {
			return errorVal(
				ErrorCodes.DomainError,
				"Phi node has no valid sources: " + ins.target,
			);
		}

		state.vars = extendValueEnv(state.vars, ins.target, phiValue);
		return undefined;
	}

	case "effect": {
		// LirInsEffect: op(args)
		const effectOp = lookupEffect(effectRegistry, ins.op);
		if (!effectOp) {
			return errorVal(
				ErrorCodes.UnknownOperator,
				"Unknown effect operation: " + ins.op,
			);
		}

		const argValues: Value[] = [];
		for (const argId of ins.args) {
			const argValue = lookupValue(state.vars, argId);
			if (!argValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Argument not found: " + argId,
				);
			}
			if (argValue.kind === "error") {
				return argValue;
			}
			argValues.push(argValue);
		}

		if (effectOp.params.length !== argValues.length) {
			return errorVal(
				ErrorCodes.ArityError,
				`Effect ${ins.op} expects ${effectOp.params.length} args, got ${argValues.length}`,
			);
		}

		// Record effect
		state.effects.push({ op: ins.op, args: argValues });

		try {
			effectOp.fn(...argValues);
			return undefined;
		} catch (e) {
			if (e instanceof CAIRSError) {
				return e.toValue();
			}
			return errorVal(ErrorCodes.DomainError, String(e));
		}
	}

	case "assignRef": {
		// LirInsAssignRef: target ref cell = value
		const value = lookupValue(state.vars, ins.value);
		if (!value) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Value not found: " + ins.value,
			);
		}
		if (value.kind === "error") {
			return value;
		}

		// Store in ref cell (using a special naming convention)
		const refCellId = ins.target + "_ref";
		state.vars.set(refCellId, value);
		return undefined;
	}

	default:
		return exhaustive(ins);
	}
}

/**
 * Execute a terminator to determine the next block.
 * Returns the next block id, or a Value for return/exit.
 */
function executeTerminator(
	term: LirTerminator,
	state: LIRRuntimeState,
	_registry: OperatorRegistry,
	_effectRegistry: EffectRegistry,
	_doc: LIRDocument,
): string | Value {
	switch (term.kind) {
	case "jump": {
		// LirTermJump: unconditional jump to block
		return term.to;
	}

	case "branch": {
		// LirTermBranch: conditional branch
		const condValue = lookupValue(state.vars, term.cond);
		if (!condValue) {
			return errorVal(
				ErrorCodes.UnboundIdentifier,
				"Condition variable not found: " + term.cond,
			);
		}

		if (condValue.kind === "error") {
			return condValue;
		}

		if (condValue.kind !== "bool") {
			return errorVal(
				ErrorCodes.TypeError,
				`Branch condition must be bool, got: ${condValue.kind}`,
			);
		}

		return condValue.value ? term.then : term.else;
	}

	case "return": {
		// LirTermReturn: return value
		if (term.value) {
			const returnValue = lookupValue(state.vars, term.value);
			if (!returnValue) {
				return errorVal(
					ErrorCodes.UnboundIdentifier,
					"Return value not found: " + term.value,
				);
			}
			state.returnValue = returnValue;
			return returnValue;
		}
		return voidVal();
	}

	case "exit": {
		// LirTermExit: exit with optional code
		if (term.code) {
			const codeValue = lookupValue(state.vars, term.code);
			if (codeValue) {
				return codeValue;
			}
		}
		return voidVal();
	}

	default:
		return exhaustive(term);
	}
}

/**
 * Evaluate a simple CIR expression (for LIR assign instruction).
 * Only supports literals and variables for now.
 */
function evaluateExpr(expr: Expr, env: ValueEnv): Value {
	switch (expr.kind) {
	case "lit":
		// For literals, return the value based on type
		const t = expr.type;
		const v = expr.value;
		switch (t.kind) {
		case "bool":
			return { kind: "bool", value: Boolean(v) };
		case "int":
			return intVal(Number(v));
		case "float":
			return { kind: "float", value: Number(v) };
		case "string":
			return { kind: "string", value: String(v) };
		case "void":
			return voidVal();
		default:
			return errorVal(ErrorCodes.TypeError, "Complex literals not yet supported in LIR");
		}

	case "var": {
		const value = lookupValue(env, expr.name);
		if (!value) {
			return errorVal(ErrorCodes.UnboundIdentifier, "Unbound identifier: " + expr.name);
		}
		return value;
	}

	default:
		return errorVal(ErrorCodes.DomainError, "Complex expressions not yet supported in LIR");
	}
}
