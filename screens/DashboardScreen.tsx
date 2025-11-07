// DashboardScreen.tsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Animated,
  Image,
  StatusBar,
  Dimensions,
  Platform,
} from "react-native";
import Svg, { Path, Circle, G as SvgG, Text as SvgText } from "react-native-svg";

// --- CONFIGURAÇÕES E TIPOS GLOBAIS ---
const WINDOW_WIDTH = Dimensions.get("window").width;
const kphToMs = (kph: number) => kph / 3.6;

// Tipagem de Pista e Carro (MANTIDO)
type CarClass = "GTP" | "LMP2" | "GT3";
type Point = { x: number; y: number };
type TrackSegment = { start: Point; end: Point; length: number; angle: number };
type BrakingPointSimple = { segmentIndex: number; brakeStart: number; brakingPower: number; minCornerSpeedKPH: number };
type CarTelemetry = {
  x: number;
  y: number;
  speed: number;
  gear: number;
  segment: number;
  isBraking: boolean;
};
type Car = {
  id: string;
  pilotLicense: string;
  position: number;
  number: number;
  nationality: string;
  carName: CarClass;
  telemetry: CarTelemetry;
};

// --- CONFIGURAÇÕES DE PISTA (MANTIDO) ---
const MAX_SPEED_KPH = 360;
const TRACK_SCALE_FACTOR = 0.2; 
const TRACK_POINTS: Point[] = [
  { x: 100, y: 190 }, // 0: Start/Finish
  { x: 180, y: 190 },
  { x: 190, y: 170 },
  { x: 190, y: 60 },
  { x: 140, y: 60 },
  { x: 140, y: 65 },
  { x: 90, y: 65 },
  { x: 50, y: 65 },
  { x: 50, y: 70 },
  { x: 10, y: 70 },
  { x: 10, y: 120 },
  { x: 50, y: 150 },
  { x: 100, y: 190 }, // 12: Volta ao Start/Finish
];
const TOTAL_TRACK_POINTS = TRACK_POINTS.length - 1;
const LE_MANS_SVG_PATH_VISUAL: string =
  "M 100 190 L 180 190 C 188 185, 192 175, 190 170 L 190 60 L 140 60 C 130 60, 140 65, 140 65 L 90 65 L 50 65 C 40 65, 50 70, 50 70 L 10 70 L 10 120 C 10 130, 20 140, 50 150 C 70 160, 90 180, 100 190 Z";
const BRAKING_POINTS_SIMPLE: BrakingPointSimple[] = [
  { segmentIndex: 1, brakeStart: 0.8, brakingPower: 0.3, minCornerSpeedKPH: 150 },
  { segmentIndex: 3, brakeStart: 0.9, brakingPower: 1.0, minCornerSpeedKPH: 80 },
  { segmentIndex: 6, brakeStart: 0.9, brakingPower: 1.0, minCornerSpeedKPH: 80 },
  { segmentIndex: 9, brakeStart: 0.7, brakingPower: 0.7, minCornerSpeedKPH: 140 },
  { segmentIndex: 11, brakeStart: 0.7, brakingPower: 0.5, minCornerSpeedKPH: 120 },
];
const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
  Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const trackSegments: TrackSegment[] = TRACK_POINTS.slice(0, TOTAL_TRACK_POINTS).map((start, index) => {
  const end = TRACK_POINTS[(index + 1) % TOTAL_TRACK_POINTS];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy) * TRACK_SCALE_FACTOR;
  // atan2 retorna o ângulo em radianos
  const angle = Math.atan2(dy, dx); 
  return { start, end, length, angle };
});

// --- DADOS INICIAIS (MANTIDO) ---
const CAR_CLASSES_DATA: CarClass[] = ["GTP", "LMP2", "GT3"];
const PILOT_LICENSES = ["FIA Bronze", "FIA Silver", "FIA Gold", "FIA Platinum"];
const NATIONALITIES = [
  { code: "BR", name: "Brasil", flag: "https://flagcdn.com/w20/br.png" },
  { code: "DE", name: "Alemanha", flag: "https://flagcdn.com/w20/de.png" },
  { code: "US", name: "EUA", flag: "https://flagcdn.com/w20/us.png" },
  { code: "FR", name: "França", flag: "https://flagcdn.com/w20/fr.png" },
  { code: "IT", name: "Itália", flag: "https://flagcdn.com/w20/it.png" },
];
const initialCars: Car[] = Array.from({ length: 30 }, (_, i) => {
  const nationality = NATIONALITIES[Math.floor(Math.random() * NATIONALITIES.length)];
  return {
    id: `car${i + 1}`,
    pilotLicense: PILOT_LICENSES[Math.floor(Math.random() * PILOT_LICENSES.length)],
    position: i + 1,
    number: i + 1,
    carName: i === 0 ? "GTP" : CAR_CLASSES_DATA[Math.floor(Math.random() * CAR_CLASSES_DATA.length)] as CarClass,
    nationality: nationality.code,
    telemetry: {
      x: TRACK_POINTS[0].x + (Math.random() - 0.5) * 10,
      y: TRACK_POINTS[0].y + (Math.random() - 0.5) * 10,
      speed: i === 0 ? 0 : Math.random() * 50,
      gear: 1,
      segment: 0,
      isBraking: false,
    },
  };
});

// --- LÓGICA DE TELEMETRIA (MANTIDO) ---
const RPM_LIMIT = 9000;
const GEAR_SPEEDS_HYPERCAR = [0, 90, 140, 200, 250, 295, 335];
const MOVEMENT_SCALE_FACTOR = 350000.0; 
const TRACK_LENGTHS: number[] = [];
let TOTAL_TRACK_LENGTH = 0;
for (let i = 0; i < TOTAL_TRACK_POINTS; i++) {
    const start = TRACK_POINTS[i];
    const end = TRACK_POINTS[i + 1];
    const length = distance(start, end);
    TRACK_LENGTHS.push(length);
    TOTAL_TRACK_LENGTH += length;
}
const BRAKING_POINTS_DETAILED = [
    { segmentIndex: 1, brakeStart: 0.90, brakeTarget: 80, targetGear: 3 },
    { segmentIndex: 3, brakeStart: 0.85, brakeTarget: 100, targetGear: 3 },
    { segmentIndex: 6, brakeStart: 0.85, brakeTarget: 95, targetGear: 3 },
    { segmentIndex: 9, brakeStart: 0.90, brakeTarget: 85, targetGear: 4 },
    { segmentIndex: 10, brakeStart: 0.50, brakeTarget: 60, targetGear: 4 },
];
type DetailedMovementState = { pathIndex: number; progress: number; };
const initialDetailedMovementState: DetailedMovementState[] = [
    { pathIndex: 0, progress: 0.01 },
    { pathIndex: 0, progress: 0.06 },
    { pathIndex: 0, progress: 0.11 },
];

// --- HOOK DE SIMULAÇÃO DE CORRIDA (MANTIDO) ---
const useRaceSimulator = (initialCarsArg: Car[]) => {
  const [cars, setCars] = useState<Car[]>(initialCarsArg);
  const lastUpdateTime = useRef(Date.now());
  const detailedMovementState = useRef<DetailedMovementState[]>(initialDetailedMovementState);

  const [detailedTelemetry, setDetailedTelemetry] = useState({
    rpm: 5500,
    throttle: 0,
    brake: 0,
    revMatchTimer: 0,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastUpdateTime.current) / 5000;
      lastUpdateTime.current = now;

      setCars((prev) => {
        const updated = prev.map((car, index) => {
          let { x, y, speed, segment } = car.telemetry;
          let isBraking = false;
          let newGear = car.telemetry.gear;
          
          if (index === 0) { // Lógica DETALHADA para o Carro Principal
            let { rpm, throttle, brake, revMatchTimer } = detailedTelemetry;
            let nextBrake = brake;
            let nextThrottle = throttle;
            let nextSpeed = speed;
            let nextRPM = rpm;
            let newRevMatchTimer = Math.max(0, revMatchTimer - 1);

            const currentMovementState = detailedMovementState.current[0];
            const currentSegmentIndex = currentMovementState.pathIndex;
            let currentProgress = currentMovementState.progress;
            const brakingTarget = BRAKING_POINTS_DETAILED.find(p => p.segmentIndex === currentSegmentIndex);

            if (newRevMatchTimer === 0) {
                nextBrake = Math.max(0, brake - 10);
                const accelBase = (car.telemetry.gear >= 5) ? 98 : 85;
                nextThrottle = throttle + (accelBase - throttle) * 0.15;
                nextThrottle = Math.min(100, nextThrottle);
            }

            if (brakingTarget && currentProgress > brakingTarget.brakeStart) {
                const targetBrake = brakingTarget.brakeTarget + (Math.random() * 5);
                nextBrake = Math.min(100, brake + (targetBrake - brake) * 0.3);
                nextThrottle = Math.max(0, throttle - 50);
                isBraking = true;

                if (car.telemetry.gear > brakingTarget.targetGear) {
                    const reductionRate = (currentSegmentIndex === 3 || currentSegmentIndex === 6) ? 2 : 1;
                    newGear = Math.max(brakingTarget.targetGear, car.telemetry.gear - reductionRate);

                    if (newGear !== car.telemetry.gear) {
                        newRevMatchTimer = 2;
                    }
                }
            }

            if (newRevMatchTimer > 0) {
                nextRPM = RPM_LIMIT + 1500; 
            } else {
                const currentSpeedMs = kphToMs(speed);
                const dt_local = dt * 2; // Ajuste dt para movimento (simulação)
                const accelForce = (nextThrottle / 100) * 20 * dt_local;
                const brakingForce = (nextBrake / 100) * 35 * dt_local;
                const drag = 0.0005 * speed * speed;

                nextSpeed = speed + accelForce - brakingForce - drag;
                nextSpeed = Math.max(0, Math.min(MAX_SPEED_KPH, nextSpeed));

                if (car.telemetry.gear < 7 && nextSpeed >= GEAR_SPEEDS_HYPERCAR[car.telemetry.gear] - 10 && nextThrottle > 50) {
                    newGear = car.telemetry.gear + 1;
                }

                const minRPM = 5000;
                const gearSpeedDiff = GEAR_SPEEDS_HYPERCAR[newGear] - GEAR_SPEEDS_HYPERCAR[newGear - 1];
                let targetRPM = minRPM +
                    ((nextSpeed - GEAR_SPEEDS_HYPERCAR[newGear - 1]) / Math.max(1, gearSpeedDiff)) * (RPM_LIMIT - minRPM);

                if (!isFinite(targetRPM) || isNaN(targetRPM) || targetRPM < minRPM) {
                    targetRPM = minRPM;
                }
                nextRPM = rpm + (targetRPM - rpm) * 0.35 + (Math.random() - 0.5) * 100;
                nextRPM = Math.max(minRPM - 500, Math.min(RPM_LIMIT + 500, nextRPM));
            }

            const movementState = detailedMovementState.current[0];
            const speedToUse = nextSpeed;
            const progressAdvance = (speedToUse * 50) / MOVEMENT_SCALE_FACTOR; 

            let updatedProgress = movementState.progress;
            let currentPathIndex = movementState.pathIndex;

            let segmentLength = TRACK_LENGTHS[currentPathIndex];
            let progressStep = segmentLength > 0 ? progressAdvance / segmentLength : 0;

            updatedProgress += progressStep;

            while (updatedProgress >= 1.0) {
                const overshoot = updatedProgress - 1.0;
                currentPathIndex = (currentPathIndex + 1) % TOTAL_TRACK_POINTS;
                segmentLength = TRACK_LENGTHS[currentPathIndex];
                updatedProgress = overshoot * (TRACK_LENGTHS[movementState.pathIndex] / segmentLength);
            }

            const nextStartPoint = TRACK_POINTS[currentPathIndex];
            const nextEndPoint = TRACK_POINTS[(currentPathIndex + 1) % TOTAL_TRACK_POINTS];

            x = nextStartPoint.x + (nextEndPoint.x - nextStartPoint.x) * updatedProgress; // Fix: usar updatedProgress
            y = nextStartPoint.y + (nextEndPoint.y - nextStartPoint.y) * updatedProgress; // Fix: usar updatedProgress
            segment = currentPathIndex;

            detailedMovementState.current[0] = { pathIndex: currentPathIndex, progress: updatedProgress };
            setDetailedTelemetry({
                rpm: nextRPM,
                throttle: nextThrottle,
                brake: nextBrake,
                revMatchTimer: newRevMatchTimer,
            });

            return {
                ...car,
                telemetry: {
                    x,
                    y,
                    speed: nextSpeed,
                    gear: newGear,
                    segment,
                    isBraking: nextBrake > 50, // BRK no dashboard
                },
            };

          } else { // Lógica SIMPLIFICADA para Carros Secundários
            // Lógica de movimento e telemetria simplificada (MANTIDA)
            let currentSpeedMs = kphToMs(speed);
            let acceleration = 0.1; 
            isBraking = false; 
            const currentSegment = trackSegments[segment];
            const brakingPoint = BRAKING_POINTS_SIMPLE.find((bp) => bp.segmentIndex === segment);

            if (brakingPoint && currentSegment) {
                const start = currentSegment.start;
                const dx = x - start.x;
                const dy = y - start.y;
                const distanceInSegment = Math.sqrt(dx * dx + dy * dy) * TRACK_SCALE_FACTOR;
                const segmentFraction = currentSegment.length > 0 ? distanceInSegment / currentSegment.length : 0;

                if (segmentFraction >= brakingPoint.brakeStart && speed > brakingPoint.minCornerSpeedKPH) {
                    acceleration = -12 * brakingPoint.brakingPower * (1 + (index * 0.01));
                    isBraking = true;
                } else if (speed < brakingPoint.minCornerSpeedKPH * 1.05) {
                    acceleration = 1.0 * 0.1;
                    isBraking = false;
                }
            }

            if (!isBraking && speed >= MAX_SPEED_KPH) acceleration = 0;

            let newSpeedMs = currentSpeedMs + acceleration * dt;
            newSpeedMs = Math.max(0, Math.min(kphToMs(MAX_SPEED_KPH), newSpeedMs));

            const distanceCoveredMs = (currentSpeedMs + newSpeedMs) / 2 * dt;
            const distanceCoveredPixels = distanceCoveredMs / TRACK_SCALE_FACTOR;

            let newSpeedKPH = newSpeedMs * 3.6;
            let remainingDistance = distanceCoveredPixels;

            while (remainingDistance > 0) {
                const segmentData = trackSegments[segment];
                const start = segmentData.start;
                const end = segmentData.end;
                const segmentLengthPixels = segmentData.length / TRACK_SCALE_FACTOR;

                const dx = x - start.x;
                const dy = y - start.y;
                const distanceInSegmentPixels = Math.sqrt(dx * dx + dy * dy);
                const remainingInSegment = segmentLengthPixels - distanceInSegmentPixels;

                if (remainingDistance >= remainingInSegment) {
                    x = end.x;
                    y = end.y;
                    remainingDistance -= Math.max(0, remainingInSegment);
                    segment = (segment + 1) % TOTAL_TRACK_POINTS;
                } else {
                    const currentFraction = segmentLengthPixels > 0 ? distanceInSegmentPixels / segmentLengthPixels : 0;
                    const moveFraction = segmentLengthPixels > 0 ? remainingDistance / segmentLengthPixels : 0;
                    const newFraction = currentFraction + moveFraction;

                    x = start.x + (end.x - start.x) * newFraction;
                    y = start.y + (end.y - start.y) * newFraction;

                    remainingDistance = 0;
                }
            }
            
            newGear = Math.min(6, Math.max(1, Math.floor(newSpeedKPH / 55) + 1));
            
            return {
              ...car,
              telemetry: {
                x,
                y,
                speed: newSpeedKPH,
                gear: newGear,
                segment,
                isBraking,
              },
            };
          }
        });

        // Ordena por velocidade (classificação simples)
        updated.sort((a, b) => b.telemetry.speed - a.telemetry.speed);
        return updated.map((car, idx) => ({ ...car, position: idx + 1 }));
      });
    }, 200);

    return () => clearInterval(interval);
  }, [detailedTelemetry]);

  return { cars, detailedTelemetry };
};


// --- COMPONENTE DO MINIMAPA (ATUALIZADO COM ROTAÇÃO) ---
const TrackMap = ({ cars }: { cars: Car[] }) => {
  const getMapCarColor = (carClass: CarClass): string => {
    switch (carClass) {
      case "GTP":
        return "#00FFC0"; // MANTIDO: cor de classe forte
      case "LMP2":
        return "#FFD700";
      case "GT3":
        return "#FF4500";
      default:
        return "#E9D8FD";
    }
  };

  return (
    <View style={trackMapStyles.trackContainer}>
      <Text style={trackMapStyles.labelMap}>LE MANS CIRCUIT</Text>
      <Svg width={200} height={200} viewBox="0 0 200 200">
        <Path d={LE_MANS_SVG_PATH_VISUAL} stroke="#4A0080" strokeWidth={4} fill="#111111" /> {/* Ajuste cor da pista */}
        {BRAKING_POINTS_SIMPLE.map((bp, index) => {
          const start = TRACK_POINTS[bp.segmentIndex];
          const end = TRACK_POINTS[(bp.segmentIndex + 1) % TOTAL_TRACK_POINTS];
          const x = start.x + (end.x - start.x) * bp.brakeStart;
          const y = start.y + (end.y - start.y) * bp.brakeStart;
          return <Circle key={`bp-${index}`} cx={x} cy={y} r={4} fill="#FF4D4D" opacity={0.8} />;
        })}

        {cars.map((car) => {
          // --- LÓGICA DE ROTAÇÃO ---
          const currentSegment = trackSegments[car.telemetry.segment];
          // Converte radianos para graus e adiciona 90 graus para que a "frente" do carro (o topo) 
          // aponte na direção correta da linha SVG.
          const rotationDegrees = (currentSegment.angle * 180) / Math.PI + 90; 
          // --- FIM ROTAÇÃO ---

          return (
            <SvgG 
              key={car.id} 
              x={car.telemetry.x} 
              y={car.telemetry.y}
              // PROPRIEDADES DE ROTAÇÃO
              rotation={rotationDegrees} 
              originX={0} // Ponto de rotação no centro X
              originY={0} // Ponto de rotação no centro Y
            >
              <Circle
                r={car.telemetry.isBraking ? 7.5 : 6}
                fill={getMapCarColor(car.carName)}
                stroke={car.telemetry.isBraking ? "#FFFBCC" : "#0B0014"}
                strokeWidth={car.telemetry.isBraking ? 2 : 1.5}
              />
              <SvgText
                x={0}
                y={car.telemetry.isBraking ? 3 : 2}
                fill="#000"
                fontSize={6}
                fontWeight="bold"
                textAnchor="middle"
              >
                {String(car.number)}
              </SvgText>
            </SvgG>
          );
        })}
      </Svg>
    </View>
  );
};

// --- COMPONENTE PRINCIPAL ---
export default function DashboardScreen() {
  const { cars, detailedTelemetry } = useRaceSimulator(initialCars);
  const mainCar = cars.find(c => c.id === 'car1');

  // animações de marcha
  const gearAnimations = useRef(new Map<string, Animated.Value>()).current;
  useMemo(() => {
    cars.forEach((c) => {
      if (!gearAnimations.has(c.id)) gearAnimations.set(c.id, new Animated.Value(1));
    });
  }, [cars]);

  useEffect(() => {
    cars.forEach((car) => {
      const animationValue = gearAnimations.get(car.id);
      if (animationValue) {
        const isRevMatch = car.id === 'car1' && detailedTelemetry.revMatchTimer > 0;
        Animated.spring(animationValue, {
          toValue: isRevMatch ? 1.5 : car.telemetry.gear > 1 ? 1.25 : 1,
          useNativeDriver: true,
          speed: 12,
          bounciness: isRevMatch ? 12 : 8,
        }).start();
      }
    });
  }, [cars, detailedTelemetry.revMatchTimer]);

  const getCarClassColor = (carClass: CarClass): string => {
    switch (carClass) {
      case "GTP":
        return "#00FFC0"; // CIANO
      case "LMP2":
        return "#FFD700"; // AMARELO OURO
      case "GT3":
        return "#FF4500"; // LARANJA/VERMELHO
      default:
        return "#E9D8FD";
    }
  };

  const getPositionColor = (position: number): string => {
    if (position === 1) return "#FFD700";
    if (position === 2) return "#C0C0C0";
    if (position === 3) return "#CD7F32";
    return "#E9D8FD"; // Roxo padrão para o resto
  };
  
  const getGearColor = (car: Car): string => {
      if (car.id === 'car1' && detailedTelemetry.revMatchTimer > 0) {
          return "#FF4D4D"; // Vermelho forte (Freio/RevMatch)
      }
      return "#E0AAFF"; // Roxo suave (MAIS DISCRETO)
  }

  const renderCar = ({ item }: { item: Car }) => {
    const nationality = NATIONALITIES.find((n) => n.code === item.nationality);
    const animationValue = gearAnimations.get(item.id);
    const isMainCar = item.id === 'car1';
    
    // Freio ativo no carro principal se brake > 50%
    const isBraking = isMainCar ? detailedTelemetry.brake > 50 : item.telemetry.isBraking;

    const rowStyle = isBraking ? { ...styles.carRow, borderColor: "#FF4D4D" } : styles.carRow;
    
    // --- Dados simulados para o estilo Racelab ---
    const carClassRating = item.carName.substring(0, 1);
    const baseIR = isMainCar ? 3500 : 1500;
    const simulatedRatingK = Math.round(baseIR + (Math.random() * 2000)) / 1000;
    const simulatedSafetyRating = (Math.random() * 4 + 1).toFixed(1);

    const timeDeltaSeconds = isMainCar ? "0.0" : `+${(Math.random() * 5).toFixed(1)}`;
    const deltaColor = isMainCar ? "#00FF66" : "#E9D8FD"; // Verde para o carro principal (Delta)
    const licenseShort = item.pilotLicense.split(' ')[1];
    // --- Fim dos dados ---


    return (
      <View style={rowStyle}>
        {/* 1. POSIÇÃO */}
        <Text style={[styles.position, { color: getPositionColor(item.position) }]}>{item.position}</Text>

        {/* 2. CARRO / PILOTO (Nome/Número + Licença Curta) */}
        <View style={styles.carDetail}>
          <View style={styles.pilotInfoCar}>
            {nationality && <Image source={{ uri: nationality.flag }} style={styles.flag} />}
            <Text style={styles.number}>#{item.number}</Text>
          </View>
          <Text style={[styles.carName, { color: getCarClassColor(item.carName) }]}>{item.carName} ({licenseShort})</Text>
        </View>

        {/* 3. BLOCÃO DE DADOS (RATING/I-RATING - Estilo Racelab) */}
        <View style={styles.racelabDataBlock}>
            <View style={[styles.ratingBubble, { backgroundColor: getCarClassColor(item.carName) }]}>
                <Text style={styles.ratingBubbleText}>{carClassRating}</Text>
            </View>
            <View style={styles.ratingGroup}>
                <Text style={styles.ratingText}>{simulatedSafetyRating}</Text>
                <Text style={styles.ratingLabel}>SR</Text>
            </View>
            <View style={styles.ratingGroup}>
                <Text style={styles.ratingText}>{simulatedRatingK.toFixed(1)}k</Text>
                <Text style={styles.ratingLabel}>iR</Text>
            </View>
        </View>

        {/* 4. GEAR (Marcha) & SPEED (Velocidade) */}
        <View style={styles.speedGearBlock}>
            <View style={styles.gearContainer}>
                {animationValue && (
                    <Animated.Text style={[styles.gearText, { transform: [{ scale: animationValue }], color: getGearColor(item) }]}>
                        {item.telemetry.gear}
                    </Animated.Text>
                )}
            </View>
            <View style={styles.speedContainerSmall}>
                <Text style={styles.speedTextSmall}>{Math.round(item.telemetry.speed)}</Text>
                <Text style={styles.speedUnitSmall}>KM/H</Text>
            </View>
        </View>

        {/* 5. COLUNA FINAL: DELTA/DIFERENÇA */}
        <View style={styles.timeDeltaContainer}>
            <Text style={[styles.timeDeltaText, { color: deltaColor, fontWeight: isMainCar ? "900" : "600" }]}>
                {timeDeltaSeconds}
            </Text>
            <Text style={[styles.brakingText, isBraking ? styles.brakingActive : {}]}>
                {isBraking ? "BRK" : ""}
            </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0D0D" />
      <Text style={styles.title}>🏁 DashRacing | Le Mans</Text>

      {/* Minimapa */}
      <TrackMap cars={cars} />

      {/* NOVO HEADER COM LAYOUT RACELAB */}
      <View style={[styles.headerRow, { width: "95%" }]}>
        <Text style={[styles.headerText, { width: 30 }]}>POS</Text>
        <Text style={[styles.headerText, { width: 90, textAlign: "left" }]}>PILOTO/CARRO</Text>
        <Text style={[styles.headerText, { flex: 1, textAlign: "center" }]}>RATING</Text>
        <Text style={[styles.headerText, { width: 90, textAlign: "center" }]}>VEL./MARCHA</Text>
        <Text style={[styles.headerText, { width: 60, textAlign: "right" }]}>DIFERENÇA</Text>
      </View>

      <FlatList
        data={cars}
        keyExtractor={(item) => item.id}
        renderItem={renderCar}
        style={styles.flatList}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// --- ESTILOS ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0D0D", // Fundo Preto/Escuro
    alignItems: "center",
    paddingTop: Platform.OS === "android" ? 30 : 0,
  },
  deltaBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    marginBottom: 20,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 5,
  },
  trackName: {
    color: "#FFF",
    fontWeight: "300",
    flex: 1,
  },


  // main
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#C4B5FD", // Roxo suave
    marginBottom: 10,
  },

  // header list
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#111111", // Fundo do header mais escuro
    borderBottomWidth: 1,
    borderBottomColor: "#4A0080", // Roxo da iRacing
    borderRadius: 8,
    marginBottom: 5,
    // --- EFEITO NEON/GLOW ROXO ---
    shadowColor: "#4A0080", // Cor do "Neon"
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowOpacity: 0.8, // Quase opaco para um brilho forte
    shadowRadius: 10, // Raio maior para espalhar a luz
    elevation: 8, // Elevação para Android (simula sombra)
    // --- FIM EFEITO NEON ---
  },
  headerText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#E9D8FD",
  },

  flatList: {
    width: "95%",
    marginTop: 5,
  },
  listContent: {
    paddingBottom: 20,
  },

  // car row
  carRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(26, 0, 38, 0.7)", // Fundo escuro e levemente transparente
    marginVertical: 3,
    padding: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#4A0080", // Roxo escuro
    overflow: "hidden",
  },
  position: {
    fontSize: 18,
    fontWeight: "bold",
    width: 30,
    textAlign: "center",
  },
  carDetail: {
    width: 90,
    alignItems: "flex-start",
    justifyContent: 'center',
  },
  pilotInfoCar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  number: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#C4B5FD",
  },
  carName: {
    fontSize: 10,
    fontWeight: "bold",
    marginTop: 2,
  },
  flag: {
    width: 16,
    height: 12,
    marginRight: 4,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: "#fff",
  },

  // BLOCO RATING (Racelab Style)
  racelabDataBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 5,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.05)", // Mais claro para destaque
    borderRadius: 5,
    marginHorizontal: 5,
  },
  ratingBubble: {
    width: 25,
    height: 25,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  ratingBubbleText: {
    fontSize: 14,
    fontWeight: '900',
    color: "#0B0014", 
  },
  ratingGroup: {
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: "#FFF",
    textAlign: 'center',
  },
  ratingLabel: {
    fontSize: 8,
    color: "#B0B0B0",
    textAlign: 'center',
    marginTop: -3,
  },

  // BLOCO VELOCIDADE + MARCHA
  speedGearBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 90,
  },
  speedContainerSmall: {
    flexDirection: "column",
    alignItems: "flex-end",
    justifyContent: "center",
    width: 45,
  },
  speedTextSmall: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFB703", // Amarelo para Velocidade
    lineHeight: 16,
  },
  speedUnitSmall: {
    fontSize: 8,
    color: "#FFB703",
  },
  gearContainer: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    width: 45,
  },
  gearText: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    lineHeight: 28,
  },

  // BLOCO DELTA
  timeDeltaContainer: {
    width: 60,
    alignItems: 'flex-end',
    justifyContent: 'center',
    flexDirection: 'column',
    paddingRight: 5,
  },
  timeDeltaText: {
    fontSize: 16,
    marginBottom: 2,
  },
  brakingText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#444",
    width: 30,
    textAlign: "center",
    marginLeft: 5,
  },
  brakingActive: {
    color: "#FF4D4D",
  },
});

// --- ESTILOS DO MINIMAPA ---
const trackMapStyles = StyleSheet.create({
  trackContainer: {
    backgroundColor: "#111111", // Fundo do mapa mais escuro
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 20,
    width: WINDOW_WIDTH - 30,
    borderWidth: 1,
    borderColor: "#4A0080", // Roxo escuro
  },
  labelMap: {
    fontSize: 12,
    color: "#B0B0B0",
    marginBottom: 10,
    fontWeight: "bold",
  },
});