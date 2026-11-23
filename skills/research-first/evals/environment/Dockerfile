FROM python:3.12-slim

RUN apt-get -o Acquire::Retries=3 update && \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    bash curl git jq procps ripgrep gh nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# The project every case works in: a small service whose git history explains
# code that looks removable. gh, node and npm are there because the project is
# a Node service and the skill tells the agent to search npm and GitHub; without
# them SkillEvaluator would void with-skill attempts only, as a missing
# dependency the skill names.
COPY fixture/ /opt/fixture/
RUN bash /opt/fixture/build.sh /srv/shipping-desk && rm -rf /opt/fixture

WORKDIR /srv/shipping-desk
