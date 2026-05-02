"""Progress callback mechanism for query pipeline.

Uses contextvars to pass a progress callback through the async call chain
without modifying function signatures. The SSE streaming endpoint sets the
callback, and internal query functions call ``emit_progress`` at key stages.
"""

import contextvars
from typing import Awaitable, Callable

ProgressCallback = Callable[[str, str], Awaitable[None]]

_progress_callback: contextvars.ContextVar[ProgressCallback | None] = (
    contextvars.ContextVar("progress_callback", default=None)
)


async def emit_progress(stage: str, message: str) -> None:
    """Emit a progress event if a callback is set in the current context."""
    callback = _progress_callback.get()
    if callback:
        await callback(stage, message)
