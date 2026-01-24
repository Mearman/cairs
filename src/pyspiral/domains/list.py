"""
SPIRAL List Domain
List operators for list manipulation

Provides list operators: length, concat, nth, reverse, take, drop, slice
"""

from pyspiral.types import (
    Value,
    Type,
    ListVal,
    IntVal,
    ErrorVal,
    list_val,
    int_val,
    error_val,
    list_type,
    int_type,
    is_error,
    ErrorCode,
)
from pyspiral.domains.registry import Operator, OperatorRegistry, define_operator


#==============================================================================
# List Operators
#==============================================================================

# length(list<A>) -> int
def _length_impl(a: Value) -> Value:
    """Get the length of a list"""
    if is_error(a):
        return a
    if a.kind != "list":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected list value")
    return int_val(len(a.value))


length: Operator = (define_operator("list", "length")
                    .params(list_type(int_type()))
                    .returns(int_type())
                    .pure(True)
                    .impl(_length_impl)
                    .build())


# concat(list<A>, list<A>) -> list<A>
def _concat_impl(a: Value, b: Value) -> Value:
    """Concatenate two lists"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "list" or b.kind != "list":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected list values")
    return list_val(a.value + b.value)


concat: Operator = (define_operator("list", "concat")
                    .params(list_type(int_type()), list_type(int_type()))
                    .returns(list_type(int_type()))
                    .pure(True)
                    .impl(_concat_impl)
                    .build())


# nth(list<A>, int) -> A
def _nth_impl(a: Value, b: Value) -> Value:
    """Get the nth element of a list (0-indexed)"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "list":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected list value")
    if b.kind != "int":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected int index")

    idx = b.value
    if idx < 0 or idx >= len(a.value):
        return error_val(ErrorCode.DOMAIN_ERROR.value,
                        f"Index out of bounds: {idx}")

    result = a.value[idx]
    return result


nth: Operator = (define_operator("list", "nth")
                 .params(list_type(int_type()), int_type())
                 .returns(int_type())
                 .pure(True)
                 .impl(_nth_impl)
                 .build())


# reverse(list<A>) -> list<A>
def _reverse_impl(a: Value) -> Value:
    """Reverse a list"""
    if is_error(a):
        return a
    if a.kind != "list":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected list value")
    return list_val(list(reversed(a.value)))


reverse: Operator = (define_operator("list", "reverse")
                     .params(list_type(int_type()))
                     .returns(list_type(int_type()))
                     .pure(True)
                     .impl(_reverse_impl)
                     .build())


# take(list<A>, int) -> list<A>
def _take_impl(a: Value, b: Value) -> Value:
    """Take the first n elements of a list"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "list":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected list value")
    if b.kind != "int":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected int count")

    n = b.value
    if n < 0:
        return error_val(ErrorCode.DOMAIN_ERROR.value,
                        f"Count must be non-negative: {n}")

    return list_val(a.value[:n])


take: Operator = (define_operator("list", "take")
                  .params(list_type(int_type()), int_type())
                  .returns(list_type(int_type()))
                  .pure(True)
                  .impl(_take_impl)
                  .build())


# drop(list<A>, int) -> list<A>
def _drop_impl(a: Value, b: Value) -> Value:
    """Drop the first n elements of a list"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "list":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected list value")
    if b.kind != "int":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected int count")

    n = b.value
    if n < 0:
        return error_val(ErrorCode.DOMAIN_ERROR.value,
                        f"Count must be non-negative: {n}")

    return list_val(a.value[n:])


drop: Operator = (define_operator("list", "drop")
                  .params(list_type(int_type()), int_type())
                  .returns(list_type(int_type()))
                  .pure(True)
                  .impl(_drop_impl)
                  .build())


# slice(list<A>, int, int) -> list<A>
def _slice_impl(a: Value, b: Value, c: Value) -> Value:
    """Extract a slice from start index to end index (exclusive)"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if is_error(c):
        return c
    if a.kind != "list":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected list value")
    if b.kind != "int" or c.kind != "int":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected int indices")

    start = b.value
    end = c.value

    if start < 0:
        return error_val(ErrorCode.DOMAIN_ERROR.value,
                        f"Start index must be non-negative: {start}")
    if end < start:
        return error_val(ErrorCode.DOMAIN_ERROR.value,
                        f"End index must be >= start: {end} < {start}")

    return list_val(a.value[start:end])


slice_op: Operator = (define_operator("list", "slice")
                      .params(list_type(int_type()), int_type(), int_type())
                      .returns(list_type(int_type()))
                      .pure(True)
                      .impl(_slice_impl)
                      .build())


#==============================================================================
# Registry Creation
#==============================================================================

def create_list_registry() -> OperatorRegistry:
    """
    Create the list domain registry with all list operators.

    Returns:
        OperatorRegistry containing length, concat, nth, reverse, take, drop, slice operators
    """
    registry = OperatorRegistry()

    registry.register(length)
    registry.register(concat)
    registry.register(nth)
    registry.register(reverse)
    registry.register(take)
    registry.register(drop)
    registry.register(slice_op)

    return registry
