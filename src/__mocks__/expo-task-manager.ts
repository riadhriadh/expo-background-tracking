export const defineTask = jest.fn();
export const isTaskDefined = jest.fn().mockReturnValue(false);
export const isTaskRegisteredAsync = jest.fn().mockResolvedValue(false);
export const unregisterAllTasksAsync = jest.fn().mockResolvedValue(undefined);
