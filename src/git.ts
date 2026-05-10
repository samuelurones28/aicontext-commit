import { execFileSync } from 'child_process'
import { CliError, isCliError, messageFromUnknown } from './errors'

const MAX_STAGED_DIFF_CHARACTERS = 60_000
const MAX_GIT_OUTPUT_BYTES = 1_000_000
const GIT_COMMAND_TIMEOUT_MS = 10_000
const GIT_LOG_TIMEOUT_MS = 5_000
const DEFAULT_COMMIT_HISTORY_LIMIT = 30
const MAX_COMMIT_HISTORY_LIMIT = 100

export function getStagedDiff(): string {
  try {
    ensureGitWorkTree()

    const diff = execFileSync('git', ['diff', '--cached', '--no-ext-diff', '--no-color'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES
    })
    if (!diff.trim()) {
      throw new CliError({
        code: 'NO_STAGED_CHANGES',
        message: 'No staged changes found.',
        details: ['Use git add before running acc.']
      })
    }
    if (diff.length > MAX_STAGED_DIFF_CHARACTERS) {
      throw new CliError({
        code: 'STAGED_DIFF_TOO_LARGE',
        message: `The staged diff is too large (${diff.length} characters).`,
        details: [
          `The current limit is ${MAX_STAGED_DIFF_CHARACTERS} characters.`,
          'Split the changes into smaller commits.'
        ]
      })
    }
    return diff
  } catch (error: unknown) {
    if (isCliError(error)) {
      throw error
    }
    throw new CliError({
      code: 'GIT_DIFF_FAILED',
      message: 'Could not read the staged diff.',
      details: [
        'Make sure you are inside a git repository.',
        'If git is not available, install it or check your PATH.',
        messageFromUnknown(error)
      ],
      cause: error
    })
  }
}

function ensureGitWorkTree(): void {
  try {
    const isInsideWorkTree = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES
    })

    if (isInsideWorkTree.trim() === 'true') return
  } catch (error: unknown) {
    throw new CliError({
      code: 'NOT_GIT_REPOSITORY',
      message: 'You are not inside a git repository.',
      details: ['Enter the repository where you have staged changes and run acc again.'],
      cause: error
    })
  }

  throw new CliError({
    code: 'NOT_GIT_REPOSITORY',
    message: 'You are not inside a git repository.',
    details: ['Enter the repository where you have staged changes and run acc again.']
  })
}

export function getRecentCommits(n: number = 30): string {
  try {
    const limit = normalizeCommitLimit(n)
    const commits = execFileSync('git', ['log', `-${limit}`, '--format=%h %s'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: GIT_LOG_TIMEOUT_MS,
      maxBuffer: MAX_GIT_OUTPUT_BYTES
    })
    if (!commits.trim()) return ''
    return commits
  } catch {
    return '' // A new repo without commits is not fatal.
  }
}

function normalizeCommitLimit(n: number): number {
  if (!Number.isInteger(n) || n <= 0) return DEFAULT_COMMIT_HISTORY_LIMIT
  return Math.min(n, MAX_COMMIT_HISTORY_LIMIT)
}
