export declare const LocationAccuracy: {
    Highest: number;
    High: number;
    Balanced: number;
    Low: number;
    Lowest: number;
    BestForNavigation: number;
};
export declare const GeofencingEventType: {
    Enter: number;
    Exit: number;
};
export declare const requestForegroundPermissionsAsync: jest.Mock<any, any, any>;
export declare const requestBackgroundPermissionsAsync: jest.Mock<any, any, any>;
export declare const getForegroundPermissionsAsync: jest.Mock<any, any, any>;
export declare const getBackgroundPermissionsAsync: jest.Mock<any, any, any>;
export declare const getCurrentPositionAsync: jest.Mock<any, any, any>;
export declare const watchPositionAsync: jest.Mock<any, any, any>;
export declare const startLocationUpdatesAsync: jest.Mock<any, any, any>;
export declare const stopLocationUpdatesAsync: jest.Mock<any, any, any>;
export declare const hasStartedLocationUpdatesAsync: jest.Mock<any, any, any>;
export declare const hasServicesEnabledAsync: jest.Mock<any, any, any>;
export declare const startGeofencingAsync: jest.Mock<any, any, any>;
export declare const stopGeofencingAsync: jest.Mock<any, any, any>;
export declare const hasStartedGeofencingAsync: jest.Mock<any, any, any>;
