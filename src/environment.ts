import Constants from 'expo-constants';

/** True when running inside the Expo Go sandbox app. */
export function isExpoGo(): boolean {
  try {
    return (
      (Constants as { executionEnvironment?: string } | undefined)
        ?.executionEnvironment === 'storeClient'
    );
  } catch {
    return false;
  }
}

/**
 * Background location (expo-task-manager location tasks) requires a
 * development build — it is not available inside Expo Go.
 * https://docs.expo.dev/versions/latest/sdk/location/
 */
export function isBackgroundCapable(): boolean {
  return !isExpoGo();
}
