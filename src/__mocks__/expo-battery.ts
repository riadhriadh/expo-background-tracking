export const BatteryState = { CHARGING: 1, DISCHARGING: 2, FULL: 3, UNKNOWN: 0 };
export const getBatteryLevelAsync = jest.fn().mockResolvedValue(0.8);
export const getBatteryStateAsync = jest.fn().mockResolvedValue(2);
export const isLowPowerModeEnabledAsync = jest.fn().mockResolvedValue(false);
export const addLowPowerModeListener = jest.fn().mockReturnValue({ remove: jest.fn() });
