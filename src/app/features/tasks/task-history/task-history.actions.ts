import { createAction } from '@ngrx/store';
import { PersistentActionMeta } from '../../../op-log/core/persistent-action.interface';
import { OpType } from '../../../op-log/core/operation.types';
import { TaskRevision } from './task-history.model';

export const addTaskRevision = createAction(
  '[TaskHistory] Add TaskRevision',
  (revisionProps: { taskId: string; revision: TaskRevision }) => ({
    ...revisionProps,
    meta: {
      isPersistent: true,
      entityType: 'TASK',
      entityId: revisionProps.taskId,
      opType: OpType.Update,
    } satisfies PersistentActionMeta,
  }),
);
