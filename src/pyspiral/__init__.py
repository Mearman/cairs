"""
SPIRAL Python Implementation

A Python implementation of the SPIRAL intermediate representation,
supporting AIR, CIR, EIR, PIR, and LIR layers with expression and CFG forms.

This module provides a clean public API mirroring the TypeScript implementation.
"""

from __future__ import annotations

#==============================================================================
# Types
#==============================================================================

from pyspiral.types import (
    # Base types
    Type,
    Value,
    Expr,
    Node,
    FunctionSignature,
    # Document types
    AIRDef,
    AIRDocument,
    CIRDocument,
    EIRDocument,
    LIRDocument,
    PIRDocument,
    # LIR types
    LirBlock,
    LirInsAssign,
    LirInsCall,
    LirInsOp,
    LirInsPhi,
    LirInsEffect,
    LirInsAssignRef,
    LirTermJump,
    LirTermBranch,
    LirTermReturn,
    LirTermExit,
    # EIR expression types
    EirSeqExpr,
    EirAssignExpr,
    EirWhileExpr,
    EirForExpr,
    EirIterExpr,
    EirEffectExpr,
    EirRefCellExpr,
    EirDerefExpr,
    EirTryExpr,
    # PIR expression types
    PirParExpr,
    PirSpawnExpr,
    PirAwaitExpr,
    PirChannelExpr,
    PirSendExpr,
    PirRecvExpr,
    PirSelectExpr,
    PirRaceExpr,
    # Evaluation state
    EvalState,
    Effect,
    AsyncEvalState,
    TaskState,
    # Error codes
    ErrorCode,
)

from pyspiral.env import (
    TypeEnv,
    ValueEnv,
    Defs,
)

# ErrorCode is defined in types module, imported above
from pyspiral.errors import (
    ValidationError,
    ValidationResult,
)

from pyspiral.domains.registry import (
    Operator,
    OperatorRegistry,
    OperatorBuilder,
)

from pyspiral.effects import (
    EffectOp,
    EffectRegistry,
)

#==============================================================================
# Type Constructors
#==============================================================================

from pyspiral.types import (
    # Type constructors
    bool_type,
    float_type,
    fn_type,
    int_type,
    list_type,
    map_type,
    opaque_type,
    option_type,
    set_type,
    string_type,
    # EIR types
    ref_type,
    void_type,
    # Value constructors
    bool_val,
    closure_val,
    error_val,
    float_val,
    int_val,
    list_val,
    map_val,
    opaque_val,
    option_val,
    set_val,
    string_val,
    # EIR values
    void_val,
    ref_cell_val,
)

#==============================================================================
# Type Guards and Utilities
#==============================================================================

from pyspiral.types import (
    hash_value,
    is_closure,
    is_error,
    is_primitive_type,
    type_equal,
    # EIR type guards
    is_ref_cell,
    is_void,
    # EIR utilities
    empty_eval_state,
    create_eval_state,
)

#==============================================================================
# Error Codes
#==============================================================================

from pyspiral.errors import (
    ErrorCodes,
    SPIRALError,
    combine_results,
    invalid_result,
    valid_result,
)

#==============================================================================
# Environment Functions
#==============================================================================

from pyspiral.env import (
    empty_type_env,
    empty_value_env,
    empty_defs,
)

#==============================================================================
# Validation
#==============================================================================

from pyspiral.validator import (
    validate_air,
    validate_cir,
    validate_eir,
    validate_lir,
    validate_pir,
)

#==============================================================================
# Evaluation
#==============================================================================

from pyspiral.evaluator import (
    Evaluator,
    EvalOptions,
    evaluate,
    evaluate_program,
    create_evaluator,
)

#==============================================================================
# Domains
#==============================================================================

from pyspiral.domains.core import (
    create_core_registry,
)

from pyspiral.domains.bool import (
    create_bool_registry,
)

from pyspiral.domains.list import (
    create_list_registry,
)

from pyspiral.domains.set import (
    create_set_registry,
)

from pyspiral.domains.registry import (
    define_operator,
    empty_registry,
)

#==============================================================================
# Effects Registry
#==============================================================================

from pyspiral.effects import (
    create_default_effect_registry,
    create_queued_effect_registry,
    default_effect_registry,
    empty_effect_registry,
    lookup_effect,
    register_effect,
    io_effects,
    state_effects,
)

#==============================================================================
# LIR
#==============================================================================

from pyspiral.lir import (
    evaluate_lir_async,
    LIRAsyncEvalOptions,
    LIRAsyncRuntimeState,
    # Note: TaskScheduler, AsyncChannel, AsyncChannelStore also imported below
)

#==============================================================================
# PIR (Parallel IR) - Scheduler
#==============================================================================

from pyspiral.scheduler import (
    SchedulerMode,
    TaskStatus,
    Task,
    DefaultTaskScheduler,
    DeterministicScheduler,
    create_deterministic_scheduler,
)

#==============================================================================
# PIR (Parallel IR) - Async Effects
#==============================================================================

from pyspiral.async_effects import (
    # Async primitives
    AsyncMutex,
    AsyncRefCell,
    AsyncChannel,
    AsyncBarrier,
    # Store types
    AsyncRefCellStore,
    AsyncChannelStore,
    # Effect tracking (Effect as ConcurrentEffect to avoid clash with types.Effect)
    ConcurrentEffect,
    ConcurrentEffectLog,
    # Factory functions
    create_async_mutex,
    create_async_ref_cell,
    create_async_channel,
    create_async_barrier,
    create_concurrent_effect_log,
    create_async_ref_cell_store,
    create_async_channel_store,
    # Utilities
    gather_futures,
    select_first,
    with_timeout,
)

# Import TaskScheduler once (from scheduler module)
from pyspiral.scheduler import (
    TaskScheduler,
    create_task_scheduler,
)

#==============================================================================
# Concurrent Execution Detectors
#==============================================================================

from pyspiral.detectors import (
    RaceDetector,
    DeadlockDetector,
    create_race_detector,
    create_deadlock_detector,
    create_detectors,
    DetectionOptions,
    RaceCondition,
    DeadlockCycle,
    DetectionResult,
    DEFAULT_DETECTION_OPTIONS,
    STRICT_DETECTION_OPTIONS,
)

__version__ = "0.1.0"

__all__ = [
    #==========================================================================
    # Types
    #==========================================================================
    "Type",
    "Value",
    "Expr",
    "Node",
    "FunctionSignature",
    "AIRDef",
    "AIRDocument",
    "CIRDocument",
    "EIRDocument",
    "LIRDocument",
    "PIRDocument",
    "LirBlock",
    "LirInsAssign",
    "LirInsCall",
    "LirInsOp",
    "LirInsPhi",
    "LirInsEffect",
    "LirInsAssignRef",
    "LirTermJump",
    "LirTermBranch",
    "LirTermReturn",
    "LirTermExit",
    "EirSeqExpr",
    "EirAssignExpr",
    "EirWhileExpr",
    "EirForExpr",
    "EirIterExpr",
    "EirEffectExpr",
    "EirRefCellExpr",
    "EirDerefExpr",
    "EirTryExpr",
    "PirParExpr",
    "PirSpawnExpr",
    "PirAwaitExpr",
    "PirChannelExpr",
    "PirSendExpr",
    "PirRecvExpr",
    "PirSelectExpr",
    "PirRaceExpr",
    "EvalState",
    "Effect",
    "AsyncEvalState",
    "TaskState",
    "TypeEnv",
    "ValueEnv",
    "Defs",
    "ErrorCode",
    "ValidationError",
    "ValidationResult",
    "Operator",
    "OperatorRegistry",
    "OperatorBuilder",
    "EffectOp",
    "EffectRegistry",

    #==========================================================================
    # Type Constructors
    #==========================================================================
    "bool_type",
    "float_type",
    "fn_type",
    "int_type",
    "list_type",
    "map_type",
    "opaque_type",
    "option_type",
    "set_type",
    "string_type",
    "ref_type",
    "void_type",

    #==========================================================================
    # Value Constructors
    #==========================================================================
    "bool_val",
    "closure_val",
    "error_val",
    "float_val",
    "int_val",
    "list_val",
    "map_val",
    "opaque_val",
    "option_val",
    "set_val",
    "string_val",
    "void_val",
    "ref_cell_val",

    #==========================================================================
    # Type Guards and Utilities
    #==========================================================================
    "hash_value",
    "is_closure",
    "is_error",
    "is_primitive_type",
    "type_equal",
    "is_ref_cell",
    "is_void",
    "empty_eval_state",
    "create_eval_state",

    #==========================================================================
    # Error Codes
    #==========================================================================
    "ErrorCodes",
    "SPIRALError",
    "combine_results",
    "invalid_result",
    "valid_result",

    #==========================================================================
    # Environment Functions
    #==========================================================================
    "empty_type_env",
    "empty_value_env",
    "empty_defs",
    # TypeEnv methods: extend, extend_many, lookup
    # ValueEnv methods: extend, extend_many, lookup, define
    # Defs methods: extend, lookup, register

    #==========================================================================
    # Validation
    #==========================================================================
    "validate_air",
    "validate_cir",
    "validate_eir",
    "validate_lir",
    "validate_pir",

    #==========================================================================
    # Evaluation
    #==========================================================================
    "Evaluator",
    "EvalOptions",
    "evaluate",
    "evaluate_program",
    "create_evaluator",

    #==========================================================================
    # Domains
    #==========================================================================
    "create_core_registry",
    "create_bool_registry",
    "create_list_registry",
    "create_set_registry",
    "define_operator",
    "empty_registry",
    # OperatorRegistry methods: lookup, register, has, names

    #==========================================================================
    # Effects Registry
    #==========================================================================
    "create_default_effect_registry",
    "create_queued_effect_registry",
    "default_effect_registry",
    "empty_effect_registry",
    "lookup_effect",
    "register_effect",
    "io_effects",
    "state_effects",

    #==========================================================================
    # LIR
    #==========================================================================
    "evaluate_lir_async",
    "LIRAsyncEvalOptions",
    "LIRAsyncRuntimeState",

    #==========================================================================
    # PIR (Parallel IR) - Scheduler
    #==========================================================================
    "TaskScheduler",
    "SchedulerMode",
    "TaskStatus",
    "Task",
    "DefaultTaskScheduler",
    "DeterministicScheduler",
    "create_deterministic_scheduler",

    #==========================================================================
    # PIR (Parallel IR) - Async Effects
    #==========================================================================
    "AsyncMutex",
    "AsyncRefCell",
    "AsyncChannel",
    "AsyncBarrier",
    "AsyncRefCellStore",
    "AsyncChannelStore",
    "ConcurrentEffect",
    "ConcurrentEffectLog",
    "create_async_mutex",
    "create_async_ref_cell",
    "create_async_channel",
    "create_async_barrier",
    "create_concurrent_effect_log",
    "create_async_ref_cell_store",
    "create_async_channel_store",
    "gather_futures",
    "select_first",
    "with_timeout",

    #==========================================================================
    # Concurrent Execution Detectors
    #==========================================================================
    "RaceDetector",
    "DeadlockDetector",
    "create_race_detector",
    "create_deadlock_detector",
    "create_detectors",
    "DetectionOptions",
    "RaceCondition",
    "DeadlockCycle",
    "DetectionResult",
    "DEFAULT_DETECTION_OPTIONS",
    "STRICT_DETECTION_OPTIONS",
]
