// SPIRAL Environment Types
// Type and Value environments for type checking and evaluation

import type { AIRDef, Type, Value } from "./types.js";

//==============================================================================
// Type Environment (Γ)
// Maps variable names to their types
//==============================================================================

export type TypeEnv = Map<string, Type>;

/**
 * Extend a type environment with a new binding.
 * Returns a new Map without modifying the original.
 */
export function extendTypeEnv(env: TypeEnv, name: string, type: Type): TypeEnv {
	const newEnv = new Map(env);
	newEnv.set(name, type);
	return newEnv;
}

/**
 * Extend a type environment with multiple bindings.
 */
export function extendTypeEnvMany(
	env: TypeEnv,
	bindings: [string, Type][],
): TypeEnv {
	const newEnv = new Map(env);
	for (const [name, type] of bindings) {
		newEnv.set(name, type);
	}
	return newEnv;
}

/**
 * Look up a type binding in the environment.
 */
export function lookupType(env: TypeEnv, name: string): Type | undefined {
	return env.get(name);
}

/**
 * Create an empty type environment.
 */
export function emptyTypeEnv(): TypeEnv {
	return new Map();
}

//==============================================================================
// Value Environment (ρ)
// Maps variable names to their runtime values
//==============================================================================

export type ValueEnv = Map<string, Value>;

/**
 * Extend a value environment with a new binding.
 * Returns a new Map without modifying the original.
 */
export function extendValueEnv(
	env: ValueEnv,
	name: string,
	value: Value,
): ValueEnv {
	const newEnv = new Map(env);
	newEnv.set(name, value);
	return newEnv;
}

/**
 * Extend a value environment with multiple bindings.
 */
export function extendValueEnvMany(
	env: ValueEnv,
	bindings: [string, Value][],
): ValueEnv {
	const newEnv = new Map(env);
	for (const [name, value] of bindings) {
		newEnv.set(name, value);
	}
	return newEnv;
}

/**
 * Look up a value binding in the environment.
 */
export function lookupValue(env: ValueEnv, name: string): Value | undefined {
	return env.get(name);
}

/**
 * Create an empty value environment.
 */
export function emptyValueEnv(): ValueEnv {
	return new Map();
}

//==============================================================================
// Definitions (Defs)
// Maps airDef qualified names to their definitions
//==============================================================================

export type Defs = Map<string, AIRDef>;

/**
 * Create a qualified key for an airDef.
 */
export function defKey(ns: string, name: string): string {
	return ns + ":" + name;
}

/**
 * Register an airDef in the definitions map.
 */
export function registerDef(defs: Defs, def: AIRDef): Defs {
	const newDefs = new Map(defs);
	newDefs.set(defKey(def.ns, def.name), def);
	return newDefs;
}

/**
 * Look up an airDef by qualified name.
 */
export function lookupDef(
	defs: Defs,
	ns: string,
	name: string,
): AIRDef | undefined {
	return defs.get(defKey(ns, name));
}

/**
 * Create an empty definitions map.
 */
export function emptyDefs(): Defs {
	return new Map();
}
