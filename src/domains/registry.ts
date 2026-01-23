// SPIRAL Operator Registry
// Central registry for all domain operators

import type { Type, Value } from "../types.js";

//==============================================================================
// Operator Interface
//==============================================================================

export interface Operator {
	ns: string;
	name: string;
	params: Type[];
	returns: Type;
	pure: boolean;
	fn: (...args: Value[]) => Value;
}

//==============================================================================
// Operator Registry Type
//==============================================================================

export type OperatorRegistry = Map<string, Operator>;

/**
 * Create a qualified key for an operator.
 */
export function opKey(ns: string, name: string): string {
	return ns + ":" + name;
}

/**
 * Register an operator in the registry.
 */
export function registerOperator(
	registry: OperatorRegistry,
	op: Operator,
): OperatorRegistry {
	const newRegistry = new Map(registry);
	newRegistry.set(opKey(op.ns, op.name), op);
	return newRegistry;
}

/**
 * Look up an operator by qualified name.
 */
export function lookupOperator(
	registry: OperatorRegistry,
	ns: string,
	name: string,
): Operator | undefined {
	return registry.get(opKey(ns, name));
}

/**
 * Create an empty registry.
 */
export function emptyRegistry(): OperatorRegistry {
	return new Map();
}

//==============================================================================
// Operator Builder
//==============================================================================

export class OperatorBuilder {
	private ns: string;
	private name: string;
	private params: Type[] = [];
	private returns!: Type;
	private pure = true;
	private fn!: (...args: Value[]) => Value;

	constructor(ns: string, name: string) {
		this.ns = ns;
		this.name = name;
	}

	setParams(...params: Type[]): this {
		this.params = params;
		return this;
	}

	setReturns(type: Type): this {
		this.returns = type;
		return this;
	}

	setPure(pure: boolean): this {
		this.pure = pure;
		return this;
	}

	setImpl(fn: (...args: Value[]) => Value): this {
		this.fn = fn;
		return this;
	}

	build(): Operator {
		return {
			ns: this.ns,
			name: this.name,
			params: this.params,
			returns: this.returns,
			pure: this.pure,
			fn: this.fn,
		};
	}
}

/**
 * Helper to create an operator definition.
 */
export function defineOperator(ns: string, name: string): OperatorBuilder {
	return new OperatorBuilder(ns, name);
}
