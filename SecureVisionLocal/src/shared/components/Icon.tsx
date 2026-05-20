import React from 'react';
import { Text, TextStyle, ViewStyle } from 'react-native';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: ViewStyle | TextStyle;
}

const iconMap: Record<string, string> = {
  video: '\u25B6',
  'video-off': '\u25A0',
  'record-circle': '\u25CF',
  'settings-outline': '\u2699',
  'cog-outline': '\u2699',
  'plus-circle': '\u2295',
  'play-circle': '\u25B6',
  'pause-circle': '\u23F8',
  'stop-circle': '\u25A0',
  'chevron-right': '\u203A',
  'chevron-left': '\u2039',
  'chevron-up': '\u2037',
  'chevron-down': '\u2038',
  'arrow-up': '\u2191',
  'arrow-down': '\u2193',
  'arrow-left': '\u2190',
  'arrow-right': '\u2192',
  home: '\u2302',
  bell: '\u2708',
  bellOff: '\u2708',
  camera: '\u{1F4F7}',
  lock: '\u{1F512}',
  unlock: '\u{1F513}',
  lightbulb: '\u{1F4A1}',
  'lightbulb-off': '\u{1F4A1}',
  warning: '\u26A0',
  check: '\u2713',
  close: '\u2717',
  refresh: '\u21BB',
  sync: '\u21BB',
  search: '\u{1F50D}',
  mic: '\u{1F3A4}',
  'mic-off': '\u{1F3A4}',
  volume: '\u{1F50A}',
  'volume-off': '\u{1F507}',
  eye: '\u{1F441}',
  'eye-off': '\u{1F648}',
  download: '\u{1F4E5}',
  upload: '\u{1F4E4}',
  trash: '\u{1F5D1}',
  edit: '\u{270E}',
  save: '\u{1F4BE}',
  folder: '\u{1F4C1}',
  'folder-open': '\u{1F4C2}',
  file: '\u{1F4C4}',
  image: '\u{1F5BC}',
  calendar: '\u{1F4C5}',
  clock: '\u{1F551}',
  user: '\u{1F464}',
  'user-group': '\u{1F465}',
  wifi: '\u{1F4F6}',
  'wifi-off': '\u{1F4F6}',
  battery: '\u{1F50B}',
  'battery-full': '\u{1F50B}',
  'battery-half': '\u{1FAAB}',
  'battery-low': '\u{1FAAB}',
  signal: '\u{1F4F6}',
  'signal-off': '\u{1F4F6}',
  connection: '\u{1F310}',
  network: '\u{1F310}',
};

export function Icon({
  name,
  size = 24,
  color = '#FFFFFF',
  style,
}: IconProps): React.ReactElement {
  const iconChar = iconMap[name] || '?';

  return (
    <Text style={[{ fontSize: size, color, textAlign: 'center' }, style]}>
      {iconChar}
    </Text>
  );
}