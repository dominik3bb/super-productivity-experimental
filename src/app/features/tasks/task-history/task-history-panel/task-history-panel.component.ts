import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { T } from '../../../../t.const';
import { DialogConfirmComponent } from '../../../../ui/dialog-confirm/dialog-confirm.component';
import { InlineMarkdownComponent } from '../../../../ui/inline-markdown/inline-markdown.component';
import { LocaleDatePipe } from '../../../../ui/pipes/locale-date.pipe';
import { Task } from '../../task.model';
import {
  buildTaskHistoryTimeline,
  isRestorableTaskRevision,
  TaskHistoryTimelineEntry,
} from '../task-history.util';
import { TaskRevision } from '../task-history.model';
import { TaskHistoryService } from '../task-history.service';

@Component({
  selector: 'task-history-panel',
  templateUrl: './task-history-panel.component.html',
  styleUrl: './task-history-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatIcon, TranslatePipe, LocaleDatePipe, InlineMarkdownComponent],
})
export class TaskHistoryPanelComponent {
  private readonly _taskHistory = inject(TaskHistoryService);
  private readonly _matDialog = inject(MatDialog);

  readonly T = T;
  readonly task = input.required<Task>();
  readonly expandedRevisionId = signal<string | null>(null);

  readonly timeline = computed(() => buildTaskHistoryTimeline(this.task()));

  isExpanded(entry: TaskHistoryTimelineEntry): boolean {
    return this.expandedRevisionId() === entry.revision.id;
  }

  isRestorable(revision: TaskRevision): boolean {
    return isRestorableTaskRevision(revision);
  }

  toggleExpand(entry: TaskHistoryTimelineEntry): void {
    // Title/created milestones are fully readable in the headline; expand is
    // for notes (full markdown) and rename before→after detail.
    if (
      entry.revision.kind === 'title' ||
      entry.revision.kind === 'created' ||
      entry.revision.kind === 'subtaskAdded' ||
      entry.revision.kind === 'subtaskRemoved'
    ) {
      return;
    }
    this.expandedRevisionId.update((id) =>
      id === entry.revision.id ? null : entry.revision.id,
    );
  }

  canExpand(entry: TaskHistoryTimelineEntry): boolean {
    return entry.revision.kind === 'notes' || entry.revision.kind === 'subtaskRenamed';
  }

  labelKey(revision: TaskRevision): string {
    switch (revision.kind) {
      case 'created':
        return T.F.TASK.ADDITIONAL_INFO.HISTORY_TASK_CREATED;
      case 'title':
        return T.F.TASK.ADDITIONAL_INFO.HISTORY_TITLE_CHANGED;
      case 'notes':
        return T.F.TASK.ADDITIONAL_INFO.HISTORY_NOTES_UPDATED;
      case 'subtaskAdded':
        return T.F.TASK.ADDITIONAL_INFO.HISTORY_SUBTASK_ADDED;
      case 'subtaskRemoved':
        return T.F.TASK.ADDITIONAL_INFO.HISTORY_SUBTASK_REMOVED;
      case 'subtaskRenamed':
        return T.F.TASK.ADDITIONAL_INFO.HISTORY_SUBTASK_RENAMED;
      default:
        return T.F.TASK.ADDITIONAL_INFO.HISTORY_TITLE_CHANGED;
    }
  }

  restore(revision: TaskRevision): void {
    if (revision.id.startsWith('__created-')) {
      return;
    }
    const task = this.task();
    if (revision.kind === 'title') {
      this._taskHistory.restoreTitle(task, revision);
      return;
    }
    if (revision.kind !== 'notes') {
      return;
    }

    const currentNotes = (task.notes ?? '').trim();
    const previousNotes = revision.notes ?? '';
    if (currentNotes && currentNotes !== previousNotes.trim()) {
      this._matDialog
        .open(DialogConfirmComponent, {
          restoreFocus: true,
          data: {
            cancelTxt: T.G.CANCEL,
            okTxt: T.F.TASK.ADDITIONAL_INFO.HISTORY_RESTORE,
            message: T.F.TASK.ADDITIONAL_INFO.HISTORY_RESTORE_NOTES_CONFIRM,
          },
        })
        .afterClosed()
        .subscribe((isConfirm: boolean) => {
          if (isConfirm) {
            this._taskHistory.restoreNotes(task, revision);
          }
        });
      return;
    }

    this._taskHistory.restoreNotes(task, revision);
  }
}
