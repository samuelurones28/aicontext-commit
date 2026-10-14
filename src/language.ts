import { CliError } from './errors'
import { readConfigValue } from './security'

export const COMMIT_LANGUAGES = {
  auto: 'Automatic (from commit history)',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  ca: 'Català',
  ja: '日本語',
  zh: '中文',
  ko: '한국어'
} as const

export type CommitLanguage = keyof typeof COMMIT_LANGUAGES

export function parseCommitLanguage(value: string): CommitLanguage {
  const code = value.trim().toLowerCase()
  if (Object.hasOwnProperty.call(COMMIT_LANGUAGES, code)) return code as CommitLanguage
  throw new CliError({
    code: 'INVALID_LANGUAGE',
    message: 'Unsupported commit language.',
    details: [`Choose one of: ${Object.keys(COMMIT_LANGUAGES).join(', ')}.`]
  })
}

// Explicit CLI options override environment variables and project .env values.
export function resolveCommitLanguage(args: string[]): CommitLanguage | undefined {
  let value: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--language' || arg === '-l') {
      value = args[++i]
      if (!value || value.startsWith('-')) {
        throw new CliError({
          code: 'INVALID_LANGUAGE',
          message: 'The language option requires a value.',
          details: ['Example: acc --language es']
        })
      }
    } else if (arg.startsWith('--language=')) {
      value = arg.slice('--language='.length)
    }
  }
  value ??= readConfigValue('ACC_LANGUAGE')
  return value === undefined ? undefined : parseCommitLanguage(value)
}
