/**
 * expo-background-tracking — Type definitions.
 * API surface modeled after transistorsoft/react-native-background-geolocation.
 */

// ---------------------------------------------------------------------------
// Enums / constants
// ---------------------------------------------------------------------------

export enum DesiredAccuracy {
  NAVIGATION = -2,
  HIGH = -1,
  MEDIUM = 10,
  LOW = 100,
  VERY_LOW = 1000,
  LOWEST = 3000,
}

export enum LogLevel {
  OFF = 0,
  ERROR = 1,
  WARNING = 2,
  INFO = 3,
  DEBUG = 4,
  VERBOSE = 5,
}

export enum ActivityType {
  OTHER = 1,
  AUTOMOTIVE_NAVIGATION = 2,
  FITNESS = 3,
  OTHER_NAVIGATION = 4,
  AIRBORNE = 5,
}

export enum PersistMode {
  ALL = 2,
  LOCATION = 1,
  GEOFENCE = -1,
  NONE = 0,
}

export enum AuthorizationStatus {
  NOT_DETERMINED = 0,
  RESTRICTED = 1,
  DENIED = 2,
  ALWAYS = 3,
  WHEN_IN_USE = 4,
}

export enum AccuracyAuthorization {
  FULL = 0,
  REDUCED = 1,
}

export type MotionActivityType =
  | 'still'
  | 'walking'
  | 'on_foot'
  | 'running'
  | 'on_bicycle'
  | 'in_vehicle'
  | 'unknown';

export type GeofenceAction = 'ENTER' | 'EXIT' | 'DWELL';

export type TrackingMode = 0 | 1; // 0 = geofences-only, 1 = location + geofences

export type LocationError =
  | 0 // success
  | 1 // permission denied
  | 2 // network error
  | 3 // location unavailable
  | 408 // timeout
  | 499; // cancelled

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

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
  level: number; // 0..1, -1 unknown
  is_charging: boolean;
}

export interface ActivityChangeEvent {
  activity: MotionActivityType;
  confidence: number; // 0..100
}

export interface Location {
  uuid: string;
  timestamp: string; // ISO-8601
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

// ---------------------------------------------------------------------------
// Geofence
// ---------------------------------------------------------------------------

export interface Geofence {
  identifier: string;
  radius?: number; // metres (circular)
  latitude?: number;
  longitude?: number;
  /** Polygon geofence: list of [latitude, longitude] vertices. */
  vertices?: Array<[number, number]>;
  notifyOnEntry?: boolean;
  notifyOnExit?: boolean;
  notifyOnDwell?: boolean;
  loiteringDelay?: number; // ms before DWELL fires
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

// ---------------------------------------------------------------------------
// HTTP / Authorization
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Provider / connectivity / power
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/** e.g. "1-5 09:00-17:00" (ISO day numbers 1=Monday … 7=Sunday) */
export type ScheduleItem = string;

export interface ScheduleEvent {
  enabled: boolean;
  state: State;
}

// ---------------------------------------------------------------------------
// Notification (Android foreground service — dev build only)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Config {
  // --- Geolocation
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

  // --- Activity recognition / motion
  isMoving?: boolean;
  stopTimeout?: number; // minutes
  motionTriggerDelay?: number; // ms
  disableMotionActivityUpdates?: boolean;
  disableStopDetection?: boolean;
  stopOnStationary?: boolean;

  // --- HTTP & persistence
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

  // --- Application
  stopOnTerminate?: boolean;
  startOnBoot?: boolean;
  heartbeatInterval?: number; // seconds
  schedule?: ScheduleItem[];
  preventSuspend?: boolean;
  foregroundService?: boolean;
  notification?: Notification;

  // --- Logging & debug
  debug?: boolean;
  logLevel?: LogLevel;
  logMaxDays?: number;

  // --- Permissions
  locationAuthorizationRequest?: 'Always' | 'WhenInUse' | 'Any';
  backgroundPermissionRationale?: {
    title?: string;
    message?: string;
    positiveAction?: string;
    negativeAction?: string;
  };

  // --- Misc
  reset?: boolean;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface State extends Config {
  enabled: boolean;
  isMoving?: boolean;
  schedulerEnabled: boolean;
  trackingMode: TrackingMode;
  odometer: number;
  didLaunchInBackground?: boolean;
  isFirstBoot?: boolean;
}

// ---------------------------------------------------------------------------
// getCurrentPosition options
// ---------------------------------------------------------------------------

export interface CurrentPositionRequest {
  timeout?: number; // seconds
  maximumAge?: number; // ms
  persist?: boolean;
  samples?: number;
  desiredAccuracy?: number; // metres
  extras?: Record<string, unknown>;
}

export interface WatchPositionRequest {
  interval?: number; // ms
  desiredAccuracy?: DesiredAccuracy;
  persist?: boolean;
  extras?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Sensors / device / SQL
// ---------------------------------------------------------------------------

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
  start?: number; // timestamp ms
  end?: number;
  limit?: number;
  order?: -1 | 1;
}

// ---------------------------------------------------------------------------
// Headless / background events
// ---------------------------------------------------------------------------

export interface HeadlessEvent {
  name:
    | 'location'
    | 'motionchange'
    | 'geofence'
    | 'heartbeat'
    | 'http'
    | 'providerchange'
    | 'connectivitychange'
    | 'powersavechange'
    | 'schedule'
    | 'enabledchange'
    | 'activitychange'
    | 'authorization'
    | 'geofenceschange'
    | 'notificationaction';
  params: unknown;
}

export type HeadlessTask = (event: HeadlessEvent) => Promise<void>;

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export interface Subscription {
  remove: () => void;
}

export type EventName = HeadlessEvent['name'];

// ---------------------------------------------------------------------------
// Persisted log entry
// ---------------------------------------------------------------------------

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}
