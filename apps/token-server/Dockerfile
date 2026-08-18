# Token server image for Fly.io / Railway / any container host.
#
# NOT VERIFIED LOCALLY: this machine has no Docker, so the image has never been
# built. The commands inside are the ones that work outside a container; treat
# the first deploy as the test.
#
# The build context is the REPO ROOT, not this directory — pnpm needs the
# workspace manifest and the lockfile to install a workspace package.
#   docker build -f apps/token-server/Dockerfile .
FROM node:22-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

WORKDIR /app

# Manifests first, so a code change does not invalidate the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/token-server/package.json apps/token-server/

# Dev dependencies are kept on purpose: the service starts through tsx, because
# @nigord/shared resolves to TypeScript sources rather than to built JavaScript.
RUN pnpm install --frozen-lockfile --filter @nigord/token-server...

COPY packages/shared packages/shared
COPY apps/token-server apps/token-server

# Fly injects PORT; the config schema defaults it to 3000 when absent.
ENV HOST=0.0.0.0
EXPOSE 3000

# Boot fails loudly when LIVEKIT_* or NIGORD_GROUP_SECRET are missing, which is
# what specs/room-access requires — never issue invalid credentials silently.
CMD ["pnpm", "--filter", "@nigord/token-server", "start"]
