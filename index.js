// Must run before expo-router / supabase so PKCE uses SHA-256 (not plain).
import './lib/polyfills';
// Register background geofence task before app mounts
import './services/backgroundNearby';
import 'expo-router/entry';
