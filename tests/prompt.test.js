const assert = require('node:assert/strict')
const test = require('node:test')

const { buildPrompt } = require('../dist/prompt')

test('buildPrompt asks for global commit summaries instead of per-file suggestions', () => {
  const prompt = buildPrompt(
    `diff --git a/src/git.ts b/src/git.ts
diff --git a/src/index.ts b/src/index.ts
diff --git a/package.json b/package.json`,
    ''
  )

  assert.match(prompt, /describe the entire staged diff as one commit/)
  assert.match(prompt, /Do not generate one suggestion per file/)
  assert.match(prompt, /alternative phrasings for the same complete change/)
})
