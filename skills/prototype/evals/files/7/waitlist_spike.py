# Quick spike: does our waitlist promotion idea work? Delete when done.

seats = {"s1": "ana", "s2": "ben"}
waitlist = ["cy", "dee"]


def cancel(seat):
    seats[seat] = None
    if waitlist:
        seats[seat] = waitlist.pop(0)


def join(name):
    if name not in waitlist:
        waitlist.append(name)


def run(steps):
    for kind, arg in steps:
        if kind == "cancel":
            cancel(arg)
        else:
            join(arg)


run([("cancel", "s1"), ("join", "ana"), ("cancel", "s2"), ("cancel", "s1")])
run([("join", "dee"), ("cancel", "s1"), ("cancel", "s2")])
print("all scenarios ran, no errors")
