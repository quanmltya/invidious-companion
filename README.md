# Invidious companion

Companion for Invidious which handle all the video stream retrieval from YouTube servers.

## Documentation
- Installation guide: https://docs.invidious.io/installation/
- Extra documentation for Invidious companion: https://github.com/iv-org/invidious-companion/wiki

### Local development

### Requirements

- [Node.js](https://nodejs.org/) v20 or newer
- [npm](https://www.npmjs.com/)

### Install dependencies

```
npm install
```

### Run Locally (development)

```
SERVER_SECRET_KEY=CHANGEME npm run dev
```

### Available scripts

- `npm run dev`: Launch Invidious companion in development mode (using tsx)
- `npm run build`: Compile the project to `dist/` using TypeScript
- `npm run start`: Run the compiled output with Node.js
- `npm test`: Run unit tests
- `npm run test:integration`: Run integration tests (requires network)
