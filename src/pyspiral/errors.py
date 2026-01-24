# SPIRAL Error Types
# Error domain for type checking and evaluation errors

from __future__ import annotations

from enum import Enum
from typing import Any

from pyspiral.types import Type, Value


#==============================================================================
# Error Codes
#==============================================================================

class ErrorCodes(str, Enum):
    """Error code constants for SPIRAL errors"""

    # Type errors
    TYPE_ERROR = "TypeError"
    ARITY_ERROR = "ArityError"

    # Domain errors
    DOMAIN_ERROR = "DomainError"
    DIVIDE_BY_ZERO = "DivideByZero"

    # Lookup errors
    UNKNOWN_OPERATOR = "UnknownOperator"
    UNKNOWN_DEFINITION = "UnknownDefinition"
    UNBOUND_IDENTIFIER = "UnboundIdentifier"

    # Termination errors
    NON_TERMINATION = "NonTermination"

    # Timeout errors
    TIMEOUT_ERROR = "TimeoutError"
    SELECT_TIMEOUT = "SelectTimeout"

    # Validation errors
    VALIDATION_ERROR = "ValidationError"
    MISSING_REQUIRED_FIELD = "MissingRequiredField"
    INVALID_ID_FORMAT = "InvalidIdFormat"
    INVALID_TYPE_FORMAT = "InvalidTypeFormat"
    INVALID_EXPR_FORMAT = "InvalidExprFormat"
    DUPLICATE_NODE_ID = "DuplicateNodeId"
    INVALID_RESULT_REFERENCE = "InvalidResultReference"
    CYCLIC_REFERENCE = "CyclicReference"


#==============================================================================
# SPIRAL Error Class
#==============================================================================

class SPIRALError(Exception):
    """Base exception class for all SPIRAL errors"""

    def __init__(self, code: ErrorCodes, message: str, meta: dict[str, Value] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.meta = meta

    def __str__(self) -> str:
        return self.message

    def to_value(self) -> Value:
        """Convert to Value representation"""
        result: Value = {
            "kind": "error",
            "code": self.code.value,
        }
        if self.meta is not None:
            result["meta"] = self.meta
        return result

    #---------------------------------------------------------------------------
    # Static factory methods for common errors
    #---------------------------------------------------------------------------

    @staticmethod
    def type_error(expected: Type, got: Type, context: str | None = None) -> "SPIRALError":
        """Create a TypeError"""
        ctx = f" ({context})" if context else ""
        return SPIRALError(
            ErrorCodes.TYPE_ERROR,
            f"Type error{ctx}: expected {format_type(expected)}, got {format_type(got)}",
        )

    @staticmethod
    def arity_error(expected: int, got: int, name: str) -> "SPIRALError":
        """Create an ArityError"""
        return SPIRALError(
            ErrorCodes.ARITY_ERROR,
            f"Arity error: {name} expects {expected} arguments, got {got}",
        )

    @staticmethod
    def domain_error(message: str) -> "SPIRALError":
        """Create a DomainError"""
        return SPIRALError(ErrorCodes.DOMAIN_ERROR, message)

    @staticmethod
    def divide_by_zero() -> "SPIRALError":
        """Create a DivideByZero error"""
        return SPIRALError(ErrorCodes.DIVIDE_BY_ZERO, "Division by zero")

    @staticmethod
    def unknown_operator(ns: str, name: str) -> "SPIRALError":
        """Create an UnknownOperator error"""
        return SPIRALError(
            ErrorCodes.UNKNOWN_OPERATOR,
            f"Unknown operator: {ns}:{name}",
        )

    @staticmethod
    def unknown_definition(ns: str, name: str) -> "SPIRALError":
        """Create an UnknownDefinition error"""
        return SPIRALError(
            ErrorCodes.UNKNOWN_DEFINITION,
            f"Unknown definition: {ns}:{name}",
        )

    @staticmethod
    def unbound_identifier(name: str) -> "SPIRALError":
        """Create an UnboundIdentifier error"""
        return SPIRALError(
            ErrorCodes.UNBOUND_IDENTIFIER,
            f"Unbound identifier: {name}",
        )

    @staticmethod
    def non_termination() -> "SPIRALError":
        """Create a NonTermination error"""
        return SPIRALError(
            ErrorCodes.NON_TERMINATION,
            "Expression evaluation did not terminate",
        )

    @staticmethod
    def validation(path: str, message: str, value: Any | None = None) -> "SPIRALError":
        """Create a ValidationError"""
        value_str = f" (value: {value!r})" if value is not None else ""
        return SPIRALError(
            ErrorCodes.VALIDATION_ERROR,
            f"Validation error at {path}: {message}{value_str}",
        )


#==============================================================================
# Type Formatting (for error messages)
#==============================================================================

def format_type(t: Type) -> str:
    """Format a Type for error messages"""
    kind = t["kind"]

    if kind == "bool":
        return "bool"
    elif kind == "int":
        return "int"
    elif kind == "float":
        return "float"
    elif kind == "string":
        return "string"
    elif kind == "void":
        return "void"
    elif kind == "set":
        return f"set<{format_type(t['of'])}>"
    elif kind == "list":
        return f"list<{format_type(t['of'])}>"
    elif kind == "map":
        return f"map<{format_type(t['key'])}, {format_type(t['value'])}>"
    elif kind == "option":
        return f"option<{format_type(t['of'])}>"
    elif kind == "ref":
        return f"ref<{format_type(t['of'])}>"
    elif kind == "opaque":
        return f"opaque({t['name']})"
    elif kind == "fn":
        params_str = ", ".join(format_type(p) for p in t["params"])
        return f"fn({params_str}) -> {format_type(t['returns'])}"
    else:
        # Exhaustive checking - this should never be reached
        return "unknown"


#==============================================================================
# Validation Error Types
#==============================================================================

class ValidationError:
    """A single validation error"""

    def __init__(self, path: str, message: str, value: Any | None = None):
        self.path = path
        self.message = message
        self.value = value


class ValidationResult:
    """Result of a validation operation"""

    def __init__(self, valid: bool, errors: list[ValidationError], value: Any | None = None):
        self.valid = valid
        self.errors = errors
        self.value = value


def valid_result(value: Any) -> ValidationResult:
    """Create a successful validation result"""
    return ValidationResult(valid=True, errors=[], value=value)


def invalid_result(errors: list[ValidationError]) -> ValidationResult:
    """Create a failed validation result"""
    return ValidationResult(valid=False, errors=errors)


def combine_results(results: list[ValidationResult]) -> ValidationResult:
    """Combine multiple validation results"""
    all_errors: list[ValidationError] = []
    for r in results:
        all_errors.extend(r.errors)

    if all_errors:
        return invalid_result(all_errors)

    values = [r.value for r in results if r.value is not None]
    return valid_result(values)


#==============================================================================
# Exhaustiveness Checking
#==============================================================================

def exhaustive(value: Any) -> None:
    """
    Asserts that a value is unreachable, ensuring exhaustive handling.
    Use in switch default cases to ensure all variants are handled.

    Raises:
        AssertionError: If called (indicating unhandled case)

    Example:
        match expr["kind"]:
            case "lit":
                return ...
            case "var":
                return ...
            case _:
                exhaustive(expr)  # Error if a kind is missing
    """
    raise AssertionError(f"Unexpected value: {value!r}")
