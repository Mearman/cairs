// CAIRS CIR Substitution
// Capture-avoiding substitution for CIR expressions

import type { ValueEnv } from "../env.js";
import { exhaustive } from "../errors.js";
import type { Expr } from "../types.js";

//==============================================================================
// Fresh Name Generation
//==============================================================================

/**
 * Generate a fresh name that doesn't conflict with names in the given context.
 * Names are generated like "__cairs_0", "__cairs_1", etc.
 */
export function freshName(base: string, context: Set<string>): string {
	let candidate = base;
	let counter = 0;
	while (context.has(candidate)) {
		counter++;
		candidate = "__cairs_" + String(counter);
	}
	return candidate;
}

//==============================================================================
// Capture-Avoiding Substitution
//==============================================================================

/**
 * Perform capture-avoiding substitution: e[x := v]
 * Replace all free occurrences of x in e with value v.
 *
 * For value-level substitution (used in closures), we use the environment
 * instead of actual substitution. This function is provided for completeness.
 */
export function substitute(expr: Expr, varName: string, value: Expr): Expr {
	return substituteExpr(expr, varName, value, new Set());
}

function substituteExpr(
	expr: Expr,
	varName: string,
	value: Expr,
	boundVars: Set<string>,
): Expr {
	switch (expr.kind) {
		case "lit":
		case "ref":
			// These expressions don't contain variables
			return expr;

		case "var":
			// If this is the variable we're substituting, return the value
			if (expr.name === varName && !boundVars.has(varName)) {
				return value;
			}
			return expr;

		case "call":
			// Substitute in arguments (but call itself is a value reference)
			return { ...expr };

		case "if":
			return {
				...expr,
				// Branches are node refs, not expressions, so no substitution needed
			};

		case "let":
			// If the bound name is the one we're substituting, shadow it
			const newLetBoundVars = new Set(boundVars);
			newLetBoundVars.add(expr.name);
			return {
				...expr,
				// Value and body are node refs, not expressions
			};

		case "airRef":
			return { ...expr };

		case "predicate":
			return { ...expr };

		case "lambda":
			// Check if varName is captured by lambda parameters
			if (expr.params.includes(varName)) {
				// varName is bound by this lambda, so free occurrences inside are not the same
				return expr;
			}

			// Check if any of the lambda's parameters occur free in value
			const paramsSet = new Set(expr.params);
			const capturedInValue = collectFreeVars(value, new Set()).filter((v) =>
				paramsSet.has(v),
			);

			if (capturedInValue.length === 0) {
				// No capture, can substitute directly
				return {
					...expr,
					// Body is a node ref, not an expression
				};
			}

			// Capture would occur! Need to alpha-rename the lambda parameters
			const newParams: string[] = [];
			const paramRenaming = new Map<string, string>();

			for (const param of expr.params) {
				if (capturedInValue.includes(param)) {
					// This parameter would be captured, rename it
					const newName = freshName(
						param,
						new Set([...paramsSet, ...boundVars, varName]),
					);
					newParams.push(newName);
					paramRenaming.set(param, newName);
				} else {
					newParams.push(param);
				}
			}

			if (paramRenaming.size === 0) {
				return expr;
			}

			// Apply alpha renaming
			return alphaRenameExpr(expr, new Set(), paramRenaming);

		case "callExpr":
			return { ...expr };

		case "fix":
			return { ...expr };

		default:
			return exhaustive(expr);
	}
}

//==============================================================================
// Free Variable Collection
//==============================================================================

/**
 * Collect all free variables in an expression.
 * A variable is free if it is not bound by any enclosing lambda/let.
 */
export function collectFreeVars(expr: Expr, boundVars: Set<string>): string[] {
	switch (expr.kind) {
		case "lit":
		case "ref":
			return [];

		case "var":
			if (boundVars.has(expr.name)) {
				return [];
			}
			return [expr.name];

		case "call":
			// Arguments are node refs, not expressions
			return [];

		case "if":
			// Branches are node refs, not expressions
			return [];

		case "let":
			// The name is bound in the body
			const newBoundVars = new Set(boundVars);
			newBoundVars.add(expr.name);
			// Body is a node ref, not an expression
			return [];

		case "airRef":
			return [];

		case "predicate":
			return [];

		case "lambda":
			// Parameters are bound in the body
			const lambdaBoundVars = new Set(boundVars);
			for (const param of expr.params) {
				lambdaBoundVars.add(param);
			}
			// Body is a node ref, not an expression
			return [];

		case "callExpr":
			return [];

		case "fix":
			return [];

		default:
			return exhaustive(expr);
	}
}

//==============================================================================
// Alpha Renaming
//==============================================================================

/**
 * Rename variables in an expression.
 * oldVars and newVars must have the same length.
 */
export function alphaRename(
	expr: Expr,
	oldVars: string[],
	newVars: string[],
): Expr {
	if (oldVars.length !== newVars.length) {
		throw new Error(
			"alphaRename: oldVars and newVars must have the same length",
		);
	}

	const renaming = new Map<string, string>();
	for (let i = 0; i < oldVars.length; i++) {
		renaming.set(oldVars[i]!, newVars[i]!);
	}

	return alphaRenameExpr(expr, new Set(), renaming);
}

function alphaRenameExpr(
	expr: Expr,
	boundVars: Set<string>,
	renaming: Map<string, string>,
): Expr {
	switch (expr.kind) {
		case "lit":
		case "ref":
			return expr;

		case "var":
			if (renaming.has(expr.name) && !boundVars.has(expr.name)) {
				return { ...expr, name: renaming.get(expr.name)! };
			}
			return expr;

		case "call":
			return { ...expr };

		case "if":
			return { ...expr };

		case "let":
			return { ...expr };

		case "airRef":
			return { ...expr };

		case "predicate":
			return { ...expr };

		case "lambda": {
			// Check if any parameters are being renamed
			const newParams: string[] = [];
			const paramRenaming = new Map<string, string>();
			const newBoundVars = new Set(boundVars);

			for (const param of expr.params) {
				newBoundVars.add(param);
				if (renaming.has(param)) {
					const newName = freshName(renaming.get(param)!, newBoundVars);
					newParams.push(newName);
					paramRenaming.set(param, newName);
					newBoundVars.add(newName);
				} else {
					newParams.push(param);
				}
			}

			if (paramRenaming.size === 0) {
				return expr;
			}

			// Create updated renaming for the body
			const updatedRenaming = new Map(renaming);
			for (const [old, newP] of paramRenaming) {
				updatedRenaming.set(old, newP);
			}

			return {
				...expr,
				params: newParams,
			};
		}

		case "callExpr":
			return { ...expr };

		case "fix":
			return { ...expr };

		default:
			return exhaustive(expr);
	}
}

//==============================================================================
// Value-Level Substitution (Environment-based)
//==============================================================================

/**
 * Substitute values into an environment.
 * This is used when evaluating closures and airDefs.
 */
export function substituteEnv(
	env: ValueEnv,
	varName: string,
	value: unknown,
): ValueEnv {
	const newEnv = new Map(env);
	newEnv.set(varName, value as any); // Value type is imported from types
	return newEnv;
}
