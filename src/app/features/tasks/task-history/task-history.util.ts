import { Task } from '../task.model';
import { TASK_HISTORY_MAX_ENTRIES } from './task-history.const';
import { TaskRevision, TaskRevisionKind } from './task-history.model';

/**
 * Prepend a revision and drop the oldest entries past the cap.
 * Newest-first order matches the History panel list.
 */
export const appendTaskRevision = (
  existing: readonly TaskRevision[] | undefined,
  revision: TaskRevision,
  maxEntries: number = TASK_HISTORY_MAX_ENTRIES,
): TaskRevision[] => {
  const next = [revision, ...(existing ?? [])];
  return next.length > maxEntries ? next.slice(0, maxEntries) : next;
};

/**
 * Whether a new capture of `kind` should be skipped because a recent entry of
 * the same kind already preserves the pre-burst value.
 */
export const shouldCoalesceTaskRevision = (
  existing: readonly TaskRevision[] | undefined,
  kind: TaskRevisionKind,
  now: number,
  debounceMs: number,
): boolean => {
  if (kind === 'created') {
    return false;
  }
  const newest = existing?.[0];
  return !!newest && newest.kind === kind && now - newest.created < debounceMs;
};

export const isRestorableTaskRevision = (revision: TaskRevision): boolean =>
  revision.kind === 'title' || revision.kind === 'notes';

export const taskHasCreatedRevision = (
  revisions: readonly TaskRevision[] | undefined,
): boolean => !!revisions?.some((r) => r.kind === 'created');

/**
 * Title the task had *after* this title-change revision (the milestone label).
 * Stored `revision.title` is the previous value used for restore.
 */
export const resolveTitleAfterChange = (
  revisions: readonly TaskRevision[],
  index: number,
  currentTitle: string,
): string => {
  for (let i = index - 1; i >= 0; i--) {
    const newer = revisions[i];
    if (newer.kind === 'title' && typeof newer.title === 'string') {
      return newer.title;
    }
  }
  return currentTitle;
};

const NOTES_PREVIEW_MAX = 120;

export const truncateHistoryNotesPreview = (
  notes: string | undefined,
): string | undefined => {
  const trimmed = (notes ?? '').trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length <= NOTES_PREVIEW_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, NOTES_PREVIEW_MAX).trimEnd()}…`;
};

export interface TaskHistoryTimelineEntry {
  revision: TaskRevision;
  /** Title shown in the milestone headline (created / new title / subtask). */
  displayTitle?: string;
  /** Short notes preview for notes milestones. */
  displayNotesPreview?: string;
  isSynthetic: boolean;
}

const inferInitialTitle = (
  revisions: readonly TaskRevision[],
  currentTitle: string,
): string => {
  for (let i = revisions.length - 1; i >= 0; i--) {
    const rev = revisions[i];
    if (rev.kind === 'title' && typeof rev.title === 'string' && rev.title.trim()) {
      return rev.title;
    }
  }
  return currentTitle;
};

/**
 * Newest-first milestone list for the History panel. When older data has
 * title/notes events but no `created` entry, appends a synthetic origin so
 * the timeline still starts with "Task created …".
 */
export const buildTaskHistoryTimeline = (task: Task): TaskHistoryTimelineEntry[] => {
  const stored = task.revisions ?? [];
  const revisions: TaskRevision[] = [...stored];

  if (revisions.length > 0 && !taskHasCreatedRevision(revisions)) {
    revisions.push({
      id: `__created-${task.id}`,
      created: task.created,
      kind: 'created',
      title: inferInitialTitle(revisions, task.title),
    });
  }

  return revisions.map((revision, index) => {
    let displayTitle: string | undefined;
    switch (revision.kind) {
      case 'created':
        displayTitle = revision.title?.trim() || task.title;
        break;
      case 'title':
        displayTitle = resolveTitleAfterChange(revisions, index, task.title);
        break;
      case 'subtaskAdded':
      case 'subtaskRemoved':
      case 'subtaskRenamed':
        displayTitle = revision.subTaskTitle?.trim() || '…';
        break;
      default:
        displayTitle = undefined;
    }

    return {
      revision,
      displayTitle,
      displayNotesPreview:
        revision.kind === 'notes'
          ? truncateHistoryNotesPreview(revision.notes)
          : undefined,
      isSynthetic: revision.id.startsWith('__created-'),
    };
  });
};
