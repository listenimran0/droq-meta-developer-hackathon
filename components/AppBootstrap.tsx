import React, { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { runWhenIdle } from '@/lib/runWhenIdle';
import { trackEvent } from '@/services/analytics';
import {
  flushOfflineQueue,
  startOfflineQueueWatcher,
} from '@/services/offlineQueue';
import {
  ensureNotificationPermissions,
  registerPushToken,
} from '@/services/notifications';
import { useAdsBootstrap } from '@/hooks/useAdsBootstrap';
import { UpdatePrompt } from '@/components/UpdatePrompt';

/**
 * Boots push token registration, offline flush, session analytics, and ads SDK.
 * Mount once under AuthProvider. Heavy work waits until after first paint.
 */
export function AppBootstrap({ children }: { children: React.ReactNode }) {
  const { user, configured } = useAuth();
  const router = useRouter();
  const booted = useRef(false);
  useAdsBootstrap();

  const boot = useCallback(async () => {
    if (!configured || !user) return;
    await Promise.all([
      ensureNotificationPermissions().catch(() => false),
      registerPushToken().catch(() => null),
    ]);
    await flushOfflineQueue().catch(() => undefined);
    if (!booted.current) {
      booted.current = true;
      await trackEvent('session_start', {});
    }
  }, [configured, user?.id]);

  useEffect(() => {
    const task = runWhenIdle(() => {
      void boot();
    });
    return () => task.cancel();
  }, [boot]);

  useEffect(() => {
    const unsub = startOfflineQueueWatcher();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runWhenIdle(() => {
          flushOfflineQueue().catch(() => undefined);
          // Re-register when coming online so social pushes can reach this device
          if (configured && user) {
            registerPushToken().catch(() => null);
          }
        });
      }
    });
    return () => {
      unsub();
      appSub.remove();
    };
  }, [configured, user?.id]);

  // Warm deep links + OS notification taps.
  // Cold-start URLs are owned by expo-router (do not call Linking.getInitialURL here —
  // that races Android's async initial URL with NavigationContainer mount: expo/expo#49378).
  useEffect(() => {
    let alive = true;
    const handledIds = new Set<string>();

    const routeFromResponse = (response: Notifications.NotificationResponse | null) => {
      if (!alive || !response) return;
      const id = response.notification.request.identifier;
      if (handledIds.has(id)) return;
      handledIds.add(id);

      const data = response.notification.request.content.data as {
        drop_id?: string;
        kind?: string;
        hunt_id?: string;
      };
      if (data?.kind === 'nearby_drop') {
        router.push('/discover');
      } else if (
        data?.kind === 'friend_request' ||
        data?.kind === 'friend_accepted'
      ) {
        router.push('/friends');
      } else if (data?.kind === 'squad_invite' && data.hunt_id) {
        router.push({
          pathname: '/squad/[id]',
          params: { id: data.hunt_id, dropId: data.drop_id, mode: 'join' },
        });
      } else if (data?.drop_id) {
        router.push('/discover');
      } else {
        router.push('/notifications');
      }
    };

    const openUrl = (url: string | null) => {
      if (!alive || !url) return;
      // Dev-client / Expo Go bootstrap URLs — not app routes
      if (
        url.includes('expo-development-client') ||
        url.startsWith('exp://') ||
        /[?&]url=http/.test(url)
      ) {
        return;
      }
      const hunt = url.match(/(?:hunt|q|qr)\/([0-9a-f-]{36})/i);
      if (hunt?.[1]) {
        router.push(`/hunt/${hunt[1]}`);
        return;
      }
      if (url.includes('auth/reset')) {
        router.push('/auth/reset');
        return;
      }
      if (url.includes('auth/callback') || /[?&#](code|access_token|token_hash)=/i.test(url)) {
        router.push('/auth/callback');
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    const linkSub = Linking.addEventListener('url', ({ url }) => openUrl(url));

    // After commit: only cold-start notification taps (not Linking.getInitialURL)
    const bootTimer = setTimeout(() => {
      if (!alive) return;
      Notifications.getLastNotificationResponseAsync()
        .then(routeFromResponse)
        .catch(() => undefined);
    }, 0);

    return () => {
      alive = false;
      clearTimeout(bootTimer);
      sub.remove();
      linkSub.remove();
    };
  }, [router]);

  return (
    <>
      {children}
      <UpdatePrompt />
    </>
  );
}
