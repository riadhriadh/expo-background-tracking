"use strict";
/**
 * expo-background-tracking — Type definitions.
 * API surface modeled after transistorsoft/react-native-background-geolocation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccuracyAuthorization = exports.AuthorizationStatus = exports.PersistMode = exports.ActivityType = exports.LogLevel = exports.DesiredAccuracy = void 0;
// ---------------------------------------------------------------------------
// Enums / constants
// ---------------------------------------------------------------------------
var DesiredAccuracy;
(function (DesiredAccuracy) {
    DesiredAccuracy[DesiredAccuracy["NAVIGATION"] = -2] = "NAVIGATION";
    DesiredAccuracy[DesiredAccuracy["HIGH"] = -1] = "HIGH";
    DesiredAccuracy[DesiredAccuracy["MEDIUM"] = 10] = "MEDIUM";
    DesiredAccuracy[DesiredAccuracy["LOW"] = 100] = "LOW";
    DesiredAccuracy[DesiredAccuracy["VERY_LOW"] = 1000] = "VERY_LOW";
    DesiredAccuracy[DesiredAccuracy["LOWEST"] = 3000] = "LOWEST";
})(DesiredAccuracy || (exports.DesiredAccuracy = DesiredAccuracy = {}));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["OFF"] = 0] = "OFF";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["WARNING"] = 2] = "WARNING";
    LogLevel[LogLevel["INFO"] = 3] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 4] = "DEBUG";
    LogLevel[LogLevel["VERBOSE"] = 5] = "VERBOSE";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
var ActivityType;
(function (ActivityType) {
    ActivityType[ActivityType["OTHER"] = 1] = "OTHER";
    ActivityType[ActivityType["AUTOMOTIVE_NAVIGATION"] = 2] = "AUTOMOTIVE_NAVIGATION";
    ActivityType[ActivityType["FITNESS"] = 3] = "FITNESS";
    ActivityType[ActivityType["OTHER_NAVIGATION"] = 4] = "OTHER_NAVIGATION";
    ActivityType[ActivityType["AIRBORNE"] = 5] = "AIRBORNE";
})(ActivityType || (exports.ActivityType = ActivityType = {}));
var PersistMode;
(function (PersistMode) {
    PersistMode[PersistMode["ALL"] = 2] = "ALL";
    PersistMode[PersistMode["LOCATION"] = 1] = "LOCATION";
    PersistMode[PersistMode["GEOFENCE"] = -1] = "GEOFENCE";
    PersistMode[PersistMode["NONE"] = 0] = "NONE";
})(PersistMode || (exports.PersistMode = PersistMode = {}));
var AuthorizationStatus;
(function (AuthorizationStatus) {
    AuthorizationStatus[AuthorizationStatus["NOT_DETERMINED"] = 0] = "NOT_DETERMINED";
    AuthorizationStatus[AuthorizationStatus["RESTRICTED"] = 1] = "RESTRICTED";
    AuthorizationStatus[AuthorizationStatus["DENIED"] = 2] = "DENIED";
    AuthorizationStatus[AuthorizationStatus["ALWAYS"] = 3] = "ALWAYS";
    AuthorizationStatus[AuthorizationStatus["WHEN_IN_USE"] = 4] = "WHEN_IN_USE";
})(AuthorizationStatus || (exports.AuthorizationStatus = AuthorizationStatus = {}));
var AccuracyAuthorization;
(function (AccuracyAuthorization) {
    AccuracyAuthorization[AccuracyAuthorization["FULL"] = 0] = "FULL";
    AccuracyAuthorization[AccuracyAuthorization["REDUCED"] = 1] = "REDUCED";
})(AccuracyAuthorization || (exports.AccuracyAuthorization = AccuracyAuthorization = {}));
