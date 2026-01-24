"""
SPIRAL LIR (Low-Level Intermediate Representation) Package

This module provides CFG-based evaluation for LIR programs with support for:
- Basic blocks with instructions and terminators
- Phi nodes for SSA (Static Single Assignment) form
- Effect operations
- Control flow execution (jump, branch, return, exit)
- Async execution with fork/join/suspend terminators
"""

# Try to import the synchronous evaluator (may have broken imports)
try:
    from pyspiral.lir.evaluator import (
        LIREvaluator,
        LIRRuntimeState,
        LIREvalOptions,
        evaluate_lir,
        create_lir_eval_state,
    )
    _has_evaluator = True
except ImportError:
    _has_evaluator = False

# Import the async evaluator
from pyspiral.lir.async_evaluator import (
    evaluate_lir_async,
    LIRAsyncEvalOptions,
    LIRAsyncRuntimeState,
    TaskScheduler,
    AsyncChannel,
    AsyncChannelStore,
    create_task_scheduler,
    create_async_channel_store,
)

__all__ = [
    "evaluate_lir_async",
    "LIRAsyncEvalOptions",
    "LIRAsyncRuntimeState",
    "TaskScheduler",
    "AsyncChannel",
    "AsyncChannelStore",
    "create_task_scheduler",
    "create_async_channel_store",
]

# Add synchronous exports if available
if _has_evaluator:
    __all__.extend([
        "LIREvaluator",
        "LIRRuntimeState",
        "LIREvalOptions",
        "evaluate_lir",
        "create_lir_eval_state",
    ])
