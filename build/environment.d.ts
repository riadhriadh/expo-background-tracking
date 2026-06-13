/** True when running inside the Expo Go sandbox app. */
export declare function isExpoGo(): boolean;
/**
 * Background location (expo-task-manager location tasks) requires a
 * development build — it is not available inside Expo Go.
 * https://docs.expo.dev/versions/latest/sdk/location/
 */
export declare function isBackgroundCapable(): boolean;
