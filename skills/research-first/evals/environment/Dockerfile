FROM python:3.12-slim

RUN apt-get -o Acquire::Retries=3 update && \
    apt-get -o Acquire::Retries=3 install -y --no-install-recommends \
    bash curl git jq procps ripgrep \
    && rm -rf /var/lib/apt/lists/*

# The project every case works in: a small service whose git history explains
# code that looks removable.
COPY fixture/ /opt/fixture/
RUN bash /opt/fixture/build.sh /srv/shipping-desk && rm -rf /opt/fixture

WORKDIR /srv/shipping-desk
