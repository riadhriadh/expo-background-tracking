# Features

## Core Capabilities

### 🎯 Background Geolocation
- **Continuous tracking** in foreground and background (dev builds)
- **Configurable accuracy** levels (DESIRED_ACCURACY_HIGH, etc.)
- **Distance filtering** to reduce excessive location updates
- **Native GPS** integration with fallback to software-based tracking
- **Adaptive accuracy** based on device motion

### 🎪 Geofencing (Unlimited)
- **Circle geofences** with customizable radius
- **Polygon geofences** for complex zone detection
- **Entry/Exit/Dwell events** with configurable delays
- **Software & native** evaluation modes
- **Loitering detection** to identify stationary periods

### 📍 Motion Detection
- **Accelerometer-based** motion sensing
- **Battery-efficient** detection algorithm
- **Activity classification** (walking, running, vehicle, stationary)
- **Automatic pace control** for power optimization

### 💾 Data Persistence
- **SQLite storage** for offline resilience
- **Automatic batching** for efficient queries
- **Configurable retention** (max days, max records)
- **Full queue visibility** and manual control

### 🌐 HTTP Sync & Server Integration
- **Native fetch-based** transmission (no Firebase)
- **Offline queue** with automatic retry on reconnection
- **Batch transmission** to reduce network overhead
- **Custom headers & parameters** for auth/context
- **Template-based payloads** for flexible formatting
- **JWT authentication** with automatic token refresh
- **HTTP event tracking** for monitoring uploads

### ⏱️ Scheduling
- **Weekly schedules** (e.g., "1-5 09:00-17:00" = Mon-Fri 9am-5pm)
- **Automatic start/stop** based on schedule
- **Smart scheduling** to save power during off-hours

### 🔋 Battery & Power Management
- **Battery level reporting** in location data
- **Charging state detection**
- **Power save mode** awareness
- **Motion-based sleep** to reduce sampling when stationary
- **Efficient foreground service** (Android)

### 📊 Metrics & Diagnostics
- **Odometer tracking** (distance traveled)
- **Sensor data collection** (GPS, accelerometer, compass)
- **Comprehensive logging** with debug output
- **Provider state monitoring** (GPS, network quality)
- **Heartbeat events** to confirm app is still tracking

### 🔐 Security & Authentication
- **Bearer token support** in HTTP headers
- **JWT-based authentication** with refresh strategy
- **Custom headers** for API key injection
- **Secure HTTPS** for all transmissions

## Platform Support

### ✅ Supported Platforms
- **iOS** (13+) with UIBackgroundModes configuration
- **Android** (5+) with FOREGROUND_SERVICE permissions

### 📱 Expo Compatibility
- **Expo Go**: Full foreground tracking, software geofencing
- **Dev builds**: Full background tracking with native geofencing
- **Production**: Full background tracking after EAS build

## Performance Characteristics

- **Minimal battery drain** with optimized algorithms
- **Low memory footprint** (~5-10 MB)
- **Efficient database** queries with indexing
- **Batched network requests** to reduce data usage
- **Configurable trade-offs** between accuracy and power consumption

## Integration Options

- **Seamless integration** with Expo ecosystem
- **Cross-platform** code (same logic iOS/Android)
- **Headless task support** for background processing
- **Full TypeScript** support with type definitions
- **Event-driven architecture** for reactive applications

## Data Collection

Each location includes:
- **Coordinates** (latitude, longitude, accuracy)
- **Movement** (speed, heading, altitude)
- **Activity** (type, confidence level)
- **Battery** (level, charging state)
- **Device** (ID, model, OS)
- **Timestamp** (ISO 8601)
- **Odometer** (distance traveled)
- **Custom extras** (mission, user, etc.)

## No External Dependencies

- ✅ No Firebase required
- ✅ No Google Play Services (uses native APIs)
- ✅ No paid tracking SDKs
- ✅ Full control over your data
- ✅ Custom server backend compatible
