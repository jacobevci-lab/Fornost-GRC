FROM node:24-alpine
WORKDIR /bridge
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY directory.mjs saml.mjs server.mjs ./
ENV BRIDGE_HOST=0.0.0.0 BRIDGE_PORT=8444 NODE_ENV=production
USER node
EXPOSE 8444
CMD ["node", "server.mjs"]
