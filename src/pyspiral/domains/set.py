"""
SPIRAL Set Domain
Set operators for set manipulation

Provides set operators: union, intersect, difference, contains, size,
is_subset, is_disjoint
"""

from pyspiral.types import (
    Value,
    Type,
    SetVal,
    BoolVal,
    IntVal,
    ErrorVal,
    set_val,
    bool_val,
    int_val,
    error_val,
    set_type,
    int_type,
    bool_type,
    is_error,
    hash_value,
    ErrorCode,
)
from pyspiral.domains.registry import Operator, OperatorRegistry, define_operator


#==============================================================================
# Set Operators
#==============================================================================

# union(set<A>, set<A>) -> set<A>
def _union_impl(a: Value, b: Value) -> Value:
    """Union of two sets"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "set" or b.kind != "set":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected set values")
    return set_val(a.value | b.value)


union: Operator = (define_operator("set", "union")
                   .params(set_type(int_type()), set_type(int_type()))
                   .returns(set_type(int_type()))
                   .pure(True)
                   .impl(_union_impl)
                   .build())


# intersect(set<A>, set<A>) -> set<A>
def _intersect_impl(a: Value, b: Value) -> Value:
    """Intersection of two sets"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "set" or b.kind != "set":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected set values")
    return set_val(a.value & b.value)


intersect: Operator = (define_operator("set", "intersect")
                       .params(set_type(int_type()), set_type(int_type()))
                       .returns(set_type(int_type()))
                       .pure(True)
                       .impl(_intersect_impl)
                       .build())


# difference(set<A>, set<A>) -> set<A>
def _difference_impl(a: Value, b: Value) -> Value:
    """Difference of two sets (elements in a but not in b)"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "set" or b.kind != "set":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected set values")
    return set_val(a.value - b.value)


difference: Operator = (define_operator("set", "difference")
                        .params(set_type(int_type()), set_type(int_type()))
                        .returns(set_type(int_type()))
                        .pure(True)
                        .impl(_difference_impl)
                        .build())


# contains(set<A>, A) -> bool
def _contains_impl(a: Value, b: Value) -> Value:
    """Check if a set contains an element"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "set":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected set value")
    return bool_val(hash_value(b) in a.value)


contains: Operator = (define_operator("set", "contains")
                      .params(set_type(int_type()), int_type())
                      .returns(bool_type())
                      .pure(True)
                      .impl(_contains_impl)
                      .build())


# size(set<A>) -> int
def _size_impl(a: Value) -> Value:
    """Get the size of a set"""
    if is_error(a):
        return a
    if a.kind != "set":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected set value")
    return int_val(len(a.value))


size: Operator = (define_operator("set", "size")
                  .params(set_type(int_type()))
                  .returns(int_type())
                  .pure(True)
                  .impl(_size_impl)
                  .build())


# is_subset(set<A>, set<A>) -> bool
def _is_subset_impl(a: Value, b: Value) -> Value:
    """Check if set a is a subset of set b"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "set" or b.kind != "set":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected set values")
    return bool_val(a.value <= b.value)


is_subset: Operator = (define_operator("set", "is_subset")
                       .params(set_type(int_type()), set_type(int_type()))
                       .returns(bool_type())
                       .pure(True)
                       .impl(_is_subset_impl)
                       .build())


# is_disjoint(set<A>, set<A>) -> bool
def _is_disjoint_impl(a: Value, b: Value) -> Value:
    """Check if two sets are disjoint (have no elements in common)"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind != "set" or b.kind != "set":
        return error_val(ErrorCode.TYPE_ERROR.value, "Expected set values")
    return bool_val(a.value.isdisjoint(b.value))


is_disjoint: Operator = (define_operator("set", "is_disjoint")
                         .params(set_type(int_type()), set_type(int_type()))
                         .returns(bool_type())
                         .pure(True)
                         .impl(_is_disjoint_impl)
                         .build())


#==============================================================================
# Registry Creation
#==============================================================================

def create_set_registry() -> OperatorRegistry:
    """
    Create the set domain registry with all set operators.

    Returns:
        OperatorRegistry containing union, intersect, difference, contains,
        size, is_subset, is_disjoint operators
    """
    registry = OperatorRegistry()

    registry.register(union)
    registry.register(intersect)
    registry.register(difference)
    registry.register(contains)
    registry.register(size)
    registry.register(is_subset)
    registry.register(is_disjoint)

    return registry
