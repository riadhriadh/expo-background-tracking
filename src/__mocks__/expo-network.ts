export const NetworkStateType = { WIFI: 2, CELLULAR: 1, NONE: 0 };
export const getNetworkStateAsync = jest.fn().mockResolvedValue({ isConnected: true, type: 2 });
export const addNetworkStateListener = jest.fn().mockReturnValue({ remove: jest.fn() });
