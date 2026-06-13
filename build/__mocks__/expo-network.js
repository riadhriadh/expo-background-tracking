"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addNetworkStateListener = exports.getNetworkStateAsync = exports.NetworkStateType = void 0;
exports.NetworkStateType = { WIFI: 2, CELLULAR: 1, NONE: 0 };
exports.getNetworkStateAsync = jest.fn().mockResolvedValue({ isConnected: true, type: 2 });
exports.addNetworkStateListener = jest.fn().mockReturnValue({ remove: jest.fn() });
