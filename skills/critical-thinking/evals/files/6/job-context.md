# Nightly sales report: how it runs today

- `scripts/sales_report.py` builds yesterday's sales report and emails it to 14 people. A run takes about 6 minutes.
- Whoever is on support starts it by hand each morning. It was forgotten 5 times last quarter.
- It should run once a night at 02:00 UTC. A second run the same night sends the email a second time.
- The app is one Docker container (Flask with gunicorn, 2 workers) on a single VM.
- Deploys restart the container. They usually happen on Tuesdays between 01:00 and 03:00 UTC.
- Next quarter we go from 1 app instance to 2 behind a load balancer.
- The VM is rebuilt from an Ansible playbook about twice a year. Anything set up by hand on the machine is gone after a rebuild.
- Our cloud account includes a managed scheduler: it calls an HTTPS URL on a schedule and retries on failure. The first 3 jobs are free, then $0.10 a job each month. We use none today.
- Alerts reach the team's chat channel through an existing webhook.
