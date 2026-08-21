# Type-level patterns

## Branded (nominal) types

TypeScript is structural: `UserId` and `OrderId` are both `string` and freely
interchangeable. Branding adds a phantom property that exists only at compile time.

```ts
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type UserId  = Brand<string, "UserId">;
export type OrderId = Brand<string, "OrderId">;
export type Email   = Brand<string, "Email">;
export type Positive = Brand<number, "Positive">;
```

Zero runtime cost — the brand is erased. Rules:

1. **Only a parser may cast into a brand.** One `as` per type, inside its parser.
2. Export the parser, never a raw constructor.
3. Brand anything with an invariant a plain primitive can't express: ids, emails,
   URLs, non-empty strings, positive numbers, percentages, currency amounts.

```ts
export const parsePositive = (n: number): Result<Positive, "notPositive"> =>
  n > 0 ? { ok: true, value: n as Positive } : { ok: false, error: "notPositive" };
```

With zod, `.brand<"Email">()` does this for you and keeps the cast inside the library.

## `as const satisfies` for tables

```ts
const ROLES = {
  admin:  { label: "Admin",  level: 3 },
  editor: { label: "Editor", level: 2 },
  viewer: { label: "Viewer", level: 1 },
} as const satisfies Record<string, { label: string; level: number }>;

type Role = keyof typeof ROLES;              // "admin" | "editor" | "viewer"
const level = (r: Role) => ROLES[r].level;   // number, narrowed per key
```

`as const` preserves literal types and makes it deeply readonly; `satisfies`
checks the shape without widening. A plain `: Record<...>` annotation would
destroy the key union — which is exactly what you wanted to keep.

## Replacing `enum`

`enum` generates runtime code, behaves oddly with `const enum`, and numeric enums
accept any number. Prefer:

```ts
// string union — simplest, best for most cases
type Status = "draft" | "published" | "archived";

// object + derived union — when you need runtime iteration
const Status = { Draft: "draft", Published: "published" } as const;
type Status = (typeof Status)[keyof typeof Status];
```

## Exhaustiveness helpers

```ts
export const assertNever = (x: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
};

// Non-throwing variant for rendering paths where a crash is worse than a fallback
export const exhaustive = <T>(x: never, fallback: T): T => fallback;
```

`assertNever` in a `default` branch is a compile-time guarantee: if a union gains
a variant, `x` is no longer `never` and the call fails to typecheck.

## Modeling absence

Prefer a union variant over `null`/`undefined` when absence carries meaning:

```ts
// ✗ what does null mean — not loaded? no result? failed?
type Search = { results: User[] | null };

// ✓ each case is distinct and nameable
type Search =
  | { readonly kind: "notSearched" }
  | { readonly kind: "empty";   readonly query: string }
  | { readonly kind: "results"; readonly users: readonly [User, ...User[]] };
```

Note `readonly [User, ...User[]]` — a non-empty array type. It makes "results
means at least one" a compile-time fact, so `users[0]` needs no guard even under
`noUncheckedIndexedAccess`.

## Generic functions over generic classes

```ts
// A tiny pipe covers most composition needs
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe(a: unknown, ...fns: Array<(x: unknown) => unknown>) {
  return fns.reduce((acc, f) => f(acc), a);
}

const slug = pipe(title, trim, lowercase, hyphenate);
```

Prefer this to method-chaining classes: it works on any value, tree-shakes, and
needs no wrapper type.

## Type predicates and assertion functions

```ts
// Predicate: narrows in a conditional
const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;

// Assertion: narrows for the rest of the scope (use sparingly — it throws)
function assertDefined<T>(v: T | undefined, what: string): asserts v is T {
  if (v === undefined) throw new Error(`${what} is undefined`);
}
```

A predicate is a *claim the compiler cannot verify* — the body must genuinely
establish it. A wrong predicate is worse than a cast because it looks safe.

## `satisfies` vs annotation vs `as`

| Form | Effect | Use when |
|---|---|---|
| `const x: T = {...}` | checks, and widens to `T` | you want exactly `T` |
| `const x = {...} satisfies T` | checks, keeps the narrow inferred type | you need literal keys/values *and* the constraint |
| `const x = {...} as T` | asserts, no check | almost never — only inside a parser |

## Utility types worth reaching for

```ts
type DeepReadonly<T> = { readonly [K in keyof T]: DeepReadonly<T[K]> };

// Extract one variant of a discriminated union by its tag value.
// Parameterise the tag key so it works whatever you called it.
type Variant<U, K extends PropertyKey, V> = Extract<U, Record<K, V>>;
type OkFetch = Variant<FetchState, "status", "ok">;   // FetchState tagged by `status`
type Circle  = Variant<Shape, "kind", "circle">;      // Shape tagged by `kind`

// Require at least one key
type AtLeastOne<T> = { [K in keyof T]: Pick<T, K> }[keyof T] & Partial<T>;
```

Keep type-level programming proportionate: a clever conditional type that saves
three lines but costs the next reader ten minutes is a bad trade. The goal is
making illegal states unrepresentable, not maximizing type-system usage.
