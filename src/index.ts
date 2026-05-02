import 'dotenv/config'
import pc from 'picocolors'
import { select, input } from '@inquirer/prompts'
import { getStagedDiff, getRecentCommits } from './git'
import { buildPrompt } from './prompt'
import { generateCommitMessages } from './ai'
import { execFileSync } from 'child_process'
import { CliError, formatCliError, isCliError, isPromptCancelError } from './errors'

async function main() {
  // 1. Read git
  console.log(pc.dim('Reading staged changes...'))
  const diff = getStagedDiff()
  const commits = getRecentCommits(30)

  // 2. Generate suggestions
  console.log(pc.dim('Generating suggestions...'))
  const prompt = buildPrompt(diff, commits)
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
    const edited = await input({
      message: 'Edit the message if needed (Enter to confirm):',
      default: selected
    })

    doCommit(edited.trim())
    break
  }
}

function doCommit(message: string) {
  try {
    execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' })
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
