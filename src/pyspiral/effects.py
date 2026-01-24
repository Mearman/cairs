"""
SPIRAL Effect System for Python
Effect registry and built-in effects for EIR

This module provides effect operations and an effect registry for
handling side effects in EIR programs, including IO effects (print, read, etc.)
and state effects (get/set mutable state).
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import (
    Union,
    Optional,
    List,
    Dict,
    Callable,
    Any,
    TypeAlias,
)
from types import NoneType

from pyspiral.types import (
    Type,
    Value,
    string_type,
    int_type,
    void_type,
    string_val,
    int_val,
    error_val,
    void_val,
    ErrorCode,
)


#==============================================================================
# Effect Operation Signature
#==============================================================================

@dataclass(frozen=True)
class EffectOp:
    """
    An effect operation that can be invoked during EIR evaluation.

    Effect operations represent side effects like I/O, state mutation,
    and other impure operations. They return their result directly,
    while side effects are tracked in the EvalState.
    """
    name: str
    params: List[Type]
    returns: Type
    pure: bool
    fn: Callable[..., Value]


#==============================================================================
# Effect Registry
#==============================================================================

EffectRegistry: TypeAlias = Dict[str, EffectOp]


def lookup_effect(registry: EffectRegistry, name: str) -> Optional[EffectOp]:
    """
    Look up an effect operation by name.

    Args:
        registry: The effect registry to search
        name: The name of the effect operation

    Returns:
        The EffectOp if found, None otherwise
    """
    return registry.get(name)


def register_effect(registry: EffectRegistry, op: EffectOp) -> EffectRegistry:
    """
    Register an effect operation in the registry.

    Args:
        registry: The current effect registry
        op: The effect operation to register

    Returns:
        A new registry with the effect operation added
    """
    new_registry = dict(registry)
    new_registry[op.name] = op
    return new_registry


def empty_effect_registry() -> EffectRegistry:
    """
    Create an empty effect registry.

    Returns:
        An empty effect registry
    """
    return {}


#==============================================================================
# Built-in Effect Operations
#==============================================================================

# IO Effects - print, read, etc.
# These effects store their actions in the EvalState effects array
# for the host runtime to handle

def _print_fn(**kwargs: Any) -> Value:
    """Print effect implementation"""
    args = kwargs.get('args', [])
    if len(args) < 1:
        return error_val(ErrorCode.ARITY_ERROR.value, "print requires 1 argument")
    # Actual printing is handled by the runner via effects array
    return void_val()


def _print_int_fn(**kwargs: Any) -> Value:
    """Print integer effect implementation"""
    args = kwargs.get('args', [])
    if len(args) < 1:
        return error_val(ErrorCode.ARITY_ERROR.value, "printInt requires 1 argument")
    # Actual printing is handled by the runner via effects array
    return void_val()


def _read_line_fn(**kwargs: Any) -> Value:
    """Read line effect implementation"""
    args = kwargs.get('args', [])
    if len(args) > 0:
        return error_val(ErrorCode.ARITY_ERROR.value, "readLine accepts no arguments")
    # Runner supplies actual value
    return string_val("")


def _read_int_fn(**kwargs: Any) -> Value:
    """Read integer effect implementation"""
    args = kwargs.get('args', [])
    if len(args) > 0:
        return error_val(ErrorCode.ARITY_ERROR.value, "readInt accepts no arguments")
    # Runner supplies actual value
    return int_val(0)


def _write_fn(**kwargs: Any) -> Value:
    """Write effect implementation"""
    args = kwargs.get('args', [])
    if len(args) < 1:
        return error_val(ErrorCode.ARITY_ERROR.value, "write requires 1 argument")
    # Actual writing is handled by the runner via effects array
    return void_val()


def _prompt_fn(**kwargs: Any) -> Value:
    """Prompt effect implementation"""
    args = kwargs.get('args', [])
    if len(args) < 1:
        return error_val(ErrorCode.ARITY_ERROR.value, "prompt requires 1 argument")
    # Runner supplies actual value
    return string_val("")


def _random_fn(**kwargs: Any) -> Value:
    """Random number effect implementation"""
    # No arguments expected
    return int_val(0)  # Runner supplies actual value


def _sleep_fn(**kwargs: Any) -> Value:
    """Sleep effect implementation"""
    args = kwargs.get('args', [])
    if len(args) < 1:
        return error_val(ErrorCode.ARITY_ERROR.value, "sleep requires 1 argument")
    # Actual sleep is handled by the runner via effects array
    return void_val()


# IO effect definitions
io_effects: List[EffectOp] = [
    EffectOp(
        name="print",
        params=[string_type()],
        returns=void_type(),
        pure=False,
        fn=_print_fn,
    ),
    EffectOp(
        name="printInt",
        params=[int_type()],
        returns=void_type(),
        pure=False,
        fn=_print_int_fn,
    ),
    EffectOp(
        name="readLine",
        params=[],
        returns=string_type(),
        pure=False,
        fn=_read_line_fn,
    ),
    EffectOp(
        name="readInt",
        params=[],
        returns=int_type(),
        pure=False,
        fn=_read_int_fn,
    ),
    EffectOp(
        name="write",
        params=[string_type()],
        returns=void_type(),
        pure=False,
        fn=_write_fn,
    ),
    EffectOp(
        name="prompt",
        params=[string_type()],
        returns=string_type(),
        pure=False,
        fn=_prompt_fn,
    ),
    EffectOp(
        name="random",
        params=[],
        returns=int_type(),
        pure=False,
        fn=_random_fn,
    ),
    EffectOp(
        name="sleep",
        params=[int_type()],
        returns=void_type(),
        pure=False,
        fn=_sleep_fn,
    ),
]

# State Effects - get/set mutable state

def _get_state_fn(**kwargs: Any) -> Value:
    """Get state effect implementation"""
    args = kwargs.get('args', [])
    if len(args) > 0:
        return error_val(ErrorCode.ARITY_ERROR.value, "getState accepts no arguments")
    # In a real implementation, this would return the actual state
    return string_val("mock-state")


def _set_state_fn(**kwargs: Any) -> Value:
    """Set state effect implementation"""
    args = kwargs.get('args', [])
    if len(args) < 1:
        return error_val(ErrorCode.ARITY_ERROR.value, "setState requires 1 argument")
    # In a real implementation, this would update state with args[0]
    return void_val()


state_effects: List[EffectOp] = [
    EffectOp(
        name="getState",
        params=[],
        returns=string_type(),
        pure=False,
        fn=_get_state_fn,
    ),
    EffectOp(
        name="setState",
        params=[string_type()],
        returns=void_type(),
        pure=False,
        fn=_set_state_fn,
    ),
]


def create_default_effect_registry() -> EffectRegistry:
    """
    Create a default effect registry with all built-in effects.

    Returns:
        An effect registry with IO and state effects registered
    """
    registry = empty_effect_registry()
    for op in [*io_effects, *state_effects]:
        registry = register_effect(registry, op)
    return registry


# Default registry instance
default_effect_registry: EffectRegistry = create_default_effect_registry()


#==============================================================================
# Queued Input Registry
#==============================================================================

def create_queued_effect_registry(inputs: List[Union[str, int]]) -> EffectRegistry:
    """
    Create an effect registry with queue-backed input effects.

    Used for interactive examples with deterministic input handling.
    The readLine and readInt effects will consume values from the input queue.

    Args:
        inputs: Array of input values (strings or numbers)

    Returns:
        EffectRegistry with readLine/readInt bound to the input queue
    """
    # Make a copy to avoid mutations
    input_queue = list(inputs)

    # Create closures that capture the queue
    def _queued_read_line_fn(**kwargs: Any) -> Value:
        """Read line from queue"""
        args = kwargs.get('args', [])
        if len(args) > 0:
            return error_val(ErrorCode.ARITY_ERROR.value, "readLine accepts no arguments")
        if len(input_queue) == 0:
            return string_val("")
        next_val = input_queue.pop(0)
        return string_val(str(next_val))

    def _queued_read_int_fn(**kwargs: Any) -> Value:
        """Read int from queue"""
        args = kwargs.get('args', [])
        if len(args) > 0:
            return error_val(ErrorCode.ARITY_ERROR.value, "readInt accepts no arguments")
        if len(input_queue) == 0:
            return int_val(0)
        next_val = input_queue.pop(0)
        if isinstance(next_val, int):
            num = next_val
        else:
            try:
                num = int(str(next_val))
            except ValueError:
                num = 0
        return int_val(num)

    # Build registry with queued input effects
    registry = empty_effect_registry()

    # Add print effect (unchanged)
    registry = register_effect(registry, EffectOp(
        name="print",
        params=[string_type()],
        returns=void_type(),
        pure=False,
        fn=_print_fn,
    ))

    # Add printInt effect (unchanged)
    registry = register_effect(registry, EffectOp(
        name="printInt",
        params=[int_type()],
        returns=void_type(),
        pure=False,
        fn=_print_int_fn,
    ))

    # Add write effect (unchanged)
    registry = register_effect(registry, EffectOp(
        name="write",
        params=[string_type()],
        returns=void_type(),
        pure=False,
        fn=_write_fn,
    ))

    # Add prompt effect (unchanged)
    registry = register_effect(registry, EffectOp(
        name="prompt",
        params=[string_type()],
        returns=string_type(),
        pure=False,
        fn=_prompt_fn,
    ))

    # Add random effect (unchanged)
    registry = register_effect(registry, EffectOp(
        name="random",
        params=[],
        returns=int_type(),
        pure=False,
        fn=_random_fn,
    ))

    # Add sleep effect (unchanged)
    registry = register_effect(registry, EffectOp(
        name="sleep",
        params=[int_type()],
        returns=void_type(),
        pure=False,
        fn=_sleep_fn,
    ))

    # Add readLine effect with queue
    registry = register_effect(registry, EffectOp(
        name="readLine",
        params=[],
        returns=string_type(),
        pure=False,
        fn=_queued_read_line_fn,
    ))

    # Add readInt effect with queue
    registry = register_effect(registry, EffectOp(
        name="readInt",
        params=[],
        returns=int_type(),
        pure=False,
        fn=_queued_read_int_fn,
    ))

    # Optionally add state effects
    for op in state_effects:
        registry = register_effect(registry, op)

    return registry
