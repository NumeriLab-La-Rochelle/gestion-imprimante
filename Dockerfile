FROM node:20-alpine
WORKDIR /app

RUN mkdir -p /srv/stl-farm

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
VOLUME ["/srv/stl-farm"]

CMD ["node", "server.js"]
