---
name: functional-typescript
description: >
  Write TypeScript in a functional style — pure functions, immutable data, discriminated
  unions, and Result-typed errors instead of classes, inheritance, mutation, and thrown
  exceptions. Use whenever writing, reviewing, or refactoring TypeScript or JavaScript:
  new modules, services, React/Node code, domain models, error handling, API boundaries,
  or state machines. Also use when deciding between a class and a function, when tempted
  to reach for inheritance or a mutable service field, when handling "what if this
  fails", or when a type has optional fields that are only valid in certain
  combinations. Covers strict tsconfig, readonly/as const, exhaustive matching, branded
  types, parse-don't-validate, neverthrow/Effect, and functional core + imperative
  shell.
license: MIT
metadata:
  author: Matanel Gordon
  source: https://github.com/MatanelGordon/skills
---

# Functional TypeScript

Default to functions over classes, values over state, and types that make illegal
states unrepresentable. TypeScript's structural type system is unusually good at
this — the language rewards a functional style far more than it rewards OOP.

## The five rules

1. **Data is immutable.** `readonly` by default; produce new values, never mutate.
2. **Functions are pure.** Same input → same output, no side effects. Push I/O to the edges.
3. **Model with unions, not optional fields.** If two fields are only valid together, that's a union.
4. **Expected failures are values,** returned as `Result`. Exceptions are for bugs.
5. **Parse at the boundary.** `unknown` in, domain types out. Never trust external data.

**Scope:** apply these rules at domain boundaries and in new modules.
Framework requirements (React error boundaries, NestJS providers) and internal
helpers that cannot fail are legitimate exceptions — see "Don't be dogmatic"
before Result-wrapping everything.

---

## Start with the compiler

Most "functional TypeScript" is just a strict compiler doing its job.

```jsonc
// tsconfig.json — the non-negotiables
{
  "compilerOptions": {
    "strict": true,                        // the big one
    "noUncheckedIndexedAccess": true,      // arr[0] is T | undefined — it always was
    "exactOptionalPropertyTypes": true,    // `?: T` ≠ `: T | undefined`
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "erasableSyntaxOnly": true             // TS 5.8+: bans enums/namespaces/param properties
  }
}
```

Ban `any`. At boundaries use `unknown` and parse. `as` is a claim you can't back up —
the only acceptable uses are inside a parser and in `as const`.

## Immutability

```ts
type User = {
  readonly id: UserId;
  readonly email: Email;
  readonly tags: readonly string[];    // not string[] — callers can't push
};

// Update by producing a new value
const withTag = (u: User, tag: string): User =>
  ({ ...u, tags: [...u.tags, tag] });
```

- `readonly` on every property and array in a domain type.
- `as const satisfies T` for config and lookup tables: `as const` freezes it,
  `satisfies` type-checks it *without* widening the inferred literal types.
- Never mutate a parameter. A function that takes `User` and changes it is a bug
  the type system can't see once you drop `readonly`.
- Deep updates: nested spreads are fine for 2 levels; past that use `immer`'s
  `produce` (structural sharing, immutable result) rather than hand-rolling.

## Model with discriminated unions

The single highest-leverage change. Optional fields let callers construct nonsense;
unions don't.

```ts
// ✗ Four fields, sixteen combinations, three of them legal
type FetchState = {
  status: "idle" | "loading" | "ok" | "error";
  data?: User;
  error?: Error;
};

// ✓ Exactly the legal states, each carrying only its own data
type FetchState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly data: User }
  | { readonly status: "error"; readonly error: Error };
```

Now `.data` simply doesn't exist unless `status === "ok"`. No optional chaining,
no "this can't happen" comments.

### Match exhaustively

```ts
const render = (r: FetchState): string => {
  switch (r.status) {
    case "idle":    return "";
    case "loading": return "Loading…";
    case "ok":      return r.data.email;      // narrowed, no ?.
    case "error":   return r.error.message;
    default:        return assertNever(r);     // compile error if a case is added
  }
};

const assertNever = (x: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
};
```

Adding a fifth variant breaks every `switch` until you handle it — that is the
feature. For nested or multi-value matching, use **ts-pattern**'s `match(...)
.exhaustive()`; it handles shapes a `switch` can't and fails at compile time.

## Errors are return values

Throwing is an invisible second return type. Reserve it for programmer error
(invariant violated, unreachable state). For anything a caller should handle,
return a `Result`.

```ts
type Result<T, E> =
  | { readonly ok: true;  readonly value: T }
  | { readonly ok: false; readonly error: E };
```

Errors should be **typed unions**, not `Error` or `string`:

```ts
type ParseError =
  | { readonly kind: "empty" }
  | { readonly kind: "tooLong"; readonly max: number }
  | { readonly kind: "badFormat"; readonly input: string };
```

The caller can then handle each case exhaustively. See
`references/error-handling.md` for the neverthrow/Effect decision and how to
compose chains without a pyramid of `if (!r.ok) return r`.

Async composition: wrap the awaited value, not the promise — neverthrow's
`ResultAsync` flattens `(await parse(input)).andThen(fetchUser)` into one
`Promise<Result<T, E>>`; `Effect.gen` does the same for larger graphs. Never
let `Promise<Result<Result<T>>>` leak through an unflattened step.
See `references/error-handling.md`.

**Rule of thumb:** expected domain failure → `Result`. Bug or unrecoverable →
`throw`. Never use exceptions to model control flow you expect to happen.

## Parse, don't validate

A validator returns a boolean and you forget you called it. A parser returns a
*different type* and the compiler remembers forever.

```ts
declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

type Email = Brand<string, "Email">;

// The ONLY place the cast is allowed
const parseEmail = (raw: string): Result<Email, ParseError> =>
  raw.includes("@")
    ? { ok: true, value: raw as Email }
    : { ok: false, error: { kind: "badFormat", input: raw } };
```

`Email` is now unforgeable — `sendTo(someString)` won't compile. Do this for IDs
especially: `UserId` and `OrderId` are both `string` structurally, so without
brands the compiler will happily let you swap them.

At I/O boundaries (HTTP, files, env, DB rows) take `unknown` and parse with **zod**
or **arktype** into domain types. Everything inside the boundary is trustworthy.

**Both directions of every JSON boundary get a schema — no exceptions:**

```ts
const CreateUser = z.object({ email: z.string().email(), plan: z.enum(["free","pro"]) });
const UserCreated = z.object({ id: z.string().uuid(), createdAt: z.coerce.date() });

// OUTBOUND: validate the body before it goes on the wire
export const createUser = async (input: unknown): Promise<Result<User, ApiError>> => {
  const body = CreateUser.safeParse(input);
  if (!body.success) return { ok: false, error: { kind: "badRequest", issues: body.error.issues } };

  const res = await fetch(url, { method: "POST", body: JSON.stringify(body.data) });

  // INBOUND: never trust the response — parse it before returning
  const parsed = UserCreated.safeParse(await res.json());
  if (!parsed.success) return { ok: false, error: { kind: "badResponse", issues: parsed.error.issues } };
  return { ok: true, value: parsed.data };
};
```

Applies to handlers too: parse the incoming request body, and parse your own
response before returning it. `await res.json()` is `any` in disguise — sending an
unvalidated body ships malformed data to someone else's system, and returning an
unvalidated response lets a schema drift upstream become a runtime crash three
layers into your own code. `safeParse` returns a Result-shaped value and
accumulates every issue at once, so it composes with §Errors directly.

## Functions, not classes

Use a module of functions over a class. Classes couple data to behavior, invite
mutable fields, and make composition harder.

```ts
// ✗ Mutable state, hidden dependency, hard to test
class CartService {
  private items: Item[] = [];
  add(i: Item) { this.items.push(i); }
  total() { return this.items.reduce((s, i) => s + i.price, 0); }
}

// ✓ Data and transformations, separately
type Cart = readonly Item[];
const add   = (c: Cart, i: Item): Cart => [...c, i];
const total = (c: Cart): number => c.reduce((s, i) => s + i.price, 0);
```

**Inheritance is never the answer here** — use unions for "is one of" and plain
function composition for reuse. Higher-order functions replace Strategy, Template
Method, Decorator, and most of Factory.

Classes are still fine where a framework demands them (React error boundaries,
NestJS providers, custom `Error` subclasses) or for a stateful resource wrapper
with a genuine lifecycle. Use them there and keep the logic pure.

## Composition

Prefer `map`/`filter`/`flatMap` over accumulator loops. But **`reduce` is not
automatically better than a loop** — if a `reduce` needs a comment to explain it,
write the loop over a local array and return it `readonly`. Clarity wins; the
point is no *shared* mutation, not zero local variables.

## Functional core, imperative shell

```
HTTP handler / CLI / job runner   ← impure: I/O, clock, randomness, logging
        │  parse into domain types
        ▼
   pure domain functions           ← all business logic, trivially testable
        │  returns a decision/value
        ▼
   shell performs the effects      ← writes, sends, persists
```

Gather → compute → persist. The core takes values and returns values; it never
reaches for a DB, `Date.now()`, or `fetch`. Pass `now: Date` in as a parameter.
This is what makes tests need no mocks.

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| `class` with mutable fields | module of pure functions over a `readonly` type |
| `extends` / abstract base | discriminated union + exhaustive match |
| optional fields for state | one union variant per legal state |
| `throw` for expected failure | `Result<T, E>` with a typed error union |
| `try/catch` around domain logic | parse at the boundary, `Result` inside |
| `enum` | `as const` object + `typeof x[keyof typeof x]`, or a string union |
| `any` | `unknown` + parse (zod/arktype) |
| `string` for an id | branded type (`UserId`) |
| `arr.push(...)` in a loop | `map` / `filter` / `flatMap` |
| `null` checks scattered around | make the absent case a union variant |
| getters/setters | plain readonly data + transformation functions |
| Strategy / Template Method / Decorator | pass a function |

## Review checklist

- [ ] No `any`; boundaries take `unknown` and parse
- [ ] Every JSON boundary has a zod schema **both ways** — request body validated before sending, response validated before returning
- [ ] Domain types are fully `readonly`; no parameter is mutated
- [ ] States modeled as unions, not optional-field soup
- [ ] Every union match is exhaustive (`assertNever` or `.exhaustive()`)
- [ ] Expected failures return `Result` with a typed error union
- [ ] IDs and validated strings are branded
- [ ] Business logic is pure; clock/IO/randomness injected, not imported
- [ ] No inheritance; no class holding mutable domain state

## Don't be dogmatic

Local mutation inside a pure function is fine and often clearer. Not every
function needs `Result` — internal helpers that cannot fail should just return
the value. Don't introduce Effect/fp-ts into a codebase that isn't ready for it;
a plain `Result` type and strict compiler flags deliver most of the benefit at a
fraction of the onboarding cost. Match the surrounding code's conventions.

Deeper material: `references/error-handling.md` (Result composition, neverthrow
vs Effect), `references/types.md` (branding, generics, type-level patterns).
