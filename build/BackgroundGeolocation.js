"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackgroundGeolocation = exports.LOCATION_TASK = void 0;
const ExpoLocation = __importStar(require("expo-location"));
const TaskManager = __importStar(require("expo-task-manager"));
const Battery = __importStar(require("expo-battery"));
const Device = __importStar(require("expo-device"));
const react_native_1 = require("react-native");
const expo_sensors_1 = require("expo-sensors");
const Database_1 = require("./Database");
const Logger_1 = require("./Logger");
const EventBus_1 = require("./EventBus");
const HttpService_1 = require("./HttpService");
const MotionDetector_1 = require("./MotionDetector");
const GeofenceManager_1 = require("./GeofenceManager");
const Scheduler_1 = require("./Scheduler");
const geo_1 = require("./geo");
const environment_1 = require("./environment");
const types_1 = require("./types");
exports.LOCATION_TASK = 'expo-background-tracking.location';
const DEFAULT_CONFIG = {
    desiredAccuracy: types_1.DesiredAccuracy.HIGH,
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
    httpTimeout: 60000,
    maxDaysToPersist: 1,
    maxRecordsToPersist: -1,
    persistMode: types_1.PersistMode.ALL,
    stopOnTerminate: true,
    startOnBoot: false,
    debug: false,
    logLevel: types_1.LogLevel.INFO,
    logMaxDays: 3,
    locationAuthorizationRequest: 'Always',
    foregroundService: true,
};
class BackgroundGeolocationImpl {
    constructor() {
        // re-exported enums (parity with transistorsoft statics)
        this.DESIRED_ACCURACY_NAVIGATION = types_1.DesiredAccuracy.NAVIGATION;
        this.DESIRED_ACCURACY_HIGH = types_1.DesiredAccuracy.HIGH;
        this.DESIRED_ACCURACY_MEDIUM = types_1.DesiredAccuracy.MEDIUM;
        this.DESIRED_ACCURACY_LOW = types_1.DesiredAccuracy.LOW;
        this.DESIRED_ACCURACY_VERY_LOW = types_1.DesiredAccuracy.VERY_LOW;
        this.LOG_LEVEL_OFF = types_1.LogLevel.OFF;
        this.LOG_LEVEL_ERROR = types_1.LogLevel.ERROR;
        this.LOG_LEVEL_WARNING = types_1.LogLevel.WARNING;
        this.LOG_LEVEL_INFO = types_1.LogLevel.INFO;
        this.LOG_LEVEL_DEBUG = types_1.LogLevel.DEBUG;
        this.LOG_LEVEL_VERBOSE = types_1.LogLevel.VERBOSE;
        this.PERSIST_MODE_ALL = types_1.PersistMode.ALL;
        this.PERSIST_MODE_LOCATION = types_1.PersistMode.LOCATION;
        this.PERSIST_MODE_GEOFENCE = types_1.PersistMode.GEOFENCE;
        this.PERSIST_MODE_NONE = types_1.PersistMode.NONE;
        this.AUTHORIZATION_STATUS_ALWAYS = types_1.AuthorizationStatus.ALWAYS;
        this.AUTHORIZATION_STATUS_WHEN_IN_USE = types_1.AuthorizationStatus.WHEN_IN_USE;
        this.AUTHORIZATION_STATUS_DENIED = types_1.AuthorizationStatus.DENIED;
        this.logger = Logger_1.logger;
        this.bus = new EventBus_1.EventBus();
        this.http = new HttpService_1.HttpService(this.bus);
        this.geofenceManager = new GeofenceManager_1.GeofenceManager(this.bus);
        this.config = { ...DEFAULT_CONFIG };
        this.enabled = false;
        this.trackingMode = 1;
        this.odometer = 0;
        this.lastLocation = null;
        this.lastPersistedCoords = null;
        this.isReady = false;
        this.foregroundSub = null;
        this.watchSub = null;
        this.heartbeatTimer = null;
        this.providerTimer = null;
        this.powerSaveSub = null;
        this.lastProviderState = null;
        this.headlessTask = null;
        this.bgTaskCounter = 0;
        this.motion = new MotionDetector_1.MotionDetector({
            stopTimeoutMinutes: DEFAULT_CONFIG.stopTimeout,
            motionTriggerDelayMs: DEFAULT_CONFIG.motionTriggerDelay,
            disabled: false,
            onMotionChange: (isMoving) => void this.handleMotionChange(isMoving),
            onActivityChange: (activity) => this.bus.emit('activitychange', activity),
        });
        this.scheduler = new Scheduler_1.Scheduler((scheduleEnabled) => {
            void (async () => {
                if (scheduleEnabled && !this.enabled)
                    await this.start();
                else if (!scheduleEnabled && this.enabled)
                    await this.stop();
                const state = await this.getState();
                this.bus.emit('schedule', { enabled: scheduleEnabled, state });
            })();
        });
        try {
            this.defineTasks();
        }
        catch (e) {
            // never crash the app at import time (e.g. exotic environments)
            console.warn('[expo-background-tracking] defineTasks failed:', e);
        }
    }
    // -------------------------------------------------------------------------
    // TaskManager background tasks (effective in dev builds; inert in Expo Go)
    // -------------------------------------------------------------------------
    defineTasks() {
        if (!TaskManager.isTaskDefined(exports.LOCATION_TASK)) {
            TaskManager.defineTask(exports.LOCATION_TASK, async ({ data, error }) => {
                if (error) {
                    Logger_1.logger.error(`Background location task error: ${error.message}`);
                    return;
                }
                const { locations } = (data ?? {});
                if (!locations?.length)
                    return;
                for (const raw of locations) {
                    const location = await this.buildLocation(raw);
                    await this.processLocation(location);
                    await this.dispatchHeadless({ name: 'location', params: location });
                }
            });
        }
        if (!TaskManager.isTaskDefined(GeofenceManager_1.GEOFENCE_TASK)) {
            TaskManager.defineTask(GeofenceManager_1.GEOFENCE_TASK, async ({ data, error }) => {
                if (error) {
                    Logger_1.logger.error(`Geofence task error: ${error.message}`);
                    return;
                }
                const event = data;
                const action = event.eventType === ExpoLocation.GeofencingEventType.Enter ? 'ENTER' : 'EXIT';
                const location = this.lastLocation ?? (await this.fetchCurrentLocation().catch(() => null));
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
    async dispatchHeadless(event) {
        if (this.headlessTask) {
            try {
                await this.headlessTask(event);
            }
            catch (e) {
                Logger_1.logger.error(`Headless task error: ${String(e)}`);
            }
        }
    }
    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    async ready(config = {}) {
        if (this.isReady && !config.reset)
            return this.getState();
        const persisted = config.reset
            ? null
            : await Database_1.database.getKV('config');
        this.config = { ...DEFAULT_CONFIG, ...(persisted ?? {}), ...config };
        await Database_1.database.setKV('config', this.config);
        Logger_1.logger.level = this.config.logLevel ?? types_1.LogLevel.INFO;
        Logger_1.logger.debug = this.config.debug ?? false;
        this.http.setConfig(this.config);
        this.geofenceManager.setProximityRadius(this.config.geofenceProximityRadius ?? 1000);
        this.motion.setOptions({
            stopTimeoutMinutes: this.config.stopTimeout ?? 5,
            motionTriggerDelayMs: this.config.motionTriggerDelay ?? 0,
            disabled: this.config.disableMotionActivityUpdates ?? false,
        });
        if (this.config.schedule?.length)
            this.scheduler.setSchedule(this.config.schedule);
        this.odometer = (await Database_1.database.getKV('odometer')) ?? 0;
        const wasEnabled = (await Database_1.database.getKV('enabled')) ?? false;
        this.trackingMode = ((await Database_1.database.getKV('trackingMode')) ?? 1);
        await Database_1.database.prune(this.config.maxDaysToPersist ?? 1, this.config.maxRecordsToPersist ?? -1);
        await Database_1.database.pruneLogs(this.config.logMaxDays ?? 3);
        this.http.startConnectivityMonitoring();
        this.startProviderMonitoring();
        void this.startPowerSaveMonitoring();
        this.isReady = true;
        Logger_1.logger.info(`ready() — env=${(0, environment_1.isExpoGo)() ? 'Expo Go (foreground-only)' : 'dev build (background OK)'}`);
        if (wasEnabled && this.config.stopOnTerminate === false) {
            // restore tracking after app relaunch
            if (this.trackingMode === 1)
                await this.start();
            else
                await this.startGeofences();
        }
        return this.getState();
    }
    async start() {
        this.assertReady('start');
        this.trackingMode = 1;
        await Database_1.database.setKV('trackingMode', 1);
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
    async stop() {
        this.foregroundSub?.remove();
        this.foregroundSub = null;
        this.stopHeartbeat();
        this.motion.stop();
        await this.geofenceManager.stop();
        if ((0, environment_1.isBackgroundCapable)()) {
            try {
                const started = await ExpoLocation.hasStartedLocationUpdatesAsync(exports.LOCATION_TASK);
                if (started)
                    await ExpoLocation.stopLocationUpdatesAsync(exports.LOCATION_TASK);
            }
            catch {
                /* ignore */
            }
        }
        this.setEnabled(false);
        return this.getState();
    }
    /** Geofences-only mode: no continuous location tracking. */
    async startGeofences() {
        this.assertReady('startGeofences');
        this.trackingMode = 0;
        await Database_1.database.setKV('trackingMode', 0);
        await this.requestPermission();
        await this.geofenceManager.start();
        // low-power significant-movement watch to evaluate software geofences
        await this.startForegroundWatch(/* lowPower */ true);
        this.setEnabled(true);
        return this.getState();
    }
    startSchedule() {
        this.assertReady('startSchedule');
        if (this.config.schedule?.length)
            this.scheduler.setSchedule(this.config.schedule);
        this.scheduler.start();
        return this.getState();
    }
    stopSchedule() {
        this.scheduler.stop();
        return this.getState();
    }
    async changePace(isMoving) {
        this.assertReady('changePace');
        this.motion.setMoving(isMoving);
    }
    setEnabled(enabled) {
        if (this.enabled === enabled)
            return;
        this.enabled = enabled;
        void Database_1.database.setKV('enabled', enabled);
        this.bus.emit('enabledchange', enabled);
        Logger_1.logger.info(`enabledchange: ${enabled}`);
    }
    assertReady(method) {
        if (!this.isReady) {
            throw new Error(`BackgroundGeolocation.${method}() called before ready()`);
        }
    }
    // -------------------------------------------------------------------------
    // Location streams
    // -------------------------------------------------------------------------
    mapAccuracy(a) {
        switch (a) {
            case types_1.DesiredAccuracy.NAVIGATION:
                return ExpoLocation.LocationAccuracy.BestForNavigation;
            case types_1.DesiredAccuracy.HIGH:
                return ExpoLocation.LocationAccuracy.Highest;
            case types_1.DesiredAccuracy.MEDIUM:
                return ExpoLocation.LocationAccuracy.Balanced;
            case types_1.DesiredAccuracy.LOW:
                return ExpoLocation.LocationAccuracy.Low;
            case types_1.DesiredAccuracy.VERY_LOW:
            case types_1.DesiredAccuracy.LOWEST:
                return ExpoLocation.LocationAccuracy.Lowest;
            default:
                return ExpoLocation.LocationAccuracy.High;
        }
    }
    async startForegroundWatch(lowPower = false) {
        this.foregroundSub?.remove();
        this.foregroundSub = await ExpoLocation.watchPositionAsync({
            accuracy: lowPower
                ? ExpoLocation.LocationAccuracy.Balanced
                : this.mapAccuracy(this.config.desiredAccuracy),
            distanceInterval: this.effectiveDistanceFilter(),
            timeInterval: this.config.deferTime,
        }, (raw) => {
            void (async () => {
                const location = await this.buildLocation(raw);
                await this.processLocation(location);
            })();
        });
    }
    async startBackgroundUpdates() {
        if (!(0, environment_1.isBackgroundCapable)()) {
            Logger_1.logger.warn('Expo Go detected: background tracking unavailable (foreground-only). ' +
                'Use a development build for full background support.');
            return;
        }
        try {
            await ExpoLocation.startLocationUpdatesAsync(exports.LOCATION_TASK, {
                accuracy: this.mapAccuracy(this.config.desiredAccuracy),
                distanceInterval: this.effectiveDistanceFilter(),
                deferredUpdatesInterval: this.config.deferTime,
                pausesUpdatesAutomatically: this.config.pausesLocationUpdatesAutomatically,
                showsBackgroundLocationIndicator: this.config.showsBackgroundLocationIndicator,
                activityType: this.config.activityType,
                foregroundService: react_native_1.Platform.OS === 'android' && this.config.foregroundService !== false
                    ? {
                        notificationTitle: this.config.notification?.title ?? 'Location tracking',
                        notificationBody: this.config.notification?.text ?? 'Tracking is active',
                        notificationColor: this.config.notification?.color,
                        killServiceOnDestroy: this.config.stopOnTerminate !== false,
                    }
                    : undefined,
            });
            Logger_1.logger.info('Background location updates started');
        }
        catch (e) {
            Logger_1.logger.error(`startLocationUpdatesAsync failed: ${String(e)}`);
        }
    }
    effectiveDistanceFilter() {
        const base = this.config.distanceFilter ?? 10;
        if (this.config.disableElasticity)
            return base;
        const speed = this.lastLocation?.coords.speed ?? 0;
        if (speed <= 0)
            return base;
        // elasticity: scale filter with speed, like transistorsoft
        const multiplier = this.config.elasticityMultiplier ?? 1;
        return Math.round(base + (Math.max(0, speed) * multiplier * base) / 10);
    }
    async buildLocation(raw, extras, sample = false) {
        let batteryLevel = -1;
        let charging = false;
        try {
            batteryLevel = await Battery.getBatteryLevelAsync();
            const state = await Battery.getBatteryStateAsync();
            charging =
                state === Battery.BatteryState.CHARGING ||
                    state === Battery.BatteryState.FULL;
        }
        catch {
            /* battery info unavailable */
        }
        const prev = this.lastPersistedCoords;
        if (prev && this.motion.moving && !sample) {
            this.odometer += (0, geo_1.haversine)(prev.latitude, prev.longitude, raw.coords.latitude, raw.coords.longitude);
        }
        this.motion.feedSpeed(raw.coords.speed);
        return {
            uuid: (0, geo_1.uuidv4)(),
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
            mock: raw.mocked,
            sample,
        };
    }
    shouldPersist(location) {
        if (location.sample)
            return false;
        const mode = this.config.persistMode ?? types_1.PersistMode.ALL;
        if (mode === types_1.PersistMode.NONE)
            return false;
        if (mode === types_1.PersistMode.GEOFENCE && location.event !== 'geofence')
            return false;
        if (mode === types_1.PersistMode.LOCATION && location.event === 'geofence')
            return false;
        return true;
    }
    async processLocation(location) {
        this.lastLocation = location;
        this.lastPersistedCoords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };
        await Database_1.database.setKV('odometer', this.odometer);
        if (this.shouldPersist(location)) {
            await Database_1.database.insertLocation(location);
            await Database_1.database.prune(this.config.maxDaysToPersist ?? 1, this.config.maxRecordsToPersist ?? -1);
        }
        this.bus.emit('location', location);
        await this.geofenceManager.evaluate(location);
        if (this.config.url && this.config.autoSync !== false) {
            void this.http.autoSync().catch(() => undefined);
        }
    }
    async handleMotionChange(isMoving) {
        Logger_1.logger.info(`motionchange: ${isMoving ? 'moving' : 'stationary'}`);
        const location = (await this.fetchCurrentLocation().catch(() => null)) ?? this.lastLocation;
        if (location) {
            location.event = 'motionchange';
            location.is_moving = isMoving;
            this.bus.emit('motionchange', { isMoving, location });
            if (this.enabled)
                await this.processLocation(location);
        }
        // battery optimization: relax accuracy while stationary
        if (this.enabled && this.trackingMode === 1) {
            if (!isMoving && this.config.stopOnStationary) {
                await this.stop();
            }
            else {
                await this.startForegroundWatch(!isMoving);
            }
        }
    }
    async fetchCurrentLocation() {
        const raw = await ExpoLocation.getCurrentPositionAsync({
            accuracy: this.mapAccuracy(this.config.desiredAccuracy),
        });
        return this.buildLocation(raw);
    }
    // -------------------------------------------------------------------------
    // getCurrentPosition / watchPosition
    // -------------------------------------------------------------------------
    async getCurrentPosition(options = {}) {
        const { timeout = 30, maximumAge = 0, samples = 3, persist = true } = options;
        if (maximumAge > 0 && this.lastLocation) {
            const age = Date.now() - Date.parse(this.lastLocation.timestamp);
            if (age <= maximumAge)
                return this.lastLocation;
        }
        const fetchOne = async () => {
            const raw = await ExpoLocation.getCurrentPositionAsync({
                accuracy: this.mapAccuracy(this.config.desiredAccuracy),
            });
            return this.buildLocation(raw, options.extras, true);
        };
        const withTimeout = (p) => Promise.race([
            p,
            new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 408 })), timeout * 1000)),
        ]);
        let best = null;
        const n = Math.max(1, Math.min(samples, 10));
        for (let i = 0; i < n; i++) {
            const loc = await withTimeout(fetchOne());
            if (!best ||
                (loc.coords.accuracy > 0 && loc.coords.accuracy < best.coords.accuracy)) {
                best = loc;
            }
            if (options.desiredAccuracy &&
                best.coords.accuracy > 0 &&
                best.coords.accuracy <= options.desiredAccuracy) {
                break;
            }
        }
        const result = { ...best, sample: false };
        if (persist && this.shouldPersist(result)) {
            await Database_1.database.insertLocation(result);
            if (this.config.url && this.config.autoSync !== false) {
                void this.http.autoSync().catch(() => undefined);
            }
        }
        this.bus.emit('location', result);
        return result;
    }
    async watchPosition(success, failure, options = {}) {
        try {
            this.watchSub?.remove();
            this.watchSub = await ExpoLocation.watchPositionAsync({
                accuracy: this.mapAccuracy(options.desiredAccuracy ?? this.config.desiredAccuracy),
                timeInterval: options.interval ?? 1000,
                distanceInterval: 0,
            }, (raw) => {
                void (async () => {
                    const location = await this.buildLocation(raw, options.extras, !options.persist);
                    if (options.persist)
                        await Database_1.database.insertLocation(location);
                    success(location);
                })();
            });
        }
        catch (e) {
            failure?.(e);
        }
    }
    async stopWatchPosition() {
        this.watchSub?.remove();
        this.watchSub = null;
    }
    // -------------------------------------------------------------------------
    // State & config
    // -------------------------------------------------------------------------
    async getState() {
        return {
            ...this.config,
            enabled: this.enabled,
            isMoving: this.motion.moving,
            schedulerEnabled: this.scheduler.enabled,
            trackingMode: this.trackingMode,
            odometer: Math.round(this.odometer * 100) / 100,
        };
    }
    async setConfig(config) {
        this.config = { ...this.config, ...config };
        await Database_1.database.setKV('config', this.config);
        Logger_1.logger.level = this.config.logLevel ?? types_1.LogLevel.INFO;
        Logger_1.logger.debug = this.config.debug ?? false;
        this.http.setConfig(this.config);
        this.geofenceManager.setProximityRadius(this.config.geofenceProximityRadius ?? 1000);
        this.motion.setOptions({
            stopTimeoutMinutes: this.config.stopTimeout ?? 5,
            motionTriggerDelayMs: this.config.motionTriggerDelay ?? 0,
            disabled: this.config.disableMotionActivityUpdates ?? false,
        });
        if (config.schedule)
            this.scheduler.setSchedule(config.schedule);
        if (this.enabled && this.trackingMode === 1) {
            await this.startForegroundWatch();
            await this.startBackgroundUpdates();
        }
        return this.getState();
    }
    async reset(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        await Database_1.database.setKV('config', this.config);
        return this.getState();
    }
    // -------------------------------------------------------------------------
    // Persistence API
    // -------------------------------------------------------------------------
    getLocations(query) {
        return Database_1.database.getLocations(query);
    }
    getCount() {
        return Database_1.database.getCount();
    }
    async insertLocation(location) {
        const record = {
            uuid: location.uuid ?? (0, geo_1.uuidv4)(),
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
        await Database_1.database.insertLocation(record);
        return record.uuid;
    }
    async destroyLocations() {
        await Database_1.database.destroyLocations();
    }
    async destroyLocation(uuid) {
        await Database_1.database.destroyLocation(uuid);
    }
    sync() {
        return this.http.sync();
    }
    // -------------------------------------------------------------------------
    // Odometer
    // -------------------------------------------------------------------------
    async getOdometer() {
        return Math.round(this.odometer * 100) / 100;
    }
    async setOdometer(value) {
        this.odometer = value;
        await Database_1.database.setKV('odometer', value);
        return this.getCurrentPosition({ persist: false, samples: 1 });
    }
    resetOdometer() {
        return this.setOdometer(0);
    }
    // -------------------------------------------------------------------------
    // Geofencing API
    // -------------------------------------------------------------------------
    addGeofence(geofence) {
        return this.geofenceManager.add(geofence);
    }
    addGeofences(geofences) {
        return this.geofenceManager.addMany(geofences);
    }
    removeGeofence(identifier) {
        return this.geofenceManager.remove(identifier);
    }
    removeGeofences(identifiers) {
        return this.geofenceManager.removeAll(identifiers);
    }
    getGeofences() {
        return this.geofenceManager.getGeofences();
    }
    getGeofence(identifier) {
        return this.geofenceManager.getGeofence(identifier);
    }
    geofenceExists(identifier) {
        return this.geofenceManager.exists(identifier);
    }
    // -------------------------------------------------------------------------
    // Device / sensors / power
    // -------------------------------------------------------------------------
    async getSensors() {
        const [acc, gyro, mag] = await Promise.all([
            expo_sensors_1.Accelerometer.isAvailableAsync().catch(() => false),
            expo_sensors_1.Gyroscope.isAvailableAsync().catch(() => false),
            expo_sensors_1.Magnetometer.isAvailableAsync().catch(() => false),
        ]);
        return {
            platform: react_native_1.Platform.OS,
            accelerometer: acc,
            gyroscope: gyro,
            magnetometer: mag,
            motion_hardware: acc && gyro,
        };
    }
    async getDeviceInfo() {
        return {
            model: Device.modelName ?? 'unknown',
            manufacturer: Device.manufacturer ?? 'unknown',
            version: Device.osVersion ?? 'unknown',
            platform: react_native_1.Platform.OS,
            framework: 'react-native (expo)',
        };
    }
    async isPowerSaveMode() {
        try {
            return await Battery.isLowPowerModeEnabledAsync();
        }
        catch {
            return false;
        }
    }
    async startPowerSaveMonitoring() {
        try {
            this.powerSaveSub?.remove();
            this.powerSaveSub = Battery.addLowPowerModeListener(({ lowPowerMode }) => {
                this.bus.emit('powersavechange', lowPowerMode);
            });
        }
        catch {
            /* unsupported */
        }
    }
    // -------------------------------------------------------------------------
    // Permissions / provider
    // -------------------------------------------------------------------------
    async requestPermission() {
        const fg = await ExpoLocation.requestForegroundPermissionsAsync();
        if (fg.status !== 'granted') {
            const e = Object.assign(new Error('Location permission denied'), {
                code: types_1.AuthorizationStatus.DENIED,
            });
            throw e;
        }
        if (this.config.locationAuthorizationRequest !== 'WhenInUse' &&
            (0, environment_1.isBackgroundCapable)()) {
            const bg = await ExpoLocation.requestBackgroundPermissionsAsync().catch(() => null);
            if (bg?.status === 'granted')
                return types_1.AuthorizationStatus.ALWAYS;
        }
        return types_1.AuthorizationStatus.WHEN_IN_USE;
    }
    async requestTemporaryFullAccuracy(_purpose) {
        // expo-location requests full accuracy via its permission flow;
        // reduced accuracy is reported on the permission response (iOS 14+)
        const fg = await ExpoLocation.getForegroundPermissionsAsync();
        const reduced = fg.ios?.scope === 'reduced' ||
            fg.accuracy === 'reduced';
        return reduced ? types_1.AccuracyAuthorization.REDUCED : types_1.AccuracyAuthorization.FULL;
    }
    async getProviderState() {
        const [services, fg] = await Promise.all([
            ExpoLocation.hasServicesEnabledAsync().catch(() => false),
            ExpoLocation.getForegroundPermissionsAsync(),
        ]);
        const bg = (0, environment_1.isBackgroundCapable)()
            ? await ExpoLocation.getBackgroundPermissionsAsync().catch(() => null)
            : null;
        let status = types_1.AuthorizationStatus.NOT_DETERMINED;
        if (fg.status === 'denied')
            status = types_1.AuthorizationStatus.DENIED;
        else if (bg?.status === 'granted')
            status = types_1.AuthorizationStatus.ALWAYS;
        else if (fg.status === 'granted')
            status = types_1.AuthorizationStatus.WHEN_IN_USE;
        const reduced = fg.ios?.scope === 'reduced';
        return {
            enabled: services && fg.status === 'granted',
            status,
            network: true,
            gps: services,
            accuracyAuthorization: reduced
                ? types_1.AccuracyAuthorization.REDUCED
                : types_1.AccuracyAuthorization.FULL,
        };
    }
    startProviderMonitoring() {
        if (this.providerTimer)
            return;
        this.providerTimer = setInterval(() => {
            void (async () => {
                try {
                    const state = await this.getProviderState();
                    const key = JSON.stringify(state);
                    if (this.lastProviderState !== null && key !== this.lastProviderState) {
                        this.bus.emit('providerchange', state);
                    }
                    this.lastProviderState = key;
                }
                catch {
                    /* ignore */
                }
            })();
        }, 15000);
    }
    // -------------------------------------------------------------------------
    // Heartbeat
    // -------------------------------------------------------------------------
    startHeartbeat() {
        this.stopHeartbeat();
        const interval = (this.config.heartbeatInterval ?? 60) * 1000;
        if (interval <= 0)
            return;
        this.heartbeatTimer = setInterval(() => {
            void (async () => {
                if (!this.enabled || this.motion.moving)
                    return;
                const location = this.lastLocation;
                if (location) {
                    this.bus.emit('heartbeat', {
                        location: { ...location, event: 'heartbeat' },
                    });
                }
            })();
        }, interval);
    }
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    // -------------------------------------------------------------------------
    // Background tasks (iOS-style grace period emulation)
    // -------------------------------------------------------------------------
    async startBackgroundTask() {
        return ++this.bgTaskCounter;
    }
    async stopBackgroundTask(_taskId) {
        /* no-op: JS timers run while app is alive; dev-build background
           execution is handled by expo-task-manager */
    }
    // -------------------------------------------------------------------------
    // Headless
    // -------------------------------------------------------------------------
    registerHeadlessTask(task) {
        this.headlessTask = task;
    }
    // -------------------------------------------------------------------------
    // Logs / misc
    // -------------------------------------------------------------------------
    async getLog() {
        return Logger_1.logger.getLog();
    }
    async destroyLog() {
        return Logger_1.logger.destroyLog();
    }
    async emailLog(_email) {
        // Without native mail-composer access we return the log text;
        // apps can share it via expo-sharing / mailto.
        return Logger_1.logger.getLog();
    }
    async playSound(_soundId) {
        /* debug sounds require native assets — no-op */
    }
    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------
    onLocation(success, failure) {
        void failure;
        return this.bus.on('location', (e) => success(e));
    }
    onMotionChange(fn) {
        return this.bus.on('motionchange', (e) => fn(e));
    }
    onActivityChange(fn) {
        return this.bus.on('activitychange', (e) => fn(e));
    }
    onGeofence(fn) {
        return this.bus.on('geofence', (e) => fn(e));
    }
    onGeofencesChange(fn) {
        return this.bus.on('geofenceschange', (e) => fn(e));
    }
    onHeartbeat(fn) {
        return this.bus.on('heartbeat', (e) => fn(e));
    }
    onHttp(fn) {
        return this.bus.on('http', (e) => fn(e));
    }
    onProviderChange(fn) {
        return this.bus.on('providerchange', (e) => fn(e));
    }
    onConnectivityChange(fn) {
        return this.bus.on('connectivitychange', (e) => fn(e));
    }
    onPowerSaveChange(fn) {
        return this.bus.on('powersavechange', (e) => fn(e));
    }
    onEnabledChange(fn) {
        return this.bus.on('enabledchange', (e) => fn(e));
    }
    onSchedule(fn) {
        return this.bus.on('schedule', (e) => fn(e));
    }
    onAuthorization(fn) {
        return this.bus.on('authorization', (e) => fn(e));
    }
    onNotificationAction(fn) {
        // Requires custom native code — never fires in Expo-managed apps.
        return this.bus.on('notificationaction', (e) => fn(e));
    }
    removeListeners() {
        this.bus.removeAll();
    }
    removeAllListeners() {
        this.bus.removeAll();
    }
}
exports.BackgroundGeolocation = new BackgroundGeolocationImpl();
