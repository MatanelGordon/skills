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
states unrepresentable. TypeScript's structural type system rewards this style.

## The five rules

1. **Data is immutable.** `readonly` by default; produce new values, never mutate.
2. **Functions are pure.** Same input → same output, no side effects. Push I/O to edges.
3. **Model with unions, not optional fields.** If two fields only valid together, that's a union.
4. **Expected failures are values,** returned as `Result`. Exceptions are for bugs.
5. **Parse at the boundary.** `unknown` in, domain types out. Never trust external data.

**Scope:** apply at domain boundaries and in new modules. Framework requirements
(React error boundaries, NestJS providers) and internal helpers that cannot fail
are legitimate exceptions — see "Don't be dogmatic".

---

## Start with the compiler

```jsonc
// tsconfig.json — non-negotiables
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "erasableSyntaxOnly": true
  }
}
```

Ban `any`. At boundaries use `unknown` and parse. `as` is a claim you can't back
up — only acceptable inside a parser and in `as const`.

## Immutability

```ts
type User = {
  readonly id: UserId;
  readonly email: Email;
  readonly tags: readonly string[];
};

const withTag = (u: User, tag: string): User =>
  ({ ...u, tags: [...u.tags, tag] });
```

- `readonly` on every property and array in domain types.
- `as const satisfies T` for config/lookup tables: `as const` freezes, `satisfies`
  type-checks without widening inferred literals.
- Never mutate a parameter.
- Deep updates: nested spreads for 2 levels; past that use `immer`'s `produce`.

## Model with discriminated unions

The highest-leverage change. Optional fields let callers construct nonsense; unions don't.

```ts
// ✗ Four fields, sixteen combos, three legal
type FetchState = { status: "idle" | "loading" | "ok" | "error"; data?: User; error?: Error };

// ✓ Exactly legal states, each carrying its own data
type FetchState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "ok"; readonly data: User }
  | { readonly status: "error"; readonly error: Error };
```

Now `.data` doesn't exist unless `status === "ok"`. No optional chaining.

### Match exhaustively

```ts
const render = (r: FetchState): string => {
  switch (r.status) {
    case "idle":    return "";
    case "loading": return "Loading…";
    case "ok":      return r.data.email;
    case "error":   return r.error.message;
    default:        return assertNever(r);
  }
};

const assertNever = (x: never): never =>
  { throw new Error(`Unhandled variant: ${JSON.stringify(x)}`); };
```

Adding a variant breaks every `switch` until handled. For nested/multi-value
matching, use **ts-pattern**'s `match(...).exhaustive()`.

## Errors are return values

Throwing is an invisible second return type. Reserve for programmer error
(invariant violated, unreachable). Return `Result<T, E>` for expected failures
(validation, not found, business rule, external service error).

```ts
type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

const Ok = <T, E>(value: T): Result<T, E> => ({ ok: true, value });
const Err = <T, E>(error: E): Result<T, E> => ({ ok: false, error });

// Composition
const map = <T, E, U>(r: Result<T, E>, f: (v: T) => U): Result<U, E> =>
  r.ok ? Ok(f(r.value)) : r;
const flatMap = <T, E, U>(r: Result<T, E>, f: (v: T) => Result<U, E>): Result<U, E> =>
  r.ok ? f(r.value) : r;
```

Use `neverthrow` or `Effect` for richer composition; plain `Result` covers most.

## Branded types for IDs

```ts
type Brand<T, B> = T & { readonly __brand: B };
type UserId = Brand<string, "UserId">;
const UserId = (s: string): UserId => s as UserId;
```

Parse at boundaries (Zod/ArkType) into branded types. `unknown` → parsed → brand.

## Parameter management

1–3 positional parameters, ordered by importance. 4+ → environment/context object.
Order: data first, dependencies/services last, callbacks last.

```ts
// ✗ Six loose parameters
const place = (sku: string, qty: number, price: number,
               email: string, now: Date, validate: (o: Order) => boolean) => ...;

// ✓ Data grouped, dependency second, callback last
type PlaceOrder = { readonly sku: string; readonly qty: number;
                    readonly price: number; readonly email: string };

const place = (request: PlaceOrder, now: Date,
               validate?: (o: Order) => boolean): Result<Order, OrderError> => ...;
```

## Functional core, imperative shell

```
HTTP handler / CLI / job runner   ← impure: I/O, clock, randomness, logging
        │  parse into domain types
        ▼
   pure domain functions           ← all business logic, trivially testable
        │  returns decision/value
        ▼
   shell performs effects          ← writes, sends, persists
```

Gather → compute → persist. Core takes values, returns values; never reaches for
DB, `Date.now()`, or `fetch`. Pass `now: Date` as parameter. Tests need no mocks.

## Decider pattern

Split "what should happen" from "how it is stored": pure `decide` turns command +
state into events, paired with mechanical `evolve` fold applying one event to
state. All rules in `decide`; `evolve` never decides.

```ts
type Command = { readonly t: "pay"; amount: number } | { readonly t: "ship"; tracking: string };
type Event   = { readonly t: "paid"; amount: number } | { readonly t: "shipped"; tracking: string };

const decide = (state: OrderState, cmd: Command): readonly Event[] => {
  switch (cmd.t) {
    case "pay":   return state.status === "unpaid" ? [{ t: "paid", amount: cmd.amount }] : [];
    case "ship":  return state.status === "paid"   ? [{ t: "shipped", tracking: cmd.tracking }] : [];
  }
};

const evolve = (state: OrderState, e: Event): OrderState =>
  e.t === "paid"   ? { status: "paid", amount: e.amount }
                   : { status: "shipped", tracking: e.tracking };
```

Shell persists events and folds `evolve` to rebuild state. `decide` tests are
table-driven — no mocks, no DB, no clock.

---

## Habit → replacement

| Reach for | Instead |
|---|---|
| `class` with mutable fields | module of pure functions over `readonly` type |
| `extends` / abstract base | discriminated union + exhaustive match |
| optional fields for state | one union variant per legal state |
| `throw` for expected failure | `Result<T, E>` with typed error union |
| `try/catch` around domain logic | parse at boundary, `Result` inside |
| `enum` | `as const` object + `typeof x[keyof typeof x]`, or string union |
| `any` | `unknown` + parse (zod/arktype) |
| `string` for an id | branded type (`UserId`) |
| `arr.push(...)` in loop | `map` / `filter` / `flatMap` |
| `null` checks scattered | make absent case a union variant |
| getters/setters | plain readonly data + transformation functions |
| Strategy / Template Method / Decorator | pass a function |

## Review checklist

- [ ] No `any`; boundaries take `unknown` and parse
- [ ] Every JSON boundary has a zod schema **both ways** — request validated before sending, response validated before returning
- [ ] Domain types fully `readonly`; no parameter mutated
- [ ] States modeled as unions, not optional-field soup
- [ ] Every union match exhaustive (`assertNever` or `.exhaustive()`)
- [ ] Expected failures return `Result` with typed error union
- [ ] IDs and validated strings branded
- [ ] Business logic pure; clock/IO/randomness injected, not imported
- [ ] No inheritance; no class holding mutable domain state

## Don't be dogmatic

Local mutation inside a pure function is fine and often clearer. Not every
function needs `Result` — internal helpers that cannot fail return the value.
Don't introduce Effect/fp-ts into unready codebase; plain `Result` and strict
flags deliver most benefit at fraction of onboarding cost. Match surrounding
conventions.

Deeper material: `references/error-handling.md` (Result composition, neverthrow
vs Effect), `references/types.md` (branding, generics, type-level patterns).
