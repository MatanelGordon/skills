# Booking lifecycle (draft, not built yet)

A booking holds one slot for one customer.

## States

`held`, `confirmed`, `cancelled`, `expired`, `completed`, `no_show`

## Transitions

| From | Event | To | Note |
| --- | --- | --- | --- |
| held | `pay_ok` | confirmed | payment captured |
| held | `hold_timeout` | expired | 15 minutes after the hold was made; the slot is released |
| held | `cancel` | cancelled | the slot is released |
| confirmed | `cancel` | cancelled | the slot is released and the payment is refunded |
| confirmed | `check_in` | completed | |
| confirmed | `slot_passed` | no_show | 30 minutes after the slot start |

## Where the events come from

- `pay_ok`: a webhook from the payment provider. It can arrive minutes late,
  and the provider sends it again up to 3 times.
- `hold_timeout`, `slot_passed`: a cron job that runs once a minute.
- `cancel`, `check_in`: the customer or the front desk, in the app.

The draft does not say what happens when an event arrives in a state that has
no row for it.
