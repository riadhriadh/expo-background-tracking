import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Button,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import BackgroundGeolocation, {
  isExpoGo,
  type Location,
  type GeofenceEvent,
} from 'expo-background-tracking';

export default function App() {
  const [enabled, setEnabled] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [odometer, setOdometer] = useState(0);
  const [count, setCount] = useState(0);
  const [isMoving, setIsMoving] = useState(false);
  const [events, setEvents] = useState<string[]>([]);

  const log = (msg: string) =>
    setEvents((prev) =>
      [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 50)
    );

  useEffect(() => {
    const subs = [
      BackgroundGeolocation.onLocation((l) => {
        setLocation(l);
        setOdometer(l.odometer);
        log(`📍 ${l.coords.latitude.toFixed(5)}, ${l.coords.longitude.toFixed(5)}`);
        void BackgroundGeolocation.getCount().then(setCount);
      }),
      BackgroundGeolocation.onMotionChange((e) => {
        setIsMoving(e.isMoving);
        log(`🚶 motionchange: ${e.isMoving ? 'MOVING' : 'STATIONARY'}`);
      }),
      BackgroundGeolocation.onActivityChange((e) =>
        log(`🏃 activity: ${e.activity} (${e.confidence}%)`)
      ),
      BackgroundGeolocation.onGeofence((e: GeofenceEvent) =>
        log(`🎯 geofence ${e.action}: ${e.identifier}`)
      ),
      BackgroundGeolocation.onHeartbeat(() => log('💓 heartbeat')),
      BackgroundGeolocation.onHttp((e) => log(`🌐 http ${e.status}`)),
      BackgroundGeolocation.onProviderChange((e) =>
        log(`📡 provider: gps=${e.gps} status=${e.status}`)
      ),
      BackgroundGeolocation.onConnectivityChange((e) =>
        log(`📶 network: ${e.connected ? 'online' : 'offline'}`)
      ),
      BackgroundGeolocation.onPowerSaveChange((on) => log(`🔋 power-save: ${on}`)),
      BackgroundGeolocation.onEnabledChange((on) => log(`⚡ enabled: ${on}`)),
    ];

    void BackgroundGeolocation.ready({
      distanceFilter: 0,
      stopTimeout: 5,
      heartbeatInterval: 60,
      debug: true,
       url: 'https://your-server.com/locations',
       autoSync: true,
    }).then((state) => {
      setEnabled(state.enabled);
      log(
        `✅ ready (${isExpoGo() ? 'Expo Go — foreground only' : 'dev build — background OK'})`
      );
    });

    return () => subs.forEach((s) => s.remove());
  }, []);

  const toggle = async (value: boolean) => {
    setEnabled(value);
    try {
      if (value) await BackgroundGeolocation.start();
      else await BackgroundGeolocation.stop();
    } catch (e) {
      log(`❌ ${e instanceof Error ? e.message : String(e)}`);
      setEnabled(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>expo-background-tracking</Text>
      {isExpoGo() && (
        <Text style={styles.banner}>
          Expo Go : tracking foreground uniquement. Background complet en dev
          build.
        </Text>
      )}
      <View style={styles.row}>
        <Text style={styles.label}>Tracking</Text>
        <Switch value={enabled} onValueChange={toggle} />
      </View>
      <Text style={styles.stat}>
        {location
          ? `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)} (±${Math.round(location.coords.accuracy)}m)`
          : '—'}
      </Text>
      <Text style={styles.stat}>
        Odomètre : {(odometer / 1000).toFixed(2)} km | DB : {count} |{' '}
        {isMoving ? '🚶 moving' : '⏸ stationary'}
      </Text>
      <View style={styles.buttons}>
        <Button
          title="Position"
          onPress={() =>
            void BackgroundGeolocation.getCurrentPosition({ samples: 1 }).catch(
              (e) => log(`❌ ${e.message}`)
            )
          }
        />
        <Button
          title="changePace"
          onPress={() =>
            void BackgroundGeolocation.changePace(!isMoving).catch((e) =>
              log(`❌ ${e.message}`)
            )
          }
        />
        <Button
          title="+ Geofence ici"
          onPress={() => {
            if (!location) {
              log('❌ pas de position — appuyez sur "Position" d’abord');
              return;
            }
            void BackgroundGeolocation.addGeofence({
              identifier: `gf-${Date.now()}`,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              radius: 200,
              notifyOnEntry: true,
              notifyOnExit: true,
            }).then(() => log('🎯 geofence ajoutée (200 m)'));
          }}
        />
        <Button
          title="Sync"
          onPress={() =>
            void BackgroundGeolocation.sync().catch((e) => log(`sync: ${e.message}`))
          }
        />
      </View>
      <ScrollView style={styles.log}>
        {events.map((e, i) => (
          <Text key={i} style={styles.logLine}>
            {e}
          </Text>
        ))}
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  banner: {
    backgroundColor: '#fff3cd',
    padding: 8,
    borderRadius: 6,
    marginBottom: 8,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 8,
  },
  label: { fontSize: 16 },
  stat: { fontSize: 13, color: '#444', marginBottom: 4 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  log: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  logLine: { fontSize: 11, fontFamily: 'monospace', marginBottom: 2 },
});
