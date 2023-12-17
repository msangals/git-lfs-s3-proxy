ARG NODE_VERSION

FROM node:${NODE_VERSION} as dependencies
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 600000 --parallel

FROM node:${NODE_VERSION} as builder
WORKDIR /app
COPY . .
COPY --from=dependencies /app/node_modules ./node_modules
RUN yarn build

FROM node:${NODE_VERSION} as runner
WORKDIR /app

ENV NODE_ENV production

# Copy only necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["yarn", "start"]
