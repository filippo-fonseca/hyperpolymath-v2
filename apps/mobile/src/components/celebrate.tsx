// Completion celebration: when a task/habit/session is checked off, a glowing
// dot flies from the tap point down into the kiwi orb in the tab bar, which
// pulses in acknowledgment. Wired through a module-level bus so any screen
// can fire it and Root renders one overlay.

import { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet } from "react-native";

import { colors } from "../theme";

interface FlyEvent {
  x: number;
  y: number;
  color: string;
}

type Listener = (e: FlyEvent) => void;
const listeners = new Set<Listener>();

/** Fire from a completion tap: pass the touch's pageX/pageY. */
export function celebrate(x: number, y: number, color: string = colors.accent): void {
  for (const fn of listeners) fn({ x, y, color });
}

const FLIGHT_MS = 620;

interface Flight extends FlyEvent {
  id: number;
  progress: Animated.Value;
}

/**
 * Renders flying completion dots. `onArrive` fires when a dot reaches the
 * orb (Root uses it to pulse the orb circle).
 */
export function CelebrationOverlay({
  targetBottom,
  onArrive,
}: {
  /** Distance from screen bottom to the orb's center. */
  targetBottom: number;
  onArrive: () => void;
}) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const onFly: Listener = (e) => {
      const flight: Flight = { ...e, id: nextId.current++, progress: new Animated.Value(0) };
      setFlights((prev) => [...prev, flight]);
      Animated.timing(flight.progress, {
        toValue: 1,
        duration: FLIGHT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        onArrive();
        setFlights((prev) => prev.filter((f) => f.id !== flight.id));
      });
    };
    listeners.add(onFly);
    return () => {
      listeners.delete(onFly);
    };
  }, [onArrive]);

  if (flights.length === 0) return null;

  const { width, height } = Dimensions.get("window");
  const target = { x: width / 2, y: height - targetBottom };

  return (
    <>
      {flights.map((f) => {
        const translateX = f.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [f.x, target.x],
        });
        const translateY = f.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [f.y, target.y],
        });
        const scale = f.progress.interpolate({
          inputRange: [0, 0.15, 1],
          outputRange: [0.6, 1.4, 0.25],
        });
        const opacity = f.progress.interpolate({
          inputRange: [0, 0.1, 0.85, 1],
          outputRange: [0.4, 1, 0.9, 0],
        });
        return (
          <Animated.View
            key={f.id}
            pointerEvents="none"
            style={[
              styles.dot,
              {
                backgroundColor: f.color,
                shadowColor: f.color,
                opacity,
                transform: [
                  { translateX: Animated.subtract(translateX, 7) },
                  { translateY: Animated.subtract(translateY, 7) },
                  { scale },
                ],
              },
            ]}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 200,
  },
});
