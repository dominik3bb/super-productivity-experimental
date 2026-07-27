import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { DEFAULT_TASK, Task } from '../task.model';
import { TaskSharedActions } from '../../../root-store/meta/task-shared.actions';
import { addTaskRevision } from './task-history.actions';
import { TASK_HISTORY_DEBOUNCE_MS } from './task-history.const';
import { TaskRevision } from './task-history.model';
import { TaskHistoryService } from './task-history.service';

describe('TaskHistoryService', () => {
  let service: TaskHistoryService;
  let store: MockStore;
  let dispatchSpy: jasmine.Spy;

  const baseTask = (overrides: Partial<Task> = {}): Task =>
    ({
      ...DEFAULT_TASK,
      id: 'task-1',
      projectId: 'p1',
      title: 'Original',
      notes: 'Old notes',
      ...overrides,
    }) as Task;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TaskHistoryService, provideMockStore()],
    });
    service = TestBed.inject(TaskHistoryService);
    store = TestBed.inject(MockStore);
    dispatchSpy = spyOn(store, 'dispatch');
  });

  describe('enrichUpdateChanges', () => {
    it('appends a title revision with the previous title', () => {
      const task = baseTask();
      const result = service.enrichUpdateChanges(task, { title: 'New title' });
      expect(result.title).toBe('New title');
      expect(result.revisions?.[0].kind).toBe('title');
      expect(result.revisions?.[0].title).toBe('Original');
    });

    it('skips a no-op title change', () => {
      const task = baseTask();
      const result = service.enrichUpdateChanges(task, { title: 'Original' });
      expect(result.revisions).toBeUndefined();
    });

    it('records a created milestone when the previous title was empty', () => {
      const task = baseTask({ title: '' });
      const result = service.enrichUpdateChanges(task, { title: 'First' });
      expect(result.revisions?.[0].kind).toBe('created');
      expect(result.revisions?.[0].title).toBe('First');
    });

    it('coalesces rapid title edits onto the first previous value', () => {
      const recent: TaskRevision = {
        id: 'r1',
        created: Date.now() - 100,
        kind: 'title',
        title: 'Very old',
      };
      const task = baseTask({ title: 'Mid', revisions: [recent] });
      const result = service.enrichUpdateChanges(task, { title: 'Newest' });
      expect(result.revisions).toBeUndefined();
      expect(result.title).toBe('Newest');
    });

    it('appends a notes revision with the previous notes', () => {
      const task = baseTask();
      const result = service.enrichUpdateChanges(task, { notes: 'New notes' });
      expect(result.revisions?.[0].kind).toBe('notes');
      expect(result.revisions?.[0].notes).toBe('Old notes');
    });

    it('records a subtaskRenamed event on the parent when a child title changes', () => {
      const task = baseTask({ parentId: 'parent-1' });
      service.enrichUpdateChanges(task, { title: 'Renamed child' });
      expect(dispatchSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: addTaskRevision.type,
          taskId: 'parent-1',
          revision: jasmine.objectContaining({
            kind: 'subtaskRenamed',
            previousSubTaskTitle: 'Original',
            subTaskTitle: 'Renamed child',
          }),
        }),
      );
    });

    it('does not coalesce after the debounce window', () => {
      const old: TaskRevision = {
        id: 'r1',
        created: Date.now() - TASK_HISTORY_DEBOUNCE_MS - 50,
        kind: 'title',
        title: 'Ancient',
      };
      const task = baseTask({ title: 'Current', revisions: [old] });
      const result = service.enrichUpdateChanges(task, { title: 'Later' });
      expect(result.revisions?.[0].title).toBe('Current');
      expect(result.revisions?.length).toBe(2);
    });
  });

  describe('restore', () => {
    it('restores a title through updateTask and captures the replaced value', () => {
      const task = baseTask({ title: 'Current' });
      const revision: TaskRevision = {
        id: 'r1',
        created: 1,
        kind: 'title',
        title: 'Previous',
      };
      service.restoreTitle(task, revision);
      expect(dispatchSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: TaskSharedActions.updateTask.type,
          task: jasmine.objectContaining({
            id: 'task-1',
            changes: jasmine.objectContaining({
              title: 'Previous',
              revisions: jasmine.arrayContaining([
                jasmine.objectContaining({ kind: 'title', title: 'Current' }),
              ]),
            }),
          }),
        }),
      );
    });

    it('restores notes through updateTask', () => {
      const task = baseTask({ notes: 'Current notes' });
      const revision: TaskRevision = {
        id: 'r1',
        created: 1,
        kind: 'notes',
        notes: 'Previous notes',
      };
      service.restoreNotes(task, revision);
      expect(dispatchSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: TaskSharedActions.updateTask.type,
          task: jasmine.objectContaining({
            changes: jasmine.objectContaining({
              notes: 'Previous notes',
            }),
          }),
        }),
      );
    });
  });

  describe('subtask events', () => {
    it('dispatches addTaskRevision for added and removed subtasks', () => {
      service.recordSubtaskAdded('parent-1', 'child-1', 'Child');
      service.recordSubtaskRemoved('parent-1', 'child-1', 'Child');
      expect(dispatchSpy).toHaveBeenCalledTimes(2);
      expect(dispatchSpy.calls.argsFor(0)[0].revision.kind).toBe('subtaskAdded');
      expect(dispatchSpy.calls.argsFor(1)[0].revision.kind).toBe('subtaskRemoved');
    });
  });
});
