import * as ExpoLocation from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';

import { database } from './Database';
import { logger } from './Logger';
import { EventBus } from './EventBus';
import { HttpService } from './HttpService';
import { MotionDetector } from './MotionDetector';
import { GeofenceManager, GEOFENCE_TASK } from './GeofenceManager';
import { Scheduler } from './Scheduler';
import { haversine, uuidv4 } from './geo';
import { isBackgroundCapable, isExpoGo } from './environment';
import {
  AccuracyAuthorization,
  AuthorizationStatus,
  DesiredAccuracy,
  LogLevel,
  PersistMode,
  type ActivityChangeEvent,
  type Config,
  type ConnectivityChangeEvent,
  type CurrentPositionRequest,
  type DeviceInfo,
  type GeofencesChangeEvent,
  type Geofence,
  type GeofenceEvent,
  type HeadlessEvent,
  type HeadlessTask,
  type HeartbeatEvent,
  type HttpEvent,
  type Location,
  type MotionChangeEvent,
  type ProviderChangeEvent,
  type ScheduleEvent,
  type Sensors,
  type SQLQuery,
  type State,
  type Subscription,
  type WatchPositionRequest,
  type AuthorizationEvent,
} from './types';

export const LOCATION_TASK = 'expo-background-tracking.location';

const DEFAULT_CONFIG: Config = {
  desiredAccuracy: DesiredAccuracy.HIGH,
  distanceFilter: 10,
  stationaryRadius: 25,
  stopTimeout: 5,
  motionTriggerDelay: 0,
  disableMotionActivityUpdates: false,
  disableStopDetection: false,
  isMoving: false,
  elasticityMultiplier: 1,
  disableElasticity: false,
  geofenceProximityRadius: 1000,
  heartbeatInterval: 60,
  autoSync: true,
  autoSyncThreshold: 0,
  batchSync: false,
  maxBatchSize: -1,
  method: 'POST',
  httpRootProperty: 'location',
  httpTimeout: 60_000,
  maxDaysToPersist: 1,
  maxRecordsToPersist: -1,
  persistMode: PersistMode.ALL,
  stopOnTerminate: true,
  startOnBoot: false,
  debug: false,
  logLevel: LogLevel.INFO,
  logMaxDays: 3,
  locationAuthorizationRequest: 'Always',
  foregroundService: true,
};

class BackgroundGeolocationImpl {
  // re-exported enums (parity with transistorsoft statics)
  readonly DESIRED_ACCURACY_NAVIGATION = DesiredAccuracy.NAVIGATION;
  readonly DESIRED_ACCURACY_HIGH = DesiredAccuracy.HIGH;
  readonly DESIRED_ACCURACY_MEDIUM = DesiredAccuracy.MEDIUM;
  readonly DESIRED_ACCURACY_LOW = DesiredAccuracy.LOW;
  readonly DESIRED_ACCURACY_VERY_LOW = DesiredAccuracy.VERY_LOW;
  readonly LOG_LEVEL_OFF = LogLevel.OFF;
  readonly LOG_LEVEL_ERROR = LogLevel.ERROR;
  readonly LOG_LEVEL_WARNING = LogLevel.WARNING;
  readonly LOG_LEVEL_INFO = LogLevel.INFO;
  readonly LOG_LEVEL_DEBUG = LogLevel.DEBUG;
  readonly LOG_LEVEL_VERBOSE = LogLevel.VERBOSE;
  readonly PERSIST_MODE_ALL = PersistMode.ALL;
  readonly PERSIST_MODE_LOCATION = PersistMode.LOCATION;
  readonly PERSIST_MODE_GEOFENCE = PersistMode.GEOFENCE;
  readonly PERSIST_MODE_NONE = PersistMode.NONE;
  readonly AUTHORIZATION_STATUS_ALWAYS = AuthorizationStatus.ALWAYS;
  readonly AUTHORIZATION_STATUS_WHEN_IN_USE = AuthorizationStatus.WHEN_IN_USE;
  readonly AUTHORIZATION_STATUS_DENIED = AuthorizationStatus.DENIED;

  readonly logger = logger;

  private bus = new EventBus();
  private http = new HttpService(this.bus);
  private geofenceManager = new GeofenceManager(this.bus);
  private motion: MotionDetector;
  private scheduler: Scheduler;

  private config: Config = { ...DEFAULT_CONFIG };
  private enabled = false;
  private trackingMode: 0 | 1 = 1;
  private odometer = 0;
  private lastLocation: Location | null = null;
  private lastPersistedCoords: { latitude: number; longitude: number } | null = null;
  private isReady = false;

  private foregroundSub: ExpoLocation.LocationSubscription | null = null;
  private watchSub: ExpoLocation.LocationSubscription | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private providerTimer: ReturnType<typeof setInterval> | null = null;
  private powerSaveSub: { remove(): void } | null = null;
  private lastProviderState: string | null = null;
  private headlessTask: HeadlessTask | null = null;
  private bgTaskCounter = 0;

  constructor() {
    this.motion = new MotionDetector({
      stopTimeoutMinutes: DEFAULT_CONFIG.stopTimeout!,
      motionTriggerDelayMs: DEFAULT_CONFIG.motionTriggerDelay!,
      disabled: false,
      onMotionChange: (isMoving) => void this.handleMotionChange(isMoving),
      onActivityChange: (activity) => this.bus.emit('activitychange', activity),
    });
    this.scheduler = new Scheduler((scheduleEnabled) => {
      void (async () => {
        if (scheduleEnabled && !this.enabled) await this.start();
        else if (!scheduleEnabled && this.enabled) await this.stop();
        const state = await this.getState();
        this.bus.emit('schedule', { enabled: scheduleEnabled, state } satisfies ScheduleEvent);
      })();
    });
    try {
      this.defineTasks();
    } catch (e) {
      // never crash the app at import time (e.g. exotic environments)
      console.warn('[expo-background-tracking] defineTasks failed:', e);
    }
  }

  // -------------------------------------------------------------------------
  // TaskManager background tasks (effective in dev builds; inert in Expo Go)
  // -------------------------------------------------------------------------

  private defineTasks(): void {
    if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
      TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
        if (error) {
          logger.error(`Background location task error: ${error.message}`);
          return;
        }
        const { locations } = (data ?? {}) as { locations?: ExpoLocation.LocationObject[] };
        if (!locations?.length) return;
        for (const raw of locations) {
          const location = await this.buildLocation(raw);
          await this.processLocation(location);
          await this.dispatchHeadless({ name: 'location', params: location });
        }
      });
    }
    if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
      TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
        if (error) {
          logger.error(`Geofence task error: ${error.message}`);
          return;
        }
        const event = data as {
          eventType: ExpoLocation.GeofencingEventType;
          region: ExpoLocation.LocationRegion;
        };
        const action =
          event.eventType === ExpoLocation.GeofencingEventType.Enter ? 'ENTER' : 'EXIT';
        const location =
          this.lastLocation ?? (await this.fetchCurrentLocation().catch(() => null));
        if (location && event.region.identifier) {
          await this.geofenceManager.onNativeEvent(event.region.identifier, action, location);
          await this.dispatchHeadless({
            name: 'geofence',
            params: { identifier: event.region.identifier, action, location },
          });
        }
      });
    }
  }

  private async dispatchHeadless(event: HeadlessEvent): Promise<void> {
    if (this.headlessTask) {
      try {
        await this.headlessTask(event);
      } catch (e) {
        logger.error(`Headless task error: ${String(e)}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async ready(config: Config = {}): Promise<State> {
    if (this.isReady && !config.reset) return this.getState();

    const persisted = config.reset
      ? null
      : await database.getKV<Config>('config');
    this.config = { ...DEFAULT_CONFIG, ...(persisted ?? {}), ...config };
    await database.setKV('config', this.config);

    logger.level = this.config.logLevel ?? LogLevel.INFO;
    logger.debug = this.config.debug ?? false;
    this.http.setConfig(this.config);
    this.geofenceManager.setProximityRadius(this.config.geofenceProximityRadius ?? 1000);
    this.motion.setOptions({
      stopTimeoutMinutes: this.config.stopTimeout ?? 5,
      motionTriggerDelayMs: this.config.motionTriggerDelay ?? 0,
      disabled: this.config.disableMotionActivityUpdates ?? false,
    });
    if (this.config.schedule?.length) this.scheduler.setSchedule(this.config.schedule);

    this.odometer = (await database.getKV<number>('odometer')) ?? 0;
    const wasEnabled = (await database.getKV<boolean>('enabled')) ?? false;
    this.trackingMode = ((await database.getKV<number>('trackingMode')) ?? 1) as 0 | 1;

    await database.prune(
      this.config.maxDaysToPersist ?? 1,
      this.config.maxRecordsToPersist ?? -1
    );
    await database.pruneLogs(this.config.logMaxDays ?? 3);

    this.http.startConnectivityMonitoring();
    this.startProviderMonitoring();
    void this.startPowerSaveMonitoring();

    this.isReady = true;
    logger.info(
      `ready() — env=${isExpoGo() ? 'Expo Go (foreground-only)' : 'dev build (background OK)'}`
    );

    if (wasEnabled && this.config.stopOnTerminate === false) {
      // restore tracking after app relaunch
      if (this.trackingMode === 1) await this.start();
      else await this.startGeofences();
    }
    return this.getState();
  }

  async start(): Promise<State> {
    this.assertReady('start');
    this.trackingMode = 1;
    await database.setKV('trackingMode', 1);
    await this.requestPermission();

    await this.startForegroundWatch();
    await this.startBackgroundUpdates();
    await this.geofenceManager.start();
    await this.motion.start();
    this.startHeartbeat();

    this.setEnabled(true);

    // fire an immediate motionchange location, like transistorsoft
    const location = await this.fetchCurrentLocation().catch(() => null);
    if (location) {
      location.event = 'motionchange';
      await this.processLocation(location);
    }
    return this.getState();
  }

  async stop(): Promise<State> {
    this.foregroundSub?.remove();
    this.foregroundSub = null;
    this.stopHeartbeat();
    this.motion.stop();
    await this.geofenceManager.stop();
    if (isBackgroundCapable()) {
      try {
        const started = await ExpoLocation.hasStartedLocationUpdatesAsync(LOCATION_TASK);
        if (started) await ExpoLocation.stopLocationUpdatesAsync(LOCATION_TASK);
      } catch {
        /* ignore */
      }
    }
    this.setEnabled(false);
    return this.getState();
  }

  /** Geofences-only mode: no continuous location tracking. */
  async startGeofences(): Promise<State> {
    this.assertReady('startGeofences');
    this.trackingMode = 0;
    await database.setKV('trackingMode', 0);
    await this.requestPermission();
    await this.geofenceManager.start();
    // low-power significant-movement watch to evaluate software geofences
    await this.startForegroundWatch(/* lowPower */ true);
    this.setEnabled(true);
    return this.getState();
  }

  startSchedule(): Promise<State> {
    this.assertReady('startSchedule');
    if (this.config.schedule?.length) this.scheduler.setSchedule(this.config.schedule);
    this.scheduler.start();
    return this.getState();
  }

  stopSchedule(): Promise<State> {
    this.scheduler.stop();
    return this.getState();
  }

  async changePace(isMoving: boolean): Promise<void> {
    this.assertReady('changePace');
    this.motion.setMoving(isMoving);
  }

  private setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    void database.setKV('enabled', enabled);
    this.bus.emit('enabledchange', enabled);
    logger.info(`enabledchange: ${enabled}`);
  }

  private assertReady(method: string): void {
    if (!this.isReady) {
      throw new Error(`BackgroundGeolocation.${method}() called before ready()`);
    }
  }

  // -------------------------------------------------------------------------
  // Location streams
  // -------------------------------------------------------------------------

  private mapAccuracy(a?: DesiredAccuracy): ExpoLocation.LocationAccuracy {
    switch (a) {
      case DesiredAccuracy.NAVIGATION:
        return ExpoLocation.LocationAccuracy.BestForNavigation;
      case DesiredAccuracy.HIGH:
        return ExpoLocation.LocationAccuracy.Highest;
      case DesiredAccuracy.MEDIUM:
        return ExpoLocation.LocationAccuracy.Balanced;
      case DesiredAccuracy.LOW:
        return ExpoLocation.LocationAccuracy.Low;
      case DesiredAccuracy.VERY_LOW:
      case DesiredAccuracy.LOWEST:
        return ExpoLocation.LocationAccuracy.Lowest;
      default:
        return ExpoLocation.LocationAccuracy.High;
    }
  }

  private async startForegroundWatch(lowPower = false): Promise<void> {
    this.foregroundSub?.remove();
    this.foregroundSub = await ExpoLocation.watchPositionAsync(
      {
        accuracy: lowPower
          ? ExpoLocation.LocationAccuracy.Balanced
          : this.mapAccuracy(this.config.desiredAccuracy),
        distanceInterval: this.effectiveDistanceFilter(),
        timeInterval: this.config.deferTime,
      },
      (raw) => {
        void (async () => {
          const location = await this.buildLocation(raw);
          await this.processLocation(location);
        })();
      }
    );
  }

  private async startBackgroundUpdates(): Promise<void> {
    if (!isBackgroundCapable()) {
      logger.warn(
        'Expo Go detected: background tracking unavailable (foreground-only). ' +
          'Use a development build for full background support.'
      );
      return;
    }
    try {
      await ExpoLocation.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: this.mapAccuracy(this.config.desiredAccuracy),
        distanceInterval: this.effectiveDistanceFilter(),
        deferredUpdatesInterval: this.config.deferTime,
        pausesUpdatesAutomatically: this.config.pausesLocationUpdatesAutomatically,
        showsBackgroundLocationIndicator: this.config.showsBackgroundLocationIndicator,
        activityType: this.config.activityType as unknown as ExpoLocation.LocationActivityType,
        foregroundService:
          Platform.OS === 'android' && this.config.foregroundService !== false
            ? {
                notificationTitle:
                  this.config.notification?.title ?? 'Location tracking',
                notificationBody:
                  this.config.notification?.text ?? 'Tracking is active',
                notificationColor: this.config.notification?.color,
                killServiceOnDestroy: this.config.stopOnTerminate !== false,
              }
            : undefined,
      });
      logger.info('Background location updates started');
    } catch (e) {
      logger.error(`startLocationUpdatesAsync failed: ${String(e)}`);
    }
  }

  private effectiveDistanceFilter(): number {
    const base = this.config.distanceFilter ?? 10;
    if (this.config.disableElasticity) return base;
    const speed = this.lastLocation?.coords.speed ?? 0;
    if (speed <= 0) return base;
    // elasticity: scale filter with speed, like transistorsoft
    const multiplier = this.config.elasticityMultiplier ?? 1;
    return Math.round(base + (Math.max(0, speed) * multiplier * base) / 10);
  }

  private async buildLocation(
    raw: ExpoLocation.LocationObject,
    extras?: Record<string, unknown>,
    sample = false
  ): Promise<Location> {
    let batteryLevel = -1;
    let charging = false;
    try {
      batteryLevel = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      charging =
        state === Battery.BatteryState.CHARGING ||
        state === Battery.BatteryState.FULL;
    } catch {
      /* battery info unavailable */
    }

    const prev = this.lastPersistedCoords;
    if (prev && this.motion.moving && !sample) {
      this.odometer += haversine(
        prev.latitude,
        prev.longitude,
        raw.coords.latitude,
        raw.coords.longitude
      );
    }

    this.motion.feedSpeed(raw.coords.speed);

    return {
      uuid: uuidv4(),
      timestamp: new Date(raw.timestamp).toISOString(),
      odometer: Math.round(this.odometer * 100) / 100,
      is_moving: this.motion.moving,
      coords: {
        latitude: raw.coords.latitude,
        longitude: raw.coords.longitude,
        accuracy: raw.coords.accuracy ?? -1,
        speed: raw.coords.speed ?? -1,
        heading: raw.coords.heading ?? -1,
        altitude: raw.coords.altitude ?? -1,
        altitude_accuracy: raw.coords.altitudeAccuracy ?? undefined,
      },
      activity: { activity: this.motion.moving ? 'on_foot' : 'still', confidence: 75 },
      battery: { level: batteryLevel, is_charging: charging },
      extras: { ...(this.config.extras ?? {}), ...(extras ?? {}) },
      mock: (raw as { mocked?: boolean }).mocked,
      sample,
    };
  }

  private shouldPersist(location: Location): boolean {
    if (location.sample) return false;
    const mode = this.config.persistMode ?? PersistMode.ALL;
    if (mode === PersistMode.NONE) return false;
    if (mode === PersistMode.GEOFENCE && location.event !== 'geofence') return false;
    if (mode === PersistMode.LOCATION && location.event === 'geofence') return false;
    return true;
  }

  private async processLocation(location: Location): Promise<void> {
    this.lastLocation = location;
    this.lastPersistedCoords = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
    await database.setKV('odometer', this.odometer);

    if (this.shouldPersist(location)) {
      await database.insertLocation(location);
      await database.prune(
        this.config.maxDaysToPersist ?? 1,
        this.config.maxRecordsToPersist ?? -1
      );
    }

    this.bus.emit('location', location);
    await this.geofenceManager.evaluate(location);

    if (this.config.url && this.config.autoSync !== false) {
      void this.http.autoSync().catch(() => undefined);
    }
  }

  private async handleMotionChange(isMoving: boolean): Promise<void> {
    logger.info(`motionchange: ${isMoving ? 'moving' : 'stationary'}`);
    const location =
      (await this.fetchCurrentLocation().catch(() => null)) ?? this.lastLocation;
    if (location) {
      location.event = 'motionchange';
      location.is_moving = isMoving;
      this.bus.emit('motionchange', { isMoving, location } satisfies MotionChangeEvent);
      if (this.enabled) await this.processLocation(location);
    }
    // battery optimization: relax accuracy while stationary
    if (this.enabled && this.trackingMode === 1) {
      if (!isMoving && this.config.stopOnStationary) {
        await this.stop();
      } else {
        await this.startForegroundWatch(!isMoving);
      }
    }
  }

  private async fetchCurrentLocation(): Promise<Location> {
    const raw = await ExpoLocation.getCurrentPositionAsync({
      accuracy: this.mapAccuracy(this.config.desiredAccuracy),
    });
    return this.buildLocation(raw);
  }

  // -------------------------------------------------------------------------
  // getCurrentPosition / watchPosition
  // -------------------------------------------------------------------------

  async getCurrentPosition(options: CurrentPositionRequest = {}): Promise<Location> {
    const { timeout = 30, maximumAge = 0, samples = 3, persist = true } = options;

    if (maximumAge > 0 && this.lastLocation) {
      const age = Date.now() - Date.parse(this.lastLocation.timestamp);
      if (age <= maximumAge) return this.lastLocation;
    }

    const fetchOne = async (): Promise<Location> => {
      const raw = await ExpoLocation.getCurrentPositionAsync({
        accuracy: this.mapAccuracy(this.config.desiredAccuracy),
      });
      return this.buildLocation(raw, options.extras, true);
    };

    const withTimeout = <T>(p: Promise<T>): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 408 })), timeout * 1000)
        ),
      ]);

    let best: Location | null = null;
    const n = Math.max(1, Math.min(samples, 10));
    for (let i = 0; i < n; i++) {
      const loc = await withTimeout(fetchOne());
      if (
        !best ||
        (loc.coords.accuracy > 0 && loc.coords.accuracy < best.coords.accuracy)
      ) {
        best = loc;
      }
      if (
        options.desiredAccuracy &&
        best.coords.accuracy > 0 &&
        best.coords.accuracy <= options.desiredAccuracy
      ) {
        break;
      }
    }

    const result = { ...best!, sample: false };
    if (persist && this.shouldPersist(result)) {
      await database.insertLocation(result);
      if (this.config.url && this.config.autoSync !== false) {
        void this.http.autoSync().catch(() => undefined);
      }
    }
    this.bus.emit('location', result);
    return result;
  }

  async watchPosition(
    success: (location: Location) => void,
    failure?: (error: unknown) => void,
    options: WatchPositionRequest = {}
  ): Promise<void> {
    try {
      this.watchSub?.remove();
      this.watchSub = await ExpoLocation.watchPositionAsync(
        {
          accuracy: this.mapAccuracy(options.desiredAccuracy ?? this.config.desiredAccuracy),
          timeInterval: options.interval ?? 1000,
          distanceInterval: 0,
        },
        (raw) => {
          void (async () => {
            const location = await this.buildLocation(raw, options.extras, !options.persist);
            if (options.persist) await database.insertLocation(location);
            success(location);
          })();
        }
      );
    } catch (e) {
      failure?.(e);
    }
  }

  async stopWatchPosition(): Promise<void> {
    this.watchSub?.remove();
    this.watchSub = null;
  }

  // -------------------------------------------------------------------------
  // State & config
  // -------------------------------------------------------------------------

  async getState(): Promise<State> {
    return {
      ...this.config,
      enabled: this.enabled,
      isMoving: this.motion.moving,
      schedulerEnabled: this.scheduler.enabled,
      trackingMode: this.trackingMode,
      odometer: Math.round(this.odometer * 100) / 100,
    };
  }

  async setConfig(config: Config): Promise<State> {
    this.config = { ...this.config, ...config };
    await database.setKV('config', this.config);
    logger.level = this.config.logLevel ?? LogLevel.INFO;
    logger.debug = this.config.debug ?? false;
    this.http.setConfig(this.config);
    this.geofenceManager.setProximityRadius(this.config.geofenceProximityRadius ?? 1000);
    this.motion.setOptions({
      stopTimeoutMinutes: this.config.stopTimeout ?? 5,
      motionTriggerDelayMs: this.config.motionTriggerDelay ?? 0,
      disabled: this.config.disableMotionActivityUpdates ?? false,
    });
    if (config.schedule) this.scheduler.setSchedule(config.schedule);
    if (this.enabled && this.trackingMode === 1) {
      await this.startForegroundWatch();
      await this.startBackgroundUpdates();
    }
    return this.getState();
  }

  async reset(config: Config = {}): Promise<State> {
    this.config = { ...DEFAULT_CONFIG, ...config };
    await database.setKV('config', this.config);
    return this.getState();
  }

  // -------------------------------------------------------------------------
  // Persistence API
  // -------------------------------------------------------------------------

  getLocations(query?: SQLQuery): Promise<Location[]> {
    return database.getLocations(query);
  }

  getCount(): Promise<number> {
    return database.getCount();
  }

  async insertLocation(location: Partial<Location>): Promise<string> {
    const record: Location = {
      uuid: location.uuid ?? uuidv4(),
      timestamp: location.timestamp ?? new Date().toISOString(),
      odometer: location.odometer ?? this.odometer,
      is_moving: location.is_moving ?? this.motion.moving,
      coords: location.coords ?? {
        latitude: 0,
        longitude: 0,
        accuracy: -1,
        speed: -1,
        heading: -1,
        altitude: -1,
      },
      activity: location.activity ?? { activity: 'unknown', confidence: 0 },
      battery: location.battery ?? { level: -1, is_charging: false },
      extras: location.extras,
    };
    await database.insertLocation(record);
    return record.uuid;
  }

  async destroyLocations(): Promise<void> {
    await database.destroyLocations();
  }

  async destroyLocation(uuid: string): Promise<void> {
    await database.destroyLocation(uuid);
  }

  sync(): Promise<Location[]> {
    return this.http.sync();
  }

  // -------------------------------------------------------------------------
  // Odometer
  // -------------------------------------------------------------------------

  async getOdometer(): Promise<number> {
    return Math.round(this.odometer * 100) / 100;
  }

  async setOdometer(value: number): Promise<Location> {
    this.odometer = value;
    await database.setKV('odometer', value);
    return this.getCurrentPosition({ persist: false, samples: 1 });
  }

  resetOdometer(): Promise<Location> {
    return this.setOdometer(0);
  }

  // -------------------------------------------------------------------------
  // Geofencing API
  // -------------------------------------------------------------------------

  addGeofence(geofence: Geofence): Promise<boolean> {
    return this.geofenceManager.add(geofence);
  }

  addGeofences(geofences: Geofence[]): Promise<boolean> {
    return this.geofenceManager.addMany(geofences);
  }

  removeGeofence(identifier: string): Promise<boolean> {
    return this.geofenceManager.remove(identifier);
  }

  removeGeofences(identifiers?: string[]): Promise<boolean> {
    return this.geofenceManager.removeAll(identifiers);
  }

  getGeofences(): Promise<Geofence[]> {
    return this.geofenceManager.getGeofences();
  }

  getGeofence(identifier: string): Promise<Geofence | null> {
    return this.geofenceManager.getGeofence(identifier);
  }

  geofenceExists(identifier: string): Promise<boolean> {
    return this.geofenceManager.exists(identifier);
  }

  // -------------------------------------------------------------------------
  // Device / sensors / power
  // -------------------------------------------------------------------------

  async getSensors(): Promise<Sensors> {
    const [acc, gyro, mag] = await Promise.all([
      Accelerometer.isAvailableAsync().catch(() => false),
      Gyroscope.isAvailableAsync().catch(() => false),
      Magnetometer.isAvailableAsync().catch(() => false),
    ]);
    return {
      platform: Platform.OS,
      accelerometer: acc,
      gyroscope: gyro,
      magnetometer: mag,
      motion_hardware: acc && gyro,
    };
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    return {
      model: Device.modelName ?? 'unknown',
      manufacturer: Device.manufacturer ?? 'unknown',
      version: Device.osVersion ?? 'unknown',
      platform: Platform.OS,
      framework: 'react-native (expo)',
    };
  }

  async isPowerSaveMode(): Promise<boolean> {
    try {
      return await Battery.isLowPowerModeEnabledAsync();
    } catch {
      return false;
    }
  }

  private async startPowerSaveMonitoring(): Promise<void> {
    try {
      this.powerSaveSub?.remove();
      this.powerSaveSub = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
        this.bus.emit('powersavechange', lowPowerMode);
      });
    } catch {
      /* unsupported */
    }
  }

  // -------------------------------------------------------------------------
  // Permissions / provider
  // -------------------------------------------------------------------------

  async requestPermission(): Promise<AuthorizationStatus> {
    const fg = await ExpoLocation.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      const e = Object.assign(new Error('Location permission denied'), {
        code: AuthorizationStatus.DENIED,
      });
      throw e;
    }
    if (
      this.config.locationAuthorizationRequest !== 'WhenInUse' &&
      isBackgroundCapable()
    ) {
      const bg = await ExpoLocation.requestBackgroundPermissionsAsync().catch(() => null);
      if (bg?.status === 'granted') return AuthorizationStatus.ALWAYS;
    }
    return AuthorizationStatus.WHEN_IN_USE;
  }

  async requestTemporaryFullAccuracy(_purpose: string): Promise<AccuracyAuthorization> {
    // expo-location requests full accuracy via its permission flow;
    // reduced accuracy is reported on the permission response (iOS 14+)
    const fg = await ExpoLocation.getForegroundPermissionsAsync();
    const reduced =
      (fg as { ios?: { scope?: string } }).ios?.scope === 'reduced' ||
      (fg as { accuracy?: string }).accuracy === 'reduced';
    return reduced ? AccuracyAuthorization.REDUCED : AccuracyAuthorization.FULL;
  }

  async getProviderState(): Promise<ProviderChangeEvent> {
    const [services, fg] = await Promise.all([
      ExpoLocation.hasServicesEnabledAsync().catch(() => false),
      ExpoLocation.getForegroundPermissionsAsync(),
    ]);
    const bg = isBackgroundCapable()
      ? await ExpoLocation.getBackgroundPermissionsAsync().catch(() => null)
      : null;
    let status = AuthorizationStatus.NOT_DETERMINED;
    if (fg.status === 'denied') status = AuthorizationStatus.DENIED;
    else if (bg?.status === 'granted') status = AuthorizationStatus.ALWAYS;
    else if (fg.status === 'granted') status = AuthorizationStatus.WHEN_IN_USE;
    const reduced =
      (fg as { ios?: { scope?: string } }).ios?.scope === 'reduced';
    return {
      enabled: services && fg.status === 'granted',
      status,
      network: true,
      gps: services,
      accuracyAuthorization: reduced
        ? AccuracyAuthorization.REDUCED
        : AccuracyAuthorization.FULL,
    };
  }

  private startProviderMonitoring(): void {
    if (this.providerTimer) return;
    this.providerTimer = setInterval(() => {
      void (async () => {
        try {
          const state = await this.getProviderState();
          const key = JSON.stringify(state);
          if (this.lastProviderState !== null && key !== this.lastProviderState) {
            this.bus.emit('providerchange', state);
          }
          this.lastProviderState = key;
        } catch {
          /* ignore */
        }
      })();
    }, 15_000);
  }

  // -------------------------------------------------------------------------
  // Heartbeat
  // -------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = (this.config.heartbeatInterval ?? 60) * 1000;
    if (interval <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      void (async () => {
        if (!this.enabled || this.motion.moving) return;
        const location = this.lastLocation;
        if (location) {
          this.bus.emit('heartbeat', {
            location: { ...location, event: 'heartbeat' as const },
          } satisfies HeartbeatEvent);
        }
      })();
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Background tasks (iOS-style grace period emulation)
  // -------------------------------------------------------------------------

  async startBackgroundTask(): Promise<number> {
    return ++this.bgTaskCounter;
  }

  async stopBackgroundTask(_taskId: number): Promise<void> {
    /* no-op: JS timers run while app is alive; dev-build background
       execution is handled by expo-task-manager */
  }

  // -------------------------------------------------------------------------
  // Headless
  // -------------------------------------------------------------------------

  registerHeadlessTask(task: HeadlessTask): void {
    this.headlessTask = task;
  }

  // -------------------------------------------------------------------------
  // Logs / misc
  // -------------------------------------------------------------------------

  async getLog(): Promise<string> {
    return logger.getLog();
  }

  async destroyLog(): Promise<void> {
    return logger.destroyLog();
  }

  async emailLog(_email: string): Promise<string> {
    // Without native mail-composer access we return the log text;
    // apps can share it via expo-sharing / mailto.
    return logger.getLog();
  }

  async playSound(_soundId: number | string): Promise<void> {
    /* debug sounds require native assets — no-op */
  }

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  onLocation(
    success: (location: Location) => void,
    failure?: (error: unknown) => void
  ): Subscription {
    void failure;
    return this.bus.on('location', (e) => success(e as Location));
  }

  onMotionChange(fn: (event: MotionChangeEvent) => void): Subscription {
    return this.bus.on('motionchange', (e) => fn(e as MotionChangeEvent));
  }

  onActivityChange(fn: (event: ActivityChangeEvent) => void): Subscription {
    return this.bus.on('activitychange', (e) => fn(e as ActivityChangeEvent));
  }

  onGeofence(fn: (event: GeofenceEvent) => void): Subscription {
    return this.bus.on('geofence', (e) => fn(e as GeofenceEvent));
  }

  onGeofencesChange(fn: (event: GeofencesChangeEvent) => void): Subscription {
    return this.bus.on('geofenceschange', (e) => fn(e as GeofencesChangeEvent));
  }

  onHeartbeat(fn: (event: HeartbeatEvent) => void): Subscription {
    return this.bus.on('heartbeat', (e) => fn(e as HeartbeatEvent));
  }

  onHttp(fn: (event: HttpEvent) => void): Subscription {
    return this.bus.on('http', (e) => fn(e as HttpEvent));
  }

  onProviderChange(fn: (event: ProviderChangeEvent) => void): Subscription {
    return this.bus.on('providerchange', (e) => fn(e as ProviderChangeEvent));
  }

  onConnectivityChange(fn: (event: ConnectivityChangeEvent) => void): Subscription {
    return this.bus.on('connectivitychange', (e) => fn(e as ConnectivityChangeEvent));
  }

  onPowerSaveChange(fn: (isPowerSaveMode: boolean) => void): Subscription {
    return this.bus.on('powersavechange', (e) => fn(e as boolean));
  }

  onEnabledChange(fn: (enabled: boolean) => void): Subscription {
    return this.bus.on('enabledchange', (e) => fn(e as boolean));
  }

  onSchedule(fn: (event: ScheduleEvent) => void): Subscription {
    return this.bus.on('schedule', (e) => fn(e as ScheduleEvent));
  }

  onAuthorization(fn: (event: AuthorizationEvent) => void): Subscription {
    return this.bus.on('authorization', (e) => fn(e as AuthorizationEvent));
  }

  onNotificationAction(fn: (buttonId: string) => void): Subscription {
    // Requires custom native code — never fires in Expo-managed apps.
    return this.bus.on('notificationaction', (e) => fn(e as string));
  }

  removeListeners(): void {
    this.bus.removeAll();
  }

  removeAllListeners(): void {
    this.bus.removeAll();
  }
}

export const BackgroundGeolocation = new BackgroundGeolocationImpl();
