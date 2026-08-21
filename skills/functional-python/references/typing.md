# Typing for functional Python

Without a strict type checker most functional discipline is unenforceable. This is
the configuration and the handful of constructs that do the work.

## Strict configuration

```toml
# pyproject.toml
[tool.mypy]
strict = true
warn_unreachable = true
disallow_any_explicit = true
plugins = ["returns.contrib.mypy.returns_plugin"]   # only if using `returns`

[tool.ruff.lint]
select = ["E", "F", "B", "UP", "SIM", "RET", "C4", "PIE", "TCH", "ANN"]
```

Or pyright:

```json
{ "typeCheckingMode": "strict", "reportUnnecessaryTypeIgnoreComment": "error" }
```

`strict` implies `disallow_untyped_defs`, `no_implicit_optional`, and
`warn_return_any` — the three that matter most.

## `NewType` for nominal types

```python
from typing import NewType

UserId  = NewType("UserId", str)
OrderId = NewType("OrderId", str)
Cents   = NewType("Cents", int)

def refund(order: OrderId, amount: Cents) -> None: ...

refund(user_id, cents)   # type error — exactly what you want
```

Zero runtime overhead (`UserId(x)` returns `x` unchanged). Rules:

1. Construct only inside the parser that establishes the invariant.
2. One `NewType` per concept — not a shared `Id` alias.
3. `NewType` cannot be subclassed or used with `isinstance`; that's fine, it isn't
   a runtime concept.

For invariants richer than identity (positive, non-empty, in-range), use a
`pydantic` model or an `attrs` class with a validator, and keep construction in
one place.

## `Protocol` over ABC

```python
from typing import Protocol, runtime_checkable

class Clock(Protocol):
    def now(self) -> datetime: ...

class UserRepo(Protocol):
    async def find(self, uid: UserId) -> User | None: ...
```

Structural: any object with the right shape satisfies it — no inheritance, no
registration, and test fakes are plain objects or simple dataclasses. Prefer
`Protocol` for the small number of genuine seams (clock, repository, HTTP client)
and a tagged union for closed sets of variants.

Add `@runtime_checkable` only if you truly need `isinstance` — it checks method
*names* only, not signatures, so it is a weak guarantee.

## Exhaustiveness with `assert_never`

```python
from typing import assert_never       # 3.11+; typing_extensions before that

def area(s: Shape) -> float:
    match s:
        case Circle(radius=r):   return math.pi * r * r
        case Rect(w=w, h=h):     return w * h
        case _:                  assert_never(s)
```

When every variant is handled, `s` narrows to `Never` and the call type-checks.
Add a variant to `Shape` and the checker reports the `assert_never` call as an
error — a compile-time exhaustiveness guarantee, which `match` alone does not give.

`assert_never` also raises at runtime if reached, so it doubles as a guard against
untyped callers.

## PEP 695 generics (3.12+)

```python
type Result[T, E] = Ok[T] | Err[E]           # lazy, no forward-ref quoting needed

def first[T](xs: Sequence[T]) -> T | None:
    return xs[0] if xs else None

@dataclass(frozen=True, slots=True)
class Box[T]:
    value: T
```

Scoped to the construct, variance inferred, no `TypeVar` declarations. Pre-3.12:

```python
from typing import TypeVar, TypeAlias
T = TypeVar("T")
Result: TypeAlias = "Ok[T] | Err[E]"
```

## Immutable signatures

Accept the least specific type you need; return the most specific immutable one.

```python
from collections.abc import Sequence, Mapping, Iterable

def summarize(users: Sequence[User]) -> Mapping[str, int]: ...
def stream(rows: Iterable[Row]) -> Iterator[Record]: ...
```

`Sequence`/`Mapping`/`Iterable` from `collections.abc` (not `typing` — deprecated)
signal "I will not mutate this". Returning `Mapping` rather than `dict` tells the
caller not to mutate the result.

Never annotate a parameter `list[T]` unless you genuinely need `list` — it invites
mutation and forbids tuples.

## Frozen dataclass details

```python
@dataclass(frozen=True, slots=True, kw_only=True)
class Order:
    id: OrderId
    lines: tuple[OrderLine, ...] = ()
    metadata: tuple[tuple[str, str], ...] = ()   # NOT Mapping — see hashability below
```

- `kw_only=True` prevents positional-argument mistakes on wide models and lets you
  reorder fields without breaking callers.
- `slots=True` blocks accidental new attributes and cuts memory; it is incompatible
  with `functools.cached_property`, which wants a `__dict__`.
- `field(default_factory=...)` for any non-primitive default.
- `frozen=True` is shallow — a `list` field is still mutable. Use `tuple`.
- Frozen dataclasses are hashable only if **every** field is. A `dict`/`Mapping`
  or `list` field makes `hash(obj)` raise `TypeError` at runtime even though the
  class is frozen — verified behaviour, and easy to miss until something puts the
  object in a set. Use `tuple[tuple[K, V], ...]` or `frozenset(d.items())`, or pass
  `eq=False`/accept unhashability deliberately.

`replace(obj, **changes)` is the update primitive; on 3.13+ `copy.replace` works
for any object implementing `__replace__`.

## Typing `Result` without a library

```python
from dataclasses import dataclass
from typing import assert_never

@dataclass(frozen=True, slots=True)
class Ok[T]:
    value: T

@dataclass(frozen=True, slots=True)
class Err[E]:
    error: E

type Result[T, E] = Ok[T] | Err[E]

def handle(r: Result[User, UserError]) -> str:
    match r:
        case Ok(value=u):  return u.email
        case Err(error=e): return describe(e)
        case _:            assert_never(r)
```

The checker narrows correctly through `match` on the dataclass patterns, so this
needs no plugin and no dependency.

## Common escapes and when they're acceptable

| Escape | Acceptable when |
|---|---|
| `# type: ignore[code]` | always with a specific code, plus a comment saying why |
| `cast(T, x)` | immediately after a runtime check the checker can't see |
| `Any` | genuinely dynamic boundary (plugin loader) — parse into a real type immediately |
| `object` | you truly accept anything and will narrow before use |

Prefer `object` to `Any`: `object` forces you to narrow, `Any` silently disables
checking and spreads through everything it touches.
