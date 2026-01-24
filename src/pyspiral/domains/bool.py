"""
SPIRAL Bool Domain
Boolean algebra operators

Provides logical operators: and, or, not, xor with short-circuit evaluation.
"""

from __future__ import annotations
from typing import Callable, Dict, List

from pyspiral.types import (
    Type,
    Value,
    BoolVal,
    BoolType,
    ErrorVal,
    bool_type,
    bool_val,
    is_error,
)
from pyspiral.errors import SPIRALError, ErrorCodes


#==============================================================================
# Operator Interface
#==============================================================================

class Operator:
    """
    Represents a SPIRAL operator with type signature and implementation.

    Attributes:
        ns: Namespace (e.g., "bool", "int")
        name: Operator name (e.g., "and", "add")
        params: Parameter types
        returns: Return type
        pure: Whether the operator is pure (no side effects)
        fn: Implementation function
    """

    def __init__(
        self,
        ns: str,
        name: str,
        params: List[Type],
        returns: Type,
        pure: bool,
        fn: Callable[..., Value],
    ):
        self.ns = ns
        self.name = name
        self.params = params
        self.returns = returns
        self.pure = pure
        self.fn = fn

    @property
    def key(self) -> str:
        """Qualified key for this operator (ns:name)"""
        return f"{self.ns}:{self.name}"


#==============================================================================
# Operator Registry
#==============================================================================

OperatorRegistry = Dict[str, Operator]


def op_key(ns: str, name: str) -> str:
    """Create a qualified key for an operator."""
    return f"{ns}:{name}"


def register_operator(registry: OperatorRegistry, op: Operator) -> OperatorRegistry:
    """
    Register an operator in the registry.
    Returns a new registry without modifying the original.
    """
    new_registry = dict(registry)
    new_registry[op.key] = op
    return new_registry


def lookup_operator(registry: OperatorRegistry, ns: str, name: str) -> Operator | None:
    """Look up an operator by qualified name."""
    return registry.get(op_key(ns, name))


def empty_registry() -> OperatorRegistry:
    """Create an empty operator registry."""
    return {}


#==============================================================================
# Operator Builder
#==============================================================================

class OperatorBuilder:
    """
    Builder pattern for creating Operator instances.

    Usage:
        op = (OperatorBuilder("bool", "and")
              .set_params(bool_type(), bool_type())
              .set_returns(bool_type())
              .set_pure(True)
              .set_impl(lambda a, b: bool_val(expect_bool(a) and expect_bool(b)))
              .build())
    """

    def __init__(self, ns: str, name: str):
        self.ns = ns
        self.name = name
        self.params: List[Type] = []
        self.returns: Type | None = None
        self.pure = True
        self.fn: Callable[..., Value] | None = None

    def set_params(self, *params: Type) -> "OperatorBuilder":
        """Set parameter types."""
        self.params = list(params)
        return self

    def set_returns(self, type: Type) -> "OperatorBuilder":
        """Set return type."""
        self.returns = type
        return self

    def set_pure(self, pure: bool) -> "OperatorBuilder":
        """Set whether operator is pure."""
        self.pure = pure
        return self

    def set_impl(self, fn: Callable[..., Value]) -> "OperatorBuilder":
        """Set implementation function."""
        self.fn = fn
        return self

    def build(self) -> Operator:
        """Build the Operator instance."""
        if self.returns is None:
            raise ValueError(f"Operator {self.ns}:{self.name} missing return type")
        if self.fn is None:
            raise ValueError(f"Operator {self.ns}:{self.name} missing implementation")

        return Operator(
            ns=self.ns,
            name=self.name,
            params=self.params,
            returns=self.returns,
            pure=self.pure,
            fn=self.fn,
        )


def define_operator(ns: str, name: str) -> OperatorBuilder:
    """Helper to create an operator builder."""
    return OperatorBuilder(ns, name)


#==============================================================================
# Helper Functions
#==============================================================================

def expect_bool(v: Value) -> bool:
    """
    Extract boolean value from a Value, raising errors for invalid inputs.

    Args:
        v: Value to extract from

    Returns:
        Boolean value

    Raises:
        SPIRALError: If value is not a bool or is an error
    """
    if v.kind == "bool":
        return v.value
    if v.kind == "error":
        raise SPIRALError.domain_error(v.message or v.code)
    raise SPIRALError.type_error(bool_type(), Type(kind=v.kind))  # type: ignore


#==============================================================================
# Boolean Operators
#==============================================================================

# and(bool, bool) -> bool
# Short-circuit evaluation: returns False immediately if first arg is False
_and_op = (
    define_operator("bool", "and")
    .set_params(bool_type(), bool_type())
    .set_returns(bool_type())
    .set_pure(True)
    .set_impl(lambda a, b: (
        a if is_error(a) else
        b if is_error(b) else
        bool_val(expect_bool(a) and expect_bool(b))
    ))
    .build()
)

# or(bool, bool) -> bool
# Short-circuit evaluation: returns True immediately if first arg is True
_or_op = (
    define_operator("bool", "or")
    .set_params(bool_type(), bool_type())
    .set_returns(bool_type())
    .set_pure(True)
    .set_impl(lambda a, b: (
        a if is_error(a) else
        b if is_error(b) else
        bool_val(expect_bool(a) or expect_bool(b))
    ))
    .build()
)

# not(bool) -> bool
_not_op = (
    define_operator("bool", "not")
    .set_params(bool_type())
    .set_returns(bool_type())
    .set_pure(True)
    .set_impl(lambda a: (
        a if is_error(a) else
        bool_val(not expect_bool(a))
    ))
    .build()
)

# xor(bool, bool) -> bool
# Exclusive OR: True when operands differ
_xor_op = (
    define_operator("bool", "xor")
    .set_params(bool_type(), bool_type())
    .set_returns(bool_type())
    .set_pure(True)
    .set_impl(lambda a, b: (
        a if is_error(a) else
        b if is_error(b) else
        bool_val((expect_bool(a) and not expect_bool(b)) or
                 (not expect_bool(a) and expect_bool(b)))
    ))
    .build()
)


#==============================================================================
# Registry Creation
#==============================================================================

def create_bool_registry() -> OperatorRegistry:
    """
    Create the bool domain registry with all boolean operators.

    Returns:
        OperatorRegistry containing and, or, not, xor operators
    """
    registry: OperatorRegistry = empty_registry()

    registry = register_operator(registry, _and_op)
    registry = register_operator(registry, _or_op)
    registry = register_operator(registry, _not_op)
    registry = register_operator(registry, _xor_op)

    return registry


# Export the registry creation function
__all__ = [
    "create_bool_registry",
    "Operator",
    "OperatorBuilder",
    "OperatorRegistry",
    "op_key",
    "register_operator",
    "lookup_operator",
    "empty_registry",
    "define_operator",
    "expect_bool",
]
