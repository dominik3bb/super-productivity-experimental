import { Task } from '../task.model';

/**
 * Whether assigning `taskId` under `targetParentId` would create a cycle in the
 * parentId chain (e.g. making an ancestor a descendant of its own subtree).
 */
export const wouldCreateTaskHierarchyCycle = (
  taskId: string,
  targetParentId: string,
  entities: Record<string, Task | undefined>,
): boolean => {
  let current: string | undefined = targetParentId;
  const visited = new Set<string>();

  while (current) {
    if (current === taskId) {
      return true;
    }
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);
    current = entities[current]?.parentId ?? undefined;
  }

  return false;
};
