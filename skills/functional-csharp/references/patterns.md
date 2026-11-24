# Pipelines, parameter objects, and the Decider

Three shapes that keep logic pure and call sites readable.

## Pure functions and pipelines

```csharp
// static local functions cannot capture `this` or locals — purity, enforced
public decimal ComputeTotal(Order order)
{
    return Sum(order.Lines);
    static decimal Sum(IEnumerable<OrderLine> ls) => ls.Sum(l => l.Price * l.Quantity);
}
```

Two extension methods carry most pipelines:

```csharp
public static TOut Map<TIn, TOut>(this TIn x, Func<TIn, TOut> f) => f(x);
public static T Tap<T>(this T x, Action<T> act) { act(x); return x; }

var total = order.Map(ApplyFees).Map(ApplyDiscount).Map(ApplyTax);
```

`Map` turns `ApplyTax(ApplyDiscount(ApplyFees(order)))` into steps that read left
to right in the order they run. `Tap` runs a side effect (a log line, a metric)
and passes the value on unchanged.

LINQ is already functional — lean on it. `Select`/`Where`/`Aggregate` over `for`
loops that mutate an accumulator, when it reads better.

## Parameter management

1–3 positional parameters, ordered by importance. When several parameters share
the same role or relevance tier, group them into a single record. Four or more
parameters always become an environment/context record — the call site should
read like a sentence, not a riddle.

Order: data first, dependencies/services next, callbacks last.

```csharp
// ✗ Six loose parameters — easy to transpose, unreadable at call sites
public static Result<Order> Place(string sku, int qty, decimal price,
    string email, IClock clock, Func<Order, bool> validate) { ... }

// ✓ Data grouped, dependency second, callback last
public sealed record PlaceOrder(string Sku, int Qty, decimal Price, string Email);

public static Result<Order> Place(PlaceOrder request, IClock clock,
    Func<Order, bool>? validate = null) { ... }
```

## Decider pattern

The bodies behind the two signatures in `SKILL.md`. A command that does not
apply in the current state yields no events, and an event `Evolve` does not
expect leaves the state as it is.

```csharp
public static ImmutableList<OrderEvent> Decide(OrderState state, Command cmd) => cmd switch
{
    Pay p when state is OrderState.Unpaid => [new OrderPaid(p.Amount, p.At)],
    Ship s when state is OrderState.Paid  => [new OrderShipped(s.Tracking, s.At)],
    _                                     => [],
};

public static OrderState Evolve(OrderState state, OrderEvent e) => (state, e) switch
{
    (OrderState.Unpaid, OrderPaid p)  => new OrderState.Paid(p.Amount, p.At),
    (OrderState.Paid, OrderShipped s) => new OrderState.Shipped(s.At, s.Tracking),
    _                                 => state,
};
```

A `Decide` test is one row per rule: the state, the command, the events
expected, as in `(Unpaid, Pay(10, t)) -> [OrderPaid(10, t)]`. Add a row for
each command that must be refused: it expects `[]`.
