const makeSensor = () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true) });
export const Accelerometer = makeSensor();
export const Gyroscope = makeSensor();
export const Magnetometer = makeSensor();
