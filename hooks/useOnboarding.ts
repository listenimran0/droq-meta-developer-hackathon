import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const ONBOARDING_KEY = 'drop.onboarding.complete';

export function useOnboarding() {
  const [complete, setComplete] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((v) => setComplete(v === '1'));
  }, []);

  const finish = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    setComplete(true);
  }, []);

  const reset = useCallback(async () => {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
    setComplete(false);
  }, []);

  return { complete, finish, reset, loading: complete === null };
}
