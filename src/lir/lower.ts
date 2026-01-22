// CAIRS EIR to LIR Lowering
// Converts expression-based EIR to CFG-based LIR

import { CAIRSError, ErrorCodes } from "../errors.js";
import type {
	EIRDocument,
	EirExpr,
	EirHybridNode,
	Expr,
	LIRDocument,
	LirBlock,
	LirInstruction,
} from "../types.js";
import { isExprNode } from "../types.js";

//==============================================================================
// Lowering Context
//==============================================================================

interface LoweringContext {
  blocks: LirBlock[];
  nextBlockId: number;
  nodeMap: Map<string, EirHybridNode>;
}

/**
 * Create a fresh block id.
 */
function freshBlock(ctx: LoweringContext): string {
	const id = "bb" + String(ctx.nextBlockId);
	ctx.nextBlockId++;
	return id;
}

/**
 * Add a block to the context.
 */
function addBlock(ctx: LoweringContext, block: LirBlock): void {
	ctx.blocks.push(block);
}

//==============================================================================
// Main Lowering Function
//==============================================================================

/**
 * Lower an EIR document to LIR (CFG form).
 *
 * Conversion strategy:
 * - Each EIR expression becomes one or more LIR blocks
 * - seq expressions: chain blocks sequentially
 * - if expressions: create branch with then/else blocks
 * - while expressions: create backward jump for loop
 * - for expressions: create init block, loop header, body, update
 * - assign expressions: assign instruction
 * - effect expressions: effect instruction
 */
export function lowerEIRtoLIR(eir: EIRDocument): LIRDocument {
	const ctx: LoweringContext = {
		blocks: [],
		nextBlockId: 0,
		nodeMap: new Map(),
	};

	// Build node map for lookup (only expr nodes can be lowered)
	for (const node of eir.nodes) {
		ctx.nodeMap.set(node.id, node);
	}

	// Lower the result node
	const resultNode = ctx.nodeMap.get(eir.result);
	if (!resultNode) {
		throw new CAIRSError(
			ErrorCodes.ValidationError,
			"Result node not found: " + eir.result,
		);
	}

	const entryId = freshBlock(ctx);
	lowerNode(resultNode, entryId, ctx, null);

	// If the result block wasn't added (e.g., for simple expressions), add a simple return block
	if (ctx.blocks.length === 0 || !ctx.blocks.some((b) => b.id === entryId)) {
		addBlock(ctx, {
			id: entryId,
			instructions: [],
			terminator: { kind: "return", value: eir.result },
		});
	}

	// Ensure we have a return terminator in the final block
	ensureReturnTerminator(ctx);

	// Build LIR document with a single block node containing all CFG blocks
	const mainBlockNode = {
		id: "main",
		blocks: ctx.blocks,
		entry: entryId,
	};

	const lirDoc: LIRDocument = {
		version: eir.version,
		nodes: [mainBlockNode],
		result: "main",
	};
	if (eir.capabilities) {
		lirDoc.capabilities = eir.capabilities;
	}
	return lirDoc;
}

/**
 * Ensure all blocks have proper terminators.
 */
function ensureReturnTerminator(ctx: LoweringContext): void {
	for (const block of ctx.blocks) {
		if (!block.terminator || block.terminator.kind === "jump") {
			const jumpTo = block.terminator?.kind === "jump" ? block.terminator.to : null;
			if (!jumpTo) {
				// Add return terminator if missing
				block.terminator = { kind: "return" };
			}
		}
	}
}

//==============================================================================
// Node Lowering
//==============================================================================

interface BlockResult {
  entry: string;
  exit: string;
}

/**
 * Lower a single node to one or more blocks.
 * Returns the entry and exit block ids.
 */
function lowerNode(
	node: EirHybridNode,
	currentBlock: string,
	ctx: LoweringContext,
	nextBlock: string | null,
): BlockResult {
	// Skip block nodes - they're already in CFG form
	if (!isExprNode(node)) {
		// Block nodes pass through - their blocks are already LIR-like
		return { entry: currentBlock, exit: currentBlock };
	}

	const expr = node.expr;

	// Check for EIR-specific expressions
	const kind = expr.kind as string;
	const EIR_KINDS = ["seq", "assign", "while", "for", "iter", "effect", "refCell", "deref"];

	if (EIR_KINDS.includes(kind)) {
		return lowerEirExpr(expr as unknown as EirExpr, node.id, currentBlock, ctx, nextBlock);
	}

	// For CIR expressions, create a simple assignment block
	// The kind check above ensures expr is actually a CIR Expr, not EIR-specific
	return lowerCirExpr(expr as Expr, node.id, currentBlock, ctx, nextBlock);
}

/**
 * Lower a CIR expression (non-EIR).
 */
function lowerCirExpr(
	expr: Expr,
	nodeId: string,
	currentBlock: string,
	ctx: LoweringContext,
	nextBlock: string | null,
): BlockResult {
	const instructions: LirInstruction[] = [];

	switch (expr.kind) {
	case "lit":
		// Literals don't need instructions - they're referenced directly
		break;

	case "var":
		// Variables are referenced directly by name
		break;

	case "ref":
		// Create an assign from the referenced node
		instructions.push({
			kind: "assign",
			target: nodeId,
			value: { kind: "var", name: expr.id },
		});
		break;

	case "call": {
		// Operator call becomes op instruction
		instructions.push({
			kind: "op",
			target: nodeId,
			ns: expr.ns,
			name: expr.name,
			args: expr.args,
		});
		break;
	}

	case "if": {
		// Conditional branch
		const thenId = freshBlock(ctx);
		const elseId = freshBlock(ctx);
		const mergeId = nextBlock ?? freshBlock(ctx);

		// Create current block with branch terminator
		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: expr.cond,
				then: thenId,
				else: elseId,
			},
		});

		// Lower then branch
		const thenNode = ctx.nodeMap.get(expr.then);
		if (thenNode) {
			lowerNode(thenNode, thenId, ctx, mergeId);
		}

		// Lower else branch
		const elseNode = ctx.nodeMap.get(expr.else);
		if (elseNode) {
			lowerNode(elseNode, elseId, ctx, mergeId);
		}

		// Create merge block (if needed)
		if (!nextBlock) {
			addBlock(ctx, {
				id: mergeId,
				instructions: [],
				terminator: { kind: "jump", to: mergeId },
			});
		}

		return { entry: currentBlock, exit: mergeId };
	}

	case "let": {
		// Let binding: assign value, then use in body
		instructions.push({
			kind: "assign",
			target: nodeId,
			value: { kind: "var", name: expr.value },
		});

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: { kind: "jump", to: expr.body },
		});

		// Lower body
		const bodyNode = ctx.nodeMap.get(expr.body);
		if (bodyNode) {
			return lowerNode(bodyNode, expr.body, ctx, nextBlock);
		}

		return { entry: currentBlock, exit: currentBlock };
	}

	case "lambda":
	case "callExpr":
	case "fix":
	case "airRef":
	case "predicate":
		// Complex CIR expressions - placeholder
		break;

	default:
		break;
	}

	// Default: create simple block
	const terminator = nextBlock
		? { kind: "jump" as const, to: nextBlock }
		: { kind: "return" as const, value: nodeId };

	addBlock(ctx, {
		id: currentBlock,
		instructions,
		terminator,
	});

	return { entry: currentBlock, exit: currentBlock };
}

/**
 * Lower an EIR expression to CFG form.
 */
function lowerEirExpr(
	expr: EirExpr,
	nodeId: string,
	currentBlock: string,
	ctx: LoweringContext,
	nextBlock: string | null,
): BlockResult {
	const kind = expr.kind as string;

	switch (kind) {
	case "seq": {
		// seq(first, then): execute first, then then
		const e = expr as unknown as { first: string; then: string };

		// Lower first part
		const firstNode = ctx.nodeMap.get(e.first);
		if (!firstNode) {
			throw new CAIRSError(
				ErrorCodes.ValidationError,
				"First node not found: " + e.first,
			);
		}

		const midBlock = freshBlock(ctx);
		lowerNode(firstNode, currentBlock, ctx, midBlock);

		// Lower then part
		const thenNode = ctx.nodeMap.get(e.then);
		if (!thenNode) {
			throw new CAIRSError(
				ErrorCodes.ValidationError,
				"Then node not found: " + e.then,
			);
		}

		return lowerNode(thenNode, midBlock, ctx, nextBlock);
	}

	case "assign": {
		// assign(target, value): assign instruction
		const e = expr as unknown as { target: string; value: string };

		const instructions: LirInstruction[] = [
			{
				kind: "assign",
				target: e.target,
				value: { kind: "var", name: e.value },
			},
		];

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: nextBlock
				? { kind: "jump", to: nextBlock }
				: { kind: "return" },
		});

		return { entry: currentBlock, exit: currentBlock };
	}

	case "while": {
		// while(cond, body): loop with condition check
		const e = expr as unknown as { cond: string; body: string };

		const headerId = freshBlock(ctx);
		const bodyId = freshBlock(ctx);
		const exitId = nextBlock ?? freshBlock(ctx);

		// Current block jumps to header
		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: { kind: "jump", to: headerId },
		});

		// Header block: check condition, branch to body or exit
		addBlock(ctx, {
			id: headerId,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: e.cond,
				then: bodyId,
				else: exitId,
			},
		});

		// Body block: execute body, jump back to header
		const bodyNode = ctx.nodeMap.get(e.body);
		if (bodyNode) {
			lowerNode(bodyNode, bodyId, ctx, headerId);
			// Ensure body block jumps back to header
			const bodyBlock = ctx.blocks.find((b) => b.id === bodyId);
			if (bodyBlock && bodyBlock.terminator?.kind !== "jump") {
				bodyBlock.terminator = { kind: "jump", to: headerId };
			}
		} else {
			addBlock(ctx, {
				id: bodyId,
				instructions: [],
				terminator: { kind: "jump", to: headerId },
			});
		}

		// Create exit block if needed
		if (!nextBlock) {
			addBlock(ctx, {
				id: exitId,
				instructions: [],
				terminator: { kind: "return" },
			});
		}

		return { entry: currentBlock, exit: exitId };
	}

	case "for": {
		// for(var, init, cond, update, body): C-style for loop
		const e = expr as unknown as {
        var: string;
        init: string;
        cond: string;
        update: string;
        body: string;
      };

		const initId = currentBlock;
		const headerId = freshBlock(ctx);
		const bodyId = freshBlock(ctx);
		const updateId = freshBlock(ctx);
		const exitId = nextBlock ?? freshBlock(ctx);

		// Init block
		const initNode = ctx.nodeMap.get(e.init);
		if (initNode) {
			lowerNode(initNode, initId, ctx, headerId);
		} else {
			addBlock(ctx, {
				id: initId,
				instructions: [],
				terminator: { kind: "jump", to: headerId },
			});
		}

		// Header block: check condition
		addBlock(ctx, {
			id: headerId,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: e.cond,
				then: bodyId,
				else: exitId,
			},
		});

		// Body block
		const bodyNode = ctx.nodeMap.get(e.body);
		if (bodyNode) {
			lowerNode(bodyNode, bodyId, ctx, updateId);
		} else {
			addBlock(ctx, {
				id: bodyId,
				instructions: [],
				terminator: { kind: "jump", to: updateId },
			});
		}

		// Update block
		const updateNode = ctx.nodeMap.get(e.update);
		if (updateNode) {
			lowerNode(updateNode, updateId, ctx, headerId);
		} else {
			addBlock(ctx, {
				id: updateId,
				instructions: [],
				terminator: { kind: "jump", to: headerId },
			});
		}

		// Exit block
		if (!nextBlock) {
			addBlock(ctx, {
				id: exitId,
				instructions: [],
				terminator: { kind: "return" },
			});
		}

		return { entry: initId, exit: exitId };
	}

	case "iter": {
		// iter(var, iter, body): iterate over list/set
		const e = expr as unknown as { var: string; iter: string; body: string };

		// Simplified lowering: create a while-like structure
		// In a full implementation, this would use iterator protocol
		const headerId = freshBlock(ctx);
		const bodyId = freshBlock(ctx);
		const exitId = nextBlock ?? freshBlock(ctx);

		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: { kind: "jump", to: headerId },
		});

		// For simplicity, we create a basic structure
		// A full implementation would handle element extraction
		addBlock(ctx, {
			id: headerId,
			instructions: [],
			terminator: {
				kind: "branch",
				cond: e.iter, // Placeholder: should check if iterator has more elements
				then: bodyId,
				else: exitId,
			},
		});

		const bodyNode = ctx.nodeMap.get(e.body);
		if (bodyNode) {
			lowerNode(bodyNode, bodyId, ctx, headerId);
		}

		if (!nextBlock) {
			addBlock(ctx, {
				id: exitId,
				instructions: [],
				terminator: { kind: "return" },
			});
		}

		return { entry: currentBlock, exit: exitId };
	}

	case "effect": {
		// effect(op, args): effect instruction
		const e = expr as unknown as { op: string; args: string[] };

		const instructions: LirInstruction[] = [
			{
				kind: "effect",
				op: e.op,
				args: e.args,
			},
		];

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: nextBlock
				? { kind: "jump", to: nextBlock }
				: { kind: "return" },
		});

		return { entry: currentBlock, exit: currentBlock };
	}

	case "refCell":
	case "deref": {
		// Reference cell operations
		const e = expr as unknown as { target: string };

		const instructions: LirInstruction[] = [];
		if (kind === "deref") {
			instructions.push({
				kind: "assign",
				target: nodeId,
				value: { kind: "var", name: e.target + "_ref" },
			});
		}

		addBlock(ctx, {
			id: currentBlock,
			instructions,
			terminator: nextBlock
				? { kind: "jump", to: nextBlock }
				: { kind: "return" },
		});

		return { entry: currentBlock, exit: currentBlock };
	}

	default:
		// Unknown EIR expression
		addBlock(ctx, {
			id: currentBlock,
			instructions: [],
			terminator: { kind: "return" },
		});
		return { entry: currentBlock, exit: currentBlock };
	}
}
