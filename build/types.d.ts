/**
 * expo-background-tracking — Type definitions.
 * API surface modeled after transistorsoft/react-native-background-geolocation.
 */
export declare enum DesiredAccuracy {
    NAVIGATION = -2,
    HIGH = -1,
    MEDIUM = 10,
    LOW = 100,
    VERY_LOW = 1000,
    LOWEST = 3000
}
export declare enum LogLevel {
    OFF = 0,
    ERROR = 1,
    WARNING = 2,
    INFO = 3,
    DEBUG = 4,
    VERBOSE = 5
}
export declare enum ActivityType {
    OTHER = 1,
    AUTOMOTIVE_NAVIGATION = 2,
    FITNESS = 3,
    OTHER_NAVIGATION = 4,
    AIRBORNE = 5
}
export declare enum PersistMode {
    ALL = 2,
    LOCATION = 1,
    GEOFENCE = -1,
    NONE = 0
}
export declare enum AuthorizationStatus {
    NOT_DETERMINED = 0,
    RESTRICTED = 1,
    DENIED = 2,
    ALWAYS = 3,
    WHEN_IN_USE = 4
}
export declare enum AccuracyAuthorization {
    FULL = 0,
    REDUCED = 1
}
export type MotionActivityType = 'still' | 'walking' | 'on_foot' | 'running' | 'on_bicycle' | 'in_vehicle' | 'unknown';
export type GeofenceAction = 'ENTER' | 'EXIT' | 'DWELL';
export type TrackingMode = 0 | 1;
export type LocationError = 0 | 1 | 2 | 3 | 408 | 499;
export interface Coords {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number;
    speed_accuracy?: number;
    heading: number;
    heading_accuracy?: number;
    altitude: number;
    altitude_accuracy?: number;
    ellipsoidal_altitude?: number;
}
export interface Battery {
    level: number;
    is_charging: boolean;
}
export interface ActivityChangeEvent {
    activity: MotionActivityType;
    confidence: number;
}
export interface Location {
    uuid: string;
    timestamp: string;
    age?: number;
    odometer: number;
    is_moving: boolean;
    coords: Coords;
    activity: ActivityChangeEvent;
    battery: Battery;
    extras?: Record<string, unknown>;
    event?: 'motionchange' | 'geofence' | 'heartbeat' | 'providerchange';
    mock?: boolean;
    sample?: boolean;
}
export interface MotionChangeEvent {
    isMoving: boolean;
    location: Location;
}
export interface HeartbeatEvent {
    location: Location;
}
export interface Geofence {
    identifier: string;
    radius?: number;
    latitude?: number;
    longitude?: number;
    /** Polygon geofence: list of [latitude, longitude] vertices. */
    vertices?: Array<[number, number]>;
    notifyOnEntry?: boolean;
    notifyOnExit?: boolean;
    notifyOnDwell?: boolean;
    loiteringDelay?: number;
    extras?: Record<string, unknown>;
}
export interface GeofenceEvent {
    identifier: string;
    action: GeofenceAction;
    location: Location;
    extras?: Record<string, unknown>;
}
export interface GeofencesChangeEvent {
    on: Geofence[];
    off: string[];
}
export interface HttpEvent {
    success: boolean;
    status: number;
    responseText: string;
}
export interface Authorization {
    strategy?: 'JWT' | 'BASIC';
    accessToken?: string;
    refreshToken?: string;
    refreshUrl?: string;
    refreshPayload?: Record<string, string>;
    refreshHeaders?: Record<string, string>;
    expires?: number;
}
export interface AuthorizationEvent {
    success: boolean;
    status?: number;
    response?: Record<string, unknown>;
    error?: string;
}
export interface ProviderChangeEvent {
    enabled: boolean;
    status: AuthorizationStatus;
    network: boolean;
    gps: boolean;
    accuracyAuthorization: AccuracyAuthorization;
}
export interface ConnectivityChangeEvent {
    connected: boolean;
}
/** e.g. "1-5 09:00-17:00" (ISO day numbers 1=Monday … 7=Sunday) */
export type ScheduleItem = string;
export interface ScheduleEvent {
    enabled: boolean;
    state: State;
}
export interface Notification {
    title?: string;
    text?: string;
    color?: string;
    channelName?: string;
    smallIcon?: string;
    largeIcon?: string;
    priority?: number;
    sticky?: boolean;
    actions?: string[];
}
export interface Config {
    desiredAccuracy?: DesiredAccuracy;
    distanceFilter?: number;
    stationaryRadius?: number;
    locationTimeout?: number;
    useSignificantChangesOnly?: boolean;
    pausesLocationUpdatesAutomatically?: boolean;
    showsBackgroundLocationIndicator?: boolean;
    activityType?: ActivityType;
    deferTime?: number;
    disableElasticity?: boolean;
    elasticityMultiplier?: number;
    stopAfterElapsedMinutes?: number;
    geofenceProximityRadius?: number;
    geofenceInitialTriggerEntry?: boolean;
    geofenceModeHighAccuracy?: boolean;
    isMoving?: boolean;
    stopTimeout?: number;
    motionTriggerDelay?: number;
    disableMotionActivityUpdates?: boolean;
    disableStopDetection?: boolean;
    stopOnStationary?: boolean;
    url?: string;
    method?: 'POST' | 'PUT' | 'OPTIONS';
    httpRootProperty?: string;
    params?: Record<string, unknown>;
    headers?: Record<string, string>;
    extras?: Record<string, unknown>;
    autoSync?: boolean;
    autoSyncThreshold?: number;
    batchSync?: boolean;
    maxBatchSize?: number;
    locationTemplate?: string;
    geofenceTemplate?: string;
    maxDaysToPersist?: number;
    maxRecordsToPersist?: number;
    persistMode?: PersistMode;
    httpTimeout?: number;
    authorization?: Authorization;
    disableAutoSyncOnCellular?: boolean;
    stopOnTerminate?: boolean;
    startOnBoot?: boolean;
    heartbeatInterval?: number;
    schedule?: ScheduleItem[];
    preventSuspend?: boolean;
    foregroundService?: boolean;
    notification?: Notification;
    debug?: boolean;
    logLevel?: LogLevel;
    logMaxDays?: number;
    locationAuthorizationRequest?: 'Always' | 'WhenInUse' | 'Any';
    backgroundPermissionRationale?: {
        title?: string;
        message?: string;
        positiveAction?: string;
        negativeAction?: string;
    };
    reset?: boolean;
}
export interface State extends Config {
    enabled: boolean;
    isMoving?: boolean;
    schedulerEnabled: boolean;
    trackingMode: TrackingMode;
    odometer: number;
    didLaunchInBackground?: boolean;
    isFirstBoot?: boolean;
}
export interface CurrentPositionRequest {
    timeout?: number;
    maximumAge?: number;
    persist?: boolean;
    samples?: number;
    desiredAccuracy?: number;
    extras?: Record<string, unknown>;
}
export interface WatchPositionRequest {
    interval?: number;
    desiredAccuracy?: DesiredAccuracy;
    persist?: boolean;
    extras?: Record<string, unknown>;
}
export interface Sensors {
    platform: 'ios' | 'android' | string;
    accelerometer: boolean;
    gyroscope: boolean;
    magnetometer: boolean;
    motion_hardware: boolean;
}
export interface DeviceInfo {
    model: string;
    manufacturer: string;
    version: string;
    platform: string;
    framework: string;
}
export interface SQLQuery {
    start?: number;
    end?: number;
    limit?: number;
    order?: -1 | 1;
}
export interface HeadlessEvent {
    name: 'location' | 'motionchange' | 'geofence' | 'heartbeat' | 'http' | 'providerchange' | 'connectivitychange' | 'powersavechange' | 'schedule' | 'enabledchange' | 'activitychange' | 'authorization' | 'geofenceschange' | 'notificationaction';
    params: unknown;
}
export type HeadlessTask = (event: HeadlessEvent) => Promise<void>;
export interface Subscription {
    remove: () => void;
}
export type EventName = HeadlessEvent['name'];
export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}
