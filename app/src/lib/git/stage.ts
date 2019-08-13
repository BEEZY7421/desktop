import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  isConflictedFileStatus,
  isManualConflict,
  GitStatusEntry,
} from '../../models/status'
import {
  ManualConflictResolution,
  ManualConflictResolutionKind,
} from '../../models/manual-conflict-resolution'
import { git } from '.'
import { assertNever } from '../fatal-error'

/**
 * Stages a file with the given manual resolution method. Useful for resolving binary conflicts at commit-time.
 *
 * @param repository
 * @param file conflicted file to stage
 * @param manualResolution method to resolve the conflict of file
 * @returns true if successful, false if something went wrong
 */
export async function stageManualConflictResolution(
  repository: Repository,
  file: WorkingDirectoryFileChange,
  manualResolution: ManualConflictResolution
): Promise<boolean> {
  const { status } = file
  // if somehow the file isn't in a conflicted state
  if (!isConflictedFileStatus(status)) {
    log.error(`tried to manually resolve unconflicted file (${file.path})`)
    return false
  }
  if (!isManualConflict(status)) {
    log.error(
      `tried to manually resolve conflicted file with markers (${file.path})`
    )
    return false
  }

  const chosen =
    manualResolution === ManualConflictResolutionKind.theirs
      ? status.entry.them
      : status.entry.us

  switch (chosen) {
    case GitStatusEntry.Deleted: {
      return await runGitCommand(
        ['rm', file.path],
        repository.path,
        'removeConflictedFile'
      )
    }
    case GitStatusEntry.Added: {
      return await runGitCommand(
        ['add', file.path],
        repository.path,
        'addConflictedFile'
      )
    }
    case GitStatusEntry.UpdatedButUnmerged: {
      const choiceFlag =
        manualResolution === ManualConflictResolutionKind.theirs
          ? 'theirs'
          : 'ours'
      const checkoutCompleted = await runGitCommand(
        ['checkout', `--${choiceFlag}`, '--', file.path],
        repository.path,
        'checkoutConflictedFile'
      )
      if (checkoutCompleted) {
        return await runGitCommand(
          ['add', file.path],
          repository.path,
          'addConflictedFile'
        )
      }
      return false
    }
    default:
      return assertNever(chosen, 'unnacounted for git status entry possibility')
  }
}

/**
 * Run a Git command and return whether the exit code indicated success
 *
 * This defers to the default error handling infrastructure inside if an error
 * is encountered.
 */
async function runGitCommand(
  args: string[],
  path: string,
  name: string
): Promise<boolean> {
  const { exitCode } = await git(args, path, name)
  return exitCode === 0
}
