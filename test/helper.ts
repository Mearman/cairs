// CAIRS Test Helper
// Provides utilities for writing tests with relaxed type checking

import type { AIRDocument, CIRDocument, Expr, Node } from "../src/types.js";

/**
 * Create a test document from a loosely-typed object.
 * This allows test fixtures to use plain object syntax without
 * strict type annotations while maintaining type safety in production code.
 */
export function createTestDocument(doc: any): AIRDocument {
	return doc as AIRDocument;
}

/**
 * Create a CIR test document from a loosely-typed object.
 */
export function createCIRTestDocument(doc: any): CIRDocument {
	return doc as CIRDocument;
}

/**
 * Create a test node from a loosely-typed object.
 */
export function createTestNode(node: any): Node {
	return node as Node;
}

/**
 * Create a test expression from a loosely-typed object.
 */
export function createTestExpr(expr: any): Expr {
	return expr as Expr;
}
