"""Routes a command or query object to the one function registered for its type."""
from typing import Any, Callable

_handlers: dict[type, Callable[[Any], Any]] = {}


def handles(request_type: type):
    """Register the decorated function as the handler for request_type."""
    def decorator(fn):
        _handlers[request_type] = fn
        return fn
    return decorator


def send(request: Any) -> Any:
    handler = _handlers.get(type(request))
    if handler is None:
        raise LookupError(f"No handler registered for {type(request).__name__}")
    return handler(request)
