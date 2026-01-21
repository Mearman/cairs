// CAIRS Effect System
// Effect registry and built-in effects for EIR

import type { Type, Value } from "./types.js";
import { intType, stringType, voidType } from "./types.js";

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
		fn: (..._args: Value[]) => {
			// Return void - the actual printing is handled by the runtime
			// based on the effects recorded in EvalState
			return { kind: "void" };
		},
	},
	{
		name: "printInt",
		params: [intType],
		returns: voidType,
		pure: false,
		fn: (..._args: Value[]) => {
			return { kind: "void" };
		},
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
