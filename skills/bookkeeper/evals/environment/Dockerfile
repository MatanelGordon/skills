FROM python:3.12-slim

RUN apt-get -o Acquire::Retries=3 update && \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    bash curl git jq procps ripgrep openssh-client \
    && rm -rf /var/lib/apt/lists/*

# The project every case works in: a small service with a .memory/ knowledge base.
# ssh is there because the skill's examples use it; without it SkillEvaluator
# would void with-skill attempts only, as a missing dependency the skill names.
COPY fixture/ /opt/fixture/
RUN bash /opt/fixture/build.sh /srv/catalog-sync && rm -rf /opt/fixture

WORKDIR /srv/catalog-sync
