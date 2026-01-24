# SPIRAL Schema Validator
# Manual structural validation for AIR, CIR, EIR, LIR, and PIR documents

from __future__ import annotations

import re
from typing import Any

from pyspiral.errors import (
    ValidationError,
    invalid_result,
    valid_result,
    ValidationResult,
)


#==============================================================================
# Validation Patterns
#==============================================================================

ID_PATTERN = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
SEMVER_PATTERN = re.compile(r'^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$')


#==============================================================================
# Validation State
#==============================================================================

class ValidationState:
    """State tracking during validation"""

    def __init__(self) -> None:
        self.errors: list[ValidationError] = []
        self.path: list[str] = []

    def push_path(self, segment: str) -> None:
        """Push a path segment onto the validation path"""
        self.path.append(segment)

    def pop_path(self) -> None:
        """Pop the last path segment from the validation path"""
        self.path.pop()

    def current_path(self) -> str:
        """Get the current validation path as a dot-separated string"""
        return ".".join(self.path) if self.path else "$"

    def add_error(self, message: str, value: Any | None = None) -> None:
        """Add a validation error to the state"""
        self.errors.append(ValidationError(
            path=self.current_path(),
            message=message,
            value=value,
        ))


#==============================================================================
# Primitive Validators
#==============================================================================

def validate_string(value: Any) -> bool:
    """Check if value is a string"""
    return isinstance(value, str)


def validate_array(value: Any) -> bool:
    """Check if value is a list"""
    return isinstance(value, list)


def validate_object(value: Any) -> bool:
    """Check if value is a dict (object)"""
    return isinstance(value, dict) and value is not None


def validate_id(value: Any) -> bool:
    """Check if value is a valid identifier string"""
    return isinstance(value, str) and ID_PATTERN.match(value) is not None


def validate_version(value: Any) -> bool:
    """Check if value is a valid semantic version string"""
    return isinstance(value, str) and SEMVER_PATTERN.match(value) is not None


#==============================================================================
# Type Validation
#==============================================================================

def validate_type(state: ValidationState, value: Any) -> bool:
    """Validate a Type object"""
    if not validate_object(value):
        state.add_error("Type must be an object", value)
        return False

    if not validate_string(value.get("kind")):
        state.add_error("Type must have 'kind' property", value)
        return False

    kind = value["kind"]

    if kind in ("bool", "int", "float", "string"):
        return True

    elif kind == "set":
        # Sets can use 'of', 'elem', or 'elementType' for the element type
        elem_prop = value.get("of") or value.get("elem") or value.get("elementType")
        if not elem_prop:
            state.add_error("set type must have 'of', 'elem', or 'elementType' property", value)
            return False

        prop_name = "of" if "of" in value else ("elem" if "elem" in value else "elementType")
        state.push_path(prop_name)
        result = validate_type(state, elem_prop)
        state.pop_path()
        return result

    elif kind in ("list", "option"):
        if "of" not in value:
            state.add_error(f"{kind} type must have 'of' property", value)
            return False
        state.push_path("of")
        result = validate_type(state, value["of"])
        state.pop_path()
        return result

    elif kind == "map":
        if "key" not in value or "value" not in value:
            state.add_error("map type must have 'key' and 'value' properties", value)
            return False
        state.push_path("key")
        key_valid = validate_type(state, value["key"])
        state.pop_path()
        state.push_path("value")
        val_valid = validate_type(state, value["value"])
        state.pop_path()
        return key_valid and val_valid

    elif kind == "opaque":
        if not validate_string(value.get("name")):
            state.add_error("opaque type must have 'name' property", value)
            return False
        return True

    elif kind == "fn":
        if not validate_array(value.get("params")):
            state.add_error("fn type must have 'params' array", value)
            return False
        if "returns" not in value:
            state.add_error("fn type must have 'returns' property", value)
            return False

        params_valid = True
        for i, param in enumerate(value["params"]):
            state.push_path(f"params[{i}]")
            if not validate_type(state, param):
                params_valid = False
            state.pop_path()

        state.push_path("returns")
        returns_valid = validate_type(state, value["returns"])
        state.pop_path()
        return params_valid and returns_valid

    else:
        state.add_error(f"Unknown type kind: {kind}", value)
        return False


#==============================================================================
# Expression Validation
#==============================================================================

def validate_expr(state: ValidationState, value: Any, allow_cir: bool) -> bool:
    """Validate an Expression object"""
    if not validate_object(value):
        state.add_error("Expression must be an object", value)
        return False

    if not validate_string(value.get("kind")):
        state.add_error("Expression must have 'kind' property", value)
        return False

    kind = value["kind"]

    if kind == "lit":
        if "type" not in value:
            state.add_error("lit expression must have 'type' property", value)
            return False
        state.push_path("type")
        result = validate_type(state, value["type"])
        state.pop_path()
        return result

    elif kind == "ref":
        if not validate_id(value.get("id")):
            state.add_error("ref expression must have valid 'id' property", value)
            return False
        return True

    elif kind == "var":
        if not validate_id(value.get("name")):
            state.add_error("var expression must have valid 'name' property", value)
            return False
        return True

    elif kind == "call":
        if not validate_id(value.get("ns")) or not validate_id(value.get("name")):
            state.add_error("call expression must have valid 'ns' and 'name' properties", value)
            return False
        if not validate_array(value.get("args")):
            state.add_error("call expression must have 'args' array", value)
            return False

        for arg in value.get("args", []):
            # Args can be either string identifiers (node refs) or inline expressions (objects)
            is_id = validate_id(arg)
            is_expr = validate_object(arg) and "kind" in arg
            if not is_id and not is_expr:
                state.add_error("call args must be valid identifiers or expressions", arg)
                return False
            # Validate inline expression args
            if is_expr:
                state.push_path("args")
                if not validate_expr(state, arg, False):
                    state.pop_path()
                    return False
                state.pop_path()
        return True

    elif kind == "if":
        # Support both node references (strings) and inline expressions (objects)
        has_node_refs = (
            validate_id(value.get("cond")) and
            validate_id(value.get("then")) and
            validate_id(value.get("else"))
        )
        has_inline_exprs = (
            validate_object(value.get("cond")) and value.get("cond") is not None and
            validate_object(value.get("then")) and value.get("then") is not None and
            validate_object(value.get("else")) and value.get("else") is not None
        )

        if not has_node_refs and not has_inline_exprs:
            state.add_error(
                "if expression must have 'cond', 'then', 'else' as identifiers or expressions",
                value
            )
            return False

        # Validate inline expressions if present
        if not has_node_refs:
            for field in ["cond", "then", "else"]:
                field_val = value.get(field)
                if validate_object(field_val) and field_val is not None:
                    state.push_path(field)
                    if not validate_expr(state, field_val, False):
                        state.pop_path()
                        return False
                    state.pop_path()

            # type is required for inline expressions
            if "type" not in value:
                state.add_error("if expression must have 'type' property for inline expressions", value)
                return False
            state.push_path("type")
            result = validate_type(state, value["type"])
            state.pop_path()
            return result

        return True

    elif kind == "let":
        if not validate_id(value.get("name")):
            state.add_error("let expression must have 'name' identifier", value)
            return False

        has_node_refs = validate_id(value.get("value")) and validate_id(value.get("body"))
        has_inline_exprs = (
            validate_object(value.get("value")) and value.get("value") is not None and
            validate_object(value.get("body")) and value.get("body") is not None
        )

        if not has_node_refs and not has_inline_exprs:
            state.add_error(
                "let expression must have 'value', 'body' as identifiers or expressions",
                value
            )
            return False

        # Validate inline expressions if present
        if not has_node_refs:
            for field in ["value", "body"]:
                field_val = value.get(field)
                if validate_object(field_val) and field_val is not None:
                    state.push_path(field)
                    if not validate_expr(state, field_val, False):
                        state.pop_path()
                        return False
                    state.pop_path()

        return True

    elif kind == "airRef":
        if not validate_id(value.get("ns")) or not validate_id(value.get("name")):
            state.add_error("airRef expression must have valid 'ns' and 'name' properties", value)
            return False
        if not validate_array(value.get("args")):
            state.add_error("airRef expression must have 'args' array", value)
            return False
        for arg in value.get("args", []):
            if not validate_id(arg):
                state.add_error("airRef args must be valid identifiers", arg)
                return False
        return True

    elif kind == "predicate":
        if not validate_id(value.get("name")) or not validate_id(value.get("value")):
            state.add_error("predicate expression must have 'name' and 'value' identifiers", value)
            return False
        return True

    elif kind == "lambda":
        if not allow_cir:
            state.add_error("lambda expression is only allowed in CIR documents", value)
            return False
        if not validate_array(value.get("params")):
            state.add_error("lambda expression must have 'params' array", value)
            return False

        for param in value.get("params", []):
            if isinstance(param, str):
                if not validate_id(param):
                    state.add_error("lambda param must be a valid identifier", param)
                    return False
            elif validate_object(param):
                if not validate_id(param.get("name")):
                    state.add_error("lambda param must have a valid 'name' identifier", param)
                    return False
                if "optional" in param and not isinstance(param["optional"], bool):
                    state.add_error("lambda param 'optional' must be a boolean", param)
                    return False
                if "default" in param:
                    param_idx = value["params"].index(param)
                    state.push_path(f"params[{param_idx}].default")
                    if not validate_expr(state, param["default"], False):
                        state.pop_path()
                        return False
                    state.pop_path()
            else:
                state.add_error("lambda param must be a string or object", param)
                return False

        if not validate_id(value.get("body")):
            state.add_error("lambda expression must have 'body' identifier", value)
            return False
        if "type" not in value:
            state.add_error("lambda expression must have 'type' property", value)
            return False
        state.push_path("type")
        result = validate_type(state, value["type"])
        state.pop_path()
        return result

    elif kind == "callExpr":
        if not allow_cir:
            state.add_error("callExpr expression is only allowed in CIR documents", value)
            return False
        if not validate_id(value.get("fn")):
            state.add_error("callExpr expression must have valid 'fn' property", value)
            return False
        if not validate_array(value.get("args")):
            state.add_error("callExpr expression must have 'args' array", value)
            return False

        for arg in value.get("args", []):
            is_id = validate_id(arg)
            is_expr = validate_object(arg) and "kind" in arg
            if not is_id and not is_expr:
                state.add_error("callExpr args must be valid identifiers or expressions", arg)
                return False
            if is_expr:
                state.push_path("args")
                if not validate_expr(state, arg, False):
                    state.pop_path()
                    return False
                state.pop_path()
        return True

    elif kind == "fix":
        if not allow_cir:
            state.add_error("fix expression is only allowed in CIR documents", value)
            return False
        if not validate_id(value.get("fn")):
            state.add_error("fix expression must have valid 'fn' property", value)
            return False
        if "type" not in value:
            state.add_error("fix expression must have 'type' property", value)
            return False
        state.push_path("type")
        result = validate_type(state, value["type"])
        state.pop_path()
        return result

    else:
        state.add_error(f"Unknown expression kind: {kind}", value)
        return False


#==============================================================================
# AIR Definition Validation
#==============================================================================

def validate_air_def(state: ValidationState, value: Any) -> bool:
    """Validate an AIR definition"""
    if not validate_object(value):
        state.add_error("airDef must be an object", value)
        return False

    if not validate_id(value.get("ns")):
        state.add_error("airDef must have valid 'ns' property", value)
        return False

    if not validate_id(value.get("name")):
        state.add_error("airDef must have valid 'name' property", value)
        return False

    if not validate_array(value.get("params")):
        state.add_error("airDef must have 'params' array", value)
        return False

    for param in value.get("params", []):
        if not validate_id(param):
            state.add_error("airDef params must be valid identifiers", param)
            return False

    if "result" not in value:
        state.add_error("airDef must have 'result' type", value)
        return False
    state.push_path("result")
    result_valid = validate_type(state, value["result"])
    state.pop_path()

    if "body" not in value:
        state.add_error("airDef must have 'body' expression", value)
        return False
    state.push_path("body")
    body_valid = validate_expr(state, value["body"], False)
    state.pop_path()

    return result_valid and body_valid


#==============================================================================
# Document Validation - AIR
#==============================================================================

def validate_air(doc: Any) -> ValidationResult:
    """Validate an AIR document"""
    state = ValidationState()

    # Top-level structure check
    if not validate_object(doc):
        state.add_error("Document must be an object", doc)
        return invalid_result(state.errors)

    # Version check
    if not validate_version(doc.get("version")):
        state.push_path("version")
        state.add_error("Document must have valid semantic version", doc.get("version"))
        state.pop_path()

    # Capabilities (optional)
    if "capabilities" in doc and not validate_array(doc["capabilities"]):
        state.push_path("capabilities")
        state.add_error("capabilities must be an array", doc["capabilities"])
        state.pop_path()

    # Function signatures (optional)
    if "functionSigs" in doc and not validate_array(doc["functionSigs"]):
        state.push_path("functionSigs")
        state.add_error("functionSigs must be an array", doc["functionSigs"])
        state.pop_path()

    # AIR defs check
    if not validate_array(doc.get("airDefs")):
        state.push_path("airDefs")
        state.add_error("Document must have 'airDefs' array", doc.get("airDefs"))
        state.pop_path()
    else:
        for i, air_def in enumerate(doc.get("airDefs", [])):
            state.push_path(f"airDefs[{i}]")
            validate_air_def(state, air_def)
            state.pop_path()

    # Nodes check
    if not validate_array(doc.get("nodes")):
        state.push_path("nodes")
        state.add_error("Document must have 'nodes' array", doc.get("nodes"))
        state.pop_path()
    else:
        nodes = doc.get("nodes", [])
        node_ids = set()

        for i, node in enumerate(nodes):
            state.push_path(f"nodes[{i}]")

            if not validate_object(node):
                state.add_error("Node must be an object", node)
                state.pop_path()
                continue

            # Node ID check
            if not validate_id(node.get("id")):
                state.add_error("Node must have valid 'id' property", node.get("id"))
            else:
                node_id = node["id"]
                if node_id in node_ids:
                    state.add_error(f"Duplicate node id: {node_id}", node_id)
                node_ids.add(node_id)

            # Node expression or blocks check (hybrid support)
            if validate_array(node.get("blocks")):
                # Block node - validate CFG structure
                validate_hybrid_block_node(state, node, node_ids)
            elif "expr" in node:
                # Expression node
                state.push_path("expr")
                validate_expr(state, node["expr"], False)
                state.pop_path()
            else:
                state.add_error("Node must have either 'blocks' array or 'expr' property", node)

            state.pop_path()

    # Result check
    if not validate_id(doc.get("result")):
        state.push_path("result")
        state.add_error("Document must have valid 'result' reference", doc.get("result"))
        state.pop_path()
    else:
        # Check that result references a valid node
        nodes = doc.get("nodes", [])
        node_ids = {n["id"] for n in nodes if validate_id(n.get("id"))}
        if doc.get("result") not in node_ids:
            state.push_path("result")
            state.add_error(f"Result references non-existent node: {doc.get('result')}", doc.get("result"))
            state.pop_path()

    # Build node map for acyclic checking
    if validate_array(doc.get("nodes")):
        nodes = doc.get("nodes", [])
        node_map = {n["id"]: n for n in nodes if validate_id(n.get("id"))}

        # Check each node for cycles
        for node in nodes:
            if validate_id(node.get("id")):
                check_acyclic(state, node_map, node["id"], set(), [node["id"]])

    if state.errors:
        return invalid_result(state.errors)

    return valid_result(doc)


#==============================================================================
# Document Validation - CIR
#==============================================================================

def validate_cir(doc: Any) -> ValidationResult:
    """Validate a CIR document"""
    state = ValidationState()

    # Top-level structure check
    if not validate_object(doc):
        state.add_error("Document must be an object", doc)
        return invalid_result(state.errors)

    # Version check
    if not validate_version(doc.get("version")):
        state.push_path("version")
        state.add_error("Document must have valid semantic version", doc.get("version"))
        state.pop_path()

    # Capabilities (optional)
    if "capabilities" in doc and not validate_array(doc["capabilities"]):
        state.push_path("capabilities")
        state.add_error("capabilities must be an array", doc["capabilities"])
        state.pop_path()

    # AIR defs check
    if not validate_array(doc.get("airDefs")):
        state.push_path("airDefs")
        state.add_error("Document must have 'airDefs' array", doc.get("airDefs"))
        state.pop_path()
    else:
        for i, air_def in enumerate(doc.get("airDefs", [])):
            state.push_path(f"airDefs[{i}]")
            validate_air_def(state, air_def)
            state.pop_path()

    # Nodes check (allow CIR expressions)
    if not validate_array(doc.get("nodes")):
        state.push_path("nodes")
        state.add_error("Document must have 'nodes' array", doc.get("nodes"))
        state.pop_path()
    else:
        nodes = doc.get("nodes", [])
        node_ids = set()

        for i, node in enumerate(nodes):
            state.push_path(f"nodes[{i}]")

            if not validate_object(node):
                state.add_error("Node must be an object", node)
                state.pop_path()
                continue

            # Node ID check
            if not validate_id(node.get("id")):
                state.add_error("Node must have valid 'id' property", node.get("id"))
            else:
                node_id = node["id"]
                if node_id in node_ids:
                    state.add_error(f"Duplicate node id: {node_id}", node_id)
                node_ids.add(node_id)

            # Node expression or blocks check (hybrid support, allow CIR)
            if validate_array(node.get("blocks")):
                # Block node - validate CFG structure
                validate_hybrid_block_node(state, node, node_ids)
            elif "expr" in node:
                # Expression node
                state.push_path("expr")
                validate_expr(state, node["expr"], True)
                state.pop_path()
            else:
                state.add_error("Node must have either 'blocks' array or 'expr' property", node)

            state.pop_path()

    # Result check
    if not validate_id(doc.get("result")):
        state.push_path("result")
        state.add_error("Document must have valid 'result' reference", doc.get("result"))
        state.pop_path()
    else:
        nodes = doc.get("nodes", [])
        node_ids = {n["id"] for n in nodes if validate_id(n.get("id"))}
        if doc.get("result") not in node_ids:
            state.push_path("result")
            state.add_error(f"Result references non-existent node: {doc.get('result')}", doc.get("result"))
            state.pop_path()

    # Build node map for acyclic checking
    if validate_array(doc.get("nodes")):
        nodes = doc.get("nodes", [])
        node_map = {n["id"]: n for n in nodes if validate_id(n.get("id"))}
        all_params_and_bindings = set()

        # Collect lambda parameters and let bindings
        for node in nodes:
            if "expr" in node and validate_object(node["expr"]):
                collect_params_and_bindings(node["expr"], all_params_and_bindings)

        # Check each node for cycles
        for node in nodes:
            if validate_id(node.get("id")):
                check_acyclic(
                    state,
                    node_map,
                    node["id"],
                    set(),
                    [node["id"]],
                    all_params_and_bindings
                )

    if state.errors:
        return invalid_result(state.errors)

    return valid_result(doc)


#==============================================================================
# Document Validation - EIR
#==============================================================================

def validate_eir(doc: Any) -> ValidationResult:
    """Validate an EIR document"""
    state = ValidationState()

    if not validate_object(doc):
        state.add_error("Document must be an object", doc)
        return invalid_result(state.errors)

    # Version check
    state.push_path("version")
    if not validate_string(doc.get("version")) or not validate_version(doc.get("version")):
        state.add_error("Document must have valid semantic version", doc.get("version"))
    state.pop_path()

    # Capabilities (optional)
    if "capabilities" in doc:
        state.push_path("capabilities")
        if not validate_array(doc["capabilities"]):
            state.add_error("capabilities must be an array", doc["capabilities"])
        state.pop_path()

    # AIR defs
    state.push_path("airDefs")
    if not validate_array(doc.get("airDefs")):
        state.add_error("airDefs must be an array", doc.get("airDefs"))
    state.pop_path()

    # Nodes
    node_ids = set()
    if validate_array(doc.get("nodes")):
        nodes = doc.get("nodes", [])
        state.push_path("nodes")
        for i, node in enumerate(nodes):
            state.push_path(f"[{i}]")

            if not validate_object(node):
                state.add_error("Node must be an object", node)
                state.pop_path()
                state.pop_path()
                continue

            # Validate node id
            state.push_path("id")
            if not validate_id(node.get("id")):
                state.add_error("Node must have valid id", node.get("id"))
            else:
                node_id = node["id"]
                if node_id in node_ids:
                    state.add_error(f"Duplicate node id: {node_id}", node_id)
                node_ids.add(node_id)
            state.pop_path()

            # Validate expr or blocks
            if validate_array(node.get("blocks")):
                validate_hybrid_block_node(state, node, node_ids)
            elif validate_object(node.get("expr")):
                state.push_path("expr")
                validate_eir_expr(state, node["expr"])
                state.pop_path()
            else:
                state.add_error("Node must have either 'blocks' array or 'expr' property", node)

            state.pop_path()
        state.pop_path()
    else:
        state.add_error("nodes must be an array", doc.get("nodes"))

    # Result
    state.push_path("result")
    if not validate_id(doc.get("result")):
        state.add_error("Result must be a valid identifier", doc.get("result"))
    else:
        result_id = doc["result"]
        if result_id not in node_ids:
            state.add_error(f"Result references non-existent node: {result_id}", result_id)
    state.pop_path()

    # Validate node references in EIR expressions
    if validate_array(doc.get("nodes")):
        for node in doc.get("nodes", []):
            if validate_object(node) and validate_object(node.get("expr")):
                validate_eir_node_references(state, node["expr"], node_ids)

    if state.errors:
        return invalid_result(state.errors)

    return valid_result(doc)


def validate_eir_expr(state: ValidationState, expr: dict[str, Any]) -> None:
    """Validate EIR-specific expressions"""
    if not validate_string(expr.get("kind")):
        state.add_error("Expression must have 'kind' property", expr)
        return

    kind = expr["kind"]

    if kind == "seq":
        if not validate_id(expr.get("first")):
            state.add_error("seq expression must have valid 'first' identifier", expr)
        if not validate_id(expr.get("then")):
            state.add_error("seq expression must have valid 'then' identifier", expr)

    elif kind == "assign":
        if not validate_id(expr.get("target")):
            state.add_error("assign expression must have valid 'target' identifier", expr)
        if not validate_id(expr.get("value")):
            state.add_error("assign expression must have valid 'value' identifier", expr)

    elif kind == "while":
        if not validate_id(expr.get("cond")):
            state.add_error("while expression must have valid 'cond' identifier", expr)
        if not validate_id(expr.get("body")):
            state.add_error("while expression must have valid 'body' identifier", expr)

    elif kind == "for":
        if not validate_id(expr.get("var")):
            state.add_error("for expression must have valid 'var' identifier", expr)
        if not validate_id(expr.get("init")):
            state.add_error("for expression must have valid 'init' identifier", expr)
        if not validate_id(expr.get("cond")):
            state.add_error("for expression must have valid 'cond' identifier", expr)
        if not validate_id(expr.get("update")):
            state.add_error("for expression must have valid 'update' identifier", expr)
        if not validate_id(expr.get("body")):
            state.add_error("for expression must have valid 'body' identifier", expr)

    elif kind == "iter":
        if not validate_id(expr.get("var")):
            state.add_error("iter expression must have valid 'var' identifier", expr)
        if not validate_id(expr.get("iter")):
            state.add_error("iter expression must have valid 'iter' identifier", expr)
        if not validate_id(expr.get("body")):
            state.add_error("iter expression must have valid 'body' identifier", expr)

    elif kind == "effect":
        if not validate_string(expr.get("op")):
            state.add_error("effect expression must have valid 'op' string", expr)
        if not validate_array(expr.get("args")):
            state.add_error("effect expression must have 'args' array", expr)
        else:
            for arg in expr.get("args", []):
                if not validate_id(arg):
                    state.add_error("effect args must be valid identifiers", arg)

    elif kind == "try":
        if not validate_id(expr.get("tryBody")):
            state.add_error("try expression must have valid 'tryBody' identifier", expr)
        if not validate_id(expr.get("catchParam")):
            state.add_error("try expression must have valid 'catchParam' identifier", expr)
        if not validate_id(expr.get("catchBody")):
            state.add_error("try expression must have valid 'catchBody' identifier", expr)
        if "fallback" in expr and not validate_id(expr["fallback"]):
            state.add_error("try expression fallback must be a valid identifier", expr)

    elif kind == "refCell":
        if not validate_id(expr.get("target")):
            state.add_error("refCell expression must have valid 'target' identifier", expr)

    elif kind == "deref":
        if not validate_id(expr.get("target")):
            state.add_error("deref expression must have valid 'target' identifier", expr)

    # CIR and AIR expressions are already validated
    elif kind in ("lit", "ref", "var", "call", "if", "let", "airRef", "predicate",
                  "lambda", "callExpr", "fix"):
        pass

    else:
        state.add_error(f"Unknown expression kind in EIR: {kind}", expr)


def validate_eir_node_references(
    state: ValidationState,
    expr: dict[str, Any],
    node_ids: set[str],
) -> None:
    """Validate node references in EIR expressions"""
    if not validate_string(expr.get("kind")):
        return

    kind = expr["kind"]

    def check_ref(ref: Any, name: str) -> None:
        if validate_id(ref):
            ref_id = ref
            if ref_id not in node_ids:
                state.add_error(f"{name} references non-existent node: {ref_id}", ref_id)

    if kind == "seq":
        check_ref(expr.get("first"), "seq.first")
        check_ref(expr.get("then"), "seq.then")
    elif kind == "assign":
        check_ref(expr.get("value"), "assign.value")
    elif kind == "while":
        check_ref(expr.get("cond"), "while.cond")
        check_ref(expr.get("body"), "while.body")
    elif kind == "for":
        check_ref(expr.get("init"), "for.init")
        check_ref(expr.get("cond"), "for.cond")
        check_ref(expr.get("update"), "for.update")
        check_ref(expr.get("body"), "for.body")
    elif kind == "iter":
        check_ref(expr.get("iter"), "iter.iter")
        check_ref(expr.get("body"), "iter.body")
    elif kind == "effect":
        if validate_array(expr.get("args")):
            for i, arg in enumerate(expr["args"]):
                check_ref(arg, f"effect.args[{i}]")
    elif kind == "try":
        check_ref(expr.get("tryBody"), "try.tryBody")
        check_ref(expr.get("catchBody"), "try.catchBody")
        if "fallback" in expr:
            check_ref(expr["fallback"], "try.fallback")


#==============================================================================
# Document Validation - LIR
#==============================================================================

def validate_lir(doc: Any) -> ValidationResult:
    """Validate an LIR document"""
    state = ValidationState()

    if not validate_object(doc):
        state.add_error("LIR Document must be an object", doc)
        return invalid_result(state.errors)

    # Version check
    if not validate_version(doc.get("version")):
        state.push_path("version")
        state.add_error("Document must have valid semantic version", doc.get("version"))
        state.pop_path()

    # Capabilities (optional)
    if "capabilities" in doc and not validate_array(doc["capabilities"]):
        state.push_path("capabilities")
        state.add_error("capabilities must be an array", doc["capabilities"])
        state.pop_path()

    # Nodes check
    if not validate_array(doc.get("nodes")):
        state.push_path("nodes")
        state.add_error("LIR Document must have 'nodes' array", doc.get("nodes"))
        state.pop_path()
        return invalid_result(state.errors)

    nodes = doc.get("nodes", [])
    node_ids = set()

    for i, node in enumerate(nodes):
        state.push_path(f"nodes[{i}]")

        if not validate_object(node):
            state.add_error("Node must be an object", node)
            state.pop_path()
            continue

        # Node ID check
        if not validate_id(node.get("id")):
            state.add_error("Node must have valid 'id' property", node.get("id"))
        else:
            node_id = node["id"]
            if node_id in node_ids:
                state.add_error(f"Duplicate node id: {node_id}", node_id)
            node_ids.add(node_id)

        # Check if this is a block node or expression node
        if validate_array(node.get("blocks")):
            validate_lir_block_node(state, node, node_ids)
        elif "expr" in node:
            state.push_path("expr")
            if not validate_object(node["expr"]):
                state.add_error("Expression must be an object", node["expr"])
            state.pop_path()
        else:
            state.add_error("Node must have either 'blocks' array or 'expr' property", node)

        state.pop_path()

    # Result check
    if not validate_id(doc.get("result")):
        state.push_path("result")
        state.add_error("LIR Document must have valid 'result' reference", doc.get("result"))
        state.pop_path()
    else:
        if doc.get("result") not in node_ids:
            state.push_path("result")
            state.add_error(f"Result references non-existent node: {doc.get('result')}", doc.get("result"))
            state.pop_path()

    if state.errors:
        return invalid_result(state.errors)

    return valid_result(doc)


#==============================================================================
# Document Validation - PIR
#==============================================================================

def validate_pir(doc: Any) -> ValidationResult:
    """Validate a PIR document"""
    state = ValidationState()

    if not validate_object(doc):
        state.add_error("Document must be an object", doc)
        return invalid_result(state.errors)

    # Check version (PIR uses version 2.x.x)
    version = doc.get("version")
    if version is not None and not validate_string(version):
        state.add_error("version must be a string", version)
    elif isinstance(version, str) and not re.match(r'^2\.\d+\.\d+$', version):
        state.add_error("PIR version must match 2.x.x format", version)

    # Check airDefs (optional)
    if "airDefs" in doc and not validate_array(doc["airDefs"]):
        state.add_error("airDefs must be an array", doc["airDefs"])

    # Check functionSigs (optional)
    if "functionSigs" in doc and not validate_array(doc["functionSigs"]):
        state.add_error("functionSigs must be an array", doc["functionSigs"])

    # Check capabilities (optional)
    if "capabilities" in doc:
        if not validate_array(doc["capabilities"]):
            state.add_error("capabilities must be an array", doc["capabilities"])
        else:
            valid_capabilities = {"async", "parallel", "channels", "hybrid"}
            for cap in doc["capabilities"]:
                if not validate_string(cap) or cap not in valid_capabilities:
                    state.add_error(f"Invalid capability: {cap}", cap)

    # Check nodes (required)
    if not validate_array(doc.get("nodes")):
        state.add_error("nodes must be an array", doc.get("nodes"))
    else:
        for i, node in enumerate(doc.get("nodes", [])):
            state.push_path(f"nodes[{i}]")
            validate_pir_node(node, state)
            state.pop_path()

    # Check result (required)
    if not validate_string(doc.get("result")):
        state.add_error("result must be a string (node ID)", doc.get("result"))

    if state.errors:
        return invalid_result(state.errors)

    return valid_result(doc)


def validate_pir_node(node: Any, state: ValidationState) -> None:
    """Validate a PIR node (expression or block-based)"""
    if not validate_object(node):
        state.add_error("Node must be an object", node)
        return

    # Check id
    if not validate_string(node.get("id")) or not re.match(r'^[A-Za-z][A-Za-z0-9_-]*$', node["id"]):
        state.add_error("id must be a valid identifier", node.get("id"))

    # Check for expr OR (blocks + entry)
    has_expr = "expr" in node
    has_blocks = "blocks" in node
    has_entry = "entry" in node

    if has_expr and (has_blocks or has_entry):
        state.add_error("Node cannot have both expr and blocks", node)
    elif not has_expr and (not has_blocks or not has_entry):
        state.add_error("Node must have either expr or (blocks + entry)", node)

    if has_expr:
        validate_pir_expr(node["expr"], state)

    if has_blocks:
        if not validate_array(node["blocks"]):
            state.add_error("blocks must be an array", node["blocks"])
        else:
            for i, block in enumerate(node["blocks"]):
                state.push_path(f"blocks[{i}]")
                validate_pir_block(block, state)
                state.pop_path()

    if has_entry and not validate_string(node["entry"]):
        state.add_error("entry must be a string (block ID)", node["entry"])


def validate_pir_expr(expr: Any, state: ValidationState) -> None:
    """Validate a PIR expression"""
    if not validate_object(expr):
        state.add_error("Expression must be an object", expr)
        return

    kind = expr.get("kind")

    if not validate_string(kind):
        state.add_error("Expression must have a 'kind' field", expr)
        return

    # PIR-specific expression kinds
    pir_kinds = {"par", "spawn", "await", "channel", "send", "recv", "select", "race"}
    # EIR expression kinds (PIR extends EIR)
    eir_kinds = {
        "lit", "var", "call", "if", "let", "lambda", "callExpr", "fix",
        "seq", "assign", "while", "for", "iter", "effect", "refCell"
    }

    if kind not in pir_kinds | eir_kinds:
        state.add_error(f"Unknown expression kind in PIR: {kind}", kind)
        return

    # Validate PIR-specific expressions
    if kind == "par":
        if not validate_array(expr.get("branches")) or len(expr["branches"]) < 2:
            state.add_error("par expression must have at least 2 branches", expr.get("branches"))

    elif kind == "spawn":
        if not validate_string(expr.get("task")):
            state.add_error("spawn expression must have a task (node ID)", expr.get("task"))

    elif kind == "await":
        if not validate_string(expr.get("future")):
            state.add_error("await expression must have a future (node ID)", expr.get("future"))

    elif kind == "channel":
        if not validate_string(expr.get("channelType")):
            state.add_error("channel expression must have a channelType", expr.get("channelType"))

    elif kind == "send":
        if not validate_string(expr.get("channel")) or not validate_string(expr.get("value")):
            state.add_error(
                "send expression must have channel and value (node IDs)",
                {"channel": expr.get("channel"), "value": expr.get("value")}
            )

    elif kind == "recv":
        if not validate_string(expr.get("channel")):
            state.add_error("recv expression must have a channel (node ID)", expr.get("channel"))

    elif kind == "select":
        if not validate_array(expr.get("futures")) or len(expr["futures"]) < 1:
            state.add_error("select expression must have at least 1 future", expr.get("futures"))

    elif kind == "race":
        if not validate_array(expr.get("tasks")) or len(expr["tasks"]) < 2:
            state.add_error("race expression must have at least 2 tasks", expr.get("tasks"))


def validate_pir_block(block: Any, state: ValidationState) -> None:
    """Validate a PIR block"""
    if not validate_object(block):
        state.add_error("Block must be an object", block)
        return

    if not validate_string(block.get("id")):
        state.add_error("Block must have an id", block.get("id"))

    if not validate_array(block.get("instructions")):
        state.add_error("Block must have instructions array", block.get("instructions"))

    if not validate_object(block.get("terminator")):
        state.add_error("Block must have a terminator object", block.get("terminator"))


#==============================================================================
# Block Node Validation (Hybrid CFG)
#==============================================================================

def validate_hybrid_block_node(
    state: ValidationState,
    node: dict[str, Any],
    node_ids: set[str],
) -> None:
    """Validate a hybrid block node for AIR/CIR/EIR documents"""
    blocks = node.get("blocks", [])
    block_ids = set()

    for i, block in enumerate(blocks):
        state.push_path(f"blocks[{i}]")

        if not validate_object(block):
            state.add_error("Block must be an object", block)
            state.pop_path()
            continue

        # Block ID check
        if not validate_id(block.get("id")):
            state.add_error("Block must have valid 'id' property", block.get("id"))
        else:
            block_id = block["id"]
            if block_id in block_ids:
                state.add_error(f"Duplicate block id: {block_id}", block_id)
            block_ids.add(block_id)

        # Instructions check
        if not validate_array(block.get("instructions")):
            state.add_error("Block must have 'instructions' array", block.get("instructions"))
        else:
            for j, ins in enumerate(block["instructions"]):
                state.push_path(f"instructions[{j}]")
                validate_hybrid_instruction(state, ins)
                state.pop_path()

        # Terminator check
        if "terminator" not in block:
            state.add_error("Block must have 'terminator' property", block)
        else:
            state.push_path("terminator")
            validate_lir_terminator(state, block["terminator"])
            state.pop_path()

        state.pop_path()

    # Entry check
    if not validate_id(node.get("entry")):
        state.push_path("entry")
        state.add_error("Block node must have valid 'entry' reference", node.get("entry"))
        state.pop_path()
    else:
        entry_id = node["entry"]
        if entry_id not in block_ids:
            state.push_path("entry")
            state.add_error(f"Entry references non-existent block: {entry_id}", entry_id)
            state.pop_path()


def validate_hybrid_instruction(state: ValidationState, ins: Any) -> None:
    """Validate an instruction in a hybrid block node"""
    if not validate_object(ins):
        state.add_error("Instruction must be an object", ins)
        return

    if not validate_string(ins.get("kind")):
        state.add_error("Instruction must have 'kind' property", ins)
        return

    kind = ins["kind"]

    if kind == "assign":
        if not validate_id(ins.get("target")):
            state.add_error("assign instruction must have valid 'target'", ins.get("target"))
        if "value" not in ins:
            state.add_error("assign instruction must have 'value' property", ins)

    elif kind == "op":
        if not validate_id(ins.get("target")):
            state.add_error("op instruction must have valid 'target'", ins.get("target"))
        if not validate_id(ins.get("ns")):
            state.add_error("op instruction must have valid 'ns'", ins.get("ns"))
        if not validate_id(ins.get("name")):
            state.add_error("op instruction must have valid 'name'", ins.get("name"))
        if not validate_array(ins.get("args")):
            state.add_error("op instruction must have 'args' array", ins.get("args"))

    elif kind == "phi":
        if not validate_id(ins.get("target")):
            state.add_error("phi instruction must have valid 'target'", ins.get("target"))
        if not validate_array(ins.get("sources")):
            state.add_error("phi instruction must have 'sources' array", ins.get("sources"))

    else:
        state.add_error(f"Unknown or disallowed instruction kind in hybrid block: {kind}", ins)


def validate_lir_block_node(
    state: ValidationState,
    node: dict[str, Any],
    node_ids: set[str],
) -> None:
    """Validate an LIR block node (a node with blocks/entry)"""
    blocks = node.get("blocks", [])
    block_ids = set()

    for i, block in enumerate(blocks):
        state.push_path(f"blocks[{i}]")

        if not validate_object(block):
            state.add_error("Block must be an object", block)
            state.pop_path()
            continue

        # Block ID check
        if not validate_id(block.get("id")):
            state.add_error("Block must have valid 'id' property", block.get("id"))
        else:
            block_id = block["id"]
            if block_id in block_ids:
                state.add_error(f"Duplicate block id: {block_id}", block_id)
            block_ids.add(block_id)

        # Instructions check
        if not validate_array(block.get("instructions")):
            state.add_error("Block must have 'instructions' array", block.get("instructions"))
        else:
            for j, ins in enumerate(block["instructions"]):
                state.push_path(f"instructions[{j}]")
                validate_lir_instruction(state, ins)
                state.pop_path()

        # Terminator check
        if "terminator" not in block:
            state.add_error("Block must have 'terminator' property", block)
        else:
            state.push_path("terminator")
            validate_lir_terminator(state, block["terminator"])
            state.pop_path()

        state.pop_path()

    # Entry check
    if not validate_id(node.get("entry")):
        state.push_path("entry")
        state.add_error("Block node must have valid 'entry' reference", node.get("entry"))
        state.pop_path()
    else:
        entry_id = node["entry"]
        if entry_id not in block_ids:
            state.push_path("entry")
            state.add_error(f"Entry references non-existent block: {entry_id}", entry_id)
            state.pop_path()

    # Validate CFG structure
    validate_cfg(state, blocks)


def validate_lir_instruction(state: ValidationState, ins: Any) -> None:
    """Validate an LIR instruction"""
    if not validate_object(ins):
        state.add_error("Instruction must be an object", ins)
        return

    if not validate_string(ins.get("kind")):
        state.add_error("Instruction must have 'kind' property", ins)
        return

    kind = ins["kind"]

    if kind == "assign":
        if not validate_id(ins.get("target")):
            state.add_error("assign instruction must have valid 'target'", ins.get("target"))
        if "value" not in ins:
            state.add_error("assign instruction must have 'value' property", ins)

    elif kind == "call":
        if not validate_id(ins.get("target")):
            state.add_error("call instruction must have valid 'target'", ins.get("target"))
        if not validate_id(ins.get("callee")):
            state.add_error("call instruction must have valid 'callee'", ins.get("callee"))
        if not validate_array(ins.get("args")):
            state.add_error("call instruction must have 'args' array", ins.get("args"))

    elif kind == "op":
        if not validate_id(ins.get("target")):
            state.add_error("op instruction must have valid 'target'", ins.get("target"))
        if not validate_id(ins.get("ns")):
            state.add_error("op instruction must have valid 'ns'", ins.get("ns"))
        if not validate_id(ins.get("name")):
            state.add_error("op instruction must have valid 'name'", ins.get("name"))
        if not validate_array(ins.get("args")):
            state.add_error("op instruction must have 'args' array", ins.get("args"))

    elif kind == "phi":
        if not validate_id(ins.get("target")):
            state.add_error("phi instruction must have valid 'target'", ins.get("target"))
        if not validate_array(ins.get("sources")):
            state.add_error("phi instruction must have 'sources' array", ins.get("sources"))

    elif kind == "effect":
        if not validate_string(ins.get("op")):
            state.add_error("effect instruction must have valid 'op'", ins.get("op"))
        if not validate_array(ins.get("args")):
            state.add_error("effect instruction must have 'args' array", ins.get("args"))

    elif kind == "assignRef":
        if not validate_id(ins.get("target")):
            state.add_error("assignRef instruction must have valid 'target'", ins.get("target"))
        if not validate_id(ins.get("value")):
            state.add_error("assignRef instruction must have 'value'", ins.get("value"))

    else:
        state.add_error(f"Unknown instruction kind: {kind}", ins)


def validate_lir_terminator(state: ValidationState, term: Any) -> None:
    """Validate an LIR terminator"""
    if not validate_object(term):
        state.add_error("Terminator must be an object", term)
        return

    if not validate_string(term.get("kind")):
        state.add_error("Terminator must have 'kind' property", term)
        return

    kind = term["kind"]

    if kind == "jump":
        if not validate_id(term.get("to")):
            state.add_error("jump terminator must have valid 'to' target", term.get("to"))

    elif kind == "branch":
        if not validate_id(term.get("cond")):
            state.add_error("branch terminator must have valid 'cond'", term.get("cond"))
        if not validate_id(term.get("then")):
            state.add_error("branch terminator must have valid 'then' target", term.get("then"))
        if not validate_id(term.get("else")):
            state.add_error("branch terminator must have valid 'else' target", term.get("else"))

    elif kind in ("return", "exit"):
        # value/code is optional
        pass

    else:
        state.add_error(f"Unknown terminator kind: {kind}", term)


def validate_cfg(state: ValidationState, blocks: list[dict[str, Any]]) -> None:
    """Validate CFG structure - check that jump/branch targets reference valid blocks"""
    block_ids = {b["id"] for b in blocks if validate_string(b.get("id"))}

    for block in blocks:
        if validate_object(block.get("terminator")):
            term = block["terminator"]
            kind = term.get("kind")

            if kind == "jump":
                to = term.get("to")
                if validate_string(to) and to not in block_ids:
                    state.add_error(f"Jump terminator references non-existent block: {to}", to)

            elif kind == "branch":
                then_target = term.get("then")
                else_target = term.get("else")
                if validate_string(then_target) and then_target not in block_ids:
                    state.add_error(f"Branch terminator references non-existent block: {then_target}", then_target)
                if validate_string(else_target) and else_target not in block_ids:
                    state.add_error(f"Branch terminator references non-existent block: {else_target}", else_target)

        # Check phi sources reference valid blocks
        if validate_array(block.get("instructions")):
            for ins in block["instructions"]:
                if validate_object(ins) and ins.get("kind") == "phi":
                    if validate_array(ins.get("sources")):
                        for source in ins["sources"]:
                            if validate_object(source):
                                source_block = source.get("block")
                                if validate_string(source_block) and source_block not in block_ids:
                                    state.add_error(
                                        f"Phi source references non-existent block: {source_block}",
                                        source_block
                                    )


#==============================================================================
# Acyclic Reference Checking
#==============================================================================

def check_acyclic(
    state: ValidationState,
    nodes: dict[str, Any],
    start_id: str,
    visited: set[str],
    path: list[str],
    lambda_params: set[str] | None = None,
) -> None:
    """Check for cyclic references in the node graph"""
    # Check for non-existent node
    node = nodes.get(start_id)
    if not validate_object(node):
        # Skip if this is a lambda parameter or let binding
        if lambda_params and start_id in lambda_params:
            return
        state.add_error(f"Reference to non-existent node: {start_id}")
        return

    # Skip block nodes
    if "expr" not in node:
        return

    # Check if already visited in current path
    if start_id in visited:
        # Check if any node in the path is a lambda
        has_lambda = any(
            nodes.get(node_id, {}).get("expr", {}).get("kind") == "lambda"
            for node_id in path
            if validate_object(nodes.get(node_id)) and "expr" in nodes[node_id]
        )
        if has_lambda:
            # This is recursion through a lambda, which is allowed
            return
        state.add_error(f"Cyclic reference detected: {' -> '.join(path + [start_id])}")
        return

    # Mark as visited
    visited.add(start_id)
    path.append(start_id)

    expr = node["expr"]
    if not validate_object(expr):
        path.pop()
        return

    # If this node is a lambda, collect its parameters
    if expr.get("kind") == "lambda":
        params = expr.get("params", [])
        if validate_array(params):
            param_set = set(lambda_params) if lambda_params else set()
            for p in params:
                if isinstance(p, str):
                    param_set.add(p)

            # Recursively check with the new parameter set
            refs, let_bindings = collect_refs_and_let_bindings(expr, param_set)
            for b in let_bindings:
                param_set.add(b)

            for ref_id in refs:
                check_acyclic(state, nodes, ref_id, visited.copy(), path.copy(), param_set)
            path.pop()
            return

    refs, let_bindings = collect_refs_and_let_bindings(expr, lambda_params)
    combined_params = set(lambda_params) if lambda_params else set()
    combined_params.update(let_bindings)

    for ref_id in refs:
        # Skip lambda parameters and let bindings
        if ref_id in let_bindings:
            continue
        if lambda_params and ref_id in lambda_params:
            continue
        check_acyclic(state, nodes, ref_id, visited.copy(), path.copy(), combined_params)

    path.pop()


def collect_refs_and_let_bindings(
    expr: dict[str, Any],
    params: set[str] | None = None,
    let_bindings: set[str] | None = None,
) -> tuple[list[str], set[str]]:
    """Collect node references and let binding names from an expression"""
    refs: list[str] = []
    bindings = set(let_bindings) if let_bindings else set()

    kind = expr.get("kind")

    if kind == "ref":
        ref_id = expr.get("id")
        if validate_string(ref_id):
            if (not params or ref_id not in params) and ref_id not in bindings:
                refs.append(ref_id)

    elif kind == "if":
        for field in ["cond", "then", "else"]:
            field_val = expr.get(field)
            if validate_string(field_val):
                if (not params or field_val not in params) and field_val not in bindings:
                    refs.append(field_val)
            elif validate_object(field_val):
                field_refs, field_bindings = collect_refs_and_let_bindings(
                    field_val, params, bindings
                )
                refs.extend(field_refs)
                bindings.update(field_bindings)

    elif kind == "let":
        let_name = expr.get("name")
        if validate_string(let_name):
            bindings.add(let_name)

        for field in ["value", "body"]:
            field_val = expr.get(field)
            if validate_string(field_val):
                if (not params or field_val not in params) and field_val not in bindings:
                    refs.append(field_val)
            elif validate_object(field_val):
                field_refs, field_bindings = collect_refs_and_let_bindings(
                    field_val, params, bindings
                )
                refs.extend(field_refs)
                bindings.update(field_bindings)

    elif kind == "call":
        args = expr.get("args", [])
        if validate_array(args):
            for arg in args:
                if validate_string(arg):
                    if (not params or arg not in params) and arg not in bindings:
                        refs.append(arg)

    elif kind == "lambda":
        lambda_params = expr.get("params", [])
        if validate_array(lambda_params):
            param_set = set(params) if params else set()
            for p in lambda_params:
                if isinstance(p, str):
                    param_set.add(p)

            body = expr.get("body")
            if validate_string(body):
                if body not in param_set and body not in bindings:
                    refs.append(body)
            elif validate_object(body):
                body_refs, body_bindings = collect_refs_and_let_bindings(
                    body, param_set, bindings
                )
                refs.extend(body_refs)
                bindings.update(body_bindings)

    elif kind == "callExpr":
        fn = expr.get("fn")
        if validate_string(fn) and (not params or fn not in params) and fn not in bindings:
            refs.append(fn)

        args = expr.get("args", [])
        if validate_array(args):
            for arg in args:
                if validate_string(arg):
                    if (not params or arg not in params) and arg not in bindings:
                        refs.append(arg)

    elif kind == "fix":
        fn = expr.get("fn")
        if validate_string(fn):
            refs.append(fn)

    return refs, bindings


def collect_params_and_bindings(expr: dict[str, Any], all_params: set[str]) -> None:
    """Recursively collect lambda parameters and let bindings from an expression"""
    kind = expr.get("kind")

    if kind == "lambda":
        params = expr.get("params", [])
        if validate_array(params):
            for p in params:
                if isinstance(p, str):
                    all_params.add(p)

        body = expr.get("body")
        if validate_object(body):
            collect_params_and_bindings(body, all_params)

    elif kind == "let":
        let_name = expr.get("name")
        if validate_string(let_name):
            all_params.add(let_name)

        for field in ["value", "body"]:
            field_val = expr.get(field)
            if validate_object(field_val):
                collect_params_and_bindings(field_val, all_params)

    elif kind == "if":
        for field in ["cond", "then", "else"]:
            field_val = expr.get(field)
            if validate_object(field_val):
                collect_params_and_bindings(field_val, all_params)
