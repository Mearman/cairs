"""
SPIRAL LIR Evaluator
Executes Control Flow Graph (CFG) based LIR programs

This module provides CFG-based evaluation for LIR programs, supporting:
- LIRDocument and LirBlock evaluation
- Instructions: assign, op, phi, effect, call, assignRef
- Terminators: jump, branch, return, exit
- Runtime state with predecessor tracking for phi resolution
- Integration with OperatorRegistry and EffectRegistry
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Union, TYPE_CHECKING
from dataclasses import dataclass, field

if TYPE_CHECKING:
    from pyspiral.types import (
        Type, Value, Expr,
        LIRDocument, LirBlock, LirHybridNode, LirInstruction, LirTerminator,
        LirInsAssign, LirInsCall, LirInsOp, LirInsPhi, LirInsEffect, LirInsAssignRef,
        LirTermJump, LirTermBranch, LirTermReturn, LirTermExit,
        ExprNode, LirBlockNode,
        BoolType, IntType, FloatType, StringType, VoidType,
        BoolVal, IntVal, FloatVal, StringVal, VoidVal, ErrorVal,
        LitExpr, VarExpr,
    )
    from pyspiral.domains.registry import OperatorRegistry, Operator
    from pyspiral.env import ValueEnv

# Runtime imports to avoid circular imports
from pyspiral.types import (
    Value,
    bool_val, int_val, float_val, string_val, void_val, error_val,
    is_error, is_block_node, is_expr_node,
)
from pyspiral.errors import SPIRALError, ErrorCodes, exhaustive
from pyspiral.env import ValueEnv, empty_value_env, lookup_value, extend_value_env
from pyspiral.domains.registry import OperatorRegistry
from pyspiral.effects import EffectRegistry, lookup_effect


#==============================================================================
# LIR Evaluation Options
#==============================================================================

@dataclass
class LIREvalOptions:
    """Options for LIR evaluation"""
    max_steps: int = 10000
    trace: bool = False
    effects: Optional[EffectRegistry] = None


#==============================================================================
# LIR Runtime State
#==============================================================================

@dataclass
class LIRRuntimeState:
    """Runtime state for LIR CFG execution"""
    vars: Dict[str, Value]  # Variable bindings (SSA form)
    return_value: Optional[Value] = None
    effects: List[Dict[str, Any]] = field(default_factory=list)  # Track effect operations
    steps: int = 0
    max_steps: int = 10000
    predecessor: Optional[str] = None  # Track which block we came from (for phi resolution)


#==============================================================================
# LIR Evaluator
#==============================================================================

class LIREvaluator:
    """
    CFG-based LIR evaluator.

    Executes LIR programs by following control flow through basic blocks:
    - Start at entry block
    - Execute instructions sequentially
    - Execute terminator to determine next block
    - Continue until return/exit terminator
    """

    def __init__(
        self,
        registry: OperatorRegistry,
        effect_registry: EffectRegistry,
        options: Optional[LIREvalOptions] = None,
    ):
        """
        Initialize the LIR evaluator.

        Args:
            registry: Operator registry for operator lookups
            effect_registry: Effect registry for effect operations
            options: Evaluation options (optional)
        """
        self.registry = registry
        self.effect_registry = effect_registry
        self.options = options or LIREvalOptions()

    def evaluate(
        self,
        doc: LIRDocument,
        inputs: Optional[Dict[str, Value]] = None,
    ) -> Dict[str, Any]:
        """
        Evaluate an LIR document.

        Args:
            doc: LIR document to evaluate
            inputs: Optional initial variable bindings

        Returns:
            Dictionary with 'result' (Value) and 'state' (LIRRuntimeState)
        """
        # Initialize runtime state
        state = LIRRuntimeState(
            vars=inputs.copy() if inputs else {},
            max_steps=self.options.max_steps if self.options else 10000,
        )

        # Build node map for lookup
        node_map: Dict[str, LirHybridNode] = {}
        if doc.nodes:
            for node in doc.nodes:
                node_map[node.id] = node

        # Find the result node
        result_node = node_map.get(doc.result)
        if not result_node:
            return {
                "result": error_val(
                    ErrorCodes.VALIDATION_ERROR.value,
                    f"Result node not found: {doc.result}",
                ),
                "state": state,
            }

        # Evaluate expression node
        if is_expr_node(result_node):
            from pyspiral.evaluator import Evaluator
            from pyspiral.types import empty_defs

            # Create an expression evaluator for hybrid node support
            expr_evaluator = Evaluator(self.registry, empty_defs())

            # Evaluate the expression with current vars as environment
            value = expr_evaluator.evaluate(result_node.expr, state.vars)
            return {
                "result": value,
                "state": state,
            }

        # Evaluate block node's CFG
        if not is_block_node(result_node):
            return {
                "result": error_val(
                    ErrorCodes.DOMAIN_ERROR.value,
                    "Result node must be expression or block node",
                ),
                "state": state,
            }

        # Execute block node's CFG
        blocks = result_node.blocks
        entry = result_node.entry

        # Validate entry block exists
        entry_block = None
        for b in blocks:
            if b.id == entry:
                entry_block = b
                break

        if not entry_block:
            return {
                "result": error_val(
                    ErrorCodes.VALIDATION_ERROR.value,
                    f"Entry block not found: {entry}",
                ),
                "state": state,
            }

        # Execute CFG starting from entry
        current_block_id: Optional[str] = entry
        executed_blocks: set[str] = set()

        while current_block_id:
            # Set the predecessor for phi node resolution
            # (state.predecessor is already set from the previous iteration, or None for entry)

            # Check for infinite loops (basic detection)
            if current_block_id in executed_blocks:
                # Allow revisiting blocks in loops, but track for potential infinite loops
                state.steps += 1
                if state.steps > state.max_steps:
                    return {
                        "result": error_val(
                            ErrorCodes.NON_TERMINATION.value,
                            "LIR execution exceeded maximum steps",
                        ),
                        "state": state,
                    }
            else:
                executed_blocks.add(current_block_id)

            # Find current block
            current_block = None
            for b in blocks:
                if b.id == current_block_id:
                    current_block = b
                    break

            if not current_block:
                return {
                    "result": error_val(
                        ErrorCodes.VALIDATION_ERROR.value,
                        f"Block not found: {current_block_id}",
                    ),
                    "state": state,
                }

            # Execute instructions
            ins_result = self._execute_block(current_block, state)
            if ins_result:
                # Error during instruction execution
                return {"result": ins_result, "state": state}

            # Execute terminator to get next block
            term_result = self._execute_terminator(current_block.terminator, state)
            if not isinstance(term_result, str):
                # Return value or error
                return {"result": term_result, "state": state}

            # Update predecessor before moving to next block
            state.predecessor = current_block_id
            current_block_id = term_result

        # If we exit the loop without a return, return void
        return {
            "result": state.return_value if state.return_value is not None else void_val(),
            "state": state,
        }

    def _execute_block(self, block: LirBlock, state: LIRRuntimeState) -> Optional[Value]:
        """
        Execute all instructions in a basic block.

        Args:
            block: Basic block to execute
            state: Current runtime state

        Returns:
            None on success, error Value on failure
        """
        for ins in block.instructions:
            state.steps += 1
            if state.steps > state.max_steps:
                return error_val(
                    ErrorCodes.NON_TERMINATION.value,
                    "Block execution exceeded maximum steps",
                )

            result = self._execute_instruction(ins, state)
            if result:
                return result  # Error

        return None  # Success

    def _execute_instruction(
        self,
        ins: LirInstruction,
        state: LIRRuntimeState,
    ) -> Optional[Value]:
        """
        Execute a single LIR instruction.

        Args:
            ins: Instruction to execute
            state: Current runtime state

        Returns:
            None on success, error Value on failure
        """
        kind = ins.get("kind")

        if kind == "assign":
            return self._execute_assign(ins, state)

        elif kind == "call":
            return self._execute_call(ins, state)

        elif kind == "op":
            return self._execute_op(ins, state)

        elif kind == "phi":
            return self._execute_phi(ins, state)

        elif kind == "effect":
            return self._execute_effect(ins, state)

        elif kind == "assignRef":
            return self._execute_assign_ref(ins, state)

        else:
            # Exhaustive check - should never reach here
            exhaustive(ins)

    def _execute_assign(self, ins: LirInsAssign, state: LIRRuntimeState) -> Optional[Value]:
        """Execute assign instruction: target = value"""
        # Evaluate the expression
        value = self._evaluate_expr(ins["value"], state.vars)
        if is_error(value):
            return value

        state.vars[ins["target"]] = value
        return None

    def _execute_call(self, ins: LirInsCall, state: LIRRuntimeState) -> Optional[Value]:
        """Execute call instruction: target = callee(args)"""
        arg_values: List[Value] = []
        for arg_id in ins["args"]:
            arg_value = state.vars.get(arg_id)
            if not arg_value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Argument not found: {arg_id}",
                )
            if is_error(arg_value):
                return arg_value
            arg_values.append(arg_value)

        # For now, calls are not fully implemented (would require function definitions)
        # Store the result as an error indicating not implemented
        state.vars[ins["target"]] = error_val(
            ErrorCodes.DOMAIN_ERROR.value,
            "Call not yet implemented in LIR",
        )
        return None

    def _execute_op(self, ins: LirInsOp, state: LIRRuntimeState) -> Optional[Value]:
        """Execute op instruction: target = ns:name(args)"""
        arg_values: List[Value] = []
        for arg_id in ins["args"]:
            arg_value = state.vars.get(arg_id)
            if not arg_value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Argument not found: {arg_id}",
                )
            if is_error(arg_value):
                return arg_value
            arg_values.append(arg_value)

        # Look up operator
        op = self.registry.lookup(ins["ns"], ins["name"])
        if not op:
            return error_val(
                ErrorCodes.UNKNOWN_OPERATOR.value,
                f"Unknown operator: {ins['ns']}:{ins['name']}",
            )

        # Check arity
        if len(op.params) != len(arg_values):
            return error_val(
                ErrorCodes.ARITY_ERROR.value,
                f"Operator {ins['ns']}:{ins['name']} expects {len(op.params)} args, got {len(arg_values)}",
            )

        try:
            result = op.impl(*arg_values)
            state.vars[ins["target"]] = result
            return None
        except SPIRALError as e:
            return e.to_value()
        except Exception as e:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, str(e))

    def _execute_phi(self, ins: LirInsPhi, state: LIRRuntimeState) -> Optional[Value]:
        """
        Execute phi instruction: target = phi(sources)

        Phi nodes merge values from different control flow predecessors.
        We select the value from the source whose block matches our predecessor.
        """
        phi_value: Optional[Value] = None

        # First, try to find a source matching the predecessor block
        if state.predecessor:
            for source in ins["sources"]:
                if source.get("block") == state.predecessor:
                    value = state.vars.get(source["id"])
                    if value and not is_error(value):
                        phi_value = value
                        break

        # Fallback: when no predecessor match, find which source's id variable exists
        if not phi_value:
            for source in ins["sources"]:
                value = state.vars.get(source["id"])
                if value and not is_error(value):
                    phi_value = value
                    break

        if not phi_value:
            return error_val(
                ErrorCodes.DOMAIN_ERROR.value,
                f"Phi node has no valid sources: {ins['target']}",
            )

        state.vars[ins["target"]] = phi_value
        return None

    def _execute_effect(self, ins: LirInsEffect, state: LIRRuntimeState) -> Optional[Value]:
        """Execute effect instruction: target = op(args)"""
        effect_op = lookup_effect(self.effect_registry, ins["op"])
        if not effect_op:
            return error_val(
                ErrorCodes.UNKNOWN_OPERATOR.value,
                f"Unknown effect operation: {ins['op']}",
            )

        arg_values: List[Value] = []
        for arg_id in ins["args"]:
            arg_value = state.vars.get(arg_id)
            if not arg_value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Argument not found: {arg_id}",
                )
            if is_error(arg_value):
                return arg_value
            arg_values.append(arg_value)

        # Check arity
        if len(effect_op.params) != len(arg_values):
            return error_val(
                ErrorCodes.ARITY_ERROR.value,
                f"Effect {ins['op']} expects {len(effect_op.params)} args, got {len(arg_values)}",
            )

        # Record effect
        state.effects.append({"op": ins["op"], "args": arg_values})

        try:
            result = effect_op.fn(*arg_values)
            state.vars[ins["target"]] = result
            return None
        except SPIRALError as e:
            return e.to_value()
        except Exception as e:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, str(e))

    def _execute_assign_ref(self, ins: LirInsAssignRef, state: LIRRuntimeState) -> Optional[Value]:
        """Execute assignRef instruction: target ref cell = value"""
        value = state.vars.get(ins["value"])
        if not value:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER.value,
                f"Value not found: {ins['value']}",
            )
        if is_error(value):
            return value

        # Store in ref cell (using a special naming convention)
        ref_cell_id = ins["target"] + "_ref"
        state.vars[ref_cell_id] = value
        return None

    def _execute_terminator(
        self,
        term: LirTerminator,
        state: LIRRuntimeState,
    ) -> Union[str, Value]:
        """
        Execute a terminator to determine the next block.

        Args:
            term: Terminator to execute
            state: Current runtime state

        Returns:
            Next block id (str) for jump/branch, or Value for return/exit
        """
        kind = term.get("kind")

        if kind == "jump":
            # LirTermJump: unconditional jump to block
            return term["to"]

        elif kind == "branch":
            # LirTermBranch: conditional branch
            cond_value = state.vars.get(term["cond"])
            if not cond_value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Condition variable not found: {term['cond']}",
                )

            if is_error(cond_value):
                return cond_value

            if cond_value.get("kind") != "bool":
                return error_val(
                    ErrorCodes.TYPE_ERROR.value,
                    f"Branch condition must be bool, got: {cond_value.get('kind')}",
                )

            return term["then_branch"] if cond_value["value"] else term["else_branch"]

        elif kind == "return":
            # LirTermReturn: return value
            if term.get("value"):
                return_value = state.vars.get(term["value"])
                if not return_value:
                    return error_val(
                        ErrorCodes.UNBOUND_IDENTIFIER.value,
                        f"Return value not found: {term['value']}",
                    )
                state.return_value = return_value
                return return_value
            return void_val()

        elif kind == "exit":
            # LirTermExit: exit with optional code
            if term.get("code"):
                code_value = state.vars.get(term["code"])
                if code_value:
                    return code_value
            return void_val()

        else:
            # Exhaustive check - should never reach here
            exhaustive(term)

    def _evaluate_expr(self, expr: Expr, env: Dict[str, Value]) -> Value:
        """
        Evaluate a simple CIR expression (for LIR assign instruction).
        Only supports literals and variables for now.

        Args:
            expr: Expression to evaluate
            env: Variable environment

        Returns:
            Result value
        """
        kind = expr.get("kind")

        if kind == "lit":
            # For literals, return the value based on type
            t = expr.get("type_annotation", {})
            v = expr.get("value")
            t_kind = t.get("kind") if isinstance(t, dict) else None

            if t_kind == "bool":
                return bool_val(bool(v))
            elif t_kind == "int":
                return int_val(int(v))
            elif t_kind == "float":
                return float_val(float(v))
            elif t_kind == "string":
                return string_val(str(v))
            elif t_kind == "void":
                return void_val()
            else:
                return error_val(
                    ErrorCodes.TYPE_ERROR.value,
                    "Complex literals not yet supported in LIR",
                )

        elif kind == "var":
            value = env.get(expr["name"])
            if not value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Unbound identifier: {expr['name']}",
                )
            return value

        else:
            return error_val(
                ErrorCodes.DOMAIN_ERROR.value,
                "Complex expressions not yet supported in LIR",
            )


#==============================================================================
# Convenience Functions
#==============================================================================

def evaluate_lir(
    doc: LIRDocument,
    registry: OperatorRegistry,
    effect_registry: EffectRegistry,
    inputs: Optional[Dict[str, Value]] = None,
    options: Optional[LIREvalOptions] = None,
) -> Dict[str, Any]:
    """
    Evaluate an LIR document with CFG-based execution.

    This is a convenience function that creates an LIREvaluator and runs it.

    Args:
        doc: LIR document to evaluate
        registry: Operator registry for operator lookups
        effect_registry: Effect registry for effect operations
        inputs: Optional initial variable bindings
        options: Evaluation options (optional)

    Returns:
        Dictionary with 'result' (Value) and 'state' (LIRRuntimeState)
    """
    evaluator = LIREvaluator(registry, effect_registry, options)
    return evaluator.evaluate(doc, inputs)


def create_lir_eval_state(
    inputs: Optional[Dict[str, Value]] = None,
    max_steps: int = 10000,
) -> LIRRuntimeState:
    """
    Create an initial LIR runtime state.

    Args:
        inputs: Optional initial variable bindings
        max_steps: Maximum execution steps (default 10000)

    Returns:
        New LIRRuntimeState instance
    """
    return LIRRuntimeState(
        vars=inputs.copy() if inputs else {},
        max_steps=max_steps,
    )
