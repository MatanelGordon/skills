"""In-process event bus: publish(event) calls every function subscribed to type(event)."""
from typing import Any, Callable

_subscribers: dict[type, list[Callable[[Any], None]]] = {}


def subscribe(event_type: type):
    """Register the decorated function to be called for each published event_type."""
    def decorator(fn):
        _subscribers.setdefault(event_type, []).append(fn)
        return fn
    return decorator


def publish(event: Any) -> None:
    for fn in _subscribers.get(type(event), []):
        fn(event)
