#!/usr/bin/env python3
"""
SPIRAL Python CLI

A command-line interface for running and validating SPIRAL documents
(AIR, CIR, EIR, LIR, PIR layers) in Python.

Usage:
    python -m pyspiral.cli <path> [options]
    pyspiral <path> [options]

Examples:
    pyspiral examples/air/basics/arithmetic.air.json
    pyspiral examples/cir/algorithms/factorial.cir.json --verbose
    pyspiral examples/eir/interactive/prompt-uppercase.eir.json --inputs "hello"
    pyspiral examples/lir/control-flow/while-cfg.lir.json --trace
    pyspiral examples/pir/async/timeout-select.pir.json --inputs "test"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Literal

from pyspiral import (
    Value,
    evaluate,
    evaluate_program,
)
from pyspiral.validator import (
    validate_air,
    validate_cir,
    validate_eir,
    validate_lir,
    validate_pir,
    ValidationResult,
)
from pyspiral.domains.registry import (
    OperatorRegistry,
    create_core_registry,
    create_bool_registry,
    create_list_registry,
    create_set_registry,
)
from pyspiral.effects import (
    EffectRegistry,
    empty_effect_registry,
    create_queued_effect_registry,
    create_default_effect_registry,
)
from pyspiral.evaluator import Evaluator, EvalOptions
from pyspiral.lir.evaluator import (
    LIREvaluator,
    LIREvalOptions,
)
from pyspiral.lir.async_evaluator import (
    LIRAsyncEvaluator,
    LIRAsyncEvalOptions,
)


#==============================================================================
# Type Aliases
#==============================================================================

IRLayer = Literal["AIR", "CIR", "EIR", "LIR", "PIR"]
Document = dict[str, Any]


#==============================================================================
# CLI Output Formatting
#==============================================================================

class Colors:
    """ANSI color codes for terminal output"""
    RESET = "\x1b[0m"
    BOLD = "\x1b[1m"
    DIM = "\x1b[2m"
    RED = "\x1b[31m"
    GREEN = "\x1b[32m"
    YELLOW = "\x1b[33m"
    BLUE = "\x1b[34m"
    MAGENTA = "\x1b[35m"
    CYAN = "\x1b[36m"


def print_msg(msg: str, color: str = Colors.RESET) -> None:
    """Print a message with optional color"""
    print(f"{color}{msg}{Colors.RESET}")


def format_value(value: Value, indent: int = 0) -> str:
    """Format a value for display"""
    pad = "  " * indent

    # Import value kind checkers
    from pyspiral.types import (
        is_error, is_int, is_float, is_bool, is_string,
        is_list, is_set, is_closure, is_void,
    )

    if is_error(value):
        return f"{pad}{Colors.RED}Error: {value.code}{Colors.RESET}"
    if is_int(value) or is_float(value):
        return f"{pad}{Colors.CYAN}{value.value}{Colors.RESET}"
    if is_bool(value):
        return f"{pad}{Colors.MAGENTA}{value.value}{Colors.RESET}"
    if is_string(value):
        return f'{pad}{Colors.GREEN}"{value.value}"{Colors.RESET}'
    if is_list(value):
        elements = ", ".join(format_value(e, 0) for e in value.value)
        return f"{pad}[{elements}]"
    if is_set(value):
        elements = ", ".join(format_value({"kind": "string", "value": e}, 0) for e in value.value)
        return f"{pad}{{{elements}}}"
    if is_closure(value):
        return f"{pad}{Colors.YELLOW}<closure>{Colors.RESET}"
    if is_void(value):
        return f"{pad}{Colors.DIM}<void>{Colors.RESET}"

    return f"{pad}{json.dumps(value.__dict__)}"


#==============================================================================
# Input Parsing
#==============================================================================

def parse_input_string(input_str: str) -> list[str | int | float]:
    """
    Parse inputs from a comma-separated or JSON format string.

    Args:
        input_str: Input string in comma-separated or JSON array format

    Returns:
        List of strings, ints, and floats

    Examples:
        "1,2,3" -> [1, 2, 3]
        "[1, 2, 3]" -> [1, 2, 3]
        "hello,world" -> ["hello", "world"]
        '["hello", "world"]' -> ["hello", "world"]
    """
    try:
        # Try parsing as JSON first
        parsed = json.loads(input_str)
        if isinstance(parsed, list):
            result = []
            for v in parsed:
                if isinstance(v, (int, float)):
                    result.append(v)
                else:
                    result.append(str(v))
            return result
    except (json.JSONDecodeError, TypeError):
        pass

    # Parse as comma-separated values
    result = []
    for s in input_str.split(","):
        trimmed = s.strip()
        if trimmed == "":
            result.append("")
        else:
            # Try to convert to number
            try:
                if "." in trimmed:
                    result.append(float(trimmed))
                else:
                    result.append(int(trimmed))
            except ValueError:
                result.append(trimmed)
    return result


def read_inputs_file(file_path: str) -> list[str | int | float] | None:
    """
    Read inputs from a JSON file.

    Args:
        file_path: Path to JSON file

    Returns:
        List of strings and numbers, or None if file doesn't exist or is invalid

    Expected format: JSON array at top level
    Example: [1, 2, 3] or ["hello", "world"] or [1, "foo", 2]
    """
    try:
        with open(file_path, "r") as f:
            content = f.read()
        parsed = json.loads(content)
        if isinstance(parsed, list):
            result = []
            for v in parsed:
                if isinstance(v, (int, float)):
                    result.append(v)
                else:
                    result.append(str(v))
            return result
    except (FileNotFoundError, json.JSONDecodeError, TypeError):
        return None


#==============================================================================
# Document Loading
#==============================================================================

def detect_ir_layer(path: str, doc: Document | None = None) -> IRLayer:
    """
    Detect the IR layer from file path or document structure.

    Args:
        path: File path
        doc: Optional loaded document

    Returns:
        The detected IR layer (AIR, CIR, EIR, LIR, or PIR)
    """
    # Check file extension first
    if ".pir.json" in path or path.endswith(".pir"):
        return "PIR"
    if ".lir.json" in path or path.endswith(".lir"):
        return "LIR"
    if ".eir.json" in path or path.endswith(".eir"):
        return "EIR"
    if ".cir.json" in path or path.endswith(".cir"):
        return "CIR"
    if ".air.json" in path or path.endswith(".air"):
        return "AIR"

    # Check path hints
    if "/pir/" in path or path.startswith("pir/"):
        return "PIR"
    if "/lir/" in path or path.startswith("lir/"):
        return "LIR"
    if "/eir/" in path or path.startswith("eir/"):
        return "EIR"
    if "/cir/" in path or path.startswith("cir/"):
        return "CIR"

    # Default to AIR
    return "AIR"


def load_document(path: str) -> tuple[Document, IRLayer] | None:
    """
    Load a SPIRAL document from a file path.

    Args:
        path: Path to the document file

    Returns:
        Tuple of (document, IR layer) or None if not found
    """
    path_obj = Path(path)

    # If path doesn't exist, try common extensions
    if not path_obj.exists():
        for ext in [".air.json", ".cir.json", ".eir.json", ".lir.json", ".pir.json"]:
            test_path = Path(f"{path}{ext}")
            if test_path.exists():
                path_obj = test_path
                break
            else:
                test_path = Path(path).with_suffix(ext)
                if test_path.exists():
                    path_obj = test_path
                    break

        if not path_obj.exists():
            return None

    try:
        with open(path_obj, "r") as f:
            content = f.read()
        doc = json.loads(content)
        ir = detect_ir_layer(str(path_obj), doc)
        return doc, ir
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


#==============================================================================
# Document Validation
#==============================================================================

def validate_document(doc: Document, ir: IRLayer) -> ValidationResult:
    """
    Validate a SPIRAL document.

    Args:
        doc: The document to validate
        ir: The IR layer

    Returns:
        Validation result with errors if any
    """
    if ir == "AIR":
        return validate_air(doc)
    elif ir == "CIR":
        return validate_cir(doc)
    elif ir == "EIR":
        return validate_eir(doc)
    elif ir == "LIR":
        return validate_lir(doc)
    else:  # PIR
        return validate_pir(doc)


#==============================================================================
# Document Evaluation
#==============================================================================

def create_registry() -> OperatorRegistry:
    """Create a merged registry with all core operators"""
    registry = create_core_registry()
    registry.update(create_bool_registry())
    registry.update(create_list_registry())
    registry.update(create_set_registry())
    return registry


def evaluate_document(
    doc: Document,
    ir: IRLayer,
    registry: OperatorRegistry,
    effect_registry: EffectRegistry,
    inputs: list[str | int | float] | None = None,
    trace: bool = False,
) -> Value:
    """
    Evaluate a SPIRAL document.

    Args:
        doc: The document to evaluate
        ir: The IR layer
        registry: Operator registry
        effect_registry: Effect registry for I/O operations
        inputs: Optional input values for interactive programs
        trace: Whether to enable trace output

    Returns:
        The result value
    """
    # Import necessary types
    from pyspiral.env import empty_defs

    defs = empty_defs()

    # Extract airDefs if present
    if "airDefs" in doc and doc["airDefs"]:
        for air_def in doc["airDefs"]:
            defs[air_def["name"]] = air_def

    if ir == "AIR" or ir == "CIR":
        # For AIR/CIR, use the expression evaluator
        options = EvalOptions(trace=trace)
        evaluator = Evaluator(registry, defs)
        result = evaluator.evaluate_program(doc, options=options)
        return result

    elif ir == "EIR":
        # For EIR, use the expression evaluator with effects
        options = EvalOptions(trace=trace)
        evaluator = Evaluator(registry, defs)
        result = evaluator.evaluate_program(doc, options=options, effects=effect_registry)
        return result

    elif ir == "LIR":
        # For LIR, use the CFG evaluator
        options = LIREvalOptions(trace=trace, effects=effect_registry)
        evaluator = LIREvaluator(registry, effect_registry, options)
        result = evaluator.evaluate_document(doc)
        return result

    else:  # PIR
        # For PIR, use the async evaluator
        import asyncio
        options = LIRAsyncEvalOptions(trace=trace)
        evaluator = LIRAsyncEvaluator(registry, effect_registry, options)
        result = asyncio.run(evaluator.evaluate_document(doc))
        return result


#==============================================================================
# Main CLI
#==============================================================================

def run_document(
    path: str,
    inputs: list[str | int | float] | None = None,
    inputs_file: str | None = None,
    trace: bool = False,
    validate_only: bool = False,
    verbose: bool = False,
) -> int:
    """
    Run a SPIRAL document.

    Args:
        path: Path to the document
        inputs: Input values (comma-separated or JSON)
        inputs_file: Path to inputs JSON file
        trace: Enable trace output
        validate_only: Only validate, don't evaluate
        verbose: Show detailed output

    Returns:
        Exit code (0 for success, 1 for failure)
    """
    # Load document
    result = load_document(path)
    if result is None:
        print_msg(f"Error: Could not load document: {path}", Colors.RED)
        return 1

    doc, ir = result

    print_msg(f"\n{Colors.BOLD}Running {ir} Document:{Colors.RESET} {Colors.CYAN}{path}{Colors.RESET}\n")

    # Validate
    print_msg(f"{Colors.BOLD}Validating...{Colors.RESET}")
    validation_result = validate_document(doc, ir)

    if not validation_result.valid:
        print_msg(f"{Colors.RED}Validation failed:{Colors.RESET}", Colors.RED)
        for error in validation_result.errors:
            print_msg(f"  - {error.path}: {error.message}", Colors.RED)
        return 1

    print_msg(f"{Colors.GREEN}✓ Validation passed{Colors.RESET}\n")

    if validate_only:
        return 0

    # Prepare inputs
    input_array: list[str | int | float] = []
    if inputs:
        input_array = parse_input_string(inputs)
        if verbose:
            print_msg(f"{Colors.DIM}Using inputs from --inputs flag{Colors.RESET}", Colors.DIM)
    elif inputs_file:
        file_inputs = read_inputs_file(inputs_file)
        if file_inputs:
            input_array = file_inputs
            if verbose:
                print_msg(f"{Colors.DIM}Using inputs from --inputs-file{Colors.RESET}", Colors.DIM)
        else:
            print_msg(f"{Colors.YELLOW}Warning: Could not read inputs file: {inputs_file}{Colors.RESET}", Colors.YELLOW)
    elif ir in ("EIR", "LIR", "PIR"):
        # Try to load fixture file
        path_obj = Path(path)
        fixture_file = path_obj.parent / f"{path_obj.stem}.inputs.json"
        fixture_inputs = read_inputs_file(str(fixture_file))
        if fixture_inputs:
            input_array = fixture_inputs
            if verbose:
                print_msg(f"{Colors.DIM}Using inputs from fixture file{Colors.RESET}", Colors.DIM)

    # Create registries
    registry = create_registry()
    effect_registry = (
        create_queued_effect_registry(input_array)
        if input_array
        else create_default_effect_registry()
    )

    # Evaluate
    print_msg(f"{Colors.BOLD}Evaluating...{Colors.RESET}")

    try:
        eval_result = evaluate_document(
            doc, ir, registry, effect_registry, input_array, trace
        )

        # Import error check
        from pyspiral.types import is_error

        if is_error(eval_result):
            print_msg(
                f"{Colors.RED}Evaluation error:{Colors.RESET} {eval_result.code}",
                Colors.RED
            )
            if hasattr(eval_result, "message") and eval_result.message:
                print_msg(f"  {eval_result.message}", Colors.RED)
            return 1

        # Display result
        print_msg(f"{Colors.GREEN}✓ Result:{Colors.RESET}", Colors.GREEN)
        print(format_value(eval_result))
        print()

        # Show expected result if available
        if "expected_result" in doc and verbose:
            expected = doc["expected_result"]
            print_msg(f"{Colors.DIM}Expected: {expected}{Colors.RESET}", Colors.DIM)
            from pyspiral.types import is_int, is_float, is_bool
            if (is_int(eval_result) and eval_result.value == expected) or \
               (is_float(eval_result) and eval_result.value == expected) or \
               (is_bool(eval_result) and eval_result.value == expected):
                print_msg(f"{Colors.GREEN}✓ Matches expected result{Colors.RESET}\n", Colors.GREEN)

        # Show document info in verbose mode
        if verbose:
            print_msg(f"{Colors.DIM}────────────────────────────────────────{Colors.RESET}", Colors.DIM)
            if "version" in doc:
                print_msg(f"{Colors.DIM}Version: {doc['version']}{Colors.RESET}", Colors.DIM)
            if "nodes" in doc:
                print_msg(f"{Colors.DIM}Nodes: {len(doc['nodes'])}{Colors.RESET}", Colors.DIM)
            if "blocks" in doc:
                print_msg(f"{Colors.DIM}Blocks: {len(doc['blocks'])}{Colors.RESET}", Colors.DIM)
            if "airDefs" in doc and doc["airDefs"]:
                print_msg(f"{Colors.DIM}AIR Defs: {len(doc['airDefs'])}{Colors.RESET}", Colors.DIM)
            if "result" in doc:
                print_msg(f"{Colors.DIM}Result: {doc['result']}{Colors.RESET}", Colors.DIM)
            if "entry" in doc:
                print_msg(f"{Colors.DIM}Entry: {doc['entry']}{Colors.RESET}", Colors.DIM)
            print()

        return 0

    except Exception as e:
        import traceback
        print_msg(f"{Colors.RED}Error:{Colors.RESET} {e}", Colors.RED)
        if verbose:
            traceback.print_exc()
        return 1


def show_help() -> None:
    """Show help message"""
    print_msg(f"\n{Colors.BOLD}SPIRAL Python CLI{Colors.RESET}\n")
    print_msg(f"{Colors.BOLD}Usage:{Colors.RESET}")
    print("  pyspiral <path> [options]\n")
    print_msg(f"{Colors.BOLD}Examples:{Colors.RESET}")
    print("  pyspiral examples/air/basics/arithmetic.air.json", Colors.CYAN)
    print("  pyspiral examples/cir/algorithms/factorial.cir.json --verbose", Colors.CYAN)
    print("  pyspiral examples/eir/interactive/prompt-uppercase.eir.json --inputs 'hello'", Colors.CYAN)
    print("  pyspiral examples/lir/control-flow/while-cfg.lir.json --trace", Colors.CYAN)
    print("  pyspiral examples/pir/async/timeout-select.pir.json --inputs 'test'", Colors.CYAN)
    print()
    print_msg(f"{Colors.BOLD}Options:{Colors.RESET}")
    print("  -v, --verbose           Show detailed output")
    print("  --validate              Only validate, don't evaluate")
    print("  --trace                 Enable trace output for debugging")
    print("  --inputs <values>       Input values (comma-separated or JSON)")
    print("  --inputs-file <path>    Read inputs from JSON file")
    print("  -h, --help              Show this help message")
    print()


def main() -> int:
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="SPIRAL Python CLI - Run and validate SPIRAL documents",
        add_help=False,  # We'll handle help ourselves
    )

    parser.add_argument(
        "path",
        nargs="?",
        help="Path to the SPIRAL document",
    )

    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Show detailed output",
    )

    parser.add_argument(
        "--validate",
        action="store_true",
        help="Only validate, don't evaluate",
    )

    parser.add_argument(
        "--trace",
        action="store_true",
        help="Enable trace output for debugging",
    )

    parser.add_argument(
        "--inputs",
        type=str,
        help="Input values (comma-separated or JSON array)",
    )

    parser.add_argument(
        "--inputs-file",
        type=str,
        dest="inputs_file",
        help="Read inputs from JSON file",
    )

    parser.add_argument(
        "-h", "--help",
        action="store_true",
        help="Show help message",
    )

    args = parser.parse_args()

    if args.help:
        show_help()
        return 0

    if not args.path:
        show_help()
        return 0

    return run_document(
        args.path,
        inputs=args.inputs,
        inputs_file=args.inputs_file,
        trace=args.trace,
        validate_only=args.validate,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    sys.exit(main())
