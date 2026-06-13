"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addLowPowerModeListener = exports.isLowPowerModeEnabledAsync = exports.getBatteryStateAsync = exports.getBatteryLevelAsync = exports.BatteryState = void 0;
exports.BatteryState = { CHARGING: 1, DISCHARGING: 2, FULL: 3, UNKNOWN: 0 };
exports.getBatteryLevelAsync = jest.fn().mockResolvedValue(0.8);
exports.getBatteryStateAsync = jest.fn().mockResolvedValue(2);
exports.isLowPowerModeEnabledAsync = jest.fn().mockResolvedValue(false);
exports.addLowPowerModeListener = jest.fn().mockReturnValue({ remove: jest.fn() });
