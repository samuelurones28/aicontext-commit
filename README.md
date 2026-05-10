# aicontext-commit

> Commit messages that sound like **your team** wrote them, not a generic LLM. `acc` reads your last 30 commits before writing a single word — matching your style, language, and conventions automatically.

`acc` looks at what you have staged with `git add`, scans your recent commits to learn how *this* project writes commits, and asks an LLM (Anthropic or OpenAI) for **3 ready-to-use suggestions**. Pick one, tweak it, or regenerate.

[![demo](https://asciinema.org/a/XglB22EcqvZLQPDM.svg)](https://asciinema.org/a/XglB22EcqvZLQPDM)


## Features

- 🧠 **Context-aware** — uses your last 30 commits as a style reference (language, casing, format, level of detail)
- ✍️ **3 suggestions per run** — alternative phrasings for the same change, ordered most-specific first
- 🌍 **Auto-detects language** — writes in whatever language your history uses, falling back to English
- 📐 **Conventional Commits** — picks the right type from the diff (`feat`, `fix`, `docs`, `build`, `ci`, `refactor`…)
- 🔁 **Regenerate / edit / manual** — you stay in control of the final message
- 🤝 **Two providers** — works with Anthropic (Claude) or OpenAI; uses whichever key you have set
- 🛡️ **Safe by design** — won't run without staged changes, refuses oversized diffs, redacts common secrets, and treats history and diff as data

## Installation

```bash
npm install -g aicontext-commit
```

Or run on demand without installing:

```bash
npx aicontext-commit
```

The package exposes two binaries — `aicontext-commit` and the shorter alias `acc`.

## Setup

Set **one** of the following API keys as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or
export OPENAI_API_KEY=sk-...
```

If both are set, Anthropic is used. You can also drop them into a `.env` file in your project root. `acc` reads only the supported API key names from that file and does not inject the whole file into the process environment. See `.env.example` for the format.

## Usage

```bash
# stage your changes as usual
git add .

# launch the picker
acc
```

You'll see something like:

```
Reading staged changes...
Generating suggestions...
? Choose a commit message: (Use arrow keys)
❯ feat(cli): add commit picker with 3 AI suggestions
  feat: generate commit messages from staged diff using LLM
  feat(acc): scaffold CLI to draft conventional commits
  ↺ Regenerate suggestions
  ✎ Write manually
```

Pick a suggestion → edit it inline if you want → press Enter → commit is created. Done.

### Options on the picker

| Option | What it does |
|---|---|
| Any suggestion | Opens an editable prompt pre-filled with the message, then commits |
| ↺ Regenerate suggestions | Asks the model again with the same prompt (useful if none fit) |
| ✎ Write manually | Type your own message from scratch |

Press `Ctrl+C` at any time to abort cleanly — no commit is created.

## How it works

1. **Read git** — runs `git diff --cached` for the staged changes and `git log --oneline -30` for style context.
2. **Build prompt** — wraps both into a structured prompt that asks the model to summarize the *entire* staged diff as one commit (not one suggestion per file) and to match the repo's existing style.
3. **Call the model** — Claude Sonnet 4 by default if `ANTHROPIC_API_KEY` is set, otherwise gpt-5.4-mini if `OPENAI_API_KEY` is set.
4. **Parse 3 suggestions** — strict format `1. … / 2. … / 3. …`; if parsing fails you get a clear error, not a bad commit.
5. **Commit** — runs `git commit -m "<your choice>"` with the message you confirmed.

## Limits & safeguards

- **No staged changes** → exits with a clear message before calling any API.
- **Not a git repo** → exits with a clear message.
- **Diff over ~60k characters** → refuses and asks you to split the commit. Keeps token usage and quality predictable.
- **Secret redaction** → common API keys, bearer tokens, private keys, and credential assignments are redacted before the diff/history is sent to the model.
- **Prompt injection** → instructions are placed before untrusted repo data, code fences are escaped, and the prompt tells the model to treat the diff and history as data.
- **Git hooks** → `git commit` runs with a sanitized environment so API keys and secret-looking variables are not passed to hooks.

## Development

```bash
git clone https://github.com/samuelurones28/aicontext-commit.git
cd aicontext-commit
npm install

# run from source
npm run dev

# build to dist/
npm run build

# run the test suite (builds first)
npm test

# preview what would be published
npm run smoke
```

The project is plain TypeScript compiled to CommonJS — no bundler. Tests use Node's built-in `node:test` runner against the compiled `dist/` output.

### Project layout

```
src/
  index.ts    # CLI entrypoint, picker flow, commit execution
  git.ts      # staged diff + recent commits, with safety checks
  prompt.ts   # prompt template
  ai.ts       # provider detection (Anthropic/OpenAI) + parser
  errors.ts   # CliError class + typed error codes + formatter
bin/
  index.js    # thin wrapper that requires dist/index.js
tests/
  *.test.js   # node:test suites for each module
```

## Debugging

Set `DEBUG=1` to print full stack traces for unexpected errors:

```bash
DEBUG=1 acc
```

Known errors come back with a code (`NO_STAGED_CHANGES`, `MISSING_API_KEY`, `STAGED_DIFF_TOO_LARGE`, `AI_PARSE_ERROR`, …) so you can grep them or wrap them in scripts.

## License

MIT © Samuel Fernandez — see [LICENSE](./LICENSE).
