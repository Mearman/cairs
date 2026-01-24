"""
SPIRAL Concurrent Execution Detectors
Race condition and deadlock detection for PIR async/parallel execution
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import (
    Dict,
    List,
    Set,
    Optional,
    Any,
    Callable,
    Literal,
    TypeAlias,
)
from datetime import datetime
import asyncio
import logging

from .types import Value

logger = logging.getLogger(__name__)


#==============================================================================
# Detection Options
#==============================================================================

@dataclass
class DetectionOptions:
    """Configuration options for race and deadlock detectors"""
    enable_race_detection: bool = True
    enable_deadlock_detection: bool = True
    deadlock_timeout: int = 5000  # ms
    detailed_race_reports: bool = True
    auto_detect: bool = False  # Auto-detect on every evaluation cycle


#==============================================================================
# Memory Access Tracking
#==============================================================================

@dataclass
class MemoryAccess:
    """Represents a single memory access event"""
    task_id: str
    location: str
    type: Literal["read", "write"]
    value: Value
    timestamp: float
    happens_before: Set[str] = field(default_factory=set)  # Task IDs that must happen before this access


@dataclass
class RaceCondition:
    """Race condition report"""
    location: str
    tasks: tuple[str, str]
    access_types: tuple[Literal["read", "write"], Literal["read", "write"]]
    conflict_type: Literal["W-W", "W-R", "R-W"]
    description: str


#==============================================================================
# Lock Acquisition Tracking
#==============================================================================

@dataclass
class LockAcquisition:
    """Represents a lock acquisition event"""
    task_id: str
    lock_id: str
    timestamp: float
    acquired: bool


@dataclass
class DeadlockCycle:
    """Deadlock cycle report"""
    cycle: List[str]
    locks: List[str]
    description: str


#==============================================================================
# Race Detector
#==============================================================================

class RaceDetector:
    """
    RaceDetector tracks memory accesses across concurrent tasks
    Uses happens-before analysis to detect data races

    A data race occurs when:
    1. Two or more tasks access the same memory location
    2. At least one access is a write
    3. No happens-before ordering exists between the accesses
    """

    def __init__(self, options: Optional[DetectionOptions] = None) -> None:
        self._options = options or DetectionOptions(
            enable_race_detection=True,
            detailed_race_reports=True,
        )
        self.accesses: Dict[str, List[MemoryAccess]] = {}
        self.sync_points: Dict[str, Set[str]] = {}
        self.access_counter = 0

    def record_access(
        self,
        task_id: str,
        location: str,
        access_type: Literal["read", "write"],
        value: Value,
    ) -> None:
        """Record a memory access from a task"""
        if not self._options.enable_race_detection:
            return

        access = MemoryAccess(
            task_id=task_id,
            location=location,
            type=access_type,
            value=value,
            timestamp=datetime.now().timestamp(),
            happens_before=set(),
        )

        # Establish happens-before from previous sync points
        if task_id in self.sync_points:
            access.happens_before = set(self.sync_points[task_id])

        # Store access
        if location not in self.accesses:
            self.accesses[location] = []
        self.accesses[location].append(access)
        self.access_counter += 1

        # Auto-detect if enabled
        if self._options.auto_detect and self.access_counter % 100 == 0:
            races = self.detect_races()
            if races:
                logger.warning(f"[RaceDetector] Detected {len(races)} potential race conditions")

    def record_sync_point(self, task_id: str, sync_task_ids: List[str]) -> None:
        """Record a synchronization point (e.g., join, barrier)"""
        if not self._options.enable_race_detection:
            return

        # Record that task_id happens-after all sync_task_ids
        if task_id not in self.sync_points:
            self.sync_points[task_id] = set()
        self.sync_points[task_id].update(sync_task_ids)

    def detect_races(self) -> List[RaceCondition]:
        """Detect data races across all recorded accesses"""
        if not self._options.enable_race_detection:
            return []

        races: List[RaceCondition] = []

        for location, accesses in self.accesses.items():
            # Check all pairs of accesses for potential races
            for i in range(len(accesses)):
                for j in range(i + 1, len(accesses)):
                    access1 = accesses[i]
                    access2 = accesses[j]

                    if access1 is None or access2 is None:
                        continue

                    race = self._check_pair_for_race(location, access1, access2)
                    if race:
                        races.append(race)

        return races

    def _check_pair_for_race(
        self,
        location: str,
        access1: MemoryAccess,
        access2: MemoryAccess,
    ) -> Optional[RaceCondition]:
        """Check if two accesses form a race condition"""
        # Same task - not a race
        if access1.task_id == access2.task_id:
            return None

        # Check if there's a happens-before relationship
        if self._has_happens_before(access1, access2):
            return None

        # Determine conflict type
        conflict_type = self._get_conflict_type(access1, access2)
        if conflict_type is None:
            return None

        description = self._generate_race_description(
            location,
            access1.task_id,
            access2.task_id,
            access1.type,
            access2.type,
        )

        return RaceCondition(
            location=location,
            tasks=(access1.task_id, access2.task_id),
            access_types=(access1.type, access2.type),
            conflict_type=conflict_type,
            description=description,
        )

    def _has_happens_before(self, access1: MemoryAccess, access2: MemoryAccess) -> bool:
        """Check if there's a happens-before relationship between two accesses"""
        # Check if access1 happens-before access2
        if access2.task_id in access1.happens_before:
            return True

        # Check if access2 happens-before access1
        if access1.task_id in access2.happens_before:
            return True

        # Check transitive happens-before
        for ancestor_id in access1.happens_before:
            if ancestor_id in access2.happens_before:
                return True

        return False

    def _get_conflict_type(
        self,
        access1: MemoryAccess,
        access2: MemoryAccess,
    ) -> Optional[Literal["W-W", "W-R", "R-W"]]:
        """Get the conflict type between two accesses (None if no conflict / R-R)"""
        if access1.type == "write" and access2.type == "write":
            return "W-W"
        if access1.type == "write" and access2.type == "read":
            return "W-R"
        if access1.type == "read" and access2.type == "write":
            return "R-W"
        # R-R is not a race
        return None

    def _generate_race_description(
        self,
        location: str,
        task1: str,
        task2: str,
        type1: Literal["read", "write"],
        type2: Literal["read", "write"],
    ) -> str:
        """Generate a human-readable race description"""
        return (
            f'Potential data race at location "{location}": '
            f'task "{task1}" performs {type1} and task "{task2}" performs {type2} '
            "without happens-before ordering. This could lead to undefined behavior."
        )

    def clear(self) -> None:
        """Clear all recorded accesses and sync points"""
        self.accesses.clear()
        self.sync_points.clear()
        self.access_counter = 0

    def get_stats(self) -> Dict[str, int]:
        """Get statistics about recorded accesses"""
        total_accesses = sum(len(accesses) for accesses in self.accesses.values())
        return {
            "total_accesses": total_accesses,
            "locations": len(self.accesses),
            "sync_points": len(self.sync_points),
        }


#==============================================================================
# Deadlock Detector
#==============================================================================

class DeadlockDetector:
    """
    DeadlockDetector tracks lock acquisitions across concurrent tasks
    Uses wait-for graph analysis to detect circular wait conditions

    A deadlock occurs when:
    1. A cycle exists in the wait-for graph
    2. All tasks in the cycle are blocked waiting for locks
    3. The cycle has no external resolver
    """

    def __init__(self, options: Optional[DetectionOptions] = None) -> None:
        self._options = options or DetectionOptions(
            enable_deadlock_detection=True,
            deadlock_timeout=5000,
        )
        self.lock_holders: Dict[str, str] = {}  # lockId -> taskId
        self.wait_graph: Dict[str, Set[str]] = {}  # taskId -> Set of lockIds waiting for
        self.acquisition_history: List[LockAcquisition] = []
        self._default_timeout = self._options.deadlock_timeout

    def track_lock_acquisition(self, task_id: str, lock_id: str) -> None:
        """Track a lock acquisition attempt"""
        if not self._options.enable_deadlock_detection:
            return

        acquisition = LockAcquisition(
            task_id=task_id,
            lock_id=lock_id,
            timestamp=datetime.now().timestamp(),
            acquired=False,  # Initially not acquired
        )

        self.acquisition_history.append(acquisition)

        # Record that task is waiting for lock
        if task_id not in self.wait_graph:
            self.wait_graph[task_id] = set()
        self.wait_graph[task_id].add(lock_id)

        # Auto-detect if enabled
        if self._options.auto_detect:
            deadlocks = self.detect_deadlock()
            if deadlocks:
                logger.warning(f"[DeadlockDetector] Detected {len(deadlocks)} potential deadlocks")

    def track_lock_acquired(self, task_id: str, lock_id: str) -> None:
        """Track a successful lock acquisition"""
        if not self._options.enable_deadlock_detection:
            return

        # Update the most recent acquisition for this task/lock
        for acquisition in reversed(self.acquisition_history):
            if (
                acquisition.task_id == task_id
                and acquisition.lock_id == lock_id
                and not acquisition.acquired
            ):
                acquisition.acquired = True
                break

        # Record that task now holds the lock
        self.lock_holders[lock_id] = task_id

        # Remove from wait graph
        if task_id in self.wait_graph:
            self.wait_graph[task_id].discard(lock_id)
            if not self.wait_graph[task_id]:
                del self.wait_graph[task_id]

    def track_lock_release(self, task_id: str, lock_id: str) -> None:
        """Track a lock release"""
        if not self._options.enable_deadlock_detection:
            return

        # Remove from lock holders
        if self.lock_holders.get(lock_id) == task_id:
            del self.lock_holders[lock_id]

    def detect_deadlock(self) -> List[DeadlockCycle]:
        """Detect deadlock cycles using wait-for graph analysis"""
        if not self._options.enable_deadlock_detection:
            return []

        cycles: List[DeadlockCycle] = []
        visited: Set[str] = set()
        rec_stack: Set[str] = set()
        path: List[str] = []
        lock_path: List[str] = []

        # Build task dependency graph: task -> tasks it's waiting for
        task_graph = self._build_task_dependency_graph()

        # DFS to detect cycles
        for task_id in task_graph:
            if task_id not in visited:
                self._detect_cycles_dfs(
                    task_id,
                    task_graph,
                    visited,
                    rec_stack,
                    path,
                    lock_path,
                    cycles,
                )

        return cycles

    def _build_task_dependency_graph(self) -> Dict[str, Set[str]]:
        """Build a task dependency graph from lock holders and waiters"""
        task_graph: Dict[str, Set[str]] = {}

        # For each lock, find who holds it and who's waiting for it
        lock_waiters: Dict[str, List[str]] = {}

        # Build map of lock -> tasks waiting for it
        for task_id, waiting_locks in self.wait_graph.items():
            for lock_id in waiting_locks:
                if lock_id not in lock_waiters:
                    lock_waiters[lock_id] = []
                lock_waiters[lock_id].append(task_id)

        # Create edges: waiting task -> holding task
        for lock_id, waiters in lock_waiters.items():
            holder = self.lock_holders.get(lock_id)
            if holder:
                for waiter in waiters:
                    if waiter not in task_graph:
                        task_graph[waiter] = set()
                    task_graph[waiter].add(holder)

        return task_graph

    def _detect_cycles_dfs(
        self,
        task_id: str,
        graph: Dict[str, Set[str]],
        visited: Set[str],
        rec_stack: Set[str],
        path: List[str],
        lock_path: List[str],
        cycles: List[DeadlockCycle],
    ) -> None:
        """DFS-based cycle detection in task dependency graph"""
        visited.add(task_id)
        rec_stack.add(task_id)
        path.append(task_id)

        # Add locks this task is waiting for
        waiting_locks = self.wait_graph.get(task_id, set())
        for lock_id in waiting_locks:
            lock_path.append(lock_id)

        dependencies = graph.get(task_id, set())
        for dep_id in dependencies:
            if dep_id not in visited:
                self._detect_cycles_dfs(
                    dep_id,
                    graph,
                    visited,
                    rec_stack,
                    path,
                    lock_path,
                    cycles,
                )
            elif dep_id in rec_stack:
                # Found a cycle - extract it
                cycle_start = path.index(dep_id)
                cycle = path[cycle_start:]
                locks = self._extract_locks_for_cycle(cycle)

                cycles.append(
                    DeadlockCycle(
                        cycle=cycle,
                        locks=locks,
                        description=self._generate_deadlock_description(cycle, locks),
                    )
                )

        rec_stack.discard(task_id)
        path.pop()

        # Remove locks this task was waiting for
        for _ in waiting_locks:
            lock_path.pop()

    def _extract_locks_for_cycle(self, cycle: List[str]) -> List[str]:
        """Extract locks involved in a deadlock cycle"""
        locks: List[str] = []

        for i in range(len(cycle)):
            current_task = cycle[i]
            next_task = cycle[(i + 1) % len(cycle)]

            # Find the lock that currentTask is waiting for that nextTask holds
            waiting_locks = self.wait_graph.get(current_task, set())
            for lock_id in waiting_locks:
                holder = self.lock_holders.get(lock_id)
                if holder and holder == next_task:
                    locks.append(lock_id)
                    break

        return locks

    def _generate_deadlock_description(self, cycle: List[str], locks: List[str]) -> str:
        """Generate a human-readable deadlock description"""
        description = "Deadlock detected: "

        parts = []
        for i in range(len(cycle)):
            task = cycle[i]
            lock = locks[i] if i < len(locks) else "?"
            next_task = cycle[(i + 1) % len(cycle)]
            parts.append(f'task "{task}" is waiting for lock "{lock}" held by task "{next_task}"')

        description += ", ".join(parts)
        description += ". This circular wait condition will never resolve without intervention."

        return description

    async def detect_deadlock_with_timeout(
        self, timeout_ms: Optional[int] = None
    ) -> List[DeadlockCycle]:
        """Detect deadlock with timeout. Returns as soon as a deadlock is detected or timeout expires"""
        timeout = timeout_ms or self._default_timeout

        start_time = datetime.now().timestamp()
        check_interval = 0.1  # 100ms

        while True:
            elapsed = (datetime.now().timestamp() - start_time) * 1000
            if elapsed >= timeout:
                return []

            deadlocks = self.detect_deadlock()
            if deadlocks:
                return deadlocks

            await asyncio.sleep(check_interval)

    def clear(self) -> None:
        """Clear all tracking state"""
        self.lock_holders.clear()
        self.wait_graph.clear()
        self.acquisition_history.clear()

    def get_stats(self) -> Dict[str, int]:
        """Get statistics about lock tracking"""
        waiting_tasks = sum(len(waiters) for waiters in self.wait_graph.values())
        return {
            "held_locks": len(self.lock_holders),
            "waiting_tasks": waiting_tasks,
            "total_acquisitions": len(self.acquisition_history),
        }


#==============================================================================
# Detection Result
#==============================================================================

@dataclass
class DetectionResult:
    """Combined detection result"""
    races: List[RaceCondition]
    deadlocks: List[DeadlockCycle]
    timestamp: float


#==============================================================================
# Factory Functions
#==============================================================================

def create_race_detector(options: Optional[DetectionOptions] = None) -> RaceDetector:
    """Create a race detector with the given options"""
    return RaceDetector(options)


def create_deadlock_detector(options: Optional[DetectionOptions] = None) -> DeadlockDetector:
    """Create a deadlock detector with the given options"""
    return DeadlockDetector(options)


def create_detectors(options: Optional[DetectionOptions] = None) -> Dict[str, Any]:
    """Create both detectors with shared options"""
    race_detector = RaceDetector(options)
    deadlock_detector = DeadlockDetector(options)

    def run_detection() -> DetectionResult:
        return DetectionResult(
            races=race_detector.detect_races(),
            deadlocks=deadlock_detector.detect_deadlock(),
            timestamp=datetime.now().timestamp(),
        )

    return {
        "race_detector": race_detector,
        "deadlock_detector": deadlock_detector,
        "run_detection": run_detection,
    }


#==============================================================================
# Default Options
#==============================================================================

DEFAULT_DETECTION_OPTIONS = DetectionOptions(
    enable_race_detection=True,
    enable_deadlock_detection=True,
    deadlock_timeout=5000,
    detailed_race_reports=True,
    auto_detect=False,  # Disabled by default for performance
)

STRICT_DETECTION_OPTIONS = DetectionOptions(
    enable_race_detection=True,
    enable_deadlock_detection=True,
    deadlock_timeout=1000,
    detailed_race_reports=True,
    auto_detect=True,  # Auto-detect on every access
)
