"""
SPIRAL Core Domain for Python
Arithmetic, comparison, and string operators

Implements polymorphic operators that handle different numeric types at runtime.
Returns int for int inputs, float for float inputs (or mixed int/float).
"""

from pyspiral.types import (
    Value,
    Type,
    BoolVal,
    IntVal,
    FloatVal,
    StringVal,
    ErrorVal,
    bool_val,
    int_val,
    float_val,
    string_val,
    error_val,
    bool_type,
    int_type,
    float_type,
    string_type,
    is_error,
    ErrorCode,
)
from pyspiral.domains.registry import Operator, OperatorRegistry, define_operator


#==============================================================================
# Helper Functions
#==============================================================================

def expect_int(v: Value) -> int:
    """Extract int value or raise error"""
    if v.kind == "int":
        return v.value
    if v.kind == "error":
        raise ValueError(v.message or v.code)
    raise TypeError(f"Expected int, got {v.kind}")


def get_numeric(v: Value) -> float:
    """Extract numeric value (int or float) as float"""
    if v.kind == "int":
        return float(v.value)
    if v.kind == "float":
        return v.value
    if v.kind == "error":
        raise ValueError(v.message or v.code)
    raise TypeError(f"Expected numeric, got {v.kind}")


def get_numeric_preserve(v: Value) -> float | int:
    """Extract numeric value preserving int type"""
    if v.kind == "int":
        return v.value
    if v.kind == "float":
        return v.value
    if v.kind == "error":
        raise ValueError(v.message or v.code)
    raise TypeError(f"Expected numeric, got {v.kind}")


#==============================================================================
# Arithmetic Operators (Polymorphic)
#==============================================================================

# add(number, number) -> number (returns int if both args are int, else float)
def _add_impl(a: Value, b: Value) -> Value:
    """Addition operator - polymorphic for int/float"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind == "int" and b.kind == "int":
        return int_val(a.value + b.value)
    return float_val(get_numeric(a) + get_numeric(b))


add: Operator = (define_operator("core", "add")
                 .params(int_type(), int_type())
                 .returns(int_type())
                 .pure(True)
                 .impl(_add_impl)
                 .build())


# sub(number, number) -> number
def _sub_impl(a: Value, b: Value) -> Value:
    """Subtraction operator - polymorphic for int/float"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind == "int" and b.kind == "int":
        return int_val(a.value - b.value)
    return float_val(get_numeric(a) - get_numeric(b))


sub: Operator = (define_operator("core", "sub")
                 .params(int_type(), int_type())
                 .returns(int_type())
                 .pure(True)
                 .impl(_sub_impl)
                 .build())


# mul(number, number) -> number
def _mul_impl(a: Value, b: Value) -> Value:
    """Multiplication operator - polymorphic for int/float"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind == "int" and b.kind == "int":
        return int_val(a.value * b.value)
    return float_val(get_numeric(a) * get_numeric(b))


mul: Operator = (define_operator("core", "mul")
                 .params(int_type(), int_type())
                 .returns(int_type())
                 .pure(True)
                 .impl(_mul_impl)
                 .build())


# div(number, number) -> number
def _div_impl(a: Value, b: Value) -> Value:
    """Division operator - polymorphic for int/float"""
    if is_error(a):
        return a
    if is_error(b):
        return b

    bv = get_numeric(b)
    if bv == 0:
        return error_val(ErrorCode.DIVIDE_BY_ZERO.value, "Division by zero")

    if a.kind == "int" and b.kind == "int":
        # Truncate toward zero like Math.trunc
        return int_val(int(a.value / bv))
    return float_val(get_numeric(a) / bv)


div: Operator = (define_operator("core", "div")
                 .params(int_type(), int_type())
                 .returns(int_type())
                 .pure(True)
                 .impl(_div_impl)
                 .build())


# mod(int, int) -> int
def _mod_impl(a: Value, b: Value) -> Value:
    """Modulo operator - int only"""
    if is_error(a):
        return a
    if is_error(b):
        return b

    bv = expect_int(b)
    if bv == 0:
        return error_val(ErrorCode.DIVIDE_BY_ZERO.value, "Modulo by zero")

    return int_val(expect_int(a) % bv)


mod: Operator = (define_operator("core", "mod")
                 .params(int_type(), int_type())
                 .returns(int_type())
                 .pure(True)
                 .impl(_mod_impl)
                 .build())


# pow(number, number) -> number
def _pow_impl(a: Value, b: Value) -> Value:
    """Power operator - polymorphic for int/float"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind == "int" and b.kind == "int":
        return int_val(int(a.value ** b.value))
    return float_val(get_numeric(a) ** get_numeric(b))


pow_op: Operator = (define_operator("core", "pow")
                    .params(int_type(), int_type())
                    .returns(int_type())
                    .pure(True)
                    .impl(_pow_impl)
                    .build())


# neg(number) -> number
def _neg_impl(a: Value) -> Value:
    """Negation operator - polymorphic for int/float"""
    if is_error(a):
        return a
    if a.kind == "int":
        return int_val(-a.value)
    if a.kind == "float":
        return float_val(-a.value)
    return error_val(ErrorCode.TYPE_ERROR.value, "Expected numeric value")


neg: Operator = (define_operator("core", "neg")
                 .params(int_type())
                 .returns(int_type())
                 .pure(True)
                 .impl(_neg_impl)
                 .build())


#==============================================================================
# Comparison Operators (Polymorphic)
#==============================================================================

# eq(number, number) -> bool
# eq(string, string) -> bool
def _eq_impl(a: Value, b: Value) -> Value:
    """Equality operator - polymorphic for int/float/string"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind == "int" and b.kind == "int":
        return bool_val(a.value == b.value)
    if a.kind == "float" and b.kind == "float":
        return bool_val(a.value == b.value)
    if a.kind == "string" and b.kind == "string":
        return bool_val(a.value == b.value)
    # Mixed numeric comparison
    return bool_val(get_numeric(a) == get_numeric(b))


eq: Operator = (define_operator("core", "eq")
                .params(int_type(), int_type())
                .returns(bool_type())
                .pure(True)
                .impl(_eq_impl)
                .build())


# neq(number, number) -> bool
# neq(string, string) -> bool
def _neq_impl(a: Value, b: Value) -> Value:
    """Inequality operator - polymorphic for int/float/string"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind == "int" and b.kind == "int":
        return bool_val(a.value != b.value)
    if a.kind == "float" and b.kind == "float":
        return bool_val(a.value != b.value)
    if a.kind == "string" and b.kind == "string":
        return bool_val(a.value != b.value)
    # Mixed numeric comparison
    return bool_val(get_numeric(a) != get_numeric(b))


neq: Operator = (define_operator("core", "neq")
                 .params(int_type(), int_type())
                 .returns(bool_type())
                 .pure(True)
                 .impl(_neq_impl)
                 .build())


# lt(number, number) -> bool
def _lt_impl(a: Value, b: Value) -> Value:
    """Less than operator - numeric comparison"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    return bool_val(get_numeric(a) < get_numeric(b))


lt: Operator = (define_operator("core", "lt")
                .params(int_type(), int_type())
                .returns(bool_type())
                .pure(True)
                .impl(_lt_impl)
                .build())


# lte(number, number) -> bool
def _lte_impl(a: Value, b: Value) -> Value:
    """Less than or equal operator - numeric comparison"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    return bool_val(get_numeric(a) <= get_numeric(b))


lte: Operator = (define_operator("core", "lte")
                 .params(int_type(), int_type())
                 .returns(bool_type())
                 .pure(True)
                 .impl(_lte_impl)
                 .build())


# gt(number, number) -> bool
def _gt_impl(a: Value, b: Value) -> Value:
    """Greater than operator - numeric comparison"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    return bool_val(get_numeric(a) > get_numeric(b))


gt: Operator = (define_operator("core", "gt")
                .params(int_type(), int_type())
                .returns(bool_type())
                .pure(True)
                .impl(_gt_impl)
                .build())


# gte(number, number) -> bool
def _gte_impl(a: Value, b: Value) -> Value:
    """Greater than or equal operator - numeric comparison"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    return bool_val(get_numeric(a) >= get_numeric(b))


gte: Operator = (define_operator("core", "gte")
                 .params(int_type(), int_type())
                 .returns(bool_type())
                 .pure(True)
                 .impl(_gte_impl)
                 .build())


#==============================================================================
# String Operators
#==============================================================================

# concat(string, string) -> string
def _concat_impl(a: Value, b: Value) -> Value:
    """String concatenation"""
    if is_error(a):
        return a
    if is_error(b):
        return b
    if a.kind == "string" and b.kind == "string":
        return string_val(a.value + b.value)
    return error_val(ErrorCode.TYPE_ERROR.value, "concat expects string arguments")


concat: Operator = (define_operator("core", "concat")
                    .params(string_type(), string_type())
                    .returns(string_type())
                    .pure(True)
                    .impl(_concat_impl)
                    .build())


# substring(string, int, int) -> string
def _substring_impl(s: Value, start: Value, length: Value) -> Value:
    """Extract substring from start position with given length"""
    if is_error(s):
        return s
    if is_error(start):
        return start
    if is_error(length):
        return length

    if s.kind != "string":
        return error_val(ErrorCode.TYPE_ERROR.value, "substring expects string as first argument")
    if start.kind != "int" or length.kind != "int":
        return error_val(ErrorCode.TYPE_ERROR.value, "substring expects int indices")

    start_val = start.value
    length_val = length.value
    str_val = s.value

    # Handle negative or out-of-bounds start
    if start_val < 0:
        start_val = 0
    if start_val >= len(str_val):
        return string_val("")

    # Handle negative or excessive length
    if length_val < 0:
        return string_val("")
    end_val = min(start_val + length_val, len(str_val))

    return string_val(str_val[start_val:end_val])


substring: Operator = (define_operator("core", "substring")
                       .params(string_type(), int_type(), int_type())
                       .returns(string_type())
                       .pure(True)
                       .impl(_substring_impl)
                       .build())


#==============================================================================
# Registry Creation
#==============================================================================

def create_core_registry() -> OperatorRegistry:
    """
    Create the core domain registry with all arithmetic, comparison, and string operators.
    Operators are polymorphic and handle different numeric types at runtime.
    """
    registry = OperatorRegistry()

    # Arithmetic operators (polymorphic: returns int for int inputs, float for float inputs)
    registry.register(add)
    registry.register(sub)
    registry.register(mul)
    registry.register(div)
    registry.register(mod)
    registry.register(pow_op)
    registry.register(neg)

    # Comparison operators (polymorphic)
    registry.register(eq)
    registry.register(neq)
    registry.register(lt)
    registry.register(lte)
    registry.register(gt)
    registry.register(gte)

    # String operators
    registry.register(concat)
    registry.register(substring)

    return registry
