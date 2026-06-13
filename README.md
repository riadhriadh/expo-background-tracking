# expo-background-tracking

GPS tracking & geofencing for **Expo** (Android + iOS), 100% Expo, **no Firebase**, no custom native code, **Expo Go compatible**.

Battery-efficient motion detection (accelerometer + GPS speed), SQLite persistence, HTTP sync with offline queue, unlimited geofencing (circles + polygons), odometer, weekly scheduling.

## Installation

```bash
npm install expo-background-tracking
npx expo install expo-location expo-task-manager expo-sqlite expo-sensors expo-battery expo-network expo-device expo-constants
```

## Expo Go Compatibility

| | Expo Go | Dev build / production |
|---|---|---|
| Tracking app in foreground | ✅ | ✅ |
| Tracking app in background | ❌* | ✅ |
| Geofencing | ✅ (software, foreground) | ✅ (native + software) |
| SQLite, HTTP sync, odometer, scheduler, motion-detection | ✅ | ✅ |

\* Official Expo limitation: background location requires a development build ([Expo docs](https://docs.expo.dev/versions/latest/sdk/location/)). The library automatically detects the environment — **same code everywhere**, zero crashes in Expo Go.

For full background (dev build), add to `app.json`:

```json
{
  "expo": {
    "ios": { "infoPlist": { "UIBackgroundModes": ["location", "fetch"] } },
    "android": { "permissions": ["ACCESS_BACKGROUND_LOCATION", "FOREGROUND_SERVICE", "FOREGROUND_SERVICE_LOCATION"] },
    "plugins": [["expo-location", {
      "isAndroidBackgroundLocationEnabled": true,
      "isAndroidForegroundServiceEnabled": true
    }]]
  }
}
```

## Usage

```ts
import BackgroundGeolocation from 'expo-background-tracking';

// 1. Listen to events
const sub = BackgroundGeolocation.onLocation((location) => {
  console.log('[location]', location.coords);
});

BackgroundGeolocation.onMotionChange(({ isMoving, location }) => {
  console.log('[motionchange]', isMoving);
});

BackgroundGeolocation.onGeofence(({ identifier, action }) => {
  console.log('[geofence]', identifier, action);
});

// 2. Configure (ready, once only)
const state = await BackgroundGeolocation.ready({
  desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
  distanceFilter: 10,
  stopTimeout: 5,
  url: 'https://your-server.com/locations', // HTTP sync — native fetch, no Firebase
  autoSync: true,
  batchSync: false,
  headers: { 'X-API-KEY': 'xyz' },
  debug: true,
});

// 3. Start
if (!state.enabled) {
  await BackgroundGeolocation.start();
}
```

### Geofencing (unlimited, circles + polygons)

```ts
await BackgroundGeolocation.addGeofence({
  identifier: 'HOME',
  latitude: 48.8566,
  longitude: 2.3522,
  radius: 200,
  notifyOnEntry: true,
  notifyOnExit: true,
  notifyOnDwell: true,
  loiteringDelay: 60000,
});

// Polygon (software-evaluated)
await BackgroundGeolocation.addGeofence({
  identifier: 'ZONE',
  vertices: [[48.85, 2.34], [48.86, 2.34], [48.86, 2.36], [48.85, 2.36]],
});

await BackgroundGeolocation.startGeofences(); // geofences-only mode
```

## Sending HTTP locations to your server

The library includes a complete HTTP service (based on `fetch`, **no Firebase**): each location is persisted in SQLite then sent to your `url`. On failure (offline, server error), locations remain queued and are automatically resent on reconnection.

### Basic configuration

```ts
await BackgroundGeolocation.ready({
  url: 'https://your-server.com/locations', // destination for locations
  method: 'POST',                             // 'POST' (default) | 'PUT' | 'OPTIONS'
  headers: {                                  // custom HTTP headers
    'X-API-KEY': 'abc123',
    'Authorization': 'Bearer ...',
  },
  params: {                                   // fields added at JSON root level
    device_id: 'phone-01',
    company_id: 7,
  },
  extras: {                                   // attached to EVERY location sent
    user_id: 42,
    mission: 'delivery',
  },
  autoSync: true,                             // automatically send each location
  httpTimeout: 60000,                         // request timeout in ms
});
```

### Control transmission count and frequency

| Option | Effect |
|---|---|
| `autoSync: true` | Automatically send each new location |
| `autoSyncThreshold: 10` | Only send when **10 locations** accumulate in queue |
| `batchSync: true` | Send locations **in batches** (1 HTTP request = N locations) |
| `maxBatchSize: 50` | Maximum **50 locations per request** (batches chain together) |
| `autoSync: false` + `sync()` | **100% manual** sending, when you decide |

```ts
// Example: save battery/network — 1 request per 25 points, in batches
await BackgroundGeolocation.ready({
  url: 'https://your-server.com/locations',
  autoSync: true,
  autoSyncThreshold: 25,
  batchSync: true,
  maxBatchSize: 100,
});

// Manual send (e.g., on button or at mission end)
const uploaded = await BackgroundGeolocation.sync();
console.log(`${uploaded.length} locations sent`);
```

### Payload format received by your server

By default (`httpRootProperty: 'location'`):

```json
{
  "location": {
    "uuid": "f3f57a91-…",
    "timestamp": "2026-06-12T14:32:11.000Z",
    "odometer": 1842.5,
    "is_moving": true,
    "coords": {
      "latitude": 48.856614, "longitude": 2.352222,
      "accuracy": 5, "speed": 1.4, "heading": 270, "altitude": 35
    },
    "activity": { "activity": "walking", "confidence": 75 },
    "battery": { "level": 0.82, "is_charging": false },
    "extras": { "user_id": 42, "mission": "delivery" }
  },
  "device_id": "phone-01",
  "company_id": 7
}
```

With `batchSync: true`, `"location"` becomes an **array** of locations.

### Customize format

```ts
await BackgroundGeolocation.ready({
  url: '…',
  httpRootProperty: 'data',          // { "data": {...} } — or '.' for no wrapper
  locationTemplate: '{"lat":<%= latitude %>,"lng":<%= longitude %>,"ts":<%= timestamp %>,"batt":<%= battery.level %>}',
});
```

Template variables: `latitude`, `longitude`, `accuracy`, `speed`, `heading`, `altitude`, `timestamp`, `uuid`, `odometer`, `is_moving`, `activity.type`, `activity.confidence`, `battery.level`, `battery.is_charging`.

### Track transmissions

```ts
BackgroundGeolocation.onHttp((response) => {
  console.log('[http]', response.status, response.success, response.responseText);
});
```

### Persistence & manual sync

```ts
const count = await BackgroundGeolocation.getCount();        // queued locations
const locations = await BackgroundGeolocation.getLocations(); // read queue
const uploaded = await BackgroundGeolocation.sync();          // send now
await BackgroundGeolocation.destroyLocations();               // empty queue
```

Retention options: `maxDaysToPersist` (default 1 day), `maxRecordsToPersist`, `persistMode` (`ALL` | `LOCATION` | `GEOFENCE` | `NONE`).

### Scheduling

```ts
await BackgroundGeolocation.ready({
  schedule: ['1-5 09:00-17:00', '6 10:00-14:00'], // Mon-Fri 9am-5pm, Sat 10am-2pm
});
await BackgroundGeolocation.startSchedule();
```

### Odometer, sensors, state

```ts
const km = (await BackgroundGeolocation.getOdometer()) / 1000;
await BackgroundGeolocation.resetOdometer();
const sensors = await BackgroundGeolocation.getSensors();
const providerState = await BackgroundGeolocation.getProviderState();
const powerSave = await BackgroundGeolocation.isPowerSaveMode();
```

### JWT auth with automatic refresh (on 401)

```ts
await BackgroundGeolocation.ready({
  url: 'https://api.example.com/locations',
  authorization: {
    strategy: 'JWT',
    accessToken: 'eyJ...',
    refreshToken: 'def...',
    refreshUrl: 'https://api.example.com/auth/refresh',
  },
});
BackgroundGeolocation.onAuthorization((event) => console.log(event));
```

## Complete API

Events: `onLocation`, `onMotionChange`, `onActivityChange`, `onGeofence`, `onGeofencesChange`, `onHeartbeat`, `onHttp`, `onProviderChange`, `onConnectivityChange`, `onPowerSaveChange`, `onEnabledChange`, `onSchedule`, `onAuthorization`.

Methods: `ready`, `start`, `stop`, `startGeofences`, `startSchedule`, `stopSchedule`, `changePace`, `getCurrentPosition`, `watchPosition`, `stopWatchPosition`, `getState`, `setConfig`, `reset`, `getLocations`, `getCount`, `insertLocation`, `destroyLocations`, `destroyLocation`, `sync`, `getOdometer`, `setOdometer`, `resetOdometer`, `addGeofence`, `addGeofences`, `removeGeofence`, `removeGeofences`, `getGeofences`, `getGeofence`, `geofenceExists`, `getSensors`, `getDeviceInfo`, `isPowerSaveMode`, `getProviderState`, `requestPermission`, `requestTemporaryFullAccuracy`, `registerHeadlessTask`, `startBackgroundTask`, `stopBackgroundTask`, `getLog`, `destroyLog`, `emailLog`, `removeListeners`.

## Test app

```bash
cd testapp
npm install
npx expo start --clear
```

## License

MIT
