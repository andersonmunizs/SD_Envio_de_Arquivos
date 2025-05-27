FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY . .
# A pasta 'uploads' será criada pelo Multer ou pelo volume do docker-compose

EXPOSE 3000 

CMD [ "node", "server.js" ]