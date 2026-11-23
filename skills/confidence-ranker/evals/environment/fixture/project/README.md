# partner-reports

Sales reports for partners: an HTTP API for the dashboard and nightly exports
for partners who still take files.

## Run

    npm install
    DATABASE_URL=postgres://localhost/reports npm start

## Jobs

    npm run jobs -- <job-name>

## Layout

- `src/server.js` wires the HTTP app
- `src/reports/` holds the report routes and queries
- `src/exporters/` turns a report into a file format
- `src/jobs/` runs scheduled work
- `src/lib/` holds helpers shared by the rest
