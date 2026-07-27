import { Task } from '../task.model';
import { wouldCreateTaskHierarchyCycle } from './task-hierarchy.util';

describe('wouldCreateTaskHierarchyCycle', () => {
  const entities = {
    root: { id: 'root', parentId: undefined } as Task,
    child: { id: 'child', parentId: 'root' } as Task,
    grandchild: { id: 'grandchild', parentId: 'child' } as Task,
  };

  it('returns false for a valid deeper nest', () => {
    expect(wouldCreateTaskHierarchyCycle('new-task', 'grandchild', entities)).toBe(false);
  });

  it('returns true when target is a descendant of the task', () => {
    expect(wouldCreateTaskHierarchyCycle('root', 'grandchild', entities)).toBe(true);
  });

  it('returns true for self-nesting', () => {
    expect(wouldCreateTaskHierarchyCycle('child', 'child', entities)).toBe(true);
  });
});
