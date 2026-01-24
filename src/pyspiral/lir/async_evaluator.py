"""
SPIRAL LIR Async Evaluator
Async CFG-based execution for LIR with fork/join/suspend terminators
and spawn/channelOp/await instructions
"""

from __future__ import annotations
import asyncio
import time
import uuid
from typing import (
    Any,
    Optional,
    Dict,
    List,
    Callable,
    Awaitable,
    TypeAlias,
    Union,
)
from dataclasses import dataclass, field

from pyspiral.types import (
    Type,
    Value,
    Expr,
    LIRDocument,
    LirBlock,
    LirHybridNode,
    LirInstruction,
    LirTerminator,
    PirInstruction,
    PirTerminator,
    PirInsSpawn,
    PirInsChannelOp,
    PirInsAwait,
    PirTermFork,
    PirTermJoin,
    PirTermSuspend,
    is_block_node,
    is_expr_node,
    is_error,
    is_future,
    is_channel,
    error_val,
    int_val,
    void_val,
    future_val,
)
from pyspiral.errors import ErrorCodes, SPIRALError, exhaustive
from pyspiral.domains.registry import OperatorRegistry
from pyspiral.effects import EffectRegistry, lookup_effect


#==============================================================================
# LIR Async Evaluation Options
#==============================================================================

@dataclass
class LIRAsyncEvalOptions:
    """Options for async LIR evaluation"""
    max_steps: int = 10000
    trace: bool = False
    concurrency: str = "parallel"  # "sequential", "parallel", "speculative"


#==============================================================================
# LIR Async Runtime State
#==============================================================================

@dataclass
class LIRAsyncRuntimeState:
    """Runtime state for async LIR evaluation"""
    vars: Dict[str, Value]  # Variable bindings (SSA form)
    return_value: Optional[Value] = None
    effects: List[Dict[str, Any]] = field(default_factory=list)
    steps: int = 0
    max_steps: int = 10000
    predecessor: Optional[str] = None  # Track which block we came from (for phi node resolution)
    task_id: str = "main"  # Current task ID for async operations
    scheduler: "TaskScheduler" = field(default_factory=lambda: create_task_scheduler())
    channels: "AsyncChannelStore" = field(default_factory=lambda: create_async_channel_store())
    ref_cells: Dict[str, Dict[str, Any]] = field(default_factory=dict)  # Reference cells


#==============================================================================
# Task Scheduler Interface
#==============================================================================

class TaskScheduler:
    """
    TaskScheduler manages async task execution in PIR
    Uses cooperative scheduling with asyncio-based execution
    """

    def __init__(
        self,
        global_max_steps: int = 1_000_000,
        yield_interval: int = 100,
    ):
        self.tasks: Dict[str, asyncio.Task[Value]] = {}
        self.task_results: Dict[str, Value] = {}
        self._global_steps = 0
        self.global_max_steps = global_max_steps
        self._yield_interval = yield_interval
        self._current_task_id = "main"
        self._loop = asyncio.get_event_loop()

    @property
    def current_task_id(self) -> str:
        return self._current_task_id

    @current_task_id.setter
    def current_task_id(self, value: str):
        self._current_task_id = value

    @property
    def active_task_count(self) -> int:
        return len(self.tasks)

    @property
    def global_steps(self) -> int:
        return self._global_steps

    def spawn(self, task_id: str, fn: Callable[[], Awaitable[Value]]) -> None:
        """Spawn a new async task"""
        if task_id in self.tasks:
            raise ValueError(f"Task {task_id} already exists")

        async def wrapper() -> Value:
            try:
                result = await fn()
                self.task_results[task_id] = result
                return result
            except Exception as e:
                error_result = error_val(ErrorCodes.DOMAIN_ERROR.value, str(e))
                self.task_results[task_id] = error_result
                return error_result
            finally:
                if task_id in self.tasks:
                    del self.tasks[task_id]

        task = self._loop.create_task(wrapper())
        self.tasks[task_id] = task

    async def await_task(self, task_id: str) -> Value:
        """Await a task's completion"""
        # Check if already completed
        if task_id in self.task_results:
            return self.task_results[task_id]

        # Check if task exists
        if task_id not in self.tasks:
            raise ValueError(f"Task {task_id} not found")

        # Wait for task to complete
        task = self.tasks[task_id]
        try:
            result = await task
            return result
        except Exception as e:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, str(e))

    async def check_global_steps(self) -> None:
        """Check global step limit and yield if needed"""
        if self._global_steps >= self.global_max_steps:
            raise SPIRALError(
                ErrorCodes.NON_TERMINATION,
                "Global step limit exceeded"
            )

        self._global_steps += 1

        # Yield to event loop every N steps
        if self._global_steps % self._yield_interval == 0:
            await asyncio.sleep(0)

    def cancel(self, task_id: str) -> None:
        """Cancel a running task"""
        if task_id in self.tasks:
            self.tasks[task_id].cancel()
            del self.tasks[task_id]

    def is_complete(self, task_id: str) -> bool:
        """Check if a task is complete"""
        return task_id in self.task_results


#==============================================================================
# Async Channel Implementation
#==============================================================================

class AsyncChannel:
    """Async channel for Go-style buffered communication"""

    def __init__(self, capacity: int):
        if capacity < 0:
            raise ValueError("Channel capacity must be non-negative")
        self.capacity = capacity
        self.buffer: List[Value] = []
        self.closed = False
        self._lock = asyncio.Lock()
        self._send_cond = asyncio.Condition(self._lock)
        self._recv_cond = asyncio.Condition(self._lock)

    async def send(self, value: Value) -> None:
        """Send a value to the channel"""
        async with self._send_cond:
            if self.closed:
                raise RuntimeError("Cannot send to closed channel")

            # Wait for buffer space
            while len(self.buffer) >= self.capacity and not self.closed:
                await self._send_cond.wait()

            if self.closed:
                raise RuntimeError("Cannot send to closed channel")

            self.buffer.append(value)
            self._recv_cond.notify(1)

    def try_send(self, value: Value) -> bool:
        """Try to send without blocking"""
        if self.closed:
            raise RuntimeError("Cannot send to closed channel")

        if len(self.buffer) >= self.capacity:
            return False

        self.buffer.append(value)
        return True

    async def recv(self) -> Value:
        """Receive a value from the channel"""
        async with self._recv_cond:
            # Wait for value
            while len(self.buffer) == 0 and not self.closed:
                await self._recv_cond.wait()

            if self.closed and len(self.buffer) == 0:
                raise RuntimeError("Cannot receive from closed channel")

            value = self.buffer.pop(0)
            self._send_cond.notify(1)
            return value

    def try_recv(self) -> Optional[Value]:
        """Try to receive without blocking"""
        if len(self.buffer) == 0:
            return None

        value = self.buffer.pop(0)
        return value

    def close(self) -> None:
        """Close the channel"""
        self.closed = True

    def is_closed(self) -> bool:
        """Check if channel is closed"""
        return self.closed


class AsyncChannelStore:
    """Store for managing named async channels"""

    def __init__(self):
        self.channels: Dict[str, AsyncChannel] = {}
        self._next_id = 0

    def create(self, capacity: int) -> str:
        """Create a new channel and return its ID"""
        channel_id = f"ch_{self._next_id}"
        self._next_id += 1
        self.channels[channel_id] = AsyncChannel(capacity)
        return channel_id

    def get(self, channel_id: str) -> Optional[AsyncChannel]:
        """Get an existing channel by ID"""
        return self.channels.get(channel_id)

    def delete(self, channel_id: str) -> bool:
        """Delete and close a channel"""
        channel = self.channels.get(channel_id)
        if channel:
            channel.close()
            return self.channels.pop(channel_id, None) is not None
        return False

    def clear(self) -> None:
        """Clear all channels"""
        for channel in self.channels.values():
            channel.close()
        self.channels.clear()


#==============================================================================
# Factory Functions
#==============================================================================

def create_task_scheduler(
    global_max_steps: int = 1_000_000,
    yield_interval: int = 100,
) -> TaskScheduler:
    """Create a new task scheduler"""
    return TaskScheduler(global_max_steps, yield_interval)


def create_async_channel_store() -> AsyncChannelStore:
    """Create a new async channel store"""
    return AsyncChannelStore()


#==============================================================================
# LIR Async Evaluator
#==============================================================================

async def evaluate_lir_async(
    doc: LIRDocument,
    registry: OperatorRegistry,
    effect_registry: EffectRegistry,
    inputs: Optional[Dict[str, Value]] = None,
    options: Optional[LIRAsyncEvalOptions] = None,
    defs: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Evaluate an LIR program asynchronously with CFG-based execution.

    LIR async execution follows control flow through basic blocks with async support:
    - Start at entry block
    - Execute instructions sequentially
    - Execute terminator to determine next block (including async terminators)
    - Handle fork/join/suspend for concurrent execution
    - Continue until return/exit terminator
    """
    if options is None:
        options = LIRAsyncEvalOptions()

    scheduler = create_task_scheduler(
        global_max_steps=options.max_steps * 100,  # Scale for concurrent tasks
    )

    channels = create_async_channel_store()

    state = LIRAsyncRuntimeState(
        vars=inputs.copy() if inputs else {},
        max_steps=options.max_steps,
        task_id="main",
        scheduler=scheduler,
        channels=channels,
    )

    # Build node map for lookup
    node_map: Dict[str, LirHybridNode] = {}
    for node in doc.nodes:
        node_map[node.id] = node

    # Find the result node
    result_node = node_map.get(doc.result)
    if not result_node:
        return {
            "result": error_val(
                ErrorCodes.VALIDATION_ERROR.value,
                f"Result node not found: {doc.result}",
            ),
            "state": state,
        }

    # Evaluate the result node
    if is_expr_node(result_node):
        # Expression node - return its value
        value = state.vars.get(result_node.id)
        return {
            "result": value or error_val(
                ErrorCodes.UNBOUND_IDENTIFIER.value,
                f"Result node value not found: {result_node.id}",
            ),
            "state": state,
        }

    if not is_block_node(result_node):
        return {
            "result": error_val(
                ErrorCodes.DOMAIN_ERROR.value,
                "Result node must be expression or block node",
            ),
            "state": state,
        }

    # Execute block node's CFG
    blocks = result_node.blocks
    entry = result_node.entry

    # Validate entry block exists
    entry_block = None
    for block in blocks:
        if block.id == entry:
            entry_block = block
            break

    if not entry_block:
        return {
            "result": error_val(
                ErrorCodes.VALIDATION_ERROR.value,
                f"Entry block not found: {entry}",
            ),
            "state": state,
        }

    # Execute CFG starting from entry
    current_block_id: Optional[str] = entry
    executed_blocks = set()

    while current_block_id:
        # Set the predecessor for phi node resolution
        state.predecessor = current_block_id

        # Check for infinite loops (basic detection)
        if current_block_id in executed_blocks:
            state.steps += 1
            if state.steps > state.max_steps:
                return {
                    "result": error_val(
                        ErrorCodes.NON_TERMINATION.value,
                        "LIR async execution exceeded maximum steps",
                    ),
                    "state": state,
                }
        else:
            executed_blocks.add(current_block_id)

        # Find current block
        current_block = None
        for block in blocks:
            if block.id == current_block_id:
                current_block = block
                break

        if not current_block:
            return {
                "result": error_val(
                    ErrorCodes.VALIDATION_ERROR.value,
                    f"Block not found: {current_block_id}",
                ),
                "state": state,
            }

        # Check global step limit via scheduler
        await state.scheduler.check_global_steps()

        # Execute instructions (async version)
        ins_result = await execute_block_async(
            current_block,
            state,
            registry,
            effect_registry,
        )
        if ins_result:
            # Error during instruction execution
            return {"result": ins_result, "state": state}

        # Execute terminator to get next block (async version)
        term_result = await execute_terminator_async(
            current_block.terminator,
            state,
            blocks,
            node_map,
            registry,
            effect_registry,
        )

        if isinstance(term_result, dict) and term_result.get("kind") == "error":
            # Error value
            return {"result": term_result, "state": state}

        if isinstance(term_result, dict) and term_result.get("kind") in ("void", "bool", "int", "float", "string", "future"):
            # Return value or void
            return {"result": term_result, "state": state}

        # Update predecessor before moving to next block
        state.predecessor = current_block_id
        current_block_id = term_result

    # If we exit the loop without a return, return void
    return {
        "result": state.return_value if state.return_value else void_val(),
        "state": state,
    }


#==============================================================================
# Block Execution
#==============================================================================

async def execute_block_async(
    block: LirBlock,
    state: LIRAsyncRuntimeState,
    registry: OperatorRegistry,
    effect_registry: EffectRegistry,
) -> Optional[Value]:
    """
    Execute all instructions in a basic block (async version).
    Returns None on success, or an error Value on failure.
    """
    for ins in block.instructions:
        state.steps += 1
        if state.steps > state.max_steps:
            return error_val(
                ErrorCodes.NON_TERMINATION.value,
                "Block async execution exceeded maximum steps",
            )

        result = await execute_instruction_async(
            ins,
            state,
            registry,
            effect_registry,
        )
        if result:
            return result  # Error

    return None  # Success


#==============================================================================
# Instruction Execution
#==============================================================================

async def execute_instruction_async(
    ins: Union[LirInstruction, PirInstruction],
    state: LIRAsyncRuntimeState,
    registry: OperatorRegistry,
    effect_registry: EffectRegistry,
) -> Optional[Value]:
    """
    Execute a single LIR instruction (async version).
    Returns None on success, or an error Value on failure.
    """
    kind = ins["kind"]

    if kind == "assign":
        # LirInsAssign: target = value (CIR expression)
        value = evaluate_expr(ins["value"], state.vars)
        if value["kind"] == "error":
            return value
        state.vars[ins["target"]] = value
        state.ref_cells[ins["target"]] = {"kind": "refCell", "value": value}
        return None

    elif kind == "call":
        # LirInsCall: target = callee(args)
        # For now, calls are not fully implemented
        state.vars[ins["target"]] = error_val(
            ErrorCodes.DOMAIN_ERROR.value,
            "Call not yet implemented in LIR async",
        )
        return None

    elif kind == "op":
        # LirInsOp: target = ns:name(args)
        arg_values: List[Value] = []
        for arg_id in ins["args"]:
            arg_value = state.vars.get(arg_id)
            if not arg_value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Argument not found: {arg_id}",
                )
            if arg_value["kind"] == "error":
                return arg_value
            arg_values.append(arg_value)

        op = registry.lookup(ins["ns"], ins["name"])
        if op is None:
            return error_val(
                ErrorCodes.UNKNOWN_OPERATOR.value,
                f"Unknown operator: {ins['ns']}:{ins['name']}",
            )

        if len(op.params) != len(arg_values):
            return error_val(
                ErrorCodes.ARITY_ERROR.value,
                f"Operator {ins['ns']}:{ins['name']} expects {len(op.params)} args, got {len(arg_values)}",
            )

        try:
            result = op.impl(*arg_values)
            state.vars[ins["target"]] = result
            state.ref_cells[ins["target"]] = {"kind": "refCell", "value": result}
            return None
        except SPIRALError as e:
            return e.to_value()
        except Exception as e:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, str(e))

    elif kind == "phi":
        # LirInsPhi: target = phi(sources)
        phi_value: Optional[Value] = None

        # First, try to find a source matching the predecessor block
        if state.predecessor:
            for source in ins["sources"]:
                if source["block"] == state.predecessor:
                    value = state.vars.get(source["id"])
                    if value and value["kind"] != "error":
                        phi_value = value
                        break

        # Fallback: when no predecessor match, find which source's id variable exists
        if not phi_value:
            for source in ins["sources"]:
                value = state.vars.get(source["id"])
                if value and value["kind"] != "error":
                    phi_value = value
                    break

        if not phi_value:
            return error_val(
                ErrorCodes.DOMAIN_ERROR.value,
                f"Phi node has no valid sources: {ins['target']}",
            )

        state.vars[ins["target"]] = phi_value
        state.ref_cells[ins["target"]] = {"kind": "refCell", "value": phi_value}
        return None

    elif kind == "effect":
        # LirInsEffect: target = op(args)
        effect_op = lookup_effect(effect_registry, ins["op"])
        if not effect_op:
            return error_val(
                ErrorCodes.UNKNOWN_OPERATOR.value,
                f"Unknown effect operation: {ins['op']}",
            )

        arg_values: List[Value] = []
        for arg_id in ins["args"]:
            arg_value = state.vars.get(arg_id)
            if not arg_value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Argument not found: {arg_id}",
                )
            if arg_value["kind"] == "error":
                return arg_value
            arg_values.append(arg_value)

        if len(effect_op.params) != len(arg_values):
            return error_val(
                ErrorCodes.ARITY_ERROR.value,
                f"Effect {ins['op']} expects {len(effect_op.params)} args, got {len(arg_values)}",
            )

        # Record effect
        state.effects.append({"op": ins["op"], "args": arg_values})

        try:
            result = effect_op.fn(*arg_values)
            state.vars[ins["target"]] = result
            state.ref_cells[ins["target"]] = {"kind": "refCell", "value": result}
            return None
        except SPIRALError as e:
            return e.to_value()
        except Exception as e:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, str(e))

    elif kind == "assignRef":
        # LirInsAssignRef: target ref cell = value
        value = state.vars.get(ins["value"])
        if not value:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER.value,
                f"Value not found: {ins['value']}",
            )
        if value["kind"] == "error":
            return value

        # Store in ref cell
        state.ref_cells[ins["target"]] = {"kind": "refCell", "value": value}
        return None

    # PIR-specific async instructions
    elif kind == "spawn":
        return await execute_spawn_instruction(ins, state)

    elif kind == "channelOp":
        return await execute_channel_op_instruction(ins, state)

    elif kind == "await":
        return await execute_await_instruction(ins, state)

    else:
        exhaustive(ins)
        return None


#==============================================================================
# PIR Instruction Execution
#==============================================================================

async def execute_spawn_instruction(
    ins: PirInsSpawn,
    state: LIRAsyncRuntimeState,
) -> Optional[Value]:
    """Execute a spawn instruction: creates a new async task"""
    task_id = f"task_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

    # Get argument values
    arg_values: List[Value] = []
    if ins.get("args"):
        for arg_id in ins["args"]:
            value = state.vars.get(arg_id)
            if not value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Spawn arg not found: {arg_id}",
                )
            arg_values.append(value)

    # Spawn the task
    async def task_fn() -> Value:
        # Placeholder task execution
        return void_val()

    state.scheduler.spawn(task_id, task_fn)

    future = future_val(task_id, "pending")
    state.vars[ins["target"]] = future
    state.ref_cells[ins["target"]] = {"kind": "refCell", "value": future}
    return None


async def execute_channel_op_instruction(
    ins: PirInsChannelOp,
    state: LIRAsyncRuntimeState,
) -> Optional[Value]:
    """Execute a channel operation instruction: send/recv/trySend/tryRecv"""
    channel_value = state.vars.get(ins["channel"])
    if not channel_value or not is_channel(channel_value):
        return error_val(ErrorCodes.TYPE_ERROR.value, "channelOp requires a Channel value")

    channel = state.channels.get(channel_value["id"])
    if not channel:
        return error_val(ErrorCodes.DOMAIN_ERROR.value, f"Channel not found: {channel_value['id']}")

    op = ins["op"]

    if op == "send":
        value = state.vars.get(ins["value"]) if ins.get("value") else void_val()
        if ins.get("value") and notvalue:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, f"Value not found: {ins['value']}")
        await channel.send(value or void_val())
        return None

    elif op == "recv":
        received = await channel.recv()
        if ins.get("target"):
            state.vars[ins["target"]] = received
            state.ref_cells[ins["target"]] = {"kind": "refCell", "value": received}
        return None

    elif op == "trySend":
        value = state.vars.get(ins["value"]) if ins.get("value") else void_val()
        if ins.get("value") and notvalue:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, f"Value not found: {ins['value']}")
        success = channel.try_send(value or void_val())
        if ins.get("target"):
            result = int_val(1 if success else 0)
            state.vars[ins["target"]] = result
            state.ref_cells[ins["target"]] = {"kind": "refCell", "value": result}
        return None

    elif op == "tryRecv":
        result = channel.try_recv()
        if result is None:
            # Channel is empty, return void value as indicator
            if ins.get("target"):
                empty = void_val()
                state.vars[ins["target"]] = empty
                state.ref_cells[ins["target"]] = {"kind": "refCell", "value": empty}
        else:
            if ins.get("target"):
                state.vars[ins["target"]] = result
                state.ref_cells[ins["target"]] = {"kind": "refCell", "value": result}
        return None

    else:
        return error_val(ErrorCodes.UNKNOWN_OPERATOR.value, f"Unknown channelOp: {op}")


async def execute_await_instruction(
    ins: PirInsAwait,
    state: LIRAsyncRuntimeState,
) -> Optional[Value]:
    """Execute an await instruction: wait for a future and store result"""
    future_value = state.vars.get(ins["future"])
    if not future_value or not is_future(future_value):
        return error_val(ErrorCodes.TYPE_ERROR.value, "await requires a Future value")

    result = await state.scheduler.await_task(future_value["task_id"])
    state.vars[ins["target"]] = result
    state.ref_cells[ins["target"]] = {"kind": "refCell", "value": result}
    return None


#==============================================================================
# Terminator Execution
#==============================================================================

async def execute_terminator_async(
    term: Union[LirTerminator, PirTerminator],
    state: LIRAsyncRuntimeState,
    blocks: List[LirBlock],
    node_map: Dict[str, LirHybridNode],
    registry: Optional[OperatorRegistry],
    effect_registry: Optional[EffectRegistry],
) -> Union[str, Value]:
    """
    Execute a terminator to determine the next block (async version).
    Returns the next block id, or a Value for return/exit.
    """
    kind = term["kind"]

    if kind == "jump":
        # LirTermJump: unconditional jump to block
        return term["to"]

    elif kind == "branch":
        # LirTermBranch: conditional branch
        cond_value = state.vars.get(term["cond"])
        if not cond_value:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER.value,
                f"Condition variable not found: {term['cond']}",
            )

        if cond_value["kind"] == "error":
            return cond_value

        if cond_value["kind"] != "bool":
            return error_val(
                ErrorCodes.TYPE_ERROR.value,
                f"Branch condition must be bool, got: {cond_value['kind']}",
            )

        return term["then_branch"] if cond_value["value"] else term["else_branch"]

    elif kind == "return":
        # LirTermReturn: return value
        if term.get("value"):
            return_value = state.vars.get(term["value"])
            if not return_value:
                return error_val(
                    ErrorCodes.UNBOUND_IDENTIFIER.value,
                    f"Return value not found: {term['value']}",
                )
            state.return_value = return_value
            return return_value
        return void_val()

    elif kind == "exit":
        # LirTermExit: exit with optional code
        if term.get("code"):
            code_value = state.vars.get(term["code"])
            if code_value:
                return code_value
        return void_val()

    # PIR-specific async terminators
    elif kind == "fork":
        if not registry:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, "Fork terminator requires operator registry")
        if not effect_registry:
            return error_val(ErrorCodes.DOMAIN_ERROR.value, "Fork terminator requires effect registry")
        return await execute_fork_terminator(term, state, blocks, node_map, registry, effect_registry)

    elif kind == "join":
        return await execute_join_terminator(term, state)

    elif kind == "suspend":
        return await execute_suspend_terminator(term, state)

    else:
        exhaustive(term)
        return error_val(ErrorCodes.DOMAIN_ERROR.value, f"Unknown terminator kind: {kind}")


#==============================================================================
# PIR Terminator Execution
#==============================================================================

async def execute_fork_terminator(
    term: PirTermFork,
    state: LIRAsyncRuntimeState,
    blocks: List[LirBlock],
    node_map: Dict[str, LirHybridNode],
    registry: OperatorRegistry,
    effect_registry: EffectRegistry,
) -> Union[str, Value]:
    """Execute fork terminator: spawn branches concurrently, wait for all to complete"""
    # Spawn all branch tasks concurrently
    for branch in term["branches"]:
        block = None
        for b in blocks:
            if b.id == branch["block"]:
                block = b
                break

        if not block:
            # Create a task that returns an error
            async def error_task() -> Value:
                return error_val(
                    ErrorCodes.DOMAIN_ERROR.value,
                    f"Fork block not found: {branch['block']}",
                )
            state.scheduler.spawn(branch["taskId"], error_task)
            continue

        # Spawn task for this branch
        async def branch_task() -> Value:
            # Execute the branch block
            for instr in block.instructions:
                result = await execute_instruction_async(instr, state, registry, effect_registry)
                if result and is_error(result):
                    return result

            # Execute branch terminator
            term_result = await execute_terminator_async(
                block.terminator,
                state,
                blocks,
                node_map,
                registry,
                effect_registry,
            )
            if isinstance(term_result, dict):
                return term_result  # Return value or error

            return void_val()

        state.scheduler.spawn(branch["taskId"], branch_task)

    # Wait for all branch tasks to complete
    await asyncio.gather(*[
        state.scheduler.await_task(branch["taskId"])
        for branch in term["branches"]
    ])

    # Continue to the continuation block
    return term["continuation"]


async def execute_join_terminator(
    term: PirTermJoin,
    state: LIRAsyncRuntimeState,
) -> Union[str, Value]:
    """Execute join terminator: wait for tasks and bind results to variables"""
    # Wait for all tasks to complete
    results = await asyncio.gather(*[
        state.scheduler.await_task(task_id)
        for task_id in term["tasks"]
    ])

    # Bind results to variables if specified
    if term.get("results"):
        for i, result_value in enumerate(results):
            target_var = term["results"][i]
            if target_var is not None:
                state.vars[target_var] = result_value
                state.ref_cells[target_var] = {"kind": "refCell", "value": result_value}

    # Continue to the next block
    return term["to"]


async def execute_suspend_terminator(
    term: PirTermSuspend,
    state: LIRAsyncRuntimeState,
) -> Union[str, Value]:
    """Execute suspend terminator: await a future, then resume at resumeBlock"""
    future_value = state.vars.get(term["future"])
    if not future_value or not is_future(future_value):
        return error_val(ErrorCodes.TYPE_ERROR.value, "suspend requires a Future value")

    # Await the future
    await state.scheduler.await_task(future_value["task_id"])

    # Resume at the specified block
    return term["resume_block"]


#==============================================================================
# Expression Evaluation
#==============================================================================

def evaluate_expr(expr: Expr, env: Dict[str, Value]) -> Value:
    """
    Evaluate a simple CIR expression (for LIR assign instruction).
    Only supports literals and variables for now.
    """
    kind = expr["kind"]

    if kind == "lit":
        # For literals, return the value based on type
        t = expr["type_annotation"]
        v = expr["value"]

        t_kind = t["kind"]

        if t_kind == "bool":
            return {"kind": "bool", "value": bool(v)}
        elif t_kind == "int":
            return int_val(int(v))
        elif t_kind == "float":
            return {"kind": "float", "value": float(v)}
        elif t_kind == "string":
            return {"kind": "string", "value": str(v)}
        elif t_kind == "void":
            return void_val()
        else:
            return error_val(ErrorCodes.TYPE_ERROR.value, "Complex literals not yet supported in LIR async")

    elif kind == "var":
        value = env.get(expr["name"])
        if not value:
            return error_val(
                ErrorCodes.UNBOUND_IDENTIFIER.value,
                f"Unbound identifier: {expr['name']}",
            )
        return value

    else:
        return error_val(ErrorCodes.DOMAIN_ERROR.value, "Complex expressions not yet supported in LIR async")
