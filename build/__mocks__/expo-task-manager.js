"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unregisterAllTasksAsync = exports.isTaskRegisteredAsync = exports.isTaskDefined = exports.defineTask = void 0;
exports.defineTask = jest.fn();
exports.isTaskDefined = jest.fn().mockReturnValue(false);
exports.isTaskRegisteredAsync = jest.fn().mockResolvedValue(false);
exports.unregisterAllTasksAsync = jest.fn().mockResolvedValue(undefined);
