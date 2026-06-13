"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExpoGo = isExpoGo;
exports.isBackgroundCapable = isBackgroundCapable;
const expo_constants_1 = __importDefault(require("expo-constants"));
/** True when running inside the Expo Go sandbox app. */
function isExpoGo() {
    try {
        return (expo_constants_1.default
            ?.executionEnvironment === 'storeClient');
    }
    catch {
        return false;
    }
}
/**
 * Background location (expo-task-manager location tasks) requires a
 * development build — it is not available inside Expo Go.
 * https://docs.expo.dev/versions/latest/sdk/location/
 */
function isBackgroundCapable() {
    return !isExpoGo();
}
