/**
 * Android TV: focusable is supported at runtime but not in RN's TouchableOpacity types.
 */
import 'react-native';

declare module 'react-native' {
  interface TouchableOpacityProps {
    focusable?: boolean;
  }
}
