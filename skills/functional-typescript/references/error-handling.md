# Result composition and library choice

## The problem with hand-rolled chains

A bare `Result` type is correct but composes badly:

```ts
const register = (raw: unknown): Result<User, AppError> => {
  const input = parseInput(raw);
  if (!input.ok) return input;
  const email = parseEmail(input.value.email);
  if (!email.ok) return email;
  const user = createUser(email.value);
  if (!user.ok) return user;
  return { ok: true, value: user.value };
};
```

Correct, explicit, and readable enough at three steps. Past ~4 it becomes noise —
that's when a library earns its place.

## neverthrow — the default

Incrementally adoptable, one function at a time, no runtime paradigm shift.

```ts
import { ok, err, Result, ResultAsync } from "neverthrow";

const register = (raw: unknown): Result<User, AppError> =>
  parseInput(raw)
    .andThen(input => parseEmail(input.email))   // andThen = flatMap/bind
    .map(email => ({ email, createdAt: NOW }))   // map = transform success
    .mapErr(toAppError);                         // transform the error track

// async: ResultAsync avoids Promise<Result<..>> nesting
const save = (u: User): ResultAsync<UserId, DbError> =>
  ResultAsync.fromPromise(db.insert(u), toDbError);
```

Key operations, worth knowing by name because they recur in every language:

| Operation | Meaning |
|---|---|
| `map` | transform the success value, stay on the success track |
| `mapErr` | transform the error value, stay on the error track |
| `andThen` | run another fallible step; short-circuits if already failed |
| `orElse` | recover — can move from the error track back to success |
| `match` | collapse both tracks into one value |
| `combine` | `Result<T>[]` → `Result<T[]>`, failing on the first error |

`safeTry` gives generator-based do-notation when a chain needs intermediate
values from several earlier steps:

```ts
const flow = safeTry(function* () {
  const input = yield* parseInput(raw).safeUnwrap();
  const email = yield* parseEmail(input.email).safeUnwrap();
  return ok({ ...input, email });        // both still in scope
});
```

## Effect — when the whole system opts in

Effect models errors, dependencies, and async in one type:
`Effect<Success, Error, Requirements>`. It brings a full runtime: structured
concurrency, fibers, retry/timeout policies, resource safety, DI, and typed
interruption.

```ts
import { Effect, pipe } from "effect";

const register = (raw: unknown) =>
  pipe(
    parseInput(raw),
    Effect.flatMap(input => parseEmail(input.email)),
    Effect.flatMap(saveUser),
    Effect.retry({ times: 3 }),
    Effect.timeout("5 seconds"),
  );
```

**Choose Effect when** you are greenfield, the team will adopt it system-wide, and
you actually need concurrency/resource/DI machinery. **Choose neverthrow when**
you are adding typed errors to an existing codebase, or you want value at the
level of individual functions without converting everything. Effect delivers most
of its benefit only when adopted broadly; neverthrow pays off one function at a time.

Do not mix both in one codebase. Do not add either to a small project — the hand-
rolled `Result` above plus strict compiler flags is genuinely sufficient.

## Typed errors, not `Error`

```ts
type AppError =
  | { readonly kind: "validation"; readonly field: string; readonly msg: string }
  | { readonly kind: "notFound";   readonly id: string }
  | { readonly kind: "conflict";   readonly reason: string }
  | { readonly kind: "upstream";   readonly status: number };
```

Callers match exhaustively, and adding a variant surfaces every place that must
now decide what to do. `Error` or `string` throws that information away — the
caller can only log it.

Map to transport concerns only at the shell:

```ts
const toHttp = (e: AppError): Response => {
  switch (e.kind) {
    case "validation": return json(400, { field: e.field, message: e.msg });
    case "notFound":   return json(404, { id: e.id });
    case "conflict":   return json(409, { reason: e.reason });
    case "upstream":   return json(502, {});
    default:           return assertNever(e);
  }
};
```

## Boundaries: converting throws into Results

Third-party code throws. Convert once, at the edge:

```ts
const tryCatch = <T, E>(f: () => T, onErr: (e: unknown) => E): Result<T, E> => {
  try { return { ok: true, value: f() }; }
  catch (e) { return { ok: false, error: onErr(e) }; }
};

const parseJson = (s: string) =>
  tryCatch(() => JSON.parse(s) as unknown, () => ({ kind: "badJson" } as const));
```

Inside the boundary nothing throws for expected reasons, so there is no `try/catch`
scattered through the domain.

## When throwing is right

- Invariant violations and unreachable states (`assertNever`).
- Programmer error: a required env var missing at startup — fail loudly and exit.
- Framework contracts that expect throws (React Suspense, some middleware).

The distinction is whether a *caller* could sensibly recover. If yes, it's a value.
If it means the program is wrong, throw.

## Validation: fail-fast vs accumulate

`Result` short-circuits on the first error — right for sequential steps. Form
validation wants *all* the errors:

```ts
const validateAll = <T, E>(rs: readonly Result<T, E>[]): Result<readonly T[], readonly E[]> => {
  const errors = rs.flatMap(r => (r.ok ? [] : [r.error]));
  return errors.length
    ? { ok: false, error: errors }
    : { ok: true, value: rs.map(r => (r as { ok: true; value: T }).value) };
};
```

neverthrow ships `Result.combineWithAllErrors`; Effect has `Either` validation
combinators. Zod already accumulates — `safeParse` returns every issue at once,
which is why parsing at the boundary handles most of this for free.
