// CAIRS Effect System
// Effect registry and built-in effects for EIR

import type { Type, Value } from "./types.js";
import { intType, stringType, voidType, intVal, stringVal } from "./types.js";

//==============================================================================
// Effect Operation Signature
//==============================================================================

export interface EffectOp {
	name: string;
	params: Type[];
	returns: Type;
	pure: boolean;
	// Effect operations return their result directly
	// Side effects are tracked in the EvalState
	fn: (...args: Value[]) => Value;
}

//==============================================================================
// Effect Registry
//==============================================================================

export type EffectRegistry = Map<string, EffectOp>;

/**
 * Look up an effect operation by name
 */
export function lookupEffect(
	registry: EffectRegistry,
	name: string,
): EffectOp | undefined {
	return registry.get(name);
}

/**
 * Register an effect operation
 */
export function registerEffect(
	registry: EffectRegistry,
	op: EffectOp,
): EffectRegistry {
	const newRegistry = new Map(registry);
	newRegistry.set(op.name, op);
	return newRegistry;
}

/**
 * Create an empty effect registry
 */
export function emptyEffectRegistry(): EffectRegistry {
	return new Map();
}

//==============================================================================
// Built-in Effect Operations
//==============================================================================

/**
 * IO effects - print, read, etc.
 * These effects store their actions in the EvalState effects array
 * for the host runtime to handle
 */
export const ioEffects: EffectOp[] = [
	{
		name: "print",
		params: [stringType],
		returns: voidType,
		pure: false,
		fn: (..._args: Value[]) => ({ kind: "void" }),
	},
	{
		name: "printInt",
		params: [intType],
		returns: voidType,
		pure: false,
		fn: (..._args: Value[]) => ({ kind: "void" }),
	},
	{
		name: "readLine",
		params: [],
		returns: stringType,
		pure: false,
		fn: (..._args: Value[]) => stringVal(""), // runner supplies actual value
	},
	{
		name: "readInt",
		params: [],
		returns: intType,
		pure: false,
		fn: (..._args: Value[]) => intVal(0), // runner supplies actual value
	},
];

/**
 * State effects - get/set mutable state
 */
export const stateEffects: EffectOp[] = [
	{
		name: "getState",
		params: [],
		returns: stringType,
		pure: false,
		fn: (..._args: Value[]) => {
			// Return a mock state value
			return { kind: "string", value: "mock-state" };
		},
	},
	{
		name: "setState",
		params: [stringType],
		returns: voidType,
		pure: false,
		fn: (..._args: Value[]) => {
			// In a real implementation, this would update state
			return { kind: "void" };
		},
	},
];

/**
 * Create a default effect registry with all built-in effects
 */
export function createDefaultEffectRegistry(): EffectRegistry {
	let registry = emptyEffectRegistry();
	for (const op of [...ioEffects, ...stateEffects]) {
		registry = registerEffect(registry, op);
	}
	return registry;
}

/**
 * Default registry instance
 */
export const defaultEffectRegistry = createDefaultEffectRegistry();

/**
 * Create an effect registry with queue-backed input effects
 * Used for interactive examples with deterministic input handling
 *
 * @param inputs - Array of input values (strings or numbers)
 * @returns EffectRegistry with readLine/readInt bound to the input queue
 */
export function createQueuedEffectRegistry(inputs: (string | number)[]): EffectRegistry {
	const inputQueue = [...inputs]; // Make a copy to avoid mutations

	let registry = emptyEffectRegistry();

	// Add print effect (unchanged)
	registry = registerEffect(registry, {
		name: "print",
		params: [stringType],
		returns: voidType,
		pure: false,
		fn: (..._args: Value[]) => ({ kind: "void" }),
	});

	// Add printInt effect (unchanged)
	registry = registerEffect(registry, {
		name: "printInt",
		params: [intType],
		returns: voidType,
		pure: false,
		fn: (..._args: Value[]) => ({ kind: "void" }),
	});

	// Add readLine effect with queue
	registry = registerEffect(registry, {
		name: "readLine",
		params: [],
		returns: stringType,
		pure: false,
		fn: (..._args: Value[]) => {
			if (inputQueue.length === 0) {
				return stringVal("");
			}
			const next = inputQueue.shift();
			return stringVal(String(next));
		},
	});

	// Add readInt effect with queue
	registry = registerEffect(registry, {
		name: "readInt",
		params: [],
		returns: intType,
		pure: false,
		fn: (..._args: Value[]) => {
			if (inputQueue.length === 0) {
				return intVal(0);
			}
			const next = inputQueue.shift();
			const num = typeof next === "number" ? next : parseInt(String(next), 10);
			return intVal(Number.isNaN(num) ? 0 : num);
		},
	});

	// Optionally add state effects
	for (const op of stateEffects) {
		registry = registerEffect(registry, op);
	}

	return registry;
}
