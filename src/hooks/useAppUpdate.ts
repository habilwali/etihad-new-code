import { useCallback, useEffect, useRef, useState } from 'react';
import DeviceInfo from 'react-native-device-info';
import { checkForUpdate, UpdateInfo } from '../services/updateService';

const CHECK_DELAY_MS = 1_500;

export interface AppUpdateState {
  modalVisible: boolean;
  updateData: UpdateInfo | null;
  dismiss: () => void;
  checkNow: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const [modalVisible, setModalVisible] = useState(false);
  const [updateData, setUpdateData] = useState<UpdateInfo | null>(null);
  const hasChecked = useRef(false);

  const runCheck = useCallback(async () => {
    // Update checks are only meaningful for release builds.
    // In debug/__DEV__ mode the versionCode has no ABI suffix and the
    // comparison would always be wrong → skip entirely.
    if (__DEV__) {
      console.log('[useAppUpdate] Skipping update check in dev/debug mode');
      return;
    }

    const rawBuild = parseInt(await DeviceInfo.getBuildNumber(), 10);

    // Release APKs use ABI-split versionCodes: base * 10 + abiIndex
    //   e.g. base=20, armeabi-v7a → 201,  arm64-v8a → 202
    // Strip the ABI suffix to get the comparable base version.
    // If rawBuild ends in 1 or 2 (our ABI codes) and is > 10, it is a
    // split code; otherwise treat it as already a base code.
    const lastDigit = rawBuild % 10;
    const installedVersion =
      (lastDigit === 1 || lastDigit === 2) && rawBuild > 10
        ? Math.floor(rawBuild / 10)
        : rawBuild;

    console.log(
      '[useAppUpdate] rawBuild:', rawBuild,
      '| installedVersion:', installedVersion,
    );

    const result = await checkForUpdate(installedVersion);

    if (result.available) {
      const cmsVersion = result.info.version_code;

      // Client-side guard: only show popup when CMS has a STRICTLY NEWER version.
      // This prevents the popup re-appearing after a successful install when the
      // CMS still returns update_available:true for the same version code.
      if (cmsVersion <= installedVersion) {
        console.log(
          '[useAppUpdate] Skipping popup — CMS version_code',
          cmsVersion,
          '<= installed',
          installedVersion,
        );
        return;
      }

      console.log(
        '[useAppUpdate] Showing update popup — CMS:', cmsVersion,
        '> installed:', installedVersion,
      );
      setUpdateData(result.info);
      setModalVisible(true);
    }
  }, []);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;
    const tid = setTimeout(runCheck, CHECK_DELAY_MS);
    return () => clearTimeout(tid);
  }, [runCheck]);

  const dismiss = useCallback(() => {
    if (updateData?.is_force_update) return;
    setModalVisible(false);
  }, [updateData]);

  const checkNow = useCallback(() => {
    runCheck();
  }, [runCheck]);

  return { modalVisible, updateData, dismiss, checkNow };
}
