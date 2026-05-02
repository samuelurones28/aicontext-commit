import pc from 'picocolors'

export type CliErrorCode =
  | 'AI_PARSE_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'GIT_COMMIT_FAILED'
  | 'GIT_DIFF_FAILED'
  | 'MISSING_API_KEY'
  | 'NO_STAGED_CHANGES'
  | 'PROMPT_CANCELLED'
  | 'STAGED_DIFF_TOO_LARGE'
  | 'UNEXPECTED_ERROR'
  | 'UNEXPECTED_RESPONSE'

type CliErrorOptions = {
  code: CliErrorCode
  message: string
  details?: string[]
  exitCode?: number
  cause?: unknown
}

export class CliError extends Error {
  readonly code: CliErrorCode
  readonly details: string[]
  readonly exitCode: number
  readonly cause?: unknown

  constructor(options: CliErrorOptions) {
    super(options.message)
    this.name = 'CliError'
    this.code = options.code
    this.details = options.details ?? []
    this.exitCode = options.exitCode ?? 1

    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError
}

export function isPromptCancelError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'ExitPromptError' || error.message.includes('User force closed the prompt'))
  )
}

export function messageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Error desconocido'
}

export function formatCliError(error: unknown): string {
  const cliError = isCliError(error)
    ? error
    : new CliError({
      code: 'UNEXPECTED_ERROR',
      message: messageFromUnknown(error)
    })

  const lines = [
    `${pc.red('Error:')} ${cliError.message}`,
    pc.dim(`Código: ${cliError.code}`)
  ]

  for (const detail of cliError.details) {
    lines.push(`  ${pc.dim('-')} ${detail}`)
  }

  return lines.join('\n')
}
