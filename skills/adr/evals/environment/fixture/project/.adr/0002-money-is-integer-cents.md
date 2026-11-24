# Money is stored and passed as integer cents

Status: accepted

Every amount in the database, in queue messages and in the API is a whole
number of cents. In 2024 a one-cent difference per order line between this
service and the ledger took a week to trace, and floating point was the cause.
