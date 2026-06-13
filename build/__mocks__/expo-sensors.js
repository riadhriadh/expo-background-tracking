"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Magnetometer = exports.Gyroscope = exports.Accelerometer = void 0;
const makeSensor = () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true) });
exports.Accelerometer = makeSensor();
exports.Gyroscope = makeSensor();
exports.Magnetometer = makeSensor();
