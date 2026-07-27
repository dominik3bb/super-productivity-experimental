import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { nanoid } from 'nanoid';
import { Task } from '../task.model';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { addTaskRevision } from './task-history.actions';
import { TASK_HISTORY_DEBOUNCE_MS } from './task-history.const';
import { TaskRevision } from './task-history.model';
import {
  appendTaskRevision,
  shouldCoalesceTaskRevision,
  taskHasCreatedRevision,
} from './task-history.util';

/**
 * Captures quiet per-task version history (title/notes/subtask events) and
 * soft-restores title/notes. History lives on `Task.revisions` and syncs as
 * TASK updates — see discussion #6620.
 */
@Injectable({ providedIn: 'root' })
export class TaskHistoryService {
  private readonly _store = inject(Store);

  /**
   * When `changes` include a title or notes edit, attach a capped revision of
   * the previous value (unless coalesced). Returns the fields to dispatch.
   */
  enrichUpdateChanges(task: Task, changes: Partial<Task>): Partial<Task> {
    let revisions = task.revisions;
    let changed = false;
    const now = Date.now();

    if (
      Object.prototype.hasOwnProperty.call(changes, 'title') &&
      typeof changes.title === 'string' &&
      changes.title !== task.title
    ) {
      if (!task.title.trim() && changes.title.trim()) {
        // First non-empty title → origin milestone (not a "title changed").
        if (!taskHasCreatedRevision(revisions)) {
          const next = appendTaskRevision(revisions, {
            id: nanoid(),
            created: now,
            kind: 'created',
            title: changes.title.trim(),
          });
          revisions = next;
          changed = true;
        }
      } else if (task.title.trim()) {
        const next = this._maybeAppend(
          revisions,
          {
            id: nanoid(),
            created: now,
            kind: 'title',
            title: task.title,
          },
          now,
        );
        if (next) {
          revisions = next;
          changed = true;
          if (task.parentId) {
            this.recordSubtaskRenamed(task.parentId, task.id, task.title, changes.title);
          }
        }
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(changes, 'notes') &&
      typeof changes.notes === 'string' &&
      changes.notes !== (task.notes ?? '')
    ) {
      // Skip capturing empty previous notes (first note on a blank task).
      if ((task.notes ?? '').trim()) {
        const next = this._maybeAppend(
          revisions,
          {
            id: nanoid(),
            created: now,
            kind: 'notes',
            notes: task.notes ?? '',
          },
          now,
        );
        if (next) {
          revisions = next;
          changed = true;
        }
      }
    }

    // Avoid writing revisions back when the caller already set them, or when
    // nothing was captured (no-op / coalesced).
    if (!changed || Object.prototype.hasOwnProperty.call(changes, 'revisions')) {
      return changes;
    }
    return { ...changes, revisions };
  }

  recordSubtaskAdded(parentId: string, subTaskId: string, subTaskTitle: string): void {
    this._dispatchRevision(parentId, {
      id: nanoid(),
      created: Date.now(),
      kind: 'subtaskAdded',
      subTaskId,
      subTaskTitle,
    });
  }

  recordSubtaskRemoved(parentId: string, subTaskId: string, subTaskTitle: string): void {
    this._dispatchRevision(parentId, {
      id: nanoid(),
      created: Date.now(),
      kind: 'subtaskRemoved',
      subTaskId,
      subTaskTitle,
    });
  }

  recordSubtaskRenamed(
    parentId: string,
    subTaskId: string,
    previousTitle: string,
    newTitle: string,
  ): void {
    if (previousTitle === newTitle) {
      return;
    }
    this._dispatchRevision(parentId, {
      id: nanoid(),
      created: Date.now(),
      kind: 'subtaskRenamed',
      subTaskId,
      subTaskTitle: newTitle,
      previousSubTaskTitle: previousTitle,
    });
  }

  /** Soft-restore: write previous title through the normal update path. */
  restoreTitle(task: Task, revision: TaskRevision): void {
    if (revision.kind !== 'title' || revision.title === undefined) {
      return;
    }
    this._store.dispatch(
      TaskSharedActions.updateTask({
        task: {
          id: task.id,
          changes: this.enrichUpdateChanges(task, { title: revision.title }),
        },
      }),
    );
  }

  /** Soft-restore: write previous notes through the normal update path. */
  restoreNotes(task: Task, revision: TaskRevision): void {
    if (revision.kind !== 'notes' || revision.notes === undefined) {
      return;
    }
    this._store.dispatch(
      TaskSharedActions.updateTask({
        task: {
          id: task.id,
          changes: this.enrichUpdateChanges(task, { notes: revision.notes }),
        },
      }),
    );
  }

  private _maybeAppend(
    existing: readonly TaskRevision[] | undefined,
    revision: TaskRevision,
    now: number,
  ): TaskRevision[] | null {
    if (
      shouldCoalesceTaskRevision(existing, revision.kind, now, TASK_HISTORY_DEBOUNCE_MS)
    ) {
      return null;
    }
    return appendTaskRevision(existing, revision);
  }

  private _dispatchRevision(taskId: string, revision: TaskRevision): void {
    this._store.dispatch(addTaskRevision({ taskId, revision }));
  }
}
