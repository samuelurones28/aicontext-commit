import pc from 'picocolors'
import input from '@inquirer/input'
import select from '@inquirer/select'
import { getStagedDiff, getRecentCommits } from './git'
import { buildPrompt } from './prompt'
import { generateCommitMessages } from './ai'
import { execFileSync } from 'child_process'
import * as readline from 'readline'
import { CliError, formatCliError, isCliError, isPromptCancelError } from './errors'
import { redactSecrets, sanitizeEnvForGit } from './security'

function editableInput(promptText: string, initialValue: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    process.stdout.write(promptText)
    rl.write(initialValue)
    rl.once('line', (line) => {
      rl.close()
      resolve(line.trim() || initialValue)
    })
    rl.once('SIGINT', () => {
      rl.close()
      process.stdout.write('\n')
      const err = new Error('User force closed the prompt')
      err.name = 'ExitPromptError'
      reject(err)
    })
  })
}

const VERSION = '0.1.0'
const GIT_COMMIT_TIMEOUT_MS = 60_000

const HELP = `
Usage: aicontext-commit [options]

Generate AI-powered commit messages from your staged changes.

Options:
  -v, --version   Show version number
  -h, --help      Show this help message

Before running, stage your changes with git add.
`.trim()

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION)
    process.exit(0)
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP)
    process.exit(0)
  }

  // 1. Read git
  console.log(pc.dim('Reading staged changes...'))
  const diff = getStagedDiff()
  const commits = getRecentCommits(30)
  const redactedDiff = redactSecrets(diff)
  const redactedCommits = redactSecrets(commits)
  const redactionCount = redactedDiff.redactionCount + redactedCommits.redactionCount

  if (redactionCount > 0) {
    console.log(pc.yellow(`Redacted ${redactionCount} potential secret(s) before sending context to AI.`))
  }

  // 2. Generate suggestions
  console.log(pc.dim('Generating suggestions...'))
  const prompt = buildPrompt(redactedDiff.text, redactedCommits.text)
  let suggestions = await generateCommitMessages(prompt)

  // 3. Show options to the user
  while (true) {
    const choice = await select({
      message: pc.green('Choose a commit message:'),
      choices: [
        ...suggestions.map((s, i) => ({ name: s, value: String(i) })),
        { name: pc.yellow('↺ Regenerate suggestions'), value: 'regenerate' },
        { name: pc.red('✎ Write manually'), value: 'manual' },
      ]
    })

    if (choice === 'regenerate') {
      console.log(pc.dim('Regenerating...'))
      suggestions = await generateCommitMessages(prompt)
      continue
    }

    if (choice === 'manual') {
      const manual = await input({ message: 'Write your commit message:' })
      if (manual.trim()) {
        doCommit(manual.trim())
      }
      break
    }

    // Let the user edit the selected suggestion before committing.
    const selected = suggestions[Number(choice)]
    const edited = await editableInput(pc.green('?') + ' Edit if needed (Enter to confirm): ', selected)

    doCommit(edited.trim())
    break
  }
}

function doCommit(message: string) {
  try {
    execFileSync('git', ['commit', '-m', message], {
      stdio: 'inherit',
      timeout: GIT_COMMIT_TIMEOUT_MS,
      env: sanitizeEnvForGit()
    })
    console.log(pc.green('✓ Commit created'))
  } catch (error: unknown) {
    throw new CliError({
      code: 'GIT_COMMIT_FAILED',
      message: 'Could not create the commit.',
      details: ['Review the git message above and try again.'],
      cause: error
    })
  }
}

main().catch((error: unknown) => {
  const normalizedError = isPromptCancelError(error)
    ? new CliError({
      code: 'PROMPT_CANCELLED',
      message: 'Operation cancelled.',
      exitCode: 130
    })
    : error

  console.error(formatCliError(normalizedError))

  if (!isCliError(normalizedError) && process.env.DEBUG) {
    console.error(normalizedError)
  }

  process.exit(isCliError(normalizedError) ? normalizedError.exitCode : 1)
})
