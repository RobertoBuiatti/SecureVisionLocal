import React, { useCallback, useState } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';
import { colors } from '@app/theme';
import { PTZSpeed } from '@features/ptz/types';

interface PTZJoystickProps {
  size?: number;
  onMove: (direction: string, speed: PTZSpeed) => void;
  onRelease: () => void;
  disabled?: boolean;
}

const JOYSTICK_DEAD_ZONE = 0.2;

export function PTZJoystick({
  size = 150,
  onMove,
  onRelease,
  disabled = false,
}: PTZJoystickProps): React.ReactElement {
  const [knobPosition, setKnobPosition] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);

  const center = size / 2;
  const maxRadius = (size - 20) / 2;
  const knobSize = size * 0.25;

  const getDirection = (x: number, y: number): string | null => {
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    if (absX < JOYSTICK_DEAD_ZONE && absY < JOYSTICK_DEAD_ZONE) {
      return null;
    }

    if (absX > absY) {
      return x > 0 ? 'RIGHT' : 'LEFT';
    } else {
      return y > 0 ? 'DOWN' : 'UP';
    }
  };

  const getSpeed = (distance: number): PTZSpeed => {
    const normalized = Math.min(Math.abs(distance), 1);
    if (normalized < 0.33) return 'slow';
    if (normalized < 0.66) return 'medium';
    return 'fast';
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: () => {
      setIsActive(true);
    },
    onPanResponderMove: (_: GestureResponderEvent, gestureState: { dx: number; dy: number }) => {
      const dx = gestureState.dx / (size / 2);
      const dy = gestureState.dy / (size / 2);

      const distance = Math.sqrt(dx * dx + dy * dy);
      const clampedDistance = Math.min(distance, 1);
      const angle = Math.atan2(dy, dx);

      const clampedX = Math.cos(angle) * clampedDistance * maxRadius;
      const clampedY = Math.sin(angle) * clampedDistance * maxRadius;

      setKnobPosition({ x: clampedX, y: clampedY });

      const direction = getDirection(dx / maxRadius, dy / maxRadius);
      if (direction) {
        onMove(direction, getSpeed(distance));
      }
    },
    onPanResponderRelease: () => {
      setIsActive(false);
      setKnobPosition({ x: 0, y: 0 });
      onRelease();
    },
    onPanResponderTerminate: () => {
      setIsActive(false);
      setKnobPosition({ x: 0, y: 0 });
      onRelease();
    },
  });

  const handleTouchIn = useCallback((direction: string, speed: PTZSpeed) => {
    onMove(direction, speed);
  }, [onMove]);

  return (
    <View style={[styles.container, { width: size, height: size }]} {...panResponder.panHandlers}>
      <View
        style={[
          styles.base,
          { width: size, height: size, borderRadius: size / 2 },
          disabled && styles.baseDisabled,
        ]}
      >
        <View style={[styles.ring, { width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35 }]} />
        <View style={[styles.ring, { width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2 }]} />

        <View
          style={[
            styles.knob,
            {
              width: knobSize,
              height: knobSize,
              borderRadius: knobSize / 2,
              transform: [
                { translateX: knobPosition.x - knobSize / 2 },
                { translateY: knobPosition.y - knobSize / 2 },
              ],
            },
            isActive && styles.knobActive,
            disabled && styles.knobDisabled,
          ]}
        />
      </View>

      <View style={[styles.directions, { width: size, height: size }]}>
        <View style={[styles.directionButton, styles.topButton]} />
        <View style={[styles.directionButton, styles.bottomButton]} />
        <View style={[styles.directionButton, styles.leftButton]} />
        <View style={[styles.directionButton, styles.rightButton]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  base: {
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  baseDisabled: {
    opacity: 0.5,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  knob: {
    backgroundColor: colors.ptzJoystick,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  knobActive: {
    backgroundColor: colors.ptzActive,
  },
  knobDisabled: {
    backgroundColor: colors.textMuted,
  },
  directions: {
    position: 'absolute',
  },
  directionButton: {
    position: 'absolute',
    width: 30,
    height: 30,
    backgroundColor: 'transparent',
  },
  topButton: {
    top: 10,
    left: '50%',
    marginLeft: -15,
  },
  bottomButton: {
    bottom: 10,
    left: '50%',
    marginLeft: -15,
  },
  leftButton: {
    left: 10,
    top: '50%',
    marginTop: -15,
  },
  rightButton: {
    right: 10,
    top: '50%',
    marginTop: -15,
  },
});