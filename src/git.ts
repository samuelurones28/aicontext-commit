import { execFileSync } from 'child_process'
import { CliError, isCliError, messageFromUnknown } from './errors'

const MAX_STAGED_DIFF_CHARACTERS = 60_000

export function getStagedDiff(): string {
  try {
    const diff = execFileSync('git', ['diff', '--cached'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (!diff.trim()) {
      throw new CliError({
        code: 'NO_STAGED_CHANGES',
        message: 'No hay cambios staged.',
        details: ['Usa git add antes de ejecutar acc.']
      })
    }
    if (diff.length > MAX_STAGED_DIFF_CHARACTERS) {
      throw new CliError({
        code: 'STAGED_DIFF_TOO_LARGE',
        message: `El diff staged es demasiado grande (${diff.length} caracteres).`,
        details: [
          `El límite actual es ${MAX_STAGED_DIFF_CHARACTERS} caracteres.`,
          'Divide los cambios en commits más pequeños.'
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
      message: 'No se pudo leer el diff staged.',
      details: [
        'Comprueba que estás dentro de un repositorio git.',
        'Si git no está disponible, instálalo o revisa tu PATH.',
        messageFromUnknown(error)
      ],
      cause: error
    })
  }
}

export function getRecentCommits(n: number = 30): string {
  try {
    const commits = execFileSync('git', ['log', '--oneline', `-${n}`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    if (!commits.trim()) return ''
    return commits
  } catch {
    return '' // repo nuevo sin commits, no es un error fatal
  }
}
