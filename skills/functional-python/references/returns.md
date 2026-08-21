# Railway pipelines with `returns`

`returns` (dry-python) provides `Result`, `Maybe`, `IO`, `RequiresContext` and the
combinators to compose them. Install with the mypy plugin — without it, type
inference through the containers is poor.

```toml
# pyproject.toml
[tool.mypy]
plugins = ["returns.contrib.mypy.returns_plugin"]
strict = true
```

## Result basics

```python
from returns.result import Result, Success, Failure

def divide(a: int, b: int) -> Result[float, str]:
    if b == 0:
        return Failure("division by zero")
    return Success(a / b)

divide(10, 2).map(round)          # Success(5)
divide(10, 0).map(round)          # Failure('division by zero') — map skipped
```

## The two tracks

| Method | Track | Effect |
|---|---|---|
| `.map(f)` | success | `T -> U`, stays successful |
| `.bind(f)` | success | `T -> Result[U, E]`, flattens; short-circuits on failure |
| `.alt(f)` | failure | `E -> F`, transform the error |
| `.lash(f)` | failure | `E -> Result[T, F]`, can recover onto the success track |
| `.value_or(d)` | both | extract with a default |
| `.unwrap()` | both | extract or raise — boundaries only |

```python
Failure(1).alt(str)                      # Failure('1')

def tolerate(exc: Exception) -> Result[int, Exception]:
    return Success(0) if isinstance(exc, ZeroDivisionError) else Failure(exc)

Failure(ZeroDivisionError()).lash(tolerate)   # Success(0)
```

`map` vs `bind` is the same distinction as everywhere: if your function itself
returns a `Result`, use `bind`, or you get `Result[Result[T]]`.

## Pipelines

```python
from returns.pipeline import flow
from returns.pointfree import bind, map_

def register(raw: str) -> Result[User, RegistrationError]:
    return flow(
        raw,
        parse_email,           # str -> Result[Email, RegistrationError]
        bind(check_not_taken), # Email -> Result[Email, RegistrationError]
        bind(create_user),     # Email -> Result[User, RegistrationError]
        map_(with_defaults),   # User -> User
    )
```

`flow(value, *functions)` applies left to right — the reading order matches the
business process. `pipe` builds the same composition without an initial value, for
when you want a reusable function.

## `@safe` — converting exceptions

```python
from returns.result import safe

@safe
def parse_int(raw: str) -> int:
    return int(raw)              # ValueError becomes Failure(ValueError(...))

parse_int("12")   # Success(12)
parse_int("abc")  # Failure(ValueError(...))
```

Use `@safe` at the boundary around code you don't control. Inside the domain,
return `Failure` explicitly with a typed error — `Failure(SomeException())` tells
the caller much less than `Failure(Invalid("email", "missing @"))`.

## Do-notation

When later steps need several earlier values, chained `bind` gets awkward:

```python
from returns.result import Result, Success

def register(raw: dict[str, str]) -> Result[User, Error]:
    return Result.do(
        User(email=email, plan=plan)
        for email in parse_email(raw["email"])
        for plan  in parse_plan(raw["plan"])       # email still in scope
    )
```

Reads like a comprehension, short-circuits on the first `Failure`.

## Maybe

```python
from returns.maybe import Maybe, Some, Nothing

Maybe.from_optional(config.get("timeout")).map(int).value_or(30)
```

Use `Maybe` for genuine absence. Don't use it as a poor man's `Result` — losing
the reason for failure is the whole problem `Result` solves.

## Async

```python
from returns.future import FutureResult, future_safe

@future_safe
async def fetch_user(uid: UserId) -> User:
    return await api.get_user(uid)          # exceptions -> Failure

result = await fetch_user(uid).awaitable()
```

`FutureResult` composes async fallible steps without `await`-ing between each one,
so the pipeline stays flat.

## Validation: accumulating errors

`Result` fails fast on the first error — right for dependent steps, wrong for form
validation where you want every problem at once. `returns` has no built-in
applicative validation, so collect explicitly:

```python
def validate_all(raw: dict[str, str]) -> Result[User, tuple[Invalid, ...]]:
    checks = (parse_email(raw["email"]), parse_age(raw["age"]), parse_plan(raw["plan"]))
    errors = tuple(c.failure() for c in checks if not is_successful(c))
    if errors:
        return Failure(errors)
    email, age, plan = (c.unwrap() for c in checks)
    return Success(User(email, age, plan))
```

Or use **pydantic** at the boundary — it accumulates every field error natively,
which is usually the better answer for request/config parsing.

## When not to use `returns`

- Small scripts and one-off tooling — the import cost outweighs the benefit.
- Codebases without a type checker: most of the value is in the types, and
  untyped `returns` code is harder to read than plain exceptions.
- Deep inside stdlib-heavy code where `KeyError`/`ValueError` are idiomatic.
- Any team that hasn't agreed to it — half-converted railway code is worse than
  consistent exceptions.

The hand-rolled `Ok`/`Err` union in the main skill is enough for many projects and
requires no dependency or mypy plugin. Reach for `returns` when you have genuine
multi-step pipelines whose failures need to compose.

## Companion libraries

| Library | Use |
|---|---|
| `pydantic` | parse/validate at I/O boundaries, accumulate errors |
| `pyrsistent` | persistent `PMap`/`PVector` with structural sharing |
| `toolz` / `cytoolz` | `pipe`, `compose`, `curry`, lazy iterator utilities |
| `attrs` | frozen classes with validators/converters (alternative to dataclasses) |
| `hypothesis` | property-based testing — pure functions make this trivially applicable |

`toolz.pipe(x, f, g, h)` applies left to right, like `flow`. Note that `pipe` and
`compose` are hard to type precisely in Python; a comprehension or explicit
intermediate variables often type-check better and read no worse.
