# Status: CSV export (REP-88), Wednesday evening

The release branch is cut on Friday at 12:00.

## Finished

- Export for the orders, customers and refunds reports: reviewed and merged.
- 31 new tests, all passing.

## Not finished

- Export for the inventory report. The exporter builds the whole file in memory and ran out of memory at about 600,000 rows on staging.
- The largest customer has 2.3 million inventory rows. 38 of our 410 customers have more than 500,000.
- The fix is a streaming exporter: about 3 working days, so it cannot be in Friday's release.

## Ways to handle it (nothing chosen yet)

- Hide the inventory export button and ship the other three on Friday. About 30 minutes of work. Inventory export comes with the next release, 2 weeks later. Two customers asked for inventory export by name last quarter.
- Ship all four on Friday, with inventory export limited to 500,000 rows and a message above that. About 4 hours of work. The 38 large customers get a partial file until the streaming exporter lands.
- Hold the whole feature for the next release and ship all four with streaming. No work this week. The three finished exports reach customers 2 weeks late. Sales has told two prospects that export arrives this month.

If nobody chooses before the branch is cut, it ships as it is now: all four buttons visible, and the inventory export failing with an error for the 38 large customers.
