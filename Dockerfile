FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY prototype ./prototype
COPY content ./content
COPY scripts ./scripts
COPY eslint.config.mjs .prettierignore ./

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production

COPY --from=build /app /app

ARG STUDENTOS_SERVICE=api
ENV STUDENTOS_SERVICE=$STUDENTOS_SERVICE

CMD ["sh", "-c", "exec pnpm --filter @studentos/$STUDENTOS_SERVICE start"]
