---
name: functional-python
description: >
  Write Python in a functional style — frozen dataclasses, pure functions, tagged-union
  domain models with exhaustive match/case, and Result-typed errors instead of mutable
  classes, inheritance hierarchies, and exceptions for expected failures. Use whenever
  writing, reviewing, or refactoring Python: modules, services, FastAPI/Django handlers,
  data pipelines, domain models, or error handling. Also use when tempted to write a
  class with mutable attributes, use inheritance for polymorphism, mutate a list/dict
  argument in place, raise for a validation failure, or return None to mean failure; and
  when a dataclass has optional fields only valid in certain combinations. Covers
  frozen/slots dataclasses, NewType, Protocol over ABC, match/case, returns library,
  immutable updates, and functional core + imperative shell.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Functional Python

Python is multi-paradigm and its functional side is underused. Frozen dataclasses,
`match`/`case`, `Protocol`, and a typed `Result` get you most of the way — without
turning Python into Haskell, which never reads well.

## The five rules

1. **Data is frozen.** `@dataclass(frozen=True, slots=True)`; update via `replace`.
2. **Functions are pure.** No mutation of arguments, no hidden global/`self` state.
3. **Model states as tagged unions,** matched exhaustively.
4. **Expected failures are returned,** not raised. `None` is not an error type.
5. **Pure core, imperative shell.** I/O, clock, and randomness live at the edges.

Type hints are not optional here — they are what makes the rest checkable. Run
`mypy --strict` or `pyright` in strict mode; without a type checker most of this
degrades to convention.

---

## Immutable data

```python
from dataclasses import dataclass, replace, field
from typing import Final

@dataclass(frozen=True, slots=True)
class User:
    id: UserId
    email: Email
    tags: tuple[str, ...] = ()        # tuple, not list — lists are mutable

updated = replace(user, email=new_email)   # new object; original untouched
```

- `frozen=True` blocks attribute assignment; `slots=True` cuts memory and blocks
  typos creating new attributes. Use both.
- **`tuple`, `frozenset`, and `Mapping` in frozen dataclasses.** A `list` field
  makes the freeze cosmetic — `user.tags.append(x)` still works.
- `frozen=True` makes instances hashable **only if every field is hashable** — one
  `dict` or `list` field and `hash()` raises `TypeError` at runtime. Another reason
  to use `tuple`/`frozenset` throughout.
- Mutable defaults: `field(default_factory=tuple)`, never `= []`.

```python
# Immutable "updates" on collections
new_tags   = (*user.tags, "vip")
new_config = {**config, "retries": 3}
new_items  = [*items[:i], replacement, *items[i + 1:]]
```

For deep persistent structures, `pyrsistent` (`PMap`, `PVector`) gives structural
sharing. Reach for it only when copying is measurably hot — plain tuples and dict
unpacking are fine at normal sizes.

Module-level constants: `MAX_RETRIES: Final = 3`.

## Tagged unions over optional fields

```python
# ✗ Which fields are set depends on `status`, and nothing enforces it
@dataclass
class Job:
    status: str
    result: str | None = None
    error: str | None = None

# ✓ Each state carries exactly its own data
@dataclass(frozen=True, slots=True)
class Pending:
    submitted_at: datetime

@dataclass(frozen=True, slots=True)
class Running:
    started_at: datetime
    worker: str

@dataclass(frozen=True, slots=True)
class Succeeded:
    output: str

@dataclass(frozen=True, slots=True)
class Failed:
    error: JobError

type Job = Pending | Running | Succeeded | Failed   # PEP 695, Python 3.12+
```

Use `type X = A | B` on 3.12+; on older versions `X: TypeAlias = A | B`.

### Exhaustive matching

```python
from typing import assert_never

def describe(job: Job) -> str:
    match job:
        case Pending(submitted_at=t):   return f"queued at {t:%H:%M}"
        case Running(worker=w):         return f"running on {w}"
        case Succeeded(output=o):       return f"done: {o}"
        case Failed(error=e):           return f"failed: {e.message}"
        case _:                         assert_never(job)
```

`assert_never` is the key: the type checker errors if any case is unhandled,
because the value reaching it would no longer be `Never`. Without it, `match` is
just a nicer `if/elif` with no exhaustiveness guarantee.

Match supports destructuring, guards, and nesting:

```python
match event:
    case {"type": "click", "pos": (x, y)} if x > 0:  ...
    case [first, *rest]:                             ...
    case Point(x=0, y=0):                            ...
```

## Errors as values

`raise` for expected failures makes the signature lie and forces callers to know
which exceptions to catch. Return the failure instead.

```python
from dataclasses import dataclass
from typing import Generic, TypeVar

@dataclass(frozen=True, slots=True)
class Ok[T]:
    value: T

@dataclass(frozen=True, slots=True)
class Err[E]:
    error: E

type Result[T, E] = Ok[T] | Err[E]
```

Error types should be unions, not strings:

```python
@dataclass(frozen=True, slots=True)
class NotFound:
    user_id: UserId

@dataclass(frozen=True, slots=True)
class Invalid:
    field: str
    reason: str

type UserError = NotFound | Invalid
```

For real composition use **`returns`** (dry-python) rather than hand-rolling
chains — see `references/returns.md`:

```python
from returns.result import Result, Success, Failure, safe
from returns.pipeline import flow
from returns.pointfree import bind, map_

result = flow(
    raw_input,
    parse_user,          # -> Result[User, UserError]
    bind(check_credit),  # -> Result[Credit, UserError]
    map_(to_summary),
)
```

**`None` is not an error.** `Optional[T]` means "absent", which is one thing;
"failed, and here is why" needs `Result`. Returning `None` for both is how you get
`if x is None:` branches that can't explain themselves.

**Still raise for:** programmer error (`ValueError` on a contract violation),
unrecoverable startup problems, and genuinely exceptional infrastructure faults.
Python's culture is more exception-friendly than most — don't wrap `KeyError` in
`Result` for a lookup you control. Use `Result` where failure is expected,
recoverable, and part of the domain.

## Parse, don't validate

```python
from typing import NewType

UserId = NewType("UserId", str)
Email  = NewType("Email", str)

def parse_email(raw: str) -> Result[Email, Invalid]:
    if "@" not in raw:
        return Err(Invalid("email", "missing @"))
    return Ok(Email(raw))
```

`NewType` is free at runtime and stops `send_to(user_id)` at type-check time —
without it every id and every email is just `str`. For richer constraints use
**pydantic** at I/O boundaries: it parses `unknown` JSON into typed models and
accumulates all errors at once.

Once past the boundary, everything is a domain type and no function re-validates.

## Functions, not classes

```python
# ✗ A class whose only job is to hold config and expose one method
class PriceCalculator:
    def __init__(self, rate: float) -> None:
        self._rate = rate
    def calculate(self, amount: float) -> float:
        return amount * (1 + self._rate)

# ✓ A function; partially apply if you need to bind the rate
def calculate_price(amount: float, rate: float) -> float:
    return amount * (1 + rate)

from functools import partial
at_vat = partial(calculate_price, rate=0.2)
```

A class with one method and no state should be a function. A class with `__init__`
storing collaborators and one `run()` is a closure wearing a costume.

**`Protocol` over ABC** for polymorphism — structural typing means no inheritance
and no registration:

```python
from typing import Protocol

class Clock(Protocol):
    def now(self) -> datetime: ...
```

Anything with a matching `now` satisfies it. For a fixed set of variants, prefer a
tagged union over either.

Classes remain right for: framework requirements (Django models, pydantic
`BaseModel`), context managers with real lifecycles, and custom exceptions.

## Composition and iteration

```python
# Comprehensions over map/filter — more Pythonic and usually clearer
names = [u.name for u in users if u.active]

# Generators for streaming; itertools for the classics
from itertools import chain, groupby, islice
total = sum(line.price * line.qty for line in order.lines)
```

Prefer comprehensions to `map`/`filter` with lambdas. Use `functools.reduce`
sparingly — a loop is usually more readable, and `sum`/`min`/`max`/`any`/`all`
cover most real uses. Local mutation inside a pure function is perfectly fine:

```python
def group_by_status(jobs: Iterable[Job]) -> Mapping[str, tuple[Job, ...]]:
    acc: dict[str, list[Job]] = {}
    for j in jobs:
        acc.setdefault(type(j).__name__, []).append(j)   # local mutation, fine
    return {k: tuple(v) for k, v in acc.items()}          # immutable at the boundary
```

`functools.cache` / `lru_cache` are safe *only* on pure functions with hashable
arguments — which is another reason purity pays.

## Functional core, imperative shell

```python
# SHELL — impure: gather
row = await db.fetch_user(user_id)
user = to_domain(row)

# CORE — pure: decide (no db, no datetime.now(), no logging)
decision = apply_promotion(user, promo, now=clock.now())

# SHELL — impure: act
match decision:
    case Ok(value):  await db.save(from_domain(value))
    case Err(error): return error_response(error)
```

Pass `now` in as a parameter instead of calling `datetime.now()` inside logic —
that single change removes most of the need for `freezegun` and mocking. The core
takes values and returns values, so its tests are plain assertions.

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| mutable class with attributes | `@dataclass(frozen=True, slots=True)` |
| inheritance for variants | tagged union + `match`/`assert_never` |
| ABC with one implementation | a function, or `Protocol` |
| class with `__init__` + one method | function (+ `functools.partial`) |
| `list` / `dict` field on a model | `tuple` / `Mapping` |
| mutating an argument in place | return a new value (`replace`, `{**d}`) |
| `raise` for validation failure | return `Result` / `Err` |
| `return None` to signal failure | `Result` with a typed error |
| `str`/`int` identifiers | `NewType` |
| `if/elif` chains on a type field | `match` with `assert_never` |
| `datetime.now()` inside logic | pass `now` as a parameter |
| `global` / module-level mutable state | explicit parameters |
| `Enum` + optional fields | one union variant per state |
| `map`/`filter` with `lambda` | comprehension / generator expression |

## Review checklist

- [ ] Dataclasses are `frozen=True, slots=True`; collection fields are immutable
- [ ] No function mutates its arguments
- [ ] States modeled as unions; every `match` ends in `assert_never`
- [ ] Expected failures return `Result`; `None` means absence only
- [ ] Ids and validated strings use `NewType`; boundaries parse with pydantic
- [ ] No `datetime.now()`, I/O, randomness, or logging in domain functions
- [ ] Type checker runs in strict mode and passes
- [ ] No inheritance used purely for polymorphism

## Don't be dogmatic

Python's exception culture is legitimate — `Result` everywhere fights the stdlib
and reads badly at call sites that just want the value. Use it at domain
boundaries and in pipelines where failures compose; let `KeyError`/`ValueError`
be exceptions. Don't import `returns` into a small script. Comprehensions beat
`compose(map(...), filter(...))` in nearly all Python code. Frozen dataclasses are
marginally slower to construct — irrelevant except in a measured hot loop. Match
the conventions already in the codebase.

Deeper material: `references/returns.md` (railway pipelines, `@safe`, do-notation,
IO/Reader containers), `references/typing.md` (NewType, Protocol, generics,
`assert_never`, strict-mode configuration).
