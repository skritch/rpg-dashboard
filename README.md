# RPG-Dashboard

A dashboard for your tabletop role-playing games. It will:

- [x] listen in on your game and keep a running transcript.
- [x] look up rules, spells, etc. in real time.
- [ ] summarize your sessions
- [ ] ?

Very WIP.

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
# Set up some Sveltekit stuff, and install pre-commit hooks
npm run prepare

# Or add your API keys to .env and use that.
export `cat .env.example | xargs`

# Run the dev server.
npm run dev
# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

TODOs:

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Testing

```sh
npm run test

# Or, to run a specific test:
npm run test src/lib/server/streaming/AudioPipeline.test.ts
```

## Tech Stack

- Svelte and Svelte-kit as a full-stack framework
- RxJS for audio stream processing on the backend
- Whisper for transcription (via an external OpenAI-style API)
