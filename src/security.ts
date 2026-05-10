import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { parse } from 'dotenv'

export const AI_API_KEY_NAMES = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'] as const

const REDACTION = '[REDACTED]'

const SENSITIVE_ENV_KEY_PATTERN =
  /(?:^|_)(?:API_?KEY|ACCESS_?KEY|ACCESS_?TOKEN|AUTH_?TOKEN|TOKEN|SECRET|PASSWORD|PRIVATE_?KEY|CREDENTIALS?)(?:_|$)/i

type RedactionPattern = {
  pattern: RegExp
  replacement: string | ((...matches: string[]) => string)
}

const REDACTION_PATTERNS: RedactionPattern[] = [
  {
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    replacement: REDACTION
  },
  {
    pattern: /(\b[A-Z0-9_-]*(?:API[_-]?KEY|ACCESS[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY|CLIENT[_-]?SECRET)[A-Z0-9_-]*\b\s*[:=]\s*)(["']?)([^\s"'`]+)(\2)/gi,
    replacement: (_match, prefix, quote, _secret, closingQuote) =>
      `${prefix}${quote}${REDACTION}${closingQuote}`
  },
  {
    pattern: /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
    replacement: (_match, prefix) => `${prefix}${REDACTION}`
  },
  {
    pattern: /\b(?:sk-(?:ant-|proj-)?|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{16,}\b/g,
    replacement: REDACTION
  },
  {
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: REDACTION
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: REDACTION
  }
]

export type RedactionResult = {
  text: string
  redactionCount: number
}

export function redactSecrets(text: string): RedactionResult {
  let redactionCount = 0
  let redacted = text

  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, (...matches: string[]) => {
      redactionCount += 1
      return typeof replacement === 'function' ? replacement(...matches) : replacement
    })
  }

  return { text: redacted, redactionCount }
}

export function readConfigValue(name: string): string | undefined {
  const envValue = process.env[name]?.trim()
  if (envValue) return envValue

  const dotenvPath = resolve(process.cwd(), '.env')
  if (!existsSync(dotenvPath)) return undefined

  try {
    const parsed = parse(readFileSync(dotenvPath, 'utf-8'))
    const dotenvValue = parsed[name]?.trim()
    return dotenvValue || undefined
  } catch {
    return undefined
  }
}

export function sanitizeEnvForGit(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const sanitized: NodeJS.ProcessEnv = {}

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (AI_API_KEY_NAMES.includes(key as typeof AI_API_KEY_NAMES[number])) continue
    if (SENSITIVE_ENV_KEY_PATTERN.test(key)) continue
    sanitized[key] = value
  }

  return sanitized
}
