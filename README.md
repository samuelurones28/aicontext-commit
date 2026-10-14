# aicontext-commit

[![npm](https://img.shields.io/npm/v/aicontext-commit)](https://www.npmjs.com/package/aicontext-commit) [![CI](https://github.com/samuelurones28/aicontext-commit/actions/workflows/ci.yml/badge.svg)](https://github.com/samuelurones28/aicontext-commit/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/aicontext-commit)](./LICENSE)

> Commit messages that sound like **your team** wrote them, not a generic LLM. `acc` reads your last 30 commits before writing a single word — matching your style, language, and conventions automatically.

`acc` looks at what you have staged with `git add`, scans your recent commits to learn how *this* project writes commits, and asks an LLM (Anthropic or OpenAI) for **3 ready-to-use suggestions**. Pick one, tweak it, or regenerate.

[![demo](https://asciinema.org/a/XglB22EcqvZLQPDM.svg)](https://asciinema.org/a/XglB22EcqvZLQPDM)


## Features

- 🧠 **Context-aware** — uses your last 30 commits as a style reference (language, casing, format, level of detail)
- ✍️ **3 suggestions per run** — alternative phrasings for the same change, ordered most-specific first
- 🌍 **Choose the language** — select a language or automatically follow your history, falling back to English
- 📐 **Conventional Commits** — picks the right type from the diff (`feat`, `fix`, `docs`, `build`, `ci`, `refactor`…)
- 🔁 **Regenerate / edit / manual** — you stay in control of the final message
- 🤝 **Three providers** — Anthropic (Claude), OpenAI, or a free local model through Ollama
- 💸 **Token-frugal** — compact diffs, a fixed budget for large commits, a locally computed style summary, and cached regenerations
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

If both are set, Anthropic is used.

### Free local mode (Ollama)

No API key? Run a local model with [Ollama](https://ollama.com) — free, and your code never leaves your machine:

```bash
ollama pull qwen2.5-coder:7b
export ACC_PROVIDER=ollama
```

`ACC_PROVIDER=ollama` takes precedence over any API key. Without it, Ollama is used only when no API key is set and `OLLAMA_HOST` is (default host: `http://localhost:11434`). You can also drop them into a `.env` file in your project root. `acc` reads supported configuration values from that file and does not inject the whole file into the process environment. See `.env.example` for the format.

### Model

By default `acc` uses small, fast, cheap models — a commit message doesn't need more:

| Provider | Default model | Notes |
|---|---|---|
| Anthropic | `claude-haiku-5-5` | |
| OpenAI | `gpt-6-luna` | reasoning disabled (`reasoning_effort: none`) for speed |
| Ollama | `qwen2.5-coder:7b` | runs locally, no cost |

To use a different model, set `ACC_MODEL` (env var or `.env`):

```bash
export ACC_MODEL=claude-sonnet-5-5
```

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
? Choose the commit language: Automatic (from commit history)
Generating suggestions...
? Choose a commit message: (Use arrow keys)
❯ feat(cli): add commit picker with 3 AI suggestions
  feat: generate commit messages from staged diff using LLM
  feat(acc): scaffold CLI to draft conventional commits
  ↺ Regenerate suggestions
  ✎ Write manually
```

Pick a suggestion → edit it inline if you want → press Enter → commit is created. Done.

### Commit language

By default, `acc` asks you to select a language before generating suggestions. Choose **Automatic** to follow the dominant language in your commit history (English if there is no history or the language is unclear).

To skip the language picker for a run:

```bash
acc --language es   # Spanish descriptions
acc -l en          # English descriptions
acc --language auto # Detect from history
```

Set a default in your environment or the project's `.env` file:

```bash
ACC_LANGUAGE=es
```

Supported codes: `auto`, `en` (English), `es` (Spanish), `fr` (French), `de` (German), `it` (Italian), `pt` (Portuguese), `ca` (Catalan), `ja` (Japanese), `zh` (Chinese), and `ko` (Korean).

Precedence: CLI option → environment variable → `.env` → interactive picker. An explicit language overrides the language of previous commits while preserving their style. Conventional Commit types (`feat`, `fix`, etc.) stay in English. Regenerations keep the chosen language.

### Options on the picker

| Option | What it does |
|---|---|
| Any suggestion | Opens an editable prompt pre-filled with the message, then commits |
| ↺ Regenerate suggestions | Asks the model again with the same prompt (useful if none fit) |
| ✎ Write manually | Type your own message from scratch |

Press `Ctrl+C` at any time to abort cleanly — no commit is created.

## How it works

1. **Read git** — runs `git diff --cached --unified=1` for the staged changes (lockfiles and generated files are summarized with `--stat` instead of sent in full) and the subjects of the last 30 non-merge commits.
2. **Analyze style locally** — computes Conventional Commits usage, common scopes, and subject length from those 30 commits without any API call, and keeps only the 10 latest as examples.
3. **Build prompt** — wraps both into a structured prompt that asks the model to summarize the *entire* staged diff as one commit (not one suggestion per file) and to match the repo's existing style.
4. **Call the model** — Ollama if `ACC_PROVIDER=ollama`, otherwise `claude-haiku-5-5` if `ANTHROPIC_API_KEY` is set, otherwise `gpt-6-luna` if `OPENAI_API_KEY` is set (override with `ACC_MODEL`).
5. **Parse 3 suggestions** — strict format `1. … / 2. … / 3. …`; if parsing fails you get a clear error, not a bad commit.
6. **Commit** — runs `git commit -m "<your choice>"` with the message you confirmed.

## Limits & safeguards

- **No staged changes** → exits with a clear message before calling any API.
- **Not a git repo** → exits with a clear message.
- **Lockfiles and generated files** (`package-lock.json`, `yarn.lock`, `Cargo.lock`, `go.sum`, `*.min.js`, `*.map`, `*.snap`, …) → only a `--stat` summary is sent, saving tokens.
- **Large diffs** → capped at ~16k characters (~4k tokens). Every file keeps its header, small files stay whole, and large files are trimmed evenly, so big commits cost the same as medium ones.
- **Regenerate** → the identical prompt is cached on Anthropic, so further regenerations bill the input at ~10%.
- **Thinking off** → thinking is disabled on Claude Haiku, and models where it can't be disabled run at the lowest effort.
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
