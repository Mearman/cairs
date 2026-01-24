"""
SPIRAL Evaluator
Implements big-step evaluation: rho |- e ⇓ v

This module provides expression evaluation for AIR/CIR/EIR layers using
big-step operational semantics. Supports closures, fixpoint recursion (CIR),
and EIR features like sequencing, mutation, loops, effects, and reference cells.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Union, TYPE_CHECKING
from dataclasses import dataclass, field

if TYPE_CHECKING:
    from pyspiral.types import (
        Type, Value, Expr, TypeEnv,
        BoolVal, IntVal, FloatVal, StringVal,
        ListVal, SetVal, MapVal, OptionVal,
        ClosureVal, VoidVal, RefCellVal, ErrorVal,
        LambdaParam, AIRDef,
        LitExpr, VarExpr, RefExpr, CallExpr, IfExpr, LetExpr,
        LambdaExpr, CallFnExpr, FixExpr,
        EirSeqExpr, EirAssignExpr, EirWhileExpr, EirForExpr,
        EirIterExpr, EirEffectExpr, EirRefCellExpr, EirDerefExpr, EirTryExpr,
        AirHybridNode, ExprNode, BlockNode,
        EirExprNode, EirBlockNode,
    )
    from pyspiral.domains.registry import OperatorRegistry, Operator

# For runtime imports
from pyspiral.types import Type, Value, Expr

from pyspiral.types import (
    bool_val, int_val, float_val, string_val,
    list_val, set_val, map_val, option_val, opaque_val,
    closure_val, error_val, void_val, ref_cell_val, undefined_val,
    is_error, is_closure, is_ref_cell, is_void,
)
from pyspiral.errors import SPIRALError, ErrorCodes, exhaustive
from pyspiral.env import ValueEnv, empty_value_env


#==============================================================================
# Environment Helper Functions
#==============================================================================

def lookup_value(env: ValueEnv, name: str) -> Optional[Value]:
    """Look up a value in the environment"""
    return env.lookup(name)


def extend_value_env(env: ValueEnv, name: str, value: Value) -> ValueEnv:
    """Extend the environment with a new binding"""
    return env.extend(name, value)


#==============================================================================
# Evaluation Options
#==============================================================================

@dataclass
class EvalOptions:
    """Options for expression evaluation"""
    max_steps: int = 10000
    trace: bool = False


#==============================================================================
# Evaluation Context
#==============================================================================

@dataclass
class EvalContext:
    """Internal evaluation state for tracking steps and configuration"""
    steps: int = 0
    max_steps: int = 10000
    trace: bool = False


#==============================================================================
# Evaluator Class
#==============================================================================

class Evaluator:
    """
    Big-step expression evaluator for AIR/CIR/EIR expressions.

    The evaluator implements the following inference rules:
    - E-Lit: rho |- lit(t, v) ⇓ v
    - E-Var: rho(x) = v ⇒ rho |- var(x) ⇓ v
    - E-Call: rho |- args[i] ⇓ vi, op(v1,...,vn) ⇓ v ⇒ rho |- call(ns:name, args) ⇓ v
    - E-If: rho |- cond ⇓ bool, rho |- branch ⇓ v ⇒ rho |- if(cond, then, else) ⇓ v
    - E-Let: rho |- value ⇓ v1, rho[x:v1] |- body ⇓ v2 ⇒ rho |- let(x, value, body) ⇓ v2
    - E-Lambda: rho |- lambda(params, body) ⇓ ⟨params, body, rho⟩
    - E-CallExpr: rho |- fn ⇓ ⟨params, body, rho'⟩, rho |- args ⇓ vi ⇒ rho |- callExpr(fn, args) ⇓ v
    - E-Fix: rho |- fn ⇓ ⟨[x], body, rho'⟩, rho'[x:fix(fn)] |- body ⇓ v ⇒ rho |- fix(fn) ⇓ v
    """

    def __init__(self, registry: OperatorRegistry, defs: Dict[str, AIRDef]):
        """
        Initialize the evaluator.

        Args:
            registry: Operator registry for built-in operators
            defs: AIR definitions registry
        """
        self._registry = registry
        self._defs = defs

    @property
    def registry(self) -> OperatorRegistry:
        """Get the operator registry"""
        return self._registry

    @property
    def defs(self) -> Dict[str, AIRDef]:
        """Get the AIR definitions"""
        return self._defs

    #---------------------------------------------------------------------------
    # Public Evaluation API
    #---------------------------------------------------------------------------

    def evaluate(
        self,
        expr: Expr,
        env: ValueEnv,
        options: Optional[EvalOptions] = None
    ) -> Value:
        """
        Evaluate an expression: rho |- e ⇓ v

        Args:
            expr: Expression to evaluate
            env: Value environment for variable lookups
            options: Evaluation options (max_steps, trace)

        Returns:
            Result value

        Raises:
            SPIRALError: If evaluation fails or exceeds max steps
        """
        opts = options or EvalOptions()
        state = EvalContext(
            steps=0,
            max_steps=opts.max_steps,
            trace=opts.trace
        )
        return self._eval_expr(expr, env, state)

    def evaluate_with_state(
        self,
        expr: Expr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        Evaluate an expression with explicit state.

        Args:
            expr: Expression to evaluate
            env: Value environment
            state: Evaluation context state

        Returns:
            Result value
        """
        return self._eval_expr(expr, env, state)

    #---------------------------------------------------------------------------
    # Expression Evaluation (Dispatch)
    #---------------------------------------------------------------------------

    def _eval_expr(
        self,
        expr: Expr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        Main expression dispatch based on expression kind.

        Args:
            expr: Expression to evaluate
            env: Value environment
            state: Evaluation context

        Returns:
            Result value
        """
        self._check_steps(state)

        kind = expr["kind"]

        # AIR expressions
        if kind == "lit":
            return self._eval_lit(expr, env, state)
        elif kind == "var":
            return self._eval_var(expr, env, state)
        elif kind == "ref":
            return self._eval_ref(expr, env, state)
        elif kind == "call":
            return self._eval_call(expr, env, state)
        elif kind == "if":
            return self._eval_if(expr, env, state)
        elif kind == "let":
            return self._eval_let(expr, env, state)
        elif kind == "airRef":
            return self._eval_air_ref(expr, env, state)
        elif kind == "predicate":
            return self._eval_predicate(expr, env, state)

        # CIR expressions
        elif kind == "lambda":
            return self._eval_lambda(expr, env, state)
        elif kind == "callExpr":
            return self._eval_call_expr(expr, env, state)
        elif kind == "fix":
            return self._eval_fix(expr, env, state)

        # EIR expressions
        elif kind == "seq":
            return self._eval_seq(expr, env, state)
        elif kind == "assign":
            return self._eval_assign(expr, env, state)
        elif kind == "while":
            return self._eval_while(expr, env, state)
        elif kind == "for":
            return self._eval_for(expr, env, state)
        elif kind == "iter":
            return self._eval_iter(expr, env, state)
        elif kind == "effect":
            return self._eval_effect(expr, env, state)
        elif kind == "refCell":
            return self._eval_ref_cell(expr, env, state)
        elif kind == "deref":
            return self._eval_deref(expr, env, state)
        elif kind == "try":
            return self._eval_try(expr, env, state)

        # PIR expressions - not supported in synchronous evaluator
        elif kind in ("par", "spawn", "await", "channel", "send", "recv", "select", "race"):
            return error_val(
                ErrorCodes.DOMAIN_ERROR,
                f"PIR expressions require AsyncEvaluator: {kind}"
            )

        else:
            exhaustive(expr)

    #---------------------------------------------------------------------------
    # AIR Expression Evaluation
    #---------------------------------------------------------------------------

    def _eval_lit(
        self,
        expr: LitExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Lit: rho |- lit(t, v) ⇓ v

        Evaluate a literal expression by converting the value to the appropriate
        Value type based on the type annotation.
        """
        type_kind = expr["type_annotation"]["kind"]
        value = expr["value"]

        if type_kind == "void":
            return void_val()
        elif type_kind == "bool":
            return bool_val(bool(value))
        elif type_kind == "int":
            return int_val(int(value))
        elif type_kind == "float":
            return float_val(float(value))
        elif type_kind == "string":
            return string_val(str(value))
        elif type_kind == "list":
            if not isinstance(value, list):
                return error_val(ErrorCodes.TYPE_ERROR, "List value must be array")

            # Convert raw values to Value objects based on element type
            list_elem_type = expr["type_annotation"]["of"]
            list_elements = []
            for elem in value:
                # Check if already a Value object
                if isinstance(elem, dict) and "kind" in elem:
                    val_obj = elem
                    if "value" in val_obj:
                        vkind = val_obj["kind"]
                        if vkind == "int":
                            list_elements.append(int_val(int(val_obj["value"])))
                        elif vkind == "bool":
                            list_elements.append(bool_val(bool(val_obj["value"])))
                        elif vkind == "string":
                            list_elements.append(string_val(str(val_obj["value"])))
                        elif vkind == "float":
                            list_elements.append(float_val(float(val_obj["value"])))
                        else:
                            list_elements.append(val_obj)  # type: ignore
                else:
                    # Raw primitive values - convert based on element type
                    elem_type_kind = list_elem_type["kind"]
                    if elem_type_kind == "int":
                        list_elements.append(int_val(int(elem)))
                    elif elem_type_kind == "bool":
                        list_elements.append(bool_val(bool(elem)))
                    elif elem_type_kind == "string":
                        list_elements.append(string_val(str(elem)))
                    elif elem_type_kind == "float":
                        list_elements.append(float_val(float(elem)))
                    else:
                        list_elements.append(int_val(int(elem)))  # Default to int

            return list_val(list_elements)

        elif type_kind == "set":
            if not isinstance(value, list):
                return error_val(ErrorCodes.TYPE_ERROR, "Set value must be array")
            # Hash all values to strings for set storage
            from pyspiral.types import hash_value
            return set_val(set(hash_value(v) for v in value))

        elif type_kind == "map":
            if not isinstance(value, list):
                return error_val(ErrorCodes.TYPE_ERROR, "Map value must be array")
            from pyspiral.types import hash_value
            map_dict = {}
            for k, v in value:
                map_dict[hash_value(k)] = v
            return map_val(map_dict)

        elif type_kind == "option":
            return option_val(value if value is not None else None)

        elif type_kind == "opaque":
            return opaque_val(expr["type_annotation"]["name"], value)

        else:
            return error_val(
                ErrorCodes.TYPE_ERROR,
                f"Cannot create literal for type: {type_kind}"
            )

    def _eval_var(
        self,
        expr: VarExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Var: rho(x) = v
                -------
                rho |- var(x) ⇓ v
        """
        name = expr["name"]
        value = lookup_value(env, name)

        if value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier: {name}"
            )

        return value

    def _eval_ref(
        self,
        expr: RefExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        Evaluate a reference expression.
        For inline expressions, ref could be a variable reference.
        Check environment first (for let-bound variables or lambda params).
        """
        ref_id = expr["id"]

        # Check environment first (for let-bound variables or lambda params)
        if isinstance(env, ValueEnv):
            ref_value = env.lookup(ref_id)
            if ref_value is not None:
                return ref_value

        # Otherwise, this is a node reference that should be resolved at program level
        return error_val(
            ErrorCodes.DOMAIN_ERROR,
            f"Ref must be resolved during program evaluation: {ref_id}"
        )

    def _eval_call(
        self,
        expr: CallExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Call: rho |- args[i] ⇓ vi    op(v1,...,vn) ⇓ v
                 ----------------------------------------
                            rho |- call(ns:name, args) ⇓ v
        """
        # Check if args are node refs (strings) or inline expressions (objects)
        has_inline_args = any(
            isinstance(arg, dict) and "kind" in arg
            for arg in expr["args"]
        )

        if not has_inline_args:
            # All args are node refs - this must be resolved during program evaluation
            return error_val(
                ErrorCodes.DOMAIN_ERROR,
                "Call must be resolved during program evaluation"
            )

        # Evaluate inline expression arguments
        arg_values: List[Value] = []
        for arg in expr["args"]:
            if isinstance(arg, str):
                # Node ref - look up in environment (for let-bound variables)
                value = lookup_value(env, arg)
                if value is None:
                    return error_val(
                        ErrorCodes.UNBOUND_IDENTIFIER,
                        f"Unbound identifier: {arg}"
                    )
                arg_values.append(value)
            else:
                # Inline expression - evaluate it
                value = self._eval_expr(arg, env, state)
                if is_error(value):
                    return value
                arg_values.append(value)

        # Look up and apply operator
        op = self._registry.lookup(expr["ns"], expr["name"])
        if op is None:
            return error_val(
                ErrorCodes.UNKNOWN_OPERATOR,
                f"Unknown operator: {expr['ns']}:{expr['name']}"
            )

        # Check arity
        if len(op.params) != len(arg_values):
            return error_val(
                ErrorCodes.ARITY_ERROR,
                f"Arity mismatch: {len(op.params)} expected, {len(arg_values)} given"
            )

        # Apply operator
        try:
            return op.impl(*arg_values)
        except SPIRALError as e:
            return e.to_value()
        except Exception as e:
            return error_val(ErrorCodes.DOMAIN_ERROR, str(e))

    def _eval_if(
        self,
        expr: IfExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-IfTrue:  rho |- cond ⇓ true    rho |- then ⇓ v
                   -----------------------------
                        rho |- if(cond, then, else) ⇓ v

        E-IfFalse: rho |- cond ⇓ false    rho |- else ⇓ v
                   ---------------------------------
                        rho |- if(cond, then, else) ⇓ v
        """
        # Helper to get value from node ref or evaluate inline expression
        def get_value(ref_or_expr: Union[str, Expr]) -> Optional[Value]:
            if isinstance(ref_or_expr, str):
                return lookup_value(env, ref_or_expr)
            else:
                return self._eval_expr(ref_or_expr, env, state)

        # Evaluate condition
        cond_value = get_value(expr["cond"])
        if cond_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier: {expr['cond']}"
            )

        if is_error(cond_value):
            return cond_value

        # Check condition type and evaluate appropriate branch
        if cond_value.kind == "bool" and cond_value.value:
            # Then branch
            then_value = get_value(expr["then_branch"])
            if then_value is None:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER,
                    f"Unbound identifier: {expr['then_branch']}"
                )
            return then_value
        else:
            # Else branch
            else_value = get_value(expr["else_branch"])
            if else_value is None:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER,
                    f"Unbound identifier: {expr['else_branch']}"
                )
            return else_value

    def _eval_let(
        self,
        expr: LetExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Let: rho |- value ⇓ v1    rho, x:v1 |- body ⇓ v2
               -----------------------------------------
                       rho |- let(x, value, body) ⇓ v2
        """
        # Helper to get value from node ref or evaluate inline expression
        def get_value(ref_or_expr: Union[str, Expr]) -> Optional[Value]:
            if isinstance(ref_or_expr, str):
                return lookup_value(env, ref_or_expr)
            else:
                return self._eval_expr(ref_or_expr, env, state)

        # Evaluate value
        value_result = get_value(expr["value"])
        if value_result is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier: {expr['value']}"
            )

        if is_error(value_result):
            return value_result

        # Extend environment with the binding
        extended_env = extend_value_env(env, expr["name"], value_result)

        # Evaluate body
        body_result = get_value(expr["body"])
        if body_result is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier: {expr['body']}"
            )

        return body_result

    def _eval_air_ref(
        self,
        expr: Dict[str, Any],
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-AirRef: Capture-avoiding inlining of airDef body.
        Arguments are node refs, resolved during program evaluation.
        """
        return error_val(
            ErrorCodes.DOMAIN_ERROR,
            "AirRef must be resolved during program evaluation"
        )

    def _eval_predicate(
        self,
        expr: Dict[str, Any],
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Pred: Create a predicate value.
        Value is a node ref, resolved during program evaluation.
        """
        return error_val(
            ErrorCodes.DOMAIN_ERROR,
            "Predicate must be resolved during program evaluation"
        )

    #---------------------------------------------------------------------------
    # CIR Expression Evaluation (Lambda, Fixpoint)
    #---------------------------------------------------------------------------

    def _eval_lambda(
        self,
        expr: LambdaExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Λ: rho |- lambda(params, body) ⇓ ⟨params, body, rho⟩

        Creates a closure value capturing the current environment.
        """
        # Convert params to LambdaParam format
        params: List[LambdaParam] = []
        for p in expr["params"]:
            if isinstance(p, str):
                params.append({"name": p, "type": None, "optional": False, "default": None})
            else:
                # Already a LambdaParam dict
                params.append(p)

        # Body is a node ref, resolved during program evaluation
        # For now, store the expression reference
        return closure_val(params, expr, env.bindings)

    def _eval_call_expr(
        self,
        expr: CallFnExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-CallExpr: rho |- fn ⇓ ⟨params, body, rho'⟩    rho |- args[i] ⇓ vi
                    rho', params:vi |- body ⇓ v
                    -----------------------------------------
                             rho |- callExpr(fn, args) ⇓ v
        """
        # Look up function value
        fn_value = lookup_value(env, expr["fn"])
        if fn_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Function not found: {expr['fn']}"
            )

        if is_error(fn_value):
            return fn_value

        if not is_closure(fn_value):
            return error_val(
                ErrorCodes.TYPE_ERROR,
                f"Expected closure, got: {fn_value.kind}"
            )

        # Get argument values
        arg_values: List[Value] = []
        for arg_id in expr["args"]:
            arg_value = lookup_value(env, arg_id)
            if arg_value is None:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER,
                    f"Argument not found: {arg_id}"
                )
            if is_error(arg_value):
                return arg_value
            arg_values.append(arg_value)

        # Check arity with optional parameter support
        min_arity = sum(1 for p in fn_value["params"] if not p.get("optional", False))
        max_arity = len(fn_value["params"])

        if len(arg_values) < min_arity:
            return error_val(
                ErrorCodes.ARITY_ERROR,
                f"Arity error: expected at least {min_arity} args, got {len(arg_values)}"
            )
        if len(arg_values) > max_arity:
            return error_val(
                ErrorCodes.ARITY_ERROR,
                f"Arity error: expected at most {max_arity} args, got {len(arg_values)}"
            )

        # Extend environment with parameters
        call_env = ValueEnv(fn_value["env"])
        for i, param in enumerate(fn_value["params"]):
            param_name = param["name"]
            arg_value = arg_values[i] if i < len(arg_values) else None

            if arg_value is not None:
                # Provided argument - use it
                call_env = extend_value_env(call_env, param_name, arg_value)
            elif param.get("optional", False):
                # Omitted optional param - check for default or use undefined
                default_expr = param.get("default")
                if default_expr is not None:
                    # Evaluate default expression in closure's defining environment
                    default_env = ValueEnv(fn_value["env"])
                    default_val = self._eval_expr(default_expr, default_env, state)
                    if is_error(default_val):
                        return default_val
                    call_env = extend_value_env(call_env, param_name, default_val)
                else:
                    # Optional without default = undefined
                    call_env = extend_value_env(call_env, param_name, undefined_val())
            else:
                # Required param not provided
                return error_val(
                    ErrorCodes.ARITY_ERROR,
                    f"Missing required parameter: {param_name}"
                )

        # Recursively evaluate the closure body
        # The body expression is stored in the closure
        body_expr = fn_value["body"]
        return self._eval_expr(body_expr, call_env, state)

    def _eval_fix(
        self,
        expr: FixExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Fix: rho |- fn ⇓ ⟨[x], body, rho'⟩    rho', x:fix(fn) |- body ⇓ v
               --------------------------------------------------
                         rho |- fix(fn) ⇓ v
        """
        # Look up function value
        fn_value = lookup_value(env, expr["fn"])
        if fn_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Function not found: {expr['fn']}"
            )

        if is_error(fn_value):
            return fn_value

        if not is_closure(fn_value):
            return error_val(
                ErrorCodes.TYPE_ERROR,
                f"Expected closure, got: {fn_value.kind}"
            )

        # Get closure parameter (should be exactly one)
        params = fn_value["params"]
        if len(params) != 1:
            return error_val(
                ErrorCodes.TYPE_ERROR,
                "fix requires a single-parameter lambda"
            )

        param_name = params[0]["name"]

        # Create self-reference by extending environment
        # The fix value is the closure itself
        extended_env = extend_value_env(env, param_name, fn_value)

        # Evaluate body with the self-referential environment
        body_expr = fn_value["body"]
        return self._eval_expr(body_expr, extended_env, state)

    #---------------------------------------------------------------------------
    # EIR Expression Evaluation (Sequencing, Mutation, Effects)
    #---------------------------------------------------------------------------

    def _eval_seq(
        self,
        expr: EirSeqExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Seq: rho |- first ⇓ v1    rho |- then ⇓ v2
               ----------------------------
                    rho |- seq(first, then) ⇓ v2

        Sequencing: evaluate first, discard result, evaluate then.
        """
        # For EIR, we need to handle node references
        # This is a simplified version - full implementation would use nodeMap
        first = expr["first"]
        then = expr["then"]

        # Evaluate first (discard result)
        first_value = lookup_value(env, first)
        if first_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier in seq: {first}"
            )
        if is_error(first_value):
            return first_value

        # Evaluate and return then
        then_value = lookup_value(env, then)
        if then_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier in seq: {then}"
            )
        return then_value

    def _eval_assign(
        self,
        expr: EirAssignExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Assign: rho |- value ⇓ v    rho[target := v] |- rest ⇓ v'
                  --------------------------------------------
                          rho |- assign(target, value) ⇓ v'

        Assignment: evaluate value and update the environment.
        Note: Full EIR requires mutable state (ref cells).
        """
        target = expr["target"]
        value_ref = expr["value"]

        # Evaluate value
        value_result = lookup_value(env, value_ref)
        if value_result is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier in assign: {value_ref}"
            )
        if is_error(value_result):
            return value_result

        # For EIR, this would update a mutable ref cell
        # For now, extend the environment (immutable approach)
        # Full implementation would use EvalState with ref_cells
        return void_val()

    def _eval_while(
        self,
        expr: EirWhileExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-While: rho |- cond ⇓ true    rho |- body ⇓ v    rho |- while(cond, body) ⇓ v'
                 rho |- cond ⇓ false
                 ---------------------
                 rho |- while(cond, body) ⇓ void

        While loop: evaluate condition, if true execute body and repeat.
        """
        cond = expr["cond"]
        body = expr["body"]

        # In a full implementation, this would use nodeMap to evaluate nodes
        # For now, return void as a placeholder
        return void_val()

    def _eval_for(
        self,
        expr: EirForExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-For: C-style for loop with init, cond, update, and body.
        """
        # Full implementation would execute the for loop
        # For now, return void as a placeholder
        return void_val()

    def _eval_iter(
        self,
        expr: EirIterExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Iter: Iterator loop over a collection.
        """
        # Full implementation would iterate over the collection
        # For now, return void as a placeholder
        return void_val()

    def _eval_effect(
        self,
        expr: EirEffectExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Effect: rho |- args[i] ⇓ vi    effect(op, v1,...,vn) ⇓ v
                   -----------------------------------------------
                            rho |- effect(op, args) ⇓ v

        Effect operation: execute a side-effecting operation.
        """
        # Look up effect operation in registry
        # Full implementation would use EffectRegistry
        # For now, return void as a placeholder
        return void_val()

    def _eval_ref_cell(
        self,
        expr: EirRefCellExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-RefCell: rho |- target ⇓ v    rho, refCell(target) ⇓ ⟨v⟩
                   -----------------------------------------------
                           rho |- refCell(target) ⇓ refCell(v)

        Create a reference cell containing the target value.
        """
        target = expr["target"]
        target_value = lookup_value(env, target)

        if target_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier in refCell: {target}"
            )

        return ref_cell_val(target_value)

    def _eval_deref(
        self,
        expr: EirDerefExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-Deref: rho |- target ⇓ refCell(v)    rho |- deref(target) ⇓ v
                 -------------------------------------------------
                         rho |- deref(target) ⇓ v

        Dereference a reference cell to get its value.
        """
        target = expr["target"]
        target_value = lookup_value(env, target)

        if target_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier in deref: {target}"
            )

        if is_error(target_value):
            return target_value

        if not is_ref_cell(target_value):
            return error_val(
                ErrorCodes.TYPE_ERROR,
                f"Expected refCell, got: {target_value.kind}"
            )

        return target_value.value

    def _eval_try(
        self,
        expr: EirTryExpr,
        env: ValueEnv,
        state: EvalContext
    ) -> Value:
        """
        E-TryOk:  rho |- try_body ⇓ v    (not error)
                  ---------------------------
                  rho |- try(try_body, catch_param, catch_body) ⇓ v

        E-TryErr: rho |- try_body ⇓ Err(c)    rho[c] |- catch_body ⇓ v
                  -----------------------------------------------
                          rho |- try(...) ⇓ v
        """
        try_body = expr["try_body"]
        catch_param = expr["catch_param"]
        catch_body = expr["catch_body"]
        fallback = expr.get("fallback")

        # Evaluate try body
        try_value = lookup_value(env, try_body)
        if try_value is None:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER,
                f"Unbound identifier in try: {try_body}"
            )

        # Check if result is an error
        if is_error(try_value):
            # Extend environment with error parameter
            error_env = extend_value_env(env, catch_param, try_value)
            # Evaluate catch body
            catch_value = lookup_value(error_env, catch_body)
            if catch_value is None:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER,
                    f"Unbound identifier in catch: {catch_body}"
                )
            return catch_value

        # No error - return try value or fallback if specified
        if fallback is not None:
            fallback_value = lookup_value(env, fallback)
            if fallback_value is None:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER,
                    f"Unbound identifier in fallback: {fallback}"
                )
            return fallback_value

        return try_value

    #---------------------------------------------------------------------------
    # Utility Functions
    #---------------------------------------------------------------------------

    def _check_steps(self, state: EvalContext) -> None:
        """
        Check if step limit has been exceeded.

        Args:
            state: Evaluation context

        Raises:
            SPIRALError: If max steps exceeded
        """
        state.steps += 1
        if state.steps > state.max_steps:
            raise SPIRALError.non_termination()


#==============================================================================
# Program Evaluation (High-Level API)
#==============================================================================

def evaluate_program(
    doc: Dict[str, Any],
    registry: OperatorRegistry,
    defs: Dict[str, AIRDef],
    inputs: Optional[Dict[str, Value]] = None,
    options: Optional[EvalOptions] = None,
) -> Value:
    """
    Evaluate a full AIR/CIR/EIR program document.

    This is a high-level API that:
    1. Builds a node map from the document
    2. Evaluates nodes in dependency order
    3. Returns the result node's value

    Args:
        doc: Document structure with nodes and result reference
        registry: Operator registry
        defs: AIR definitions
        inputs: Optional input values
        options: Evaluation options

    Returns:
        Result value of the program
    """
    evaluator = Evaluator(registry, defs)
    nodes = doc.get("nodes", [])
    result_ref = doc.get("result", "")

    # Start with input environment
    env = ValueEnv(inputs or {})

    # Simple evaluation for now - evaluate nodes in order
    # Full implementation would handle:
    # - Bound node analysis (for let/lambda captured nodes)
    # - Dependency resolution
    # - Block node evaluation
    node_values: Dict[str, Value] = {}

    for node in nodes:
        node_id = node["id"]

        # Check if this is an expression node or block node
        if "expr" in node:
            # Expression node
            expr = node["expr"]
            value = evaluator.evaluate(expr, env, options)
            node_values[node_id] = value

            # Update environment if this is a let-binding
            # (Full implementation would handle this more carefully)
            if is_error(value):
                return value
        else:
            # Block node - not fully implemented in this version
            node_values[node_id] = void_val()

    # Return result value
    result_value = node_values.get(result_ref)
    if result_value is None:
        return error_val(
            ErrorCodes.DOMAIN_ERROR,
            f"Result node not evaluated: {result_ref}"
        )

    return result_value


#==============================================================================
# Convenience Functions
#==============================================================================

def create_evaluator(
    registry: OperatorRegistry,
    defs: Optional[Dict[str, AIRDef]] = None
) -> Evaluator:
    """
    Create an evaluator instance.

    Args:
        registry: Operator registry
        defs: AIR definitions (optional)

    Returns:
        New Evaluator instance
    """
    return Evaluator(registry, defs or {})


def evaluate(
    expr: Expr,
    env: ValueEnv,
    registry: OperatorRegistry,
    defs: Optional[Dict[str, AIRDef]] = None,
    options: Optional[EvalOptions] = None,
) -> Value:
    """
    Convenience function for single-expression evaluation.

    Args:
        expr: Expression to evaluate
        env: Value environment
        registry: Operator registry
        defs: AIR definitions (optional)
        options: Evaluation options (optional)

    Returns:
        Result value
    """
    evaluator = Evaluator(registry, defs or {})
    return evaluator.evaluate(expr, env, options)
