FROM node:16 as builder

RUN mkdir -p /work && \
    apt-get update && apt-get install -y wine64 && \
    dpkg --add-architecture i386 && apt-get update && apt-get install -y wine32

WORKDIR /work
ADD [".", "/work"]

RUN yarn install
RUN yarn electron:build


# ===== OUTPUT FILE =====
FROM scratch
COPY --from=builder ["/work/dist_electron/*", "/"]
