// src/context/RaceContext.tsx
import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Dimensions } from "react-native";

// === Configurações da pista e tipos (copiado do teu código principal) ===
const WINDOW_WIDTH = Dimensions.get("window").width;

type CarClass = "GTP" | "LMP2" | "GT3";
type Point = { x: number; y: number };
type TrackSegment = { start: Point; end: Point; length: number; angle: number };

type CarTelemetry = {
  x: number;
  y: number;
  speed: number;
  gear: number;
  segment: number;
  isBraking: boolean;
};

export type Car = {
  id: string;
  pilotLicense: string;
  position: number;
  number: number;
  nationality: string;
  carName: CarClass;
  telemetry: CarTelemetry;
};

const kphToMs = (kph: number) => kph / 3.6;
const MAX_SPEED_KPH = 300;
const MAX_ACCEL_MS2 = 1;
const MAX_DECEL_MS2 = 12;
const TRACK_SCALE_FACTOR = 0.2;

const TRACK_POINTS: Point[] = [
  { x: 100, y: 190 }, { x: 180, y: 190 }, { x: 190, y: 170 }, { x: 190, y: 60 },
  { x: 140, y: 60 }, { x: 140, y: 65 }, { x: 90, y: 65 }, { x: 50, y: 65 },
  { x: 50, y: 70 }, { x: 10, y: 70 }, { x: 10, y: 120 }, { x: 50, y: 150 },
  { x: 100, y: 190 }
];
const TOTAL_TRACK_POINTS = TRACK_POINTS.length - 1;

const trackSegments: TrackSegment[] = TRACK_POINTS.slice(0, TOTAL_TRACK_POINTS).map((start, i) => {
  const end = TRACK_POINTS[(i + 1) % TOTAL_TRACK_POINTS];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy) * TRACK_SCALE_FACTOR;
  const angle = Math.atan2(dy, dx);
  return { start, end, length, angle };
});

// Inicializa os carros
const initialCars: Car[] = Array.from({ length: 10 }, (_, i) => ({
  id: `car${i + 1}`,
  pilotLicense: ["FIA Bronze", "FIA Silver", "FIA Gold", "FIA Platinum"][Math.floor(Math.random() * 4)],
  position: i + 1,
  number: i + 11,
  carName: ["GTP", "LMP2", "GT3"][Math.floor(Math.random() * 3)] as CarClass,
  nationality: ["BR", "DE", "US", "FR", "IT"][Math.floor(Math.random() * 5)],
  telemetry: {
    x: TRACK_POINTS[0].x + Math.random() * 5,
    y: TRACK_POINTS[0].y + Math.random() * 5,
    speed: Math.random() * 50,
    gear: 1,
    segment: 0,
    isBraking: false,
  },
}));

// === Simulador compartilhado ===
const RaceContext = createContext<{ cars: Car[] }>({ cars: [] });

export const RaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cars, setCars] = useState<Car[]>(initialCars);
  const lastUpdate = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastUpdate.current) / 1000;
      lastUpdate.current = now;

      setCars((prev) =>
        prev.map((car) => {
          let { x, y, speed, segment } = car.telemetry;
          let acceleration = MAX_ACCEL_MS2;
          let currentSpeedMs = kphToMs(speed);

          // cálculo simples de aceleração
          let newSpeedMs = currentSpeedMs + acceleration * dt;
          newSpeedMs = Math.min(newSpeedMs, kphToMs(MAX_SPEED_KPH));
          const distance = newSpeedMs * dt / TRACK_SCALE_FACTOR;

          const seg = trackSegments[segment];
          const dx = seg.end.x - seg.start.x;
          const dy = seg.end.y - seg.start.y;
          const length = seg.length / TRACK_SCALE_FACTOR;
          let progress = distance / length;

          x += dx * progress;
          y += dy * progress;

          if (progress >= 1) {
            segment = (segment + 1) % TOTAL_TRACK_POINTS;
          }

          return {
            ...car,
            telemetry: {
              x,
              y,
              speed: newSpeedMs * 3.6,
              gear: Math.min(6, Math.floor(speed / 55) + 1),
              segment,
              isBraking: false,
            },
          };
        })
      );
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return <RaceContext.Provider value={{ cars }}>{children}</RaceContext.Provider>;
};

export const useRace = () => useContext(RaceContext);
