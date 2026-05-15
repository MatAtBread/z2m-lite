FROM node:24-alpine

# Set the working directory
WORKDIR /usr/src/app

# 1. Copy EVERYTHING first so postinstall scripts find their folders
COPY . .

# 2. Now run install (it will find src/www now)
# We use --unsafe-perm because some postinstall scripts fail as root in Alpine
RUN npm install --omit=dev --unsafe-perm

# Your app uses 8088
EXPOSE 8088
EXPOSE 1883

# Start the app
CMD [ "node", "dist/server.js", "--db", "http://matmac.mailed.me.uk:8123" ]
