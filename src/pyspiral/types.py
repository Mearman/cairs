"""
SPIRAL Type Definitions for Python
Implements Type, Value, and Expression AST domains for AIR/CIR/EIR/PIR layers

This module provides frozen dataclasses for immutable type representations,
using Union types with Literal 'kind' fields for pattern matching.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import (
    Union,
    Optional,
    List,
    Dict,
    Set,
    Any,
    Literal,
    TypeAlias,
)
from enum import Enum


#==============================================================================
# Error Codes
#==============================================================================

class ErrorCode(str, Enum):
    """Error codes for SPIRAL runtime errors"""
    TYPE_ERROR = "TypeError"
    ARITY_ERROR = "ArityError"
    DOMAIN_ERROR = "DomainError"
    DIVIDE_BY_ZERO = "DivideByZero"
    UNKNOWN_OPERATOR = "UnknownOperator"
    UNKNOWN_DEFINITION = "UnknownDefinition"
    UNBOUND_IDENTIFIER = "UnboundIdentifier"
    NON_TERMINATION = "NonTermination"


#==============================================================================
# Type Domain (Gamma - static types)
#==============================================================================

@dataclass(frozen=True)
class BoolType:
    """Boolean primitive type"""
    kind: Literal["bool"]


@dataclass(frozen=True)
class IntType:
    """Integer primitive type"""
    kind: Literal["int"]


@dataclass(frozen=True)
class FloatType:
    """Floating point primitive type"""
    kind: Literal["float"]


@dataclass(frozen=True)
class StringType:
    """String primitive type"""
    kind: Literal["string"]


@dataclass(frozen=True)
class SetType:
    """Set collection type"""
    kind: Literal["set"]
    of: Type


@dataclass(frozen=True)
class ListType:
    """List collection type"""
    kind: Literal["list"]
    of: Type


@dataclass(frozen=True)
class MapType:
    """Key-value map type"""
    kind: Literal["map"]
    key: Type
    value: Type


@dataclass(frozen=True)
class OptionType:
    """Optional type (some/none)"""
    kind: Literal["option"]
    of: Type


@dataclass(frozen=True)
class OpaqueType:
    """Opaque/custom type"""
    kind: Literal["opaque"]
    name: str


@dataclass(frozen=True)
class FnType:
    """Function type (CIR only)"""
    kind: Literal["fn"]
    params: List[Type]
    returns: Type
    optional_params: Optional[List[bool]] = None  # Track which params are optional


@dataclass(frozen=True)
class RefType:
    """Reference cell type (EIR only)"""
    kind: Literal["ref"]
    of: Type


@dataclass(frozen=True)
class VoidType:
    """Void type (EIR only)"""
    kind: Literal["void"]


@dataclass(frozen=True)
class FutureType:
    """Future type (PIR only)"""
    kind: Literal["future"]
    of: Type


@dataclass(frozen=True)
class ChannelType:
    """Channel type (PIR only)"""
    kind: Literal["channel"]
    channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"]
    of: Type


@dataclass(frozen=True)
class TaskType:
    """Task type (PIR only)"""
    kind: Literal["task"]
    returns: Type


@dataclass(frozen=True)
class AsyncFnType:
    """Async function type (PIR only)"""
    kind: Literal["async"]
    params: List[Type]
    returns: FutureType


# Type union for all types
Type: TypeAlias = Union[
    BoolType,
    IntType,
    FloatType,
    StringType,
    SetType,
    ListType,
    MapType,
    OptionType,
    OpaqueType,
    FnType,      # CIR only
    RefType,     # EIR only
    VoidType,    # EIR only
    FutureType,  # PIR only
    ChannelType, # PIR only
    TaskType,    # PIR only
    AsyncFnType, # PIR only
]


#==============================================================================
# Value Domain (v - runtime values)
#==============================================================================

@dataclass(frozen=True)
class BoolVal:
    """Boolean value"""
    kind: Literal["bool"]
    value: bool


@dataclass(frozen=True)
class IntVal:
    """Integer value"""
    kind: Literal["int"]
    value: int


@dataclass(frozen=True)
class FloatVal:
    """Floating point value"""
    kind: Literal["float"]
    value: float


@dataclass(frozen=True)
class StringVal:
    """String value"""
    kind: Literal["string"]
    value: str


@dataclass(frozen=True)
class ListVal:
    """List value"""
    kind: Literal["list"]
    value: List[Value]


@dataclass(frozen=True)
class SetVal:
    """Set value"""
    kind: Literal["set"]
    value: Set[str]


@dataclass(frozen=True)
class MapVal:
    """Map value"""
    kind: Literal["map"]
    value: Dict[str, Value]


@dataclass(frozen=True)
class OptionVal:
    """Option value (some/none)"""
    kind: Literal["option"]
    value: Optional[Value]


@dataclass(frozen=True)
class OpaqueVal:
    """Opaque/custom value"""
    kind: Literal["opaque"]
    name: str
    value: Any


@dataclass(frozen=True)
class LambdaParam:
    """Lambda parameter with optional and default support"""
    name: str
    type: Optional[Type] = None      # Type annotation (optional)
    optional: bool = False            # Can this param be omitted?
    default: Optional[Expr] = None    # Default value expression


@dataclass(frozen=True)
class ClosureVal:
    """Closure value (CIR only)"""
    kind: Literal["closure"]
    params: List[LambdaParam]
    body: Expr
    env: Dict[str, Value]  # Value environment


@dataclass(frozen=True)
class VoidVal:
    """Void value (EIR only)"""
    kind: Literal["void"]


@dataclass(frozen=True)
class RefCellVal:
    """Reference cell value (EIR only)"""
    kind: Literal["refCell"]
    value: Value


@dataclass(frozen=True)
class ErrorVal:
    """Error value"""
    kind: Literal["error"]
    code: str
    message: Optional[str] = None
    meta: Optional[Dict[str, Value]] = None


@dataclass(frozen=True)
class FutureVal:
    """Future value (PIR only)"""
    kind: Literal["future"]
    task_id: str
    status: Literal["pending", "ready", "error"]
    value: Optional[Value] = None


@dataclass(frozen=True)
class ChannelVal:
    """Channel value (PIR only)"""
    kind: Literal["channel"]
    id: str
    channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"]


@dataclass(frozen=True)
class TaskVal:
    """Task value (PIR only)"""
    kind: Literal["task"]
    id: str
    return_type: Type


@dataclass(frozen=True)
class SelectResultVal:
    """Select/await result with index (PIR only)"""
    kind: Literal["selectResult"]
    index: int  # -1=timeout, 0..n-1=winning future
    value: Value


# Forward declare Expr for Value definitions
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from typing import ForwardRef
    Expr = ForwardRef('Expr')
else:
    # Create a placeholder for circular reference
    class Expr:
        pass


# Value union for all values
Value: TypeAlias = Union[
    BoolVal,
    IntVal,
    FloatVal,
    StringVal,
    ListVal,
    SetVal,
    MapVal,
    OptionVal,
    OpaqueVal,
    ClosureVal,    # CIR only
    VoidVal,       # EIR only
    RefCellVal,    # EIR only
    ErrorVal,
    FutureVal,     # PIR only
    ChannelVal,    # PIR only
    TaskVal,       # PIR only
    SelectResultVal,  # PIR only
]


#==============================================================================
# Expression AST (e - syntactic expressions)
#==============================================================================

@dataclass(frozen=True)
class LitExpr:
    """Literal expression"""
    kind: Literal["lit"]
    type_annotation: Type
    value: Any


@dataclass(frozen=True)
class RefExpr:
    """Definition reference expression"""
    kind: Literal["ref"]
    id: str


@dataclass(frozen=True)
class VarExpr:
    """Variable reference expression"""
    kind: Literal["var"]
    name: str


@dataclass(frozen=True)
class CallExpr:
    """Operator call expression"""
    kind: Literal["call"]
    ns: str
    name: str
    args: List[str]


@dataclass(frozen=True)
class IfExpr:
    """Conditional expression"""
    kind: Literal["if"]
    cond: str
    then_branch: str
    else_branch: str
    type_annotation: Type


@dataclass(frozen=True)
class LetExpr:
    """Let binding expression"""
    kind: Literal["let"]
    name: str
    value: str
    body: str


@dataclass(frozen=True)
class AirRefExpr:
    """AIR definition reference expression"""
    kind: Literal["airRef"]
    ns: str
    name: str
    args: List[str]


@dataclass(frozen=True)
class PredicateExpr:
    """Predicate expression"""
    kind: Literal["predicate"]
    name: str
    value: str


#==============================================================================
# CIR Expression Types
#==============================================================================

@dataclass(frozen=True)
class LambdaExpr:
    """Lambda expression (CIR only)"""
    kind: Literal["lambda"]
    params: List[str]
    body: str
    type_annotation: Type


@dataclass(frozen=True)
class CallFnExpr:
    """Function call expression (CIR only)"""
    kind: Literal["callExpr"]
    fn: str
    args: List[str]


@dataclass(frozen=True)
class FixExpr:
    """Fix combinator expression (CIR only)"""
    kind: Literal["fix"]
    fn: str
    type_annotation: Type


#==============================================================================
# EIR Expression Types
#==============================================================================

@dataclass(frozen=True)
class EirSeqExpr:
    """Sequencing expression (EIR only)"""
    kind: Literal["seq"]
    first: str  # node id reference
    then: str   # node id reference


@dataclass(frozen=True)
class EirAssignExpr:
    """Assignment expression (EIR only)"""
    kind: Literal["assign"]
    target: str  # mutable target identifier
    value: str   # node id reference


@dataclass(frozen=True)
class EirWhileExpr:
    """While loop expression (EIR only)"""
    kind: Literal["while"]
    cond: str
    body: str


@dataclass(frozen=True)
class EirForExpr:
    """For loop expression (EIR only)"""
    kind: Literal["for"]
    var: str
    init: str
    cond: str
    update: str
    body: str


@dataclass(frozen=True)
class EirIterExpr:
    """Iterator loop expression (EIR only)"""
    kind: Literal["iter"]
    var: str
    iter: str
    body: str


@dataclass(frozen=True)
class EirEffectExpr:
    """Effect operation expression (EIR only)"""
    kind: Literal["effect"]
    op: str
    args: List[str]


@dataclass(frozen=True)
class EirRefCellExpr:
    """Reference cell creation expression (EIR only)"""
    kind: Literal["refCell"]
    target: str


@dataclass(frozen=True)
class EirDerefExpr:
    """Dereference expression (EIR only)"""
    kind: Literal["deref"]
    target: str


@dataclass(frozen=True)
class EirTryExpr:
    """Try-catch expression (EIR only)"""
    kind: Literal["try"]
    try_body: str       # Node to try
    catch_param: str    # Error parameter name
    catch_body: str     # Node on error
    fallback: Optional[str] = None  # Node on success (optional)


#==============================================================================
# PIR Expression Types
#==============================================================================

@dataclass(frozen=True)
class PirParExpr:
    """Parallel composition expression (PIR only)"""
    kind: Literal["par"]
    branches: List[str]


@dataclass(frozen=True)
class PirSpawnExpr:
    """Spawn task expression (PIR only)"""
    kind: Literal["spawn"]
    task: str


@dataclass(frozen=True)
class PirAwaitExpr:
    """Await future expression (PIR only)"""
    kind: Literal["await"]
    future: str
    timeout: Optional[str] = None       # Timeout in milliseconds (node reference)
    fallback: Optional[str] = None      # Fallback value on timeout (node reference)
    return_index: Optional[bool] = None # Return success(0)/timeout(1) index instead of value


@dataclass(frozen=True)
class PirChannelExpr:
    """Channel creation expression (PIR only)"""
    kind: Literal["channel"]
    channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"]
    buffer_size: Optional[str] = None


@dataclass(frozen=True)
class PirSendExpr:
    """Send to channel expression (PIR only)"""
    kind: Literal["send"]
    channel: str
    value: str


@dataclass(frozen=True)
class PirRecvExpr:
    """Receive from channel expression (PIR only)"""
    kind: Literal["recv"]
    channel: str


@dataclass(frozen=True)
class PirSelectExpr:
    """Select on futures expression (PIR only)"""
    kind: Literal["select"]
    futures: List[str]
    timeout: Optional[str] = None       # Timeout in milliseconds (node reference)
    fallback: Optional[str] = None      # Fallback value on timeout (node reference)
    return_index: Optional[bool] = None # Return which future won (index: -1=timeout, 0..n-1=winning future)


@dataclass(frozen=True)
class PirRaceExpr:
    """Race on tasks expression (PIR only)"""
    kind: Literal["race"]
    tasks: List[str]


# Now resolve the actual Expr type
Expr: TypeAlias = Union[
    LitExpr,
    RefExpr,
    VarExpr,
    CallExpr,
    IfExpr,
    LetExpr,
    AirRefExpr,
    PredicateExpr,
    LambdaExpr,      # CIR only
    CallFnExpr,      # CIR only
    FixExpr,         # CIR only
    EirSeqExpr,      # EIR only
    EirAssignExpr,   # EIR only
    EirWhileExpr,    # EIR only
    EirForExpr,      # EIR only
    EirIterExpr,     # EIR only
    EirEffectExpr,   # EIR only
    EirRefCellExpr,  # EIR only
    EirDerefExpr,    # EIR only
    EirTryExpr,      # EIR only
    PirParExpr,      # PIR only
    PirSpawnExpr,    # PIR only
    PirAwaitExpr,    # PIR only
    PirChannelExpr,  # PIR only
    PirSendExpr,     # PIR only
    PirRecvExpr,     # PIR only
    PirSelectExpr,   # PIR only
    PirRaceExpr,     # PIR only
]


#==============================================================================
# AIR Definition
#==============================================================================

@dataclass(frozen=True)
class AIRDef:
    """AIR definition"""
    ns: str
    name: str
    params: List[str]
    result: Type
    body: Expr


#==============================================================================
# Function Signature
#==============================================================================

@dataclass(frozen=True)
class FunctionSignature:
    """Function signature for type checking"""
    ns: str
    name: str
    params: List[Type]
    returns: Type
    pure: bool


#==============================================================================
# Node Types
#==============================================================================

@dataclass(frozen=True)
class Node:
    """Generic expression node"""
    id: str
    expr: Expr


@dataclass(frozen=True)
class TypedNode:
    """Typed expression node"""
    id: str
    type_annotation: Optional[Type]
    expr: Expr


#==============================================================================
# LIR Instruction Types
#==============================================================================

@dataclass(frozen=True)
class LirInsAssign:
    """LIR assignment instruction"""
    kind: Literal["assign"]
    target: str
    value: Expr


@dataclass(frozen=True)
class LirInsCall:
    """LIR function call instruction"""
    kind: Literal["call"]
    target: str
    callee: str
    args: List[str]


@dataclass(frozen=True)
class LirInsOp:
    """LIR operator instruction"""
    kind: Literal["op"]
    target: str
    ns: str
    name: str
    args: List[str]


@dataclass(frozen=True)
class LirInsPhi:
    """LIR phi node instruction"""
    kind: Literal["phi"]
    target: str
    sources: List[Dict[str, str]]  # [{"block": str, "id": str}, ...]


@dataclass(frozen=True)
class LirInsEffect:
    """LIR effect instruction"""
    kind: Literal["effect"]
    target: str
    op: str
    args: List[str]


@dataclass(frozen=True)
class LirInsAssignRef:
    """LIR reference cell assignment instruction"""
    kind: Literal["assignRef"]
    target: str  # ref cell identifier
    value: str   # node id to assign


LirInstruction: TypeAlias = Union[
    LirInsAssign,
    LirInsCall,
    LirInsOp,
    LirInsPhi,
    LirInsEffect,
    LirInsAssignRef,
]


#==============================================================================
# LIR Terminator Types
#==============================================================================

@dataclass(frozen=True)
class LirTermJump:
    """LIR jump terminator"""
    kind: Literal["jump"]
    to: str


@dataclass(frozen=True)
class LirTermBranch:
    """LIR conditional branch terminator"""
    kind: Literal["branch"]
    cond: str
    then_branch: str
    else_branch: str


@dataclass(frozen=True)
class LirTermReturn:
    """LIR return terminator"""
    kind: Literal["return"]
    value: Optional[str] = None


@dataclass(frozen=True)
class LirTermExit:
    """LIR exit terminator"""
    kind: Literal["exit"]
    code: Optional[str] = None


LirTerminator: TypeAlias = Union[
    LirTermJump,
    LirTermBranch,
    LirTermReturn,
    LirTermExit,
]


#==============================================================================
# LIR Basic Block
#==============================================================================

@dataclass(frozen=True)
class LirBlock:
    """LIR basic block"""
    id: str
    instructions: List[LirInstruction]
    terminator: LirTerminator


#==============================================================================
# AIR Instruction Types
#==============================================================================

AirInsAssign = LirInsAssign
AirInsOp = LirInsOp
AirInsPhi = LirInsPhi

AirInstruction: TypeAlias = Union[AirInsAssign, AirInsOp, AirInsPhi]


#==============================================================================
# CIR Instruction Types
#==============================================================================

CirInstruction: TypeAlias = AirInstruction


#==============================================================================
# EIR Instruction Types
#==============================================================================

EirInsEffect = LirInsEffect
EirInsAssignRef = LirInsAssignRef

EirInstruction: TypeAlias = Union[CirInstruction, EirInsEffect, EirInsAssignRef]


#==============================================================================
# PIR Instruction Types
#==============================================================================

@dataclass(frozen=True)
class PirInsSpawn:
    """PIR spawn instruction"""
    kind: Literal["spawn"]
    target: str
    entry: str
    args: Optional[List[str]] = None


@dataclass(frozen=True)
class PirInsChannelOp:
    """PIR channel operation instruction"""
    kind: Literal["channelOp"]
    op: Literal["send", "recv", "trySend", "tryRecv"]
    target: Optional[str]
    channel: str
    value: Optional[str] = None


@dataclass(frozen=True)
class PirInsAwait:
    """PIR await instruction"""
    kind: Literal["await"]
    target: str
    future: str


PirInstruction: TypeAlias = Union[EirInstruction, PirInsSpawn, PirInsChannelOp, PirInsAwait]


#==============================================================================
# Layer-Specific Block Types
#==============================================================================

@dataclass(frozen=True)
class AirBlock:
    """AIR basic block"""
    id: str
    instructions: List[AirInstruction]
    terminator: LirTerminator


@dataclass(frozen=True)
class CirBlock:
    """CIR basic block"""
    id: str
    instructions: List[CirInstruction]
    terminator: LirTerminator


@dataclass(frozen=True)
class EirBlock:
    """EIR basic block"""
    id: str
    instructions: List[EirInstruction]
    terminator: LirTerminator


@dataclass(frozen=True)
class PirBlock:
    """PIR basic block"""
    id: str
    instructions: List[PirInstruction]
    terminator: PirTerminator


#==============================================================================
# PIR Terminator Types
#==============================================================================

@dataclass(frozen=True)
class PirTermFork:
    """PIR fork terminator"""
    kind: Literal["fork"]
    branches: List[Dict[str, str]]  # [{"block": str, "taskId": str}, ...]
    continuation: str


@dataclass(frozen=True)
class PirTermJoin:
    """PIR join terminator"""
    kind: Literal["join"]
    tasks: List[str]
    to: str
    results: Optional[List[str]] = None


@dataclass(frozen=True)
class PirTermSuspend:
    """PIR suspend terminator"""
    kind: Literal["suspend"]
    future: str
    resume_block: str


PirTerminator: TypeAlias = Union[LirTerminator, PirTermFork, PirTermJoin, PirTermSuspend]


#==============================================================================
# Hybrid Node Types
#==============================================================================

@dataclass(frozen=True)
class ExprNode:
    """Expression-based node"""
    id: str
    type_annotation: Optional[Type]
    expr: Expr


@dataclass(frozen=True)
class BlockNode:
    """Block-based node"""
    id: str
    type_annotation: Optional[Type]
    blocks: List[Any]  # Generic block list - will be typed per layer
    entry: str


# Type aliases for hybrid nodes per layer
AirHybridNode: TypeAlias = Union[ExprNode, "AirBlockNode"]
CirHybridNode: TypeAlias = Union[ExprNode, "CirBlockNode"]
EirHybridNode: TypeAlias = Union["EirExprNode", "EirBlockNode"]
LirHybridNode: TypeAlias = Union[ExprNode, "LirBlockNode"]
PirHybridNode: TypeAlias = Union["PirExprNode", "PirBlockNode"]


# EIR expression node (with EIR-specific expressions)
@dataclass(frozen=True)
class EirExprNode:
    """EIR expression node"""
    id: str
    type_annotation: Optional[Type]
    expr: Union[Expr, EirSeqExpr, EirAssignExpr, EirWhileExpr, EirForExpr,
                EirIterExpr, EirEffectExpr, EirRefCellExpr, EirDerefExpr, EirTryExpr]


@dataclass(frozen=True)
class EirBlockNode:
    """EIR block node"""
    id: str
    type_annotation: Optional[Type]
    blocks: List[EirBlock]
    entry: str


# LIR block node
@dataclass(frozen=True)
class LirBlockNode:
    """LIR block node"""
    id: str
    type_annotation: Optional[Type]
    blocks: List[LirBlock]
    entry: str


# PIR expression node (with PIR-specific expressions)
@dataclass(frozen=True)
class PirExprNode:
    """PIR expression node"""
    id: str
    type_annotation: Optional[Type]
    expr: Union[Expr, EirSeqExpr, EirAssignExpr, EirWhileExpr, EirForExpr,
                EirIterExpr, EirEffectExpr, EirRefCellExpr, EirDerefExpr, EirTryExpr,
                PirParExpr, PirSpawnExpr, PirAwaitExpr, PirChannelExpr,
                PirSendExpr, PirRecvExpr, PirSelectExpr, PirRaceExpr]


@dataclass(frozen=True)
class PirBlockNode:
    """PIR block node"""
    id: str
    type_annotation: Optional[Type]
    blocks: List[PirBlock]
    entry: str


# AIR/CIR block nodes
@dataclass(frozen=True)
class AirBlockNode:
    """AIR block node"""
    id: str
    type_annotation: Optional[Type]
    blocks: List[AirBlock]
    entry: str


@dataclass(frozen=True)
class CirBlockNode:
    """CIR block node"""
    id: str
    type_annotation: Optional[Type]
    blocks: List[CirBlock]
    entry: str


#==============================================================================
# Document Types
#==============================================================================

@dataclass(frozen=True)
class AIRDocument:
    """AIR document structure"""
    version: str
    capabilities: Optional[List[str]] = None
    function_sigs: Optional[List[FunctionSignature]] = None
    air_defs: Optional[List[AIRDef]] = None
    nodes: Optional[List[AirHybridNode]] = None
    result: str = ""


@dataclass(frozen=True)
class CIRDocument:
    """CIR document structure"""
    version: str
    capabilities: Optional[List[str]] = None
    function_sigs: Optional[List[FunctionSignature]] = None
    air_defs: Optional[List[AIRDef]] = None
    nodes: Optional[List[CirHybridNode]] = None
    result: str = ""


@dataclass(frozen=True)
class EIRDocument:
    """EIR document structure"""
    version: str
    capabilities: Optional[List[str]] = None
    function_sigs: Optional[List[FunctionSignature]] = None
    air_defs: Optional[List[AIRDef]] = None
    nodes: Optional[List[EirHybridNode]] = None
    result: str = ""


@dataclass(frozen=True)
class PIRDocument:
    """PIR document structure"""
    version: str
    capabilities: Optional[List[str]] = None
    function_sigs: Optional[List[FunctionSignature]] = None
    air_defs: Optional[List[AIRDef]] = None
    nodes: Optional[List[PirHybridNode]] = None
    result: str = ""


@dataclass(frozen=True)
class LIRDocument:
    """LIR document structure"""
    version: str
    capabilities: Optional[List[str]] = None
    function_sigs: Optional[List[FunctionSignature]] = None
    air_defs: Optional[List[AIRDef]] = None
    nodes: Optional[List[LirHybridNode]] = None
    result: str = ""


#==============================================================================
# Evaluation State Types
#==============================================================================

@dataclass(frozen=True)
class Effect:
    """Effect operation in EIR"""
    op: str
    args: List[Value]


@dataclass(frozen=True)
class EvalState:
    """Evaluation state for EIR programs"""
    env: Dict[str, Value]
    ref_cells: Dict[str, Value]
    effects: List[Effect]
    steps: int
    max_steps: int


#==============================================================================
# Async Evaluation State (PIR)
#==============================================================================

@dataclass(frozen=True)
class TaskState:
    """Task state for PIR execution"""
    expr: Union[Expr, EirSeqExpr, EirAssignExpr, EirWhileExpr, EirForExpr,
                EirIterExpr, EirEffectExpr, EirRefCellExpr, EirDerefExpr, EirTryExpr,
                PirParExpr, PirSpawnExpr, PirAwaitExpr, PirChannelExpr,
                PirSendExpr, PirRecvExpr, PirSelectExpr, PirRaceExpr]
    env: Dict[str, Value]
    status: Literal["running", "completed", "failed"]
    result: Optional[Value] = None
    error: Optional[ErrorVal] = None


@dataclass(frozen=True)
class AsyncEvalState:
    """Async evaluation state for PIR programs"""
    task_id: str
    env: Dict[str, Value]
    ref_cells: Dict[str, Value]
    effects: List[Effect]
    steps: int
    max_steps: int
    scheduler: Any  # TaskScheduler interface placeholder
    channels: Any   # AsyncChannelStore placeholder
    task_pool: Dict[str, TaskState]
    parent_task_id: Optional[str] = None


#==============================================================================
# Type Guards and Utility Functions
#==============================================================================

def is_error(v: Value) -> bool:
    """Check if value is an error"""
    return v.kind == "error"


def is_closure(v: Value) -> bool:
    """Check if value is a closure"""
    return v.kind == "closure"


def is_ref_cell(v: Value) -> bool:
    """Check if value is a reference cell"""
    return v.kind == "refCell"


def is_void(v: Value) -> bool:
    """Check if value is void"""
    return v.kind == "void"


def is_future(v: Value) -> bool:
    """Check if value is a future"""
    return v.kind == "future"


def is_channel(v: Value) -> bool:
    """Check if value is a channel"""
    return v.kind == "channel"


def is_task(v: Value) -> bool:
    """Check if value is a task"""
    return v.kind == "task"


def is_primitive_type(t: Type) -> bool:
    """Check if type is a primitive type"""
    return t.kind in ("bool", "int", "float", "string", "void")


def is_block_node(node: Any) -> bool:
    """Check if a node is block-based"""
    return hasattr(node, "blocks") and hasattr(node, "entry")


def is_expr_node(node: Any) -> bool:
    """Check if a node is expression-based"""
    return hasattr(node, "expr") and not hasattr(node, "blocks")


def hash_value(v: Value) -> str:
    """Hash a value for use in Set/Map keys"""
    if v.kind == "bool":
        return f"b:{str(v.value)}"
    elif v.kind == "int":
        return f"i:{str(v.value)}"
    elif v.kind == "float":
        return f"f:{str(v.value)}"
    elif v.kind == "string":
        return f"s:{v.value}"
    elif v.kind == "option":
        return "o:none" if v.value is None else f"o:some:{hash_value(v.value)}"
    else:
        # Complex types use object identity
        import uuid
        return f"ref:{uuid.uuid4().hex[:8]}"


def type_equal(a: Type, b: Type) -> bool:
    """Check if two types are equal"""
    if a.kind != b.kind:
        return False

    if a.kind in ("bool", "int", "float", "string", "void"):
        return True
    elif a.kind == "set":
        return type_equal(a.of, b.of)  # type: ignore
    elif a.kind == "list":
        return type_equal(a.of, b.of)  # type: ignore
    elif a.kind == "option":
        return type_equal(a.of, b.of)  # type: ignore
    elif a.kind == "ref":
        return type_equal(a.of, b.of)  # type: ignore
    elif a.kind == "future":
        return type_equal(a.of, b.of)  # type: ignore
    elif a.kind == "channel":
        return (a.channel_type == b.channel_type and  # type: ignore
                type_equal(a.of, b.of))  # type: ignore
    elif a.kind == "map":
        return (type_equal(a.key, b.key) and  # type: ignore
                type_equal(a.value, b.value))  # type: ignore
    elif a.kind == "opaque":
        return a.name == b.name  # type: ignore
    elif a.kind == "fn":
        if len(a.params) != len(b.params):  # type: ignore
            return False
        for pa, pb in zip(a.params, b.params):  # type: ignore
            if not type_equal(pa, pb):
                return False
        return type_equal(a.returns, b.returns)  # type: ignore
    elif a.kind == "task":
        return type_equal(a.returns, b.returns)  # type: ignore
    elif a.kind == "async":
        if len(a.params) != len(b.params):  # type: ignore
            return False
        for pa, pb in zip(a.params, b.params):  # type: ignore
            if not type_equal(pa, pb):
                return False
        return type_equal(a.returns, b.returns)  # type: ignore

    return False


#==============================================================================
# Value Constructors
#==============================================================================

def bool_val(value: bool) -> BoolVal:
    return BoolVal(kind="bool", value=value)


def int_val(value: int) -> IntVal:
    return IntVal(kind="int", value=value)


def float_val(value: float) -> FloatVal:
    return FloatVal(kind="float", value=value)


def string_val(value: str) -> StringVal:
    return StringVal(kind="string", value=value)


def list_val(value: List[Value]) -> ListVal:
    return ListVal(kind="list", value=value)


def set_val(value: Set[str]) -> SetVal:
    return SetVal(kind="set", value=value)


def map_val(value: Dict[str, Value]) -> MapVal:
    return MapVal(kind="map", value=value)


def option_val(value: Optional[Value]) -> OptionVal:
    return OptionVal(kind="option", value=value)


def opaque_val(name: str, value: Any) -> OpaqueVal:
    return OpaqueVal(kind="opaque", name=name, value=value)


def closure_val(params: List[LambdaParam], body: Expr, env: Dict[str, Value]) -> ClosureVal:
    return ClosureVal(kind="closure", params=params, body=body, env=env)


def error_val(code: str, message: Optional[str] = None,
              meta: Optional[Dict[str, Value]] = None) -> ErrorVal:
    return ErrorVal(kind="error", code=code, message=message, meta=meta)


def void_val() -> VoidVal:
    return VoidVal(kind="void")


def ref_cell_val(value: Value) -> RefCellVal:
    return RefCellVal(kind="refCell", value=value)


def undefined_val() -> OptionVal:
    """Undefined value for optional parameters without defaults"""
    return option_val(None)


def future_val(task_id: str, status: Literal["pending", "ready", "error"] = "pending",
               value: Optional[Value] = None) -> FutureVal:
    return FutureVal(kind="future", task_id=task_id, status=status, value=value)


def channel_val(id: str, channel_type: Literal["mpsc", "spsc", "mpmc", "broadcast"]) -> ChannelVal:
    return ChannelVal(kind="channel", id=id, channel_type=channel_type)


def task_val(id: str, return_type: Type) -> TaskVal:
    return TaskVal(kind="task", id=id, return_type=return_type)


#==============================================================================
# Type Constructors
#==============================================================================

def bool_type() -> BoolType:
    return BoolType(kind="bool")


def int_type() -> IntType:
    return IntType(kind="int")


def float_type() -> FloatType:
    return FloatType(kind="float")


def string_type() -> StringType:
    return StringType(kind="string")


def set_type(of: Type) -> SetType:
    return SetType(kind="set", of=of)


def list_type(of: Type) -> ListType:
    return ListType(kind="list", of=of)


def map_type(key: Type, value: Type) -> MapType:
    return MapType(kind="map", key=key, value=value)


def option_type(of: Type) -> OptionType:
    return OptionType(kind="option", of=of)


def opaque_type(name: str) -> OpaqueType:
    return OpaqueType(kind="opaque", name=name)


def fn_type(params: List[Type], returns: Type, optional_params: Optional[List[bool]] = None) -> FnType:
    return FnType(kind="fn", params=params, returns=returns, optional_params=optional_params)


def void_type() -> VoidType:
    return VoidType(kind="void")


def ref_type(of: Type) -> RefType:
    return RefType(kind="ref", of=of)


def future_type(of: Type) -> FutureType:
    return FutureType(kind="future", of=of)


def channel_type_ctor(chan_type: Literal["mpsc", "spsc", "mpmc", "broadcast"], of: Type) -> ChannelType:
    return ChannelType(kind="channel", channel_type=chan_type, of=of)


def task_type(returns: Type) -> TaskType:
    return TaskType(kind="task", returns=returns)


def async_fn_type(params: List[Type], returns: Type) -> AsyncFnType:
    return AsyncFnType(kind="async", params=params, returns=future_type(returns))


#==============================================================================
# EvalState Constructors
#==============================================================================

def empty_eval_state(max_steps: int = 10000) -> EvalState:
    """Create an empty evaluation state"""
    return EvalState(
        env={},
        ref_cells={},
        effects=[],
        steps=0,
        max_steps=max_steps
    )


def create_eval_state(env: Optional[Dict[str, Value]] = None,
                      ref_cells: Optional[Dict[str, Value]] = None,
                      max_steps: int = 10000) -> EvalState:
    """Create an evaluation state with initial values"""
    return EvalState(
        env=env or {},
        ref_cells=ref_cells or {},
        effects=[],
        steps=0,
        max_steps=max_steps
    )
