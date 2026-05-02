import 'dotenv/config'
import pc from 'picocolors'
import { select, input } from '@inquirer/prompts'
import { getStagedDiff, getRecentCommits } from './git'
import { buildPrompt } from './prompt'
import { generateCommitMessages } from './ai'
import { execFileSync } from 'child_process'
import { CliError, formatCliError, isCliError, isPromptCancelError } from './errors'

async function main() {
  // 1. Leer git
  console.log(pc.dim('Leyendo cambios staged...'))
  const diff = getStagedDiff()
  const commits = getRecentCommits(30)

  // 2. Generar sugerencias
  console.log(pc.dim('Generando sugerencias...'))
  const prompt = buildPrompt(diff, commits)
  let suggestions = await generateCommitMessages(prompt)

  // 3. Mostrar opciones al usuario
  while (true) {
    const choice = await select({
      message: pc.green('Elige un mensaje de commit:'),
      choices: [
        ...suggestions.map((s, i) => ({ name: s, value: String(i) })),
        { name: pc.yellow('↺ Regenerar sugerencias'), value: 'regenerate' },
        { name: pc.red('✎ Escribir manualmente'), value: 'manual' },
      ]
    })

    if (choice === 'regenerate') {
      console.log(pc.dim('Regenerando...'))
      suggestions = await generateCommitMessages(prompt)
      continue
    }

    if (choice === 'manual') {
      const manual = await input({ message: 'Escribe tu mensaje de commit:' })
      if (manual.trim()) {
        doCommit(manual.trim())
      }
      break
    }

    // Elegida una sugerencia — opción de editar antes de commitear
    const selected = suggestions[Number(choice)]
    const edited = await input({
      message: 'Edita el mensaje si quieres (Enter para confirmar):',
      default: selected
    })

    doCommit(edited.trim())
    break
  }
}

function doCommit(message: string) {
  try {
    execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' })
    console.log(pc.green('✓ Commit realizado'))
  } catch (error: unknown) {
    throw new CliError({
      code: 'GIT_COMMIT_FAILED',
      message: 'No se pudo crear el commit.',
      details: ['Revisa el mensaje de git anterior y vuelve a intentarlo.'],
      cause: error
    })
  }
}

main().catch((error: unknown) => {
  const normalizedError = isPromptCancelError(error)
    ? new CliError({
      code: 'PROMPT_CANCELLED',
      message: 'Operación cancelada.',
      exitCode: 130
    })
    : error

  console.error(formatCliError(normalizedError))

  if (!isCliError(normalizedError) && process.env.DEBUG) {
    console.error(normalizedError)
  }

  process.exit(isCliError(normalizedError) ? normalizedError.exitCode : 1)
})
