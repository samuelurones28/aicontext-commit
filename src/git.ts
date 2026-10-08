import { execFileSync } from 'child_process'
import { CliError, isCliError, messageFromUnknown } from './errors'

// Roughly 4k tokens: enough to understand a change, cheap to send on every run.
export const DIFF_BUDGET_CHARACTERS = 16_000
export const DIFF_TRUNCATION_NOTE = '# Diff truncated to fit the token budget'
const MAX_GIT_OUTPUT_BYTES = 1_000_000
const GIT_COMMAND_TIMEOUT_MS = 10_000
const GIT_LOG_TIMEOUT_MS = 5_000
const DEFAULT_COMMIT_HISTORY_LIMIT = 30
const MAX_COMMIT_HISTORY_LIMIT = 100

// Lockfiles and generated files are large, machine-made and say little about intent:
// send only a --stat summary of them to save tokens.
const SUMMARIZED_FILE_PATTERNS = [
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'Cargo.lock', 'poetry.lock', 'uv.lock', 'Pipfile.lock', 'composer.lock', 'Gemfile.lock', 'go.sum',
  '*.min.js', '*.min.css', '*.map', '*.snap'
]
const SUMMARIZED_PATHSPECS = SUMMARIZED_FILE_PATTERNS.map(pattern => `:(top,glob)**/${pattern}`)
const DETAILED_PATHSPECS = [':/', ...SUMMARIZED_FILE_PATTERNS.map(pattern => `:(top,exclude,glob)**/${pattern}`)]

export function getStagedDiff(): string {
  try {
    ensureGitWorkTree()

    // One line of context instead of three: the model needs the change, not the surroundings.
    const codeDiff = runGitDiff(['--unified=1', '--', ...DETAILED_PATHSPECS])
    const summarizedStat = runGitDiff(['--stat', '--', ...SUMMARIZED_PATHSPECS])
    const diff = summarizedStat.trim()
      ? `${codeDiff}\n# Lockfile and generated file changes (content omitted):\n${summarizedStat}`
      : codeDiff
    if (!diff.trim()) {
      throw new CliError({
        code: 'NO_STAGED_CHANGES',
        message: 'No staged changes found.',
        details: ['Use git add before running acc.']
      })
    }
    return diff
  } catch (error: unknown) {
    if (isCliError(error)) {
      throw error
    }
    if ((error as NodeJS.ErrnoException)?.code === 'ENOBUFS') {
      throw new CliError({
        code: 'STAGED_DIFF_TOO_LARGE',
        message: 'The staged diff is too large to read.',
        details: ['Split the changes into smaller commits.'],
        cause: error
      })
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

/**
 * Caps the diff at a fixed character budget so large commits cost the same as
 * medium ones. Every file keeps its header; small files are kept whole and the
 * remaining budget is shared evenly among the larger ones. Run it after secret
 * redaction so a truncated secret can never slip past the redaction patterns.
 */
export function fitDiffToBudget(diff: string, budget: number = DIFF_BUDGET_CHARACTERS): { text: string, truncated: boolean } {
  if (diff.length <= budget) return { text: diff, truncated: false }

  const sections = diff.split(/(?=^diff --git )/m)
  const kept: string[] = new Array(sections.length)
  const bySize = sections.map((section, index) => ({ section, index })).sort((a, b) => a.section.length - b.section.length)

  let remaining = budget
  bySize.forEach(({ section, index }, position) => {
    const share = Math.floor(remaining / (bySize.length - position))
    kept[index] = section.length <= share ? section : truncateSection(section, share)
    remaining -= kept[index].length
  })

  return { text: `${DIFF_TRUNCATION_NOTE}\n${kept.join('')}`, truncated: true }
}

function truncateSection(section: string, maxLength: number): string {
  const lines = section.split('\n')
  const header = lines.findIndex(line => line.startsWith('@@'))
  let kept = header === -1 ? lines.slice(0, 1) : lines.slice(0, header)
  let length = kept.join('\n').length

  for (const line of lines.slice(kept.length)) {
    if (length + line.length + 1 > maxLength) break
    kept.push(line)
    length += line.length + 1
  }

  const omitted = lines.length - kept.length
  return `${kept.join('\n')}\n# ... ${omitted} more line(s) omitted\n`
}

function runGitDiff(args: string[]): string {
  return execFileSync('git', ['diff', '--cached', '--no-ext-diff', '--no-color', ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: GIT_COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_GIT_OUTPUT_BYTES
  })
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
    const commits = execFileSync('git', ['log', `-${limit}`, '--no-merges', '--format=%s'], {
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
