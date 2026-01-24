"""
SPIRAL Operator Registry
Central registry for all domain operators

Provides Operator and OperatorRegistry classes for registering and looking up
operators with namespaced names (e.g., "core:add").
"""

from __future__ import annotations

from typing import Callable, Dict, List, Optional, TYPE_CHECKING
from dataclasses import dataclass

if TYPE_CHECKING:
    from pyspiral.types import Type, Value


#==============================================================================
# Operator Class
#==============================================================================

@dataclass(frozen=True)
class Operator:
    """
    An operator definition with metadata and implementation.

    Attributes:
        ns: Namespace for the operator (e.g., "core", "math", "string")
        name: Operator name within the namespace
        params: List of parameter types
        returns: Return type
        pure: Whether the operator is pure (no side effects)
        impl: Implementation function that takes values and returns a value
    """
    ns: str
    name: str
    params: List["Type"]
    returns: "Type"
    pure: bool
    impl: Callable[..., "Value"]

    @property
    def qualified_name(self) -> str:
        """Get the fully qualified operator name (ns:name)"""
        return f"{self.ns}:{self.name}"

    def check_arity(self, arg_count: int) -> bool:
        """Check if argument count matches parameter count"""
        return len(self.params) == arg_count

    def __str__(self) -> str:
        """String representation of the operator"""
        params_str = ", ".join(repr(p) for p in self.params)
        return f"Operator({self.qualified_name}, ({params_str}) -> {self.returns})"


#==============================================================================
# Operator Registry
#==============================================================================

class OperatorRegistry:
    """
    Registry for operators with namespaced lookup.

    Operators are registered by qualified name (ns:name) and can be looked up
    for type checking and execution.
    """

    def __init__(self) -> None:
        """Create an empty operator registry"""
        self._operators: Dict[str, Operator] = {}

    #---------------------------------------------------------------------------
    # Registration
    #---------------------------------------------------------------------------

    def register(self, operator: Operator) -> "OperatorRegistry":
        """
        Register an operator in the registry.

        Args:
            operator: The operator to register

        Returns:
            self for chaining

        Raises:
            ValueError: If an operator with the same qualified name already exists
        """
        key = operator.qualified_name
        if key in self._operators:
            raise ValueError(f"Operator {key} already registered")
        self._operators[key] = operator
        return self

    def register_all(self, operators: List[Operator]) -> "OperatorRegistry":
        """
        Register multiple operators at once.

        Args:
            operators: List of operators to register

        Returns:
            self for chaining
        """
        for op in operators:
            self.register(op)
        return self

    #---------------------------------------------------------------------------
    # Lookup
    #---------------------------------------------------------------------------

    def lookup(self, ns: str, name: str) -> Optional[Operator]:
        """
        Look up an operator by namespace and name.

        Args:
            ns: The operator namespace
            name: The operator name

        Returns:
            The operator if found, None otherwise
        """
        key = f"{ns}:{name}"
        return self._operators.get(key)

    def get(self, ns: str, name: str) -> Operator:
        """
        Get an operator, raising an error if not found.

        Args:
            ns: The operator namespace
            name: The operator name

        Returns:
            The operator

        Raises:
            KeyError: If the operator is not registered
        """
        op = self.lookup(ns, name)
        if op is None:
            raise KeyError(f"Operator {ns}:{name} not registered")
        return op

    def has(self, ns: str, name: str) -> bool:
        """
        Check if an operator is registered.

        Args:
            ns: The operator namespace
            name: The operator name

        Returns:
            True if the operator exists, False otherwise
        """
        return f"{ns}:{name}" in self._operators

    #---------------------------------------------------------------------------
    # Type Checking
    #---------------------------------------------------------------------------

    def check_call(self, ns: str, name: str, arg_types: List["Type"]) -> "Type":
        """
        Type check an operator call.

        Args:
            ns: The operator namespace
            name: The operator name
            arg_types: List of argument types

        Returns:
            The return type of the operator

        Raises:
            KeyError: If the operator is not registered
            TypeError: If argument count or types don't match
        """
        from pyspiral.types import type_equal

        op = self.get(ns, name)

        # Check arity
        if not op.check_arity(len(arg_types)):
            raise TypeError(
                f"Arity error: {ns}:{name} expects {len(op.params)} "
                f"arguments, got {len(arg_types)}"
            )

        # Check argument types
        for i, (expected, got) in enumerate(zip(op.params, arg_types)):
            if not type_equal(expected, got):
                raise TypeError(
                    f"Type error: {ns}:{name} argument {i} expects "
                    f"{expected}, got {got}"
                )

        return op.returns

    #---------------------------------------------------------------------------
    # Execution
    #---------------------------------------------------------------------------

    def call(self, ns: str, name: str, *args: "Value") -> "Value":
        """
        Execute an operator with the given arguments.

        Args:
            ns: The operator namespace
            name: The operator name
            *args: Argument values

        Returns:
            The result value

        Raises:
            KeyError: If the operator is not registered
            TypeError: If argument count doesn't match
        """
        op = self.get(ns, name)

        if not op.check_arity(len(args)):
            raise TypeError(
                f"Arity error: {ns}:{name} expects {len(op.params)} "
                f"arguments, got {len(args)}"
            )

        return op.impl(*args)

    #---------------------------------------------------------------------------
    # Iteration and Inspection
    #---------------------------------------------------------------------------

    def list_namespace(self, ns: str) -> List[str]:
        """
        List all operator names in a namespace.

        Args:
            ns: The namespace to query

        Returns:
            List of operator names in the namespace
        """
        prefix = f"{ns}:"
        return [
            key[len(prefix):]
            for key in self._operators
            if key.startswith(prefix)
        ]

    def list_namespaces(self) -> List[str]:
        """
        List all registered namespaces.

        Returns:
            List of unique namespace names
        """
        namespaces = set()
        for key in self._operators:
            if ":" in key:
                ns = key.split(":")[0]
                namespaces.add(ns)
        return sorted(namespaces)

    def operators(self) -> List[Operator]:
        """
        Get all registered operators.

        Returns:
            List of all operators
        """
        return list(self._operators.values())

    def __len__(self) -> int:
        """Return the number of registered operators"""
        return len(self._operators)

    def __contains__(self, key: str) -> bool:
        """
        Check if a qualified name is in the registry.

        Args:
            key: Qualified operator name (ns:name)

        Returns:
            True if the operator exists
        """
        return key in self._operators


#==============================================================================
# Operator Builder
#==============================================================================

class OperatorBuilder:
    """
    Builder pattern for constructing operators with a fluent interface.

    Example:
        op = (OperatorBuilder("core", "add")
              .params(int_type(), int_type())
              .returns(int_type())
              .pure(True)
              .impl(lambda a, b: int_val(a.value + b.value))
              .build())
    """

    def __init__(self, ns: str, name: str) -> None:
        """
        Initialize the builder.

        Args:
            ns: Operator namespace
            name: Operator name
        """
        self._ns = ns
        self._name = name
        self._params: List["Type"] = []
        self._returns: Optional["Type"] = None
        self._pure = True
        self._impl: Optional[Callable[..., "Value"]] = None

    def params(self, *param_types: "Type") -> "OperatorBuilder":
        """Set parameter types"""
        self._params = list(param_types)
        return self

    def returns(self, return_type: "Type") -> "OperatorBuilder":
        """Set return type"""
        self._returns = return_type
        return self

    def pure(self, is_pure: bool) -> "OperatorBuilder":
        """Set whether the operator is pure"""
        self._pure = is_pure
        return self

    def impl(self, fn: Callable[..., "Value"]) -> "OperatorBuilder":
        """Set the implementation function"""
        self._impl = fn
        return self

    def build(self) -> Operator:
        """
        Build the operator.

        Returns:
            The constructed Operator

        Raises:
            ValueError: If required fields are missing
        """
        if self._returns is None:
            raise ValueError(f"Operator {self._ns}:{self._name} missing return type")
        if self._impl is None:
            raise ValueError(f"Operator {self._ns}:{self._name} missing implementation")

        return Operator(
            ns=self._ns,
            name=self._name,
            params=self._params,
            returns=self._returns,
            pure=self._pure,
            impl=self._impl,
        )


#==============================================================================
# Convenience Functions
#==============================================================================

def empty_registry() -> OperatorRegistry:
    """Create an empty operator registry"""
    return OperatorRegistry()


def define_operator(ns: str, name: str) -> OperatorBuilder:
    """
    Start building an operator definition.

    Args:
        ns: Operator namespace
        name: Operator name

    Returns:
        An OperatorBuilder for the operator
    """
    return OperatorBuilder(ns, name)
