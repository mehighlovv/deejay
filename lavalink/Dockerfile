FROM ghcr.io/lavalink-devs/lavalink:4 AS lavalink

FROM eclipse-temurin:21-jre-noble
USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl python3 \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --home-dir /opt/Lavalink --shell /usr/sbin/nologin lavalink

COPY --from=lavalink --chown=lavalink:lavalink /opt/Lavalink /opt/Lavalink

USER lavalink
WORKDIR /opt/Lavalink
ENTRYPOINT ["java", "-jar", "Lavalink.jar"]
