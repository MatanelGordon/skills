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

Python's functional side is underused. Frozen dataclasses, `match`/`case`,
`Protocol`, and typed `Result` get you most of the way — without turning Python
into Haskell.

## The five rules

1. **Data is frozen.** `@dataclass(frozen=True, slots=True)`; update via `replace`.
2. **Functions are pure.** No mutation of arguments, no hidden global/`self` state.
3. **Model states as tagged unions,** matched exhaustively.
4. **Expected failures are returned,** not raised. `None` is not an error type.
5. **Pure core, imperative shell.** I/O, clock, randomness live at edges.

Type hints are not optional — they make the rest checkable. Run `mypy --strict`
or `pyright` in strict mode; without a type checker this degrades to convention.

**Scope:** apply at domain boundaries and in new modules. Python's exception
culture, framework requirements (Django/pydantic), and small scripts are
exceptions — see "Don't be dogmatic".

---

## Immutable data

```python
from dataclasses import dataclass, replace, field
from typing import Final

@dataclass(frozen=True, slots=True)
class User:
    id: UserId
    email: Email
    tags: tuple[str, ...] = ()        # tuple, not list

updated = replace(user, email=new_email)
```

- `frozen=True` blocks attribute assignment; `slots=True` cuts memory and blocks
  typos creating new attributes. Use both.
- **`tuple`, `frozenset`, `Mapping` in frozen dataclasses.** A `list` field makes
  the freeze cosmetic — `user.tags.append(x)` still works.
- `frozen=True` makes instances hashable only if every field hashable — one `dict`
  or `list` field and `hash()` raises `TypeError`. Another reason for `tuple`/
  `frozenset`.
- Mutable defaults: `field(default_factory=tuple)`, never `= []`.

```python
# Immutable updates on collections
new_tags   = (*user.tags, "vip")
new_config = {**config, "retries": 3}
new_items  = [*items[:i], replacement, *items[i + 1:]]
```

For deep persistent structures, `pyrsistent` (`PMap`, `PVector`) gives structural
sharing. Use only when copying is measurably hot. Module constants: `MAX_RETRIES: Final = 3`.

## Tagged unions over optional fields

```python
# ✗ Which fields set depends on `status`, nothing enforces it
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

Use `type X = A | B` on 3.12+; older: `X: TypeAlias = A | B`.

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

`assert_never` is the key: type checker errors if any case unhandled, because
value reaching it would be `Never`. Without it, `match` is just nicer `if/elif`
with no exhaustiveness guarantee. Match supports destructuring, guards, nesting.

## Errors are return values

Throwing is an invisible second return. Reserve for programmer error (invariant
violated, unreachable). Return `Result[T, E]` for expected failures (validation,
not found, business rule, external error).

```python
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")
E = TypeVar("E")

@dataclass(frozen=True)
class Ok(Generic[T]):
    value: T

@dataclass(frozen=True)
class Err(Generic[E]):
    error: E

type Result[T, E] = Ok[T] | Err[E]

def map(r: Result[T, E], f: Callable[[T], U]) -> Result[U, E]:
    match r:
        case Ok(value=v): return Ok(f(v))
        case Err():       return r
```

Use `returns` library for richer composition (railway, `@safe`, do-notation).
Plain `Result` covers most.

## Branded IDs with NewType

```python
from typing import NewType

UserId = NewType("UserId", str)
user_id = UserId("u_123")  # type-checks; str passes but UserId doesn't
```

Parse at boundaries (pydantic) into branded types.

## Parameter management

1–3 positional parameters, ordered by importance. 4+ → frozen dataclass context.
Order: data first, dependencies/services last, callbacks last.

```python
# ✗ Six loose parameters
def place_order(sku: str, qty: int, price: float,
                email: str, now: datetime,
                validate: Callable[[Order], bool]) -> Result[Order, OrderError]: ...

# ✓ Data grouped, dependency second, callback last
@dataclass(frozen=True, slots=True)
class PlaceOrder:
    sku: str
    qty: int
    price: float
    email: str

def place_order(request: PlaceOrder, now: datetime,
                validate: Callable[[Order], bool] | None = None) -> Result[Order, OrderError]: ...
```

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

Pass `now` as parameter instead of `datetime.now()` in logic — removes most need
for `freezegun` and mocking. Core takes values, returns values; tests are plain
assertions.

## Decider pattern

Split "what should happen" from "how it is stored": pure `decide` turns command +
state into events, paired with mechanical `evolve` fold applying one event to
state. All rules in `decide`; `evolve` never decides.

```python
type Command = Pay | Ship
type Event = Paid | Shipped

def decide(state: Job, cmd: Command) -> tuple[Event, ...]:
    match (state, cmd):
        case (Pending(_), Pay(amount=a)): return (Paid(a),)
        case (Running(_), Ship(tracking=t)): return (Shipped(t),)
        case _: return ()

def evolve(state: Job, e: Event) -> Job:
    match e:
        case Paid(amount=a):    return Succeeded(output=str(a))
        case Shipped(tracking=t): return Succeeded(output=t)
        case _: assert_never(e)
```

Shell persists events and folds `evolve` to rebuild state. `decide` tests are
table-driven — no mocks, no DB, no clock.

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| mutable class with attributes | `@dataclass(frozen=True, slots=True)` |
| inheritance for variants | tagged union + `match`/`assert_never` |
| ABC with one implementation | a function, or `Protocol` |
| class with `__init__` + one method | function (+ `functools.partial`) |
| `list` / `dict` field on model | `tuple` / `Mapping` |
| mutating an argument in place | return new value (`replace`, `{**d}`) |
| `raise` for validation failure | return `Result` / `Err` |
| `return None` to signal failure | `Result` with typed error |
| `str`/`int` identifiers | `NewType` |
| `if/elif` chains on type field | `match` with `assert_never` |
| `datetime.now()` inside logic | pass `now` as parameter |
| `global` / module mutable state | explicit parameters |
| `Enum` + optional fields | one union variant per state |
| `map`/`filter` with `lambda` | comprehension / generator expression |

## Review checklist

- [ ] Dataclasses `frozen=True, slots=True`; collection fields immutable
- [ ] No function mutates its arguments
- [ ] States modeled as unions; every `match` ends in `assert_never`
- [ ] Expected failures return `Result`; `None` means absence only
- [ ] Ids and validated strings use `NewType`; boundaries parse with pydantic
- [ ] No `datetime.now()`, I/O, randomness, logging in domain functions
- [ ] Type checker runs in strict mode and passes
- [ ] No inheritance used purely for polymorphism

## Don't be dogmatic

Python's exception culture is legitimate — `Result` everywhere fights stdlib and
reads badly at call sites that just want the value. Use at domain boundaries and
pipelines where failures compose; let `KeyError`/`ValueError` be exceptions.
Don't import `returns` into a small script. Comprehensions beat
`compose(map(...), filter(...))` in nearly all Python code. Frozen dataclasses
marginally slower to construct — irrelevant except measured hot loop. Match
existing conventions.

Deeper material: `references/returns.md` (railway pipelines, `@safe`, do-notation,
IO/Reader containers), `references/typing.md` (NewType, Protocol, generics,
`assert_never`, strict-mode configuration).
