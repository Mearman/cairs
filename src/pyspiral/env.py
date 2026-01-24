"""
SPIRAL Environment Types
Type and Value environments for type checking and evaluation

This module provides immutable environment classes using dict.copy() pattern,
matching the TypeScript implementation in src/env.ts.
"""

from __future__ import annotations
from typing import Dict, Optional, Union
from dataclasses import dataclass

from pyspiral.types import Type, Value, AIRDef


#==============================================================================
# Type Environment (Γ)
# Maps variable names to their types
#==============================================================================

class TypeEnv:
    """
    Immutable type environment.

    Uses dict.copy() pattern to ensure immutability - all operations
    return new TypeEnv instances without modifying the original.
    """

    def __init__(self, bindings: Optional[Dict[str, Type]] = None):
        """
        Create a new type environment.

        Args:
            bindings: Initial type bindings (optional)
        """
        self._bindings = dict(bindings) if bindings else {}

    @property
    def bindings(self) -> Dict[str, Type]:
        """Return a copy of the bindings to prevent external mutation."""
        return dict(self._bindings)

    def extend(self, name: str, type: Type) -> "TypeEnv":
        """
        Extend the environment with a new binding.
        Returns a new TypeEnv without modifying the original.

        Args:
            name: Variable name
            type: Type to bind

        Returns:
            New TypeEnv with the additional binding
        """
        new_bindings = self._bindings.copy()
        new_bindings[name] = type
        return TypeEnv(new_bindings)

    def extend_many(self, bindings: list[tuple[str, Type]]) -> "TypeEnv":
        """
        Extend the environment with multiple bindings.
        Returns a new TypeEnv without modifying the original.

        Args:
            bindings: List of (name, type) tuples

        Returns:
            New TypeEnv with the additional bindings
        """
        new_bindings = self._bindings.copy()
        for name, typ in bindings:
            new_bindings[name] = typ
        return TypeEnv(new_bindings)

    def lookup(self, name: str) -> Optional[Type]:
        """
        Look up a type binding in the environment.

        Args:
            name: Variable name to look up

        Returns:
            Type if found, None otherwise
        """
        return self._bindings.get(name)

    def __contains__(self, name: str) -> bool:
        """Check if a name is bound in the environment."""
        return name in self._bindings

    def __len__(self) -> int:
        """Return the number of bindings."""
        return len(self._bindings)

    def __repr__(self) -> str:
        return f"TypeEnv({self._bindings})"


def empty_type_env() -> TypeEnv:
    """
    Create an empty type environment.

    Returns:
        New TypeEnv with no bindings
    """
    return TypeEnv()


#==============================================================================
# Value Environment (ρ)
# Maps variable names to their runtime values
#==============================================================================

class ValueEnv:
    """
    Immutable value environment.

    Uses dict.copy() pattern to ensure immutability - all operations
    return new ValueEnv instances without modifying the original.
    """

    def __init__(self, bindings: Optional[Dict[str, Value]] = None):
        """
        Create a new value environment.

        Args:
            bindings: Initial value bindings (optional)
        """
        self._bindings = dict(bindings) if bindings else {}

    @property
    def bindings(self) -> Dict[str, Value]:
        """Return a copy of the bindings to prevent external mutation."""
        return dict(self._bindings)

    def extend(self, name: str, value: Value) -> "ValueEnv":
        """
        Extend the environment with a new binding.
        Returns a new ValueEnv without modifying the original.

        Args:
            name: Variable name
            value: Value to bind

        Returns:
            New ValueEnv with the additional binding
        """
        new_bindings = self._bindings.copy()
        new_bindings[name] = value
        return ValueEnv(new_bindings)

    def extend_many(self, bindings: list[tuple[str, Value]]) -> "ValueEnv":
        """
        Extend the environment with multiple bindings.
        Returns a new ValueEnv without modifying the original.

        Args:
            bindings: List of (name, value) tuples

        Returns:
            New ValueEnv with the additional bindings
        """
        new_bindings = self._bindings.copy()
        for name, val in bindings:
            new_bindings[name] = val
        return ValueEnv(new_bindings)

    def lookup(self, name: str) -> Optional[Value]:
        """
        Look up a value binding in the environment.

        Args:
            name: Variable name to look up

        Returns:
            Value if found, None otherwise
        """
        return self._bindings.get(name)

    def __contains__(self, name: str) -> bool:
        """Check if a name is bound in the environment."""
        return name in self._bindings

    def __len__(self) -> int:
        """Return the number of bindings."""
        return len(self._bindings)

    def __repr__(self) -> str:
        return f"ValueEnv({self._bindings})"


def empty_value_env() -> ValueEnv:
    """
    Create an empty value environment.

    Returns:
        New ValueEnv with no bindings
    """
    return ValueEnv()


#==============================================================================
# Definitions (Defs)
# Maps AIRDef qualified names to their definitions
#==============================================================================

class Defs:
    """
    Immutable definitions registry.

    Stores AIRDef objects by qualified name (namespace:name).
    Uses dict.copy() pattern to ensure immutability.
    """

    def __init__(self, definitions: Optional[Dict[str, AIRDef]] = None):
        """
        Create a new definitions registry.

        Args:
            definitions: Initial definitions (optional)
        """
        self._definitions = dict(definitions) if definitions else {}

    @property
    def definitions(self) -> Dict[str, AIRDef]:
        """Return a copy of the definitions to prevent external mutation."""
        return dict(self._definitions)

    @staticmethod
    def def_key(ns: str, name: str) -> str:
        """
        Create a qualified key for a definition.

        Args:
            ns: Namespace
            name: Definition name

        Returns:
            Qualified key in format "ns:name"
        """
        return f"{ns}:{name}"

    def register(self, definition: AIRDef) -> "Defs":
        """
        Register a definition in the registry.
        Returns a new Defs without modifying the original.

        Args:
            definition: AIRDef to register

        Returns:
            New Defs with the registered definition
        """
        key = self.def_key(definition.ns, definition.name)
        new_definitions = self._definitions.copy()
        new_definitions[key] = definition
        return Defs(new_definitions)

    def lookup(self, ns: str, name: str) -> Optional[AIRDef]:
        """
        Look up a definition by qualified name.

        Args:
            ns: Namespace
            name: Definition name

        Returns:
            AIRDef if found, None otherwise
        """
        key = self.def_key(ns, name)
        return self._definitions.get(key)

    def __contains__(self, key: tuple[str, str]) -> bool:
        """
        Check if a definition exists by qualified name.

        Args:
            key: Tuple of (namespace, name)

        Returns:
            True if definition exists, False otherwise
        """
        ns, name = key
        return self.def_key(ns, name) in self._definitions

    def __len__(self) -> int:
        """Return the number of definitions."""
        return len(self._definitions)

    def __repr__(self) -> str:
        return f"Defs({self._definitions})"


def empty_defs() -> Defs:
    """
    Create an empty definitions registry.

    Returns:
        New Defs with no definitions
    """
    return Defs()
