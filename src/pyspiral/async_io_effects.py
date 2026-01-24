"""
SPIRAL Async I/O Effects for Python
Extended async I/O effect system with file system simulation and HTTP mocking
Extends the base effects system with AsyncIOEffectRegistry and in-memory file store
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
)
from dataclasses import dataclass, field

from pyspiral.types import (
    Type,
    Value,
    string_type,
    int_type,
    void_type,
    string_val,
    int_val,
    void_val,
    error_val,
    future_type,
    future_val,
    ErrorCode,
)
from pyspiral.effects import (
    EffectRegistry,
    EffectOp,
    empty_effect_registry,
    register_effect,
)


#==============================================================================
# In-Memory File System (for testing)
#==============================================================================

class InMemoryFileSystem:
    """
    In-memory file system for testing async I/O effects
    Simulates file operations without touching the real filesystem
    """

    def __init__(self) -> None:
        self.files: Dict[str, str] = {}

    async def read_file(self, filename: str) -> str:
        """
        Read a file from memory

        Args:
            filename: Name of the file to read

        Returns:
            File content or raises error if not found
        """
        # Simulate async delay
        await asyncio.sleep(0.01)

        content = self.files.get(filename)
        if content is None:
            raise FileNotFoundError(f"File not found: {filename}")
        return content

    async def write_file(self, filename: str, content: str) -> None:
        """
        Write content to a file in memory

        Args:
            filename: Name of the file to write
            content: Content to write
        """
        # Simulate async delay
        await asyncio.sleep(0.01)

        self.files[filename] = content

    async def append_file(self, filename: str, content: str) -> None:
        """
        Append content to a file in memory

        Args:
            filename: Name of the file to append to
            content: Content to append
        """
        # Simulate async delay
        await asyncio.sleep(0.01)

        existing = self.files.get(filename, "")
        self.files[filename] = existing + content

    async def delete_file(self, filename: str) -> None:
        """
        Delete a file from memory

        Args:
            filename: Name of the file to delete
        """
        # Simulate async delay
        await asyncio.sleep(0.005)

        self.files.pop(filename, None)

    async def exists(self, filename: str) -> bool:
        """
        Check if a file exists

        Args:
            filename: Name of the file to check

        Returns:
            True if file exists
        """
        # Simulate async delay
        await asyncio.sleep(0.005)

        return filename in self.files

    async def list_files(self) -> List[str]:
        """
        List all files

        Returns:
            Array of filenames
        """
        # Simulate async delay
        await asyncio.sleep(0.005)

        return list(self.files.keys())

    def set_file(self, filename: str, content: str) -> None:
        """Set a file's content directly (synchronous, for setup)"""
        self.files[filename] = content

    def get_file(self, filename: str) -> Optional[str]:
        """Get a file's content directly (synchronous, for testing)"""
        return self.files.get(filename)

    def clear(self) -> None:
        """Clear all files"""
        self.files.clear()

    def size(self) -> int:
        """Get the number of files"""
        return len(self.files)


#==============================================================================
# Mock HTTP Client (for testing)
#==============================================================================

@dataclass
class MockHttpResponse:
    """Mock HTTP response"""
    status: int
    headers: Dict[str, str]
    body: str


class MockHttpClient:
    """
    Mock HTTP client for testing async HTTP effects
    Simulates HTTP requests without making real network calls
    """

    def __init__(self) -> None:
        self.responses: Dict[str, MockHttpResponse] = {}
        self.default_response: MockHttpResponse = MockHttpResponse(
            status=404,
            headers={},
            body="Not Found"
        )

    async def get(self, url: str) -> str:
        """
        Make a GET request

        Args:
            url: URL to request

        Returns:
            Response body
        """
        # Simulate network delay
        await asyncio.sleep(0.05)

        response = self.responses.get(url, self.default_response)

        if response.status >= 400:
            raise RuntimeError(f"HTTP {response.status}: {response.body}")

        return response.body

    async def post(self, url: str, body: str) -> str:
        """
        Make a POST request

        Args:
            url: URL to request
            body: Request body

        Returns:
            Response body
        """
        # Simulate network delay
        await asyncio.sleep(0.05)

        # For mocking, just return echo of the body
        return f"Echo: {body}"

    def set_mock_response(self, url: str, response: MockHttpResponse) -> None:
        """Register a mock response for a URL"""
        self.responses[url] = response

    def set_default_response(self, response: MockHttpResponse) -> None:
        """Set the default response for unmatched URLs"""
        self.default_response = response

    def clear(self) -> None:
        """Clear all mock responses"""
        self.responses.clear()


#==============================================================================
# Async I/O Effect Configuration
#==============================================================================

@dataclass
class AsyncIOEffectConfig:
    """Configuration for async I/O effects"""
    file_system: Optional[InMemoryFileSystem] = None
    http_client: Optional[MockHttpClient] = None


#==============================================================================
# Async I/O Effect Registry
#==============================================================================

class AsyncIOEffectRegistry:
    """
    Async I/O effect registry extends the base effect registry
    with async I/O operations that have access to file system and HTTP client
    """

    def __init__(self, config: Optional[AsyncIOEffectConfig] = None) -> None:
        self._config: AsyncIOEffectConfig = config or AsyncIOEffectConfig()

    def get_config(self) -> AsyncIOEffectConfig:
        """Get the stored config"""
        return self._config

    def get_registry(self) -> EffectRegistry:
        """Get the effect registry"""
        registry = empty_effect_registry()

        # Register all async I/O effects
        registry = self._register_extended_effects(registry)

        return registry

    def _register_extended_effects(self, registry: EffectRegistry) -> EffectRegistry:
        """Register extended async I/O effects"""
        # All effects are registered with placeholder functions
        # The actual execution is handled by eval_async_effect

        # asyncRead effect
        registry = register_effect(registry, EffectOp(
            name="asyncRead",
            params=[string_type()],
            returns=future_type(string_type()),
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        # asyncWrite effect
        registry = register_effect(registry, EffectOp(
            name="asyncWrite",
            params=[string_type(), string_type()],
            returns=future_type(void_type()),
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        # sleep effect
        registry = register_effect(registry, EffectOp(
            name="sleep",
            params=[int_type()],
            returns=future_type(void_type()),
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        # httpGet effect
        registry = register_effect(registry, EffectOp(
            name="httpGet",
            params=[string_type()],
            returns=future_type(string_type()),
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        # httpPost effect
        registry = register_effect(registry, EffectOp(
            name="httpPost",
            params=[string_type(), string_type()],
            returns=future_type(string_type()),
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        # asyncAppend effect
        registry = register_effect(registry, EffectOp(
            name="asyncAppend",
            params=[string_type(), string_type()],
            returns=future_type(void_type()),
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        # asyncDelete effect
        registry = register_effect(registry, EffectOp(
            name="asyncDelete",
            params=[string_type()],
            returns=future_type(void_type()),
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        # asyncExists effect
        registry = register_effect(registry, EffectOp(
            name="asyncExists",
            params=[string_type()],
            returns=future_type(int_type()),  # Using int as boolean (0/1)
            pure=False,
            fn=lambda **kwargs: error_val(
                ErrorCode.DOMAIN_ERROR.value,
                "Use eval_async_effect for async operations"
            ),
        ))

        return registry


#==============================================================================
# Async Effect Evaluation Helper
#==============================================================================

class AsyncEvalState:
    """Async evaluation state for PIR programs"""

    def __init__(
        self,
        task_id: str,
        env: Dict[str, Value],
        ref_cells: Dict[str, Any],
        effects: List[Any],
        steps: int,
        max_steps: int,
        scheduler: Any,
        channels: Any,
        task_pool: Dict[str, Any],
        parent_task_id: Optional[str] = None,
    ):
        self.task_id = task_id
        self.env = env
        self.ref_cells = ref_cells
        self.effects = effects
        self.steps = steps
        self.max_steps = max_steps
        self.scheduler = scheduler
        self.channels = channels
        self.task_pool = task_pool
        self.parent_task_id = parent_task_id


async def eval_async_effect(
    effect_name: str,
    state: AsyncEvalState,
    config: AsyncIOEffectConfig,
    *args: Value,
) -> Value:
    """
    Evaluate an async effect with access to AsyncEvalState
    This function handles async effects that need the scheduler and file system

    Args:
        effect_name: Name of the effect to evaluate
        state: Async evaluation state with scheduler
        config: Async I/O configuration with file system and HTTP client
        *args: Effect arguments

    Returns:
        Result value (usually a FutureVal)
    """
    file_system = config.file_system or InMemoryFileSystem()
    http_client = config.http_client or MockHttpClient()

    if effect_name == "asyncRead":
        if len(args) < 1:
            return error_val(ErrorCode.ARITY_ERROR.value, "asyncRead requires 1 argument (filename)")

        filename = args[0]
        if filename["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "asyncRead filename must be a string")

        task_id = f"asyncRead_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def read_task() -> Value:
            try:
                content = await file_system.read_file(filename["value"])
                return string_val(content)
            except Exception as e:
                return error_val(ErrorCode.DOMAIN_ERROR.value, str(e))

        state.scheduler.spawn(task_id, read_task)
        return future_val(task_id, "pending")

    elif effect_name == "asyncWrite":
        if len(args) < 2:
            return error_val(ErrorCode.ARITY_ERROR.value, "asyncWrite requires 2 arguments (filename, content)")

        filename = args[0]
        content = args[1]

        if filename["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "asyncWrite filename must be a string")
        if content["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "asyncWrite content must be a string")

        task_id = f"asyncWrite_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def write_task() -> Value:
            try:
                await file_system.write_file(filename["value"], content["value"])
                return void_val()
            except Exception as e:
                return error_val(ErrorCode.DOMAIN_ERROR.value, str(e))

        state.scheduler.spawn(task_id, write_task)
        return future_val(task_id, "pending")

    elif effect_name == "asyncAppend":
        if len(args) < 2:
            return error_val(ErrorCode.ARITY_ERROR.value, "asyncAppend requires 2 arguments (filename, content)")

        filename = args[0]
        content = args[1]

        if filename["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "asyncAppend filename must be a string")
        if content["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "asyncAppend content must be a string")

        task_id = f"asyncAppend_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def append_task() -> Value:
            try:
                await file_system.append_file(filename["value"], content["value"])
                return void_val()
            except Exception as e:
                return error_val(ErrorCode.DOMAIN_ERROR.value, str(e))

        state.scheduler.spawn(task_id, append_task)
        return future_val(task_id, "pending")

    elif effect_name == "asyncDelete":
        if len(args) < 1:
            return error_val(ErrorCode.ARITY_ERROR.value, "asyncDelete requires 1 argument (filename)")

        filename = args[0]
        if filename["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "asyncDelete filename must be a string")

        task_id = f"asyncDelete_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def delete_task() -> Value:
            try:
                await file_system.delete_file(filename["value"])
                return void_val()
            except Exception as e:
                return error_val(ErrorCode.DOMAIN_ERROR.value, str(e))

        state.scheduler.spawn(task_id, delete_task)
        return future_val(task_id, "pending")

    elif effect_name == "asyncExists":
        if len(args) < 1:
            return error_val(ErrorCode.ARITY_ERROR.value, "asyncExists requires 1 argument (filename)")

        filename = args[0]
        if filename["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "asyncExists filename must be a string")

        task_id = f"asyncExists_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def exists_task() -> Value:
            try:
                exists = await file_system.exists(filename["value"])
                return int_val(1 if exists else 0)
            except Exception as e:
                return error_val(ErrorCode.DOMAIN_ERROR.value, str(e))

        state.scheduler.spawn(task_id, exists_task)
        return future_val(task_id, "pending")

    elif effect_name == "sleep":
        if len(args) < 1:
            return error_val(ErrorCode.ARITY_ERROR.value, "sleep requires 1 argument (milliseconds)")

        ms = args[0]
        if ms["kind"] != "int":
            return error_val(ErrorCode.TYPE_ERROR.value, "sleep milliseconds must be an integer")

        task_id = f"sleep_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def sleep_task() -> Value:
            await asyncio.sleep(ms["value"] / 1000.0)  # Convert ms to seconds
            return void_val()

        state.scheduler.spawn(task_id, sleep_task)
        return future_val(task_id, "pending")

    elif effect_name == "httpGet":
        if len(args) < 1:
            return error_val(ErrorCode.ARITY_ERROR.value, "httpGet requires 1 argument (url)")

        url = args[0]
        if url["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "httpGet url must be a string")

        task_id = f"httpGet_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def http_get_task() -> Value:
            try:
                body = await http_client.get(url["value"])
                return string_val(body)
            except Exception as e:
                return error_val(ErrorCode.DOMAIN_ERROR.value, str(e))

        state.scheduler.spawn(task_id, http_get_task)
        return future_val(task_id, "pending")

    elif effect_name == "httpPost":
        if len(args) < 2:
            return error_val(ErrorCode.ARITY_ERROR.value, "httpPost requires 2 arguments (url, body)")

        url = args[0]
        body = args[1]

        if url["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "httpPost url must be a string")
        if body["kind"] != "string":
            return error_val(ErrorCode.TYPE_ERROR.value, "httpPost body must be a string")

        task_id = f"httpPost_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

        async def http_post_task() -> Value:
            try:
                response_body = await http_client.post(url["value"], body["value"])
                return string_val(response_body)
            except Exception as e:
                return error_val(ErrorCode.DOMAIN_ERROR.value, str(e))

        state.scheduler.spawn(task_id, http_post_task)
        return future_val(task_id, "pending")

    else:
        return error_val(ErrorCode.UNKNOWN_OPERATOR.value, f"Unknown async effect: {effect_name}")


#==============================================================================
# Factory Functions
#==============================================================================

def create_async_io_effect_registry(config: Optional[AsyncIOEffectConfig] = None) -> AsyncIOEffectRegistry:
    """
    Create an async I/O effect registry

    Args:
        config: Optional configuration with file system and HTTP client

    Returns:
        AsyncIOEffectRegistry instance
    """
    return AsyncIOEffectRegistry(config)


def create_in_memory_file_system() -> InMemoryFileSystem:
    """
    Create an in-memory file system for testing

    Returns:
        InMemoryFileSystem instance
    """
    return InMemoryFileSystem()


def create_mock_http_client() -> MockHttpClient:
    """
    Create a mock HTTP client for testing

    Returns:
        MockHttpClient instance
    """
    return MockHttpClient()


def create_async_io_config(
    file_system: Optional[InMemoryFileSystem] = None,
    http_client: Optional[MockHttpClient] = None,
) -> AsyncIOEffectConfig:
    """
    Create async I/O effect config for testing

    Args:
        file_system: Optional in-memory file system
        http_client: Optional mock HTTP client

    Returns:
        AsyncIOEffectConfig instance
    """
    return AsyncIOEffectConfig(
        file_system=file_system or InMemoryFileSystem(),
        http_client=http_client or MockHttpClient(),
    )
