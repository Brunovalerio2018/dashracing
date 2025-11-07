import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  useWindowDimensions,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
// Certifique-se de ter instalado: npm install react-native-svg
import Svg, { Circle, Path, Text as SvgText } from "react-native-svg";

// --- TIPAGEM ---

type CarClass = "GTP" | "LMP2" | "GT3";
type TireData = { temp: number; press: number; wear: number }; // wear: 0.0 (novo) a 1.0 (gasto)
type Lap = { time: number; sectors: number[] };
type CarPosition = { x: number; y: number; color: string };

// --- TIPAGEM DE TELEMETRIA EXPANDIDA ---
type TelemetryData = {
  // === Núcleo ===
  rpm: number;
  gear: number;
  speed: number;
  throttle: number; // 0-100
  brake: number; // 0-100

  // === Configs Carro ===
  brakeBias: number; // Já existia
  tc1: number;
  tcCut: number; // NOVO
  abs: number; // NOVO
  map: number; // NOVO (Engine Map)
  
  // === Info Corrida ===
  fuel: number; // NOVO (Litros)
  fuelAvgPerLap: number; // NOVO
  lapsCompleted: number; // NOVO
  totalLaps: number; // NOVO
  lapTime: number; // Já existia
  lapData: Lap[]; // Renomeado de 'laps'
  
  // === Info Pista ===
  airTemp: number;
  trackTemp: number;
  clouds: number; // NOVO (0.0 a 1.0)
  rain: number; // NOVO (0.0 a 1.0)

  // === Status ===
  flags: { // NOVO
    yellow: boolean;
    blue: boolean;
    red: boolean;
    black: boolean;
  };
  
  // === Pneus ===
  tires: { FL: TireData; FR: TireData; RL: TireData; RR: TireData };
  
  // === Mapa ===
  carPositions: CarPosition[];
};

type CarMovementState = {
  pathIndex: number;
  progress: number;
};

// --- CONFIGURAÇÕES DE CARRO E PISTA (Sem alteração) ---
const RPM_LIMIT = 9000;
const GEAR_SPEEDS = [0, 90, 140, 200, 250, 295, 335];
const MAX_SPEED = 340;
const TRACK_POINTS = [
  { x: 100, y: 190 }, { x: 180, y: 190 }, { x: 190, y: 170 }, { x: 190, y: 60 },
  { x: 140, y: 60 }, { x: 140, y: 65 }, { x: 90, y: 65 }, { x: 50, y: 65 },
  { x: 50, y: 70 }, { x: 10, y: 70 }, { x: 10, y: 120 }, { x: 50, y: 150 },
  { x: 100, y: 190 },
];
const TOTAL_TRACK_POINTS = TRACK_POINTS.length - 1;
const BRAKING_POINTS = [
  { segmentIndex: 1, brakeStart: 0.90, brakeTarget: 80, targetGear: 3 },
  { segmentIndex: 3, brakeStart: 0.85, brakeTarget: 100, targetGear: 3 },
  { segmentIndex: 6, brakeStart: 0.85, brakeTarget: 95, targetGear: 3 },
  { segmentIndex: 9, brakeStart: 0.90, brakeTarget: 85, targetGear: 4 },
  { segmentIndex: 10, brakeStart: 0.50, brakeTarget: 60, targetGear: 4 },
];
const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
  Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
const TRACK_LENGTHS: number[] = [];
let TOTAL_TRACK_LENGTH = 0;
for (let i = 0; i < TOTAL_TRACK_POINTS; i++) {
  const start = TRACK_POINTS[i];
  const end = TRACK_POINTS[i + 1];
  const length = distance(start, end);
  TRACK_LENGTHS.push(length);
  TOTAL_TRACK_LENGTH += length;
}
const MOVEMENT_SCALE_FACTOR = 350000.0; 

/**
 * Hook de simulação ATUALIZADO com todos os novos dados.
 */
function useTelemetrySimulator(interval = 100) { // Intervalo mais rápido (100ms)
  const initialMovementState = useRef(
    Array.from({ length: 3 }, (_, idx) => ({
      pathIndex: 0,
      progress: (idx * 0.05),
    }))
  );

  const [data, setData] = useState<TelemetryData>({
    rpm: 0,
    gear: 1,
    speed: 0,
    throttle: 0,
    brake: 0,
    brakeBias: 54.5,
    tc1: 5,
    tcCut: 4,
    abs: 3,
    map: 1,
    fuel: 60.0,
    fuelAvgPerLap: 2.7,
    lapsCompleted: 1,
    totalLaps: 25,
    airTemp: 22.1,
    trackTemp: 25.8,
    clouds: 0.2,
    rain: 0.0,
    flags: { yellow: false, blue: false, red: false, black: false },
    lapTime: 0,
    tires: {
      FL: { temp: 20.3, press: 20.1, wear: 0.01 },
      FR: { temp: 20.3, press: 20.1, wear: 0.01 },
      RL: { temp: 20.1, press: 20.0, wear: 0.01 },
      RR: { temp: 20.1, press: 20.0, wear: 0.01 },
    },
    carPositions: [
      { x: TRACK_POINTS[0].x, y: TRACK_POINTS[0].y, color: "#FF0000" },
      { x: TRACK_POINTS[0].x, y: TRACK_POINTS[0].y, color: "#00FF00" },
      { x: TRACK_POINTS[0].x, y: TRACK_POINTS[0].y, color: "#00BFFF" },
    ],
    lapData: [], // Renomeado
  });

  const revMatchTimer = useRef(0);
  const flagTimer = useRef(0); // Timer para bandeiras
  const driverMovement = initialMovementState.current[0];

  useEffect(() => {
    const id = setInterval(() => {
      setData((prev) => {
        let nextBrake = prev.brake;
        let nextThrottle = prev.throttle;
        let nextSpeed = prev.speed;
        let nextGear = prev.gear;
        let nextRPM = prev.rpm;
        let peakRPM = false;
        let nextLapsCompleted = prev.lapsCompleted;

        const newRevMatchTimer = Math.max(0, revMatchTimer.current - 1);
        revMatchTimer.current = newRevMatchTimer;

        // --- Lógica de Simulação de Condução (Acelerador/Freio) ---
        const currentSegmentIndex = driverMovement.pathIndex;
        const currentProgress = driverMovement.progress;
        const brakingTarget = BRAKING_POINTS.find(p => p.segmentIndex === currentSegmentIndex);

        if (revMatchTimer.current === 0) {
          nextBrake = Math.max(0, prev.brake - 15);
          const accelBase = (prev.gear >= 5) ? 98 : 85;
          nextThrottle = prev.throttle + (accelBase - prev.throttle) * 0.15;
          nextThrottle = Math.min(100, nextThrottle);
        }

        if (brakingTarget && currentProgress > brakingTarget.brakeStart) {
          const targetBrake = brakingTarget.brakeTarget + (Math.random() * 5);
          nextBrake = Math.min(100, prev.brake + (targetBrake - prev.brake) * 0.3);
          nextThrottle = Math.max(0, prev.throttle - 50);

          if (prev.gear > brakingTarget.targetGear) {
            const reductionRate = (currentSegmentIndex === 3 || currentSegmentIndex === 6) ? 2 : 1;
            nextGear = Math.max(brakingTarget.targetGear, prev.gear - reductionRate);
            if (nextGear !== prev.gear) {
              peakRPM = true;
              revMatchTimer.current = 2;
            }
          }
        }

        if (revMatchTimer.current > 0) {
          nextRPM = RPM_LIMIT + 1500;
        }

        // --- Física e RPM ---
        const accel = (nextThrottle / 100) * 12;
        const braking = (nextBrake / 100) * 18;
        const drag = 0.005 * prev.speed * prev.speed / 100;
        nextSpeed = prev.speed + accel - braking - drag + (Math.random() - 0.5) * 1.0;
        nextSpeed = Math.max(0, Math.min(MAX_SPEED, nextSpeed));

        if (prev.gear < 6 && nextSpeed >= GEAR_SPEEDS[prev.gear] - 10 && prev.throttle > 50) {
          nextGear = prev.gear + 1;
        }

        if (!peakRPM && revMatchTimer.current === 0) {
          const minRPM = 1000;
          const gearSpeedDiff = GEAR_SPEEDS[nextGear] - (GEAR_SPEEDS[nextGear - 1] || 0);
          let targetRPM = minRPM +
            ((nextSpeed - (GEAR_SPEEDS[nextGear - 1] || 0)) / Math.max(1, gearSpeedDiff)) * (RPM_LIMIT - minRPM);
          if (!isFinite(targetRPM) || isNaN(targetRPM) || targetRPM < minRPM) {
            targetRPM = minRPM;
          }
          nextRPM = prev.rpm + (targetRPM - prev.rpm) * 0.35 + (Math.random() - 0.5) * 100;
          nextRPM = Math.max(minRPM - 500, Math.min(RPM_LIMIT + 500, nextRPM));
        }

        const nextLapTime = prev.lapTime + interval / 1000;

        // --- Lógica de Path-Following (Movimento) ---
        const newPositions: CarPosition[] = prev.carPositions.map((car, idx) => {
          const movementState = initialMovementState.current[idx];
          const speedToUse = idx === 0 ? nextSpeed : nextSpeed * (1 - (idx * 0.03)); 
          const progressAdvance = (speedToUse * interval) / MOVEMENT_SCALE_FACTOR;
          let currentProgress = movementState.progress;
          let currentPathIndex = movementState.pathIndex;
          const segmentLength = TRACK_LENGTHS[currentPathIndex];
          const progressStep = segmentLength > 0 ? progressAdvance / segmentLength : 0;
          currentProgress += progressStep;
          if (currentProgress >= 1.0) {
            const overshoot = currentProgress - 1.0;
            currentPathIndex = (currentPathIndex + 1) % TOTAL_TRACK_POINTS;
            const newSegmentLength = TRACK_LENGTHS[currentPathIndex];
            currentProgress = overshoot * (segmentLength / newSegmentLength);
          }
          const nextStartPoint = TRACK_POINTS[currentPathIndex];
          const nextEndPoint = TRACK_POINTS[(currentPathIndex + 1) % TOTAL_TRACK_POINTS];
          const x = nextStartPoint.x + (nextEndPoint.x - nextStartPoint.x) * currentProgress;
          const y = nextStartPoint.y + (nextEndPoint.y - nextStartPoint.y) * currentProgress;
          initialMovementState.current[idx] = { pathIndex: currentPathIndex, progress: currentProgress };
          return { ...car, x, y };
        });

        // --- Lógica de Volta (Lap) ---
        let lapData = [...prev.lapData];
        let resetLapTime = false;
        if (driverMovement.pathIndex === 0 && driverMovement.progress < 0.05 && prev.lapTime > 10) {
          const lapTimeSeconds = 210 + (Math.random() * 10);
          lapData.push({ time: lapTimeSeconds, sectors: [35, 35, 35, 35, 35, 35] });
          nextLapsCompleted = prev.lapsCompleted + 1;
          resetLapTime = true;
        }
        
        // --- NOVAS SIMULAÇÕES ---
        // Pneus
        const tireChange = (() => {
          const updated: TelemetryData["tires"] = { ...prev.tires };
          (Object.keys(updated) as (keyof TelemetryData["tires"])[]).forEach((pos) => {
            const t = updated[pos];
            updated[pos] = {
              temp: Math.max(20, t.temp + (nextThrottle / 100) * 0.4 - (nextBrake / 100) * 0.2 + (Math.random() - 0.5) * 0.1),
              press: t.press + (Math.random() - 0.5) * 0.01,
              wear: Math.min(1, t.wear + (nextThrottle / 100) * 0.0001 + (nextBrake / 100) * 0.00005),
            };
          });
          return updated;
        })();
        
        // Fuel
        const nextFuel = Math.max(0, prev.fuel - (nextThrottle / 100) * (0.005 / (1000/interval)));
        
        // Weather
        const nextClouds = Math.max(0, Math.min(1, prev.clouds + (Math.random() - 0.5) * 0.001));
        const nextRain = (prev.clouds > 0.7 && Math.random() < 0.01) ? Math.max(0, Math.min(1, prev.rain + (Math.random() - 0.5) * 0.01)) : 0;

        // Flags
        let nextFlags = { ...prev.flags };
        if (flagTimer.current > 0) {
            flagTimer.current -= interval;
        } else if (Math.random() < 0.005) {
            flagTimer.current = 5000;
            if (Math.random() > 0.5) nextFlags.yellow = true;
            else nextFlags.blue = true;
        } else {
            nextFlags = { yellow: false, blue: false, red: false, black: false };
        }
        
        // Configs do Carro
        let nextTc1 = prev.tc1;
        let nextAbs = prev.abs;
        let nextMap = prev.map;
        if (Math.random() < 0.002) {
            nextTc1 = Math.max(1, Math.min(10, prev.tc1 + (Math.random() > 0.5 ? 1 : -1)));
            nextAbs = Math.max(1, Math.min(10, prev.abs + (Math.random() > 0.5 ? 1 : -1)));
            nextMap = Math.max(1, Math.min(5, prev.map + (Math.random() > 0.5 ? 1 : -1)));
        }

        return {
          ...prev,
          lapTime: resetLapTime ? 0 : nextLapTime,
          rpm: nextRPM,
          speed: nextSpeed,
          gear: nextGear,
          throttle: nextThrottle,
          brake: nextBrake,
          carPositions: newPositions,
          lapData: lapData,
          tires: tireChange,
          airTemp: prev.airTemp + (Math.random() - 0.5) * 0.01,
          trackTemp: prev.trackTemp + (Math.random() - 0.5) * 0.02,
          fuel: nextFuel,
          lapsCompleted: nextLapsCompleted,
          clouds: nextClouds,
          rain: nextRain,
          flags: nextFlags,
          tc1: nextTc1,
          abs: nextAbs,
          map: nextMap,
          boost: 0.9,
          tcCut: 4,
          fuelAvgPerLap: 2.7,
          totalLaps: 25,
        };
      });
    }, interval);

    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return data;
}

// --- COMPONENTE AUXILIAR PARA INFO BOX ---
type InfoBoxProps = {
  label: string;
  value: string;
  color?: string;
  scale: number;
}
const InfoBox: React.FC<InfoBoxProps> = ({ label, value, color = "#FFF", scale }) => {
  return (
    <View style={[styles.infoBox, { minWidth: 60 * scale, marginRight: 5 * scale, marginBottom: 5 * scale }]}>
      <Text style={[styles.infoLabel, { fontSize: 10 * scale }]}>{label}</Text>
      <Text style={[styles.infoValue, { color, fontSize: 16 * scale }]}>
        {value}
      </Text>
    </View>
  );
}

// --- NOVO: COMPONENTE DE BANDEIRA (PISCANDO NO FUNDO) ---
const FlagDisplay: React.FC<{ flags: TelemetryData['flags'] }> = ({ flags }) => {
  
  // Animação de Opacidade
  const animatedOpacity = useRef(new Animated.Value(0)).current;
  // Referência para controlar o loop de animação
  const animationLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Determina a cor e se há uma bandeira ativa
  let flagColor = "#0B0014"; // Cor de fundo padrão (quando apaga)
  const isFlagActive = flags.yellow || flags.blue || flags.red || flags.black;

  if (flags.yellow) flagColor = "#FFFF00";
  else if (flags.blue) flagColor = "#0000FF";
  else if (flags.red) flagColor = "#FF0000";
  else if (flags.black) flagColor = "#000000";

  useEffect(() => {
    if (isFlagActive) {
      // Inicia o loop de piscar
      // Apenas inicia se não houver um loop rodando
      if (!animationLoop.current) {
        animationLoop.current = Animated.loop(
          Animated.sequence([
            // Pisca até 30% de opacidade
            Animated.timing(animatedOpacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
            // Apaga
            Animated.timing(animatedOpacity, { toValue: 0.0, duration: 500, useNativeDriver: true })
          ])
        );
        animationLoop.current.start();
      }
    } else {
      // Se não houver bandeira, para o loop e zera a opacidade
      if (animationLoop.current) {
        animationLoop.current.stop();
        animationLoop.current = null;
      }
      Animated.timing(animatedOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start();
    }
    
    // Limpeza ao desmontar
    return () => {
      animationLoop.current?.stop();
    };
  // Depende das bandeiras individuais para reiniciar a lógica
  }, [flags.yellow, flags.blue, flags.red, flags.black, animatedOpacity]);
  
  // Retorna uma View animada que fica no fundo
  return (
    <Animated.View 
      style={[
        styles.flagContainer, 
        { 
          backgroundColor: flagColor, 
          opacity: animatedOpacity // Opacidade controlada pela animação
        }
      ]} 
    />
  );
};

// --- NOVO: GRÁFICO DE PNEU ---
const TireInfoGraphic: React.FC<{ label: string; tireData: TireData; scale: number; tempUnit: 'C' | 'F'; convertTemp: (c: number) => number; }> = 
  ({ label, tireData, scale, tempUnit, convertTemp }) => {
  
  const { temp, press, wear } = tireData;
  const wearPercent = (1 - wear) * 100; // 1.0 = gasto, 0.0 = novo
  
  const radius = 30 * scale;
  const strokeWidth = 8 * scale;
  const size = (radius + strokeWidth) * 2;
  const center = radius + strokeWidth;
  const circumference = 2 * Math.PI * radius;
  
  const offset = circumference * wear;

  let wearColor = "#00FF66"; // Verde
  if (wearPercent < 70) wearColor = "#FFFF00"; // Amarelo
  if (wearPercent < 40) wearColor = "#ff7b4bff"; // Laranja
  if (wearPercent < 15) wearColor = "#ff0000ff"; // Vermelho
  
  const displayTemp = convertTemp(temp);
  const unitSymbol = tempUnit === 'C' ? '°C' : '°F';

  return (
    <View style={[styles.tireGraphicContainer, { width: size, marginHorizontal: 5 * scale }]}>
      <Text style={[styles.tireGraphicLabel, { fontSize: 14 * scale }]}>{label}</Text>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Fundo (Pneu Gasto) */}
        <Circle cx={center} cy={center} r={radius} stroke="#333" strokeWidth={strokeWidth} fill="none" />
        {/* Preenchimento (Pneu Bom) */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={wearColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          rotation="-90"
          originX={center}
          originY={center}
          strokeLinecap="round"
        />
        {/* Texto Interno */}
        <SvgText x={center} y={center - 5 * scale} textAnchor="middle" fill="#FFF" fontSize={14 * scale} fontWeight="bold">{displayTemp.toFixed(0)}{unitSymbol}</SvgText>
        <SvgText x={center} y={center + 15 * scale} textAnchor="middle" fill="#AAA" fontSize={12 * scale}>{press.toFixed(1)}</SvgText>
      </Svg>
      <Text style={[styles.tireGraphicWear, { fontSize: 14 * scale, color: wearColor }]}>{wearPercent.toFixed(0)}%</Text>
    </View>
  );
};

// --- COMPONENTE TELEMETRY SCREEN (Layout Atualizado) ---
export default function TelemetryScreen() {
  const { width, height } = useWindowDimensions();
  const scaleFactor = Math.min(width / 1400, height / 800, 1); 

  const data = useTelemetrySimulator(100);
  const [showAllLaps, setShowAllLaps] = useState(false);

  // LÓGICA DE TEMPERATURA
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const convertCtoF = (celsius: number) => (celsius * 9) / 5 + 32;
  const convertTemp = (celsius: number) => tempUnit === 'C' ? celsius : convertCtoF(celsius);

  const bestLapTime = data.lapData.length
    ? Math.min(...data.lapData.map((l) => l.time))
    : 9999;

  // Animações
  const throttleAnim = useState(new Animated.Value(0))[0];
  const brakeAnim = useState(new Animated.Value(0))[0];
  const gearAnim = useState(new Animated.Value(1))[0];
  const [flash, setFlash] = useState(false);

  const lastLapIsRecord =
    data.lapData.length > 0 && data.lapData[data.lapData.length - 1].time === bestLapTime;

  // LÓGICA DE FLASH DE RPM
  useEffect(() => {
    const isFlashing = data.rpm >= RPM_LIMIT * 0.95 || data.rpm > RPM_LIMIT;
    setFlash(isFlashing);
    
    if (isFlashing) {
      Animated.sequence([
        Animated.timing(gearAnim, { toValue: 1.35, duration: 60, useNativeDriver: true }),
        Animated.timing(gearAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [data.rpm, gearAnim]);

  // LÓGICA DE ANIMAÇÃO DE ACELERADOR E FREIO
  useEffect(() => {
    Animated.timing(throttleAnim, {
      toValue: data.throttle,
      duration: 50,
      useNativeDriver: false,
    }).start();
    Animated.timing(brakeAnim, {
      toValue: data.brake,
      duration: 50,
      useNativeDriver: false,
    }).start();
  }, [data.throttle, data.brake, throttleAnim, brakeAnim]);

  // Lógica do Delta (sem alteração)
  const delta = bestLapTime === 9999 ? 0 : data.lapTime - bestLapTime;
  const maxDeltaAbs = 5.0;
  const deltaPct = Math.min(1, Math.abs(delta) / maxDeltaAbs);
  const deltaColor =
    lastLapIsRecord && delta >= 0
      ? "#9D4EDD"
      : delta < 0
      ? "#00FF66"
      : "#FF4D4D";
  const deltaText =
    bestLapTime === 9999
      ? "No best lap"
      : delta > 0
      ? `+${delta.toFixed(2)}s`
      : `${delta.toFixed(2)}s`;

  // Formatar MM:SS.SS
  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(1, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
  };

  // Path do Mapa (sem alteração)
  const trackPath = useMemo(() => {
    return TRACK_POINTS.map((p, i) => {
      if (i === 0) return `M${p.x} ${p.y}`;
      return `L${p.x} ${p.y}`;
    }).join(' ') + ` L${TRACK_POINTS[0].x} ${TRACK_POINTS[0].y}`;
  }, []);

  return (
    <View style={styles.container}>
      {/* SOBREPOSIÇÃO DE BANDEIRA (PISCANDO NO FUNDO) */}
      <FlagDisplay flags={data.flags} />
      
      {/* TOP: Delta Bar (Adicionado zIndex: 1) */}
      <View style={[styles.deltaBarContainer, { transform: [{ scale: scaleFactor }], width: "95%", zIndex: 1 }]}>
        <Text style={[styles.trackName, { fontSize: 18 * scaleFactor }]}>
          Circuit de la Sarthe (Le Mans)
        </Text>
        <View style={styles.deltaBarBackground}>
          <View style={styles.deltaBarCenterLine} />
          <View
            style={[
              styles.deltaBarFill,
              {
                width: `${deltaPct * 50}%`,
                backgroundColor: deltaColor,
                alignSelf: delta < 0 ? "flex-end" : "flex-start",
                transform: [{ translateX: delta > 0 ? -100 : 0 }]
              },
            ]}
          />
        </View>
        <Text style={[styles.deltaLabel, { color: deltaColor }]}>
          {deltaText}
        </Text>
      </View>

      {/* 1. LINHA PRINCIPAL (Adicionado zIndex: 1) */}
      <View style={[styles.mainRow, { width: "95%", justifyContent: "space-between", zIndex: 1 }]}>

        {/* 1.0 Mapa da Pista (sem alteração) */}
        <View style={[styles.trackContainer, { width: 200 * scaleFactor, height: 200 * scaleFactor, marginRight: 20 * scaleFactor }]}>
          <Svg width={200 * scaleFactor} height={200 * scaleFactor} viewBox="0 0 200 200">
            <Path
              d={trackPath}
              stroke="#ffffffff"
              strokeWidth={4}
              fill="#1A0026"
            />
            {BRAKING_POINTS.map((bp, index) => {
              const start = TRACK_POINTS[bp.segmentIndex];
              const end = TRACK_POINTS[(bp.segmentIndex + 1) % TOTAL_TRACK_POINTS];
              const x = start.x + (end.x - start.x) * bp.brakeStart;
              const y = start.y + (end.y - start.y) * bp.brakeStart;
              return (
                <Circle key={`bp-${index}`} cx={x} cy={y} r={5} fill="#FF4D4D" opacity={0.9} />
              );
            })}
            {data.carPositions.map((car, idx) => (
              <Circle key={idx} cx={car.x} cy={car.y} r={7} fill={car.color} stroke="#0B0014" strokeWidth={1.5} />
            ))}
          </Svg>
        </View>

        {/* 1.1 Throttle Bar (sem alteração) */}
        <View style={[styles.verticalBarWrapper, { width: 40 * scaleFactor }]}>
          <Text style={[styles.smallLabel, { fontSize: 12 * scaleFactor }]}>THR</Text>
          <View style={[styles.verticalBarTrack, { height: 150 * scaleFactor, width: 20 * scaleFactor, borderRadius: 10 * scaleFactor }]}>
            <Animated.View
              style={[
                styles.verticalBarFill,
                {
                  height: throttleAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                  backgroundColor: "#00ff66ff",
                  borderTopLeftRadius: 10 * scaleFactor,
                  borderTopRightRadius: 10 * scaleFactor,
                },
              ]}
            />
          </View>
          <Text style={[styles.smallValue, { fontSize: 12 * scaleFactor }]}>{Math.round(data.throttle)}%</Text>
        </View>

        {/* 1.2 Centro Gear/RPM/Speed (COM BARRA DE LED HORIZONTAL) */}
        <View style={[styles.centerBlock, { marginHorizontal: 20 * scaleFactor }]}>
          
          {/* --- INÍCIO DA NOVA BARRA DE LED --- */}
          <View style={[styles.ledContainer, { width: 320 * scaleFactor, height: 20 * scaleFactor }]}>
            {Array.from({ length: 20 }).map((_, i) => {
              const totalLEDs = 20;
              const ledWidth = (300 * scaleFactor) / totalLEDs;
              const ledHeight = 18 * scaleFactor;

              const fillPct = (data.rpm / RPM_LIMIT) * totalLEDs;
              const isActive = i < Math.round(fillPct);

              // Gradiente de cor
              let color = "#00FF00"; // verde
              if (i > 5) color = "#FFFF00"; // amarelo
              if (i > 13) color = "#FF0000"; // vermelho
              if (flash) color = "#6A00FF"; // Flash

              return (
                <View
                  key={i}
                  style={[
                    styles.led,
                    {
                      width: ledWidth,
                      height: ledHeight,
                      marginHorizontal: 1 * scaleFactor,
                      borderRadius: 3 * scaleFactor,
                      backgroundColor: isActive ? color : "#222",
                      shadowColor: isActive ? color : "#000",
                      shadowOpacity: isActive ? 0.8 : 0,
                      shadowRadius: 5,
                      elevation: isActive ? 5 : 0,
                      opacity: isActive ? 1 : 0.2,
                    },
                  ]}
                />
              );
            })}
          </View>
          {/* --- FIM DA NOVA BARRA DE LED --- */}

          <Animated.Text
            style={[
              styles.gearText,
              { transform: [{ scale: gearAnim }], fontSize: 90 * scaleFactor },
              { color: flash ? "#2600ffff" : "#FFF" }
            ]}
          >
            {data.gear}
          </Animated.Text>
          
          <Text style={[styles.rpmTextCenter, { fontSize: 24 * scaleFactor, color: flash ? "#FF0000" : "#E0AAFF" }]}>
            {Math.round(data.rpm).toLocaleString("PT-BR")} RPM
          </Text>

          <Text style={[styles.speedTextCenter, { fontSize: 32 * scaleFactor }]}>
            {Math.round(data.speed)} km/h
          </Text>
        </View>

        {/* 1.3 Brake Bar (era 1.4) */}
        <View style={[styles.verticalBarWrapper, { width: 40 * scaleFactor, marginLeft: 10 * scaleFactor }]}>
          <Text style={[styles.smallLabel, { fontSize: 12 * scaleFactor }]}>BRK</Text>
          <View style={[styles.verticalBarTrack, { height: 150 * scaleFactor, width: 20 * scaleFactor, borderRadius: 10 * scaleFactor }]}>
            <Animated.View
              style={[
                styles.verticalBarFill,
                {
                  height: brakeAnim.interpolate({
                    inputRange: [0, 100],
                    outputRange: ["0%", "100%"],
                  }),
                  backgroundColor: "#ff0000ff",
                  borderTopLeftRadius: 10 * scaleFactor,
                  borderTopRightRadius: 10 * scaleFactor,
                },
              ]}
            />
          </View>
          <Text style={[styles.smallValue, { fontSize: 12 * scaleFactor }]}>{Math.round(data.brake)}%</Text>
        </View>

        {/* 1.4 Lap Time Box (era 1.5) */}
        <View style={[styles.timeLapBox, { width: 120 * scaleFactor, marginLeft: 20 * scaleFactor, padding: 10 * scaleFactor }]}>
          {!showAllLaps ? (
            <>
              <Text style={[styles.label, { fontSize: 14 * scaleFactor }]}>Lap Time</Text>
              <Text style={[styles.value, { fontSize: 24 * scaleFactor }]}>{formatTime(data.lapTime)}</Text>
              <Text
                style={[
                  styles.deltaNumeric,
                  {
                    fontSize: 16 * scaleFactor,
                    color: deltaColor,
                    fontWeight: lastLapIsRecord ? "700" : "500",
                  },
                ]}
              >
                {bestLapTime === 9999 ? "--:--.--" : `${delta < 0 ? '' : '+'}${delta.toFixed(2)}s`}
              </Text>
              <TouchableOpacity onPress={() => setShowAllLaps(true)}>
                <Text style={{ color: "#0af", marginTop: 5 * scaleFactor, fontSize: 14 * scaleFactor }}>▶ Voltas</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={() => setShowAllLaps(false)}>
                <Text style={{ color: "#0af", marginBottom: 5 * scaleFactor, fontSize: 10 * scaleFactor }}>◀ Voltar</Text>
              </TouchableOpacity>
              <ScrollView style={{ maxHeight: 200 * scaleFactor }}>
                {data.lapData.slice().reverse().map((lap, idx) => (
                  <View key={data.lapData.length - 1 - idx} style={{ marginBottom: 5 }}>
                    <Text
                      style={{
                        color: lap.time === bestLapTime ? "#9D4EDD" : "#fff",
                        fontWeight: lap.time === bestLapTime ? "bold" : "normal",
                        fontSize: 14 * scaleFactor,
                      }}
                    >
                      Lap {data.lapData.length - idx}: {formatTime(lap.time)}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </View>

      {/* --- SEGUNDA LINHA: NOVOS DADOS E GRÁFICOS DE PNEUS (Adicionado zIndex: 1) --- */}
      <View style={[styles.bottomRow, { width: "95%", marginTop: 15 * scaleFactor, zIndex: 1 }]}>
        
        {/* Bloco 1: Gráficos de Pneus */}
        <View style={styles.tireGraphicsBlock}>
          <TireInfoGraphic label="FL" tireData={data.tires.FL} scale={scaleFactor} tempUnit={tempUnit} convertTemp={convertTemp} />
          <TireInfoGraphic label="FR" tireData={data.tires.FR} scale={scaleFactor} tempUnit={tempUnit} convertTemp={convertTemp} />
          <TireInfoGraphic label="RL" tireData={data.tires.RL} scale={scaleFactor} tempUnit={tempUnit} convertTemp={convertTemp} />
          <TireInfoGraphic label="RR" tireData={data.tires.RR} scale={scaleFactor} tempUnit={tempUnit} convertTemp={convertTemp} />
          <TouchableOpacity onPress={() => setTempUnit(prev => (prev === 'C' ? 'F' : 'C'))} style={styles.unitToggle}>
            <Text style={{color: '#AAA', fontSize: 12 * scaleFactor}}>°C / °F</Text>
          </TouchableOpacity>
        </View>
        
        {/* Bloco 2: Configs do Carro */}
        <View style={styles.infoBlock}>
          <Text style={styles.blockTitle}>CARRO</Text>
          <InfoBox label="B.BIAS" value={data.brakeBias.toFixed(1)} scale={scaleFactor} color="#FFB703" />
          <InfoBox label="TC1" value={data.tc1.toString()} scale={scaleFactor} color="#00FFC0" />
          <InfoBox label="TC.CUT" value={data.tcCut.toString()} scale={scaleFactor} color="#00FFC0" />
          <InfoBox label="ABS" value={data.abs.toString()} scale={scaleFactor} color="#00FFC0" />
          <InfoBox label="MAP" value={data.map.toString()} scale={scaleFactor} color="#00FFC0" />
        </View>
        
        {/* Bloco 3: Info de Corrida */}
        <View style={styles.infoBlock}>
          <Text style={styles.blockTitle}>CORRIDA</Text>
          <InfoBox label="LAPS" value={`${data.lapsCompleted}/${data.totalLaps}`} scale={scaleFactor} color="#FFF" />
          <InfoBox label="FUEL" value={data.fuel.toFixed(1) + ' L'} scale={scaleFactor} color="#FF4500" />
          <InfoBox label="AVG" value={data.fuelAvgPerLap.toFixed(1) + ' L'} scale={scaleFactor} color="#FF4500" />
          <InfoBox label="FST" value={bestLapTime === 9999 ? "--:--.--" : formatTime(bestLapTime)} scale={scaleFactor} color="#9D4EDD" />
        </View>
        
        {/* Bloco 4: Clima */}
        <View style={styles.infoBlock}>
          <Text style={styles.blockTitle}>CLIMA</Text>
          <InfoBox label="AIR" value={convertTemp(data.airTemp).toFixed(1) + (tempUnit === 'C' ? '°C' : '°F')} scale={scaleFactor} color="#89CFF0" />
          <InfoBox label="TRACK" value={convertTemp(data.trackTemp).toFixed(1) + (tempUnit === 'C' ? '°F' : '°F')} scale={scaleFactor} color="#89CFF0" />
          <InfoBox label="CLOUDS" value={`${(data.clouds * 100).toFixed(0)}%`} scale={scaleFactor} color="#AAA" />
          <InfoBox label="RAIN" value={`${(data.rain * 100).toFixed(0)}%`} scale={scaleFactor} color="#00BFFF" />
        </View>
      
      </View>
    </View>
  );
}

// --- ESTILOS (Atualizados) ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0014",
    alignItems: "center",
    paddingTop: Platform.OS === 'web' ? 20 : 40,
  },
  // --- BANDEIRA (MODIFICADO) ---
  flagContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0, // Fica atrás do conteúdo (que terá zIndex: 1)
  },
  // flagText: { ... } // Removido
  // --- Barra Delta (Topo) ---
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
  deltaBarBackground: {
    width: "50%",
    height: 10,
    marginHorizontal: 10,
    borderRadius: 5,
    backgroundColor: "#222",
    overflow: "hidden",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  deltaBarCenterLine: {
    position: "absolute",
    width: 5,
    height: "50%",
    backgroundColor: "#FFF",
    zIndex: 10,
  },
  deltaBarFill: {
    height: "90%",
    position: "absolute",
    left: "50%",
    right: "50%",
  },
  deltaLabel: {
    fontWeight: "bold",
    fontSize: 18,
    flex: 1,
    textAlign: "right",
  },
  // --- Linha Principal ---
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  trackContainer: {
    backgroundColor: "#1A0026",
    borderRadius: 10,
    overflow: "hidden",
  },
  verticalBarWrapper: {
    alignItems: "center",
    justifyContent: "space-between",
  },
  smallLabel: {
    color: "#AAA",
    fontWeight: "bold",
    marginBottom: 5,
  },
  smallValue: {
    color: "#FFF",
    fontWeight: "bold",
    marginTop: 5,
  },
  verticalBarTrack: {
    backgroundColor: "#222",
    overflow: "hidden",
    alignItems: "flex-start",
    justifyContent: "flex-end", // Cresce de baixo para cima
  },
  verticalBarFill: {
    width: "100%",
  },
  centerBlock: {
    alignItems: "center",
    justifyContent: "center",
    // minWidth removido para flexibilidade
  },
  gearText: {
    fontSize: 90,
    fontWeight: "900",
    color: "#FFF",
    lineHeight: 90,
    marginTop: 5, // Espaço da barra de LED
  },
  rpmTextCenter: {
    fontSize: 24,
    fontWeight: "600",
    marginTop: 5,
  },
  speedTextCenter: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fffb00ff",
    marginTop: 5,
  },
  // --- Leds (RE-ADICIONADO) ---
  ledContainer: {
    flexDirection: "row",
    marginBottom: 10, // Espaço entre a barra e a marcha
  },
  led: {
    // Estilos de LED são aplicados inline
  },
  // --- Caixa de Tempo ---
  timeLapBox: {
    backgroundColor: "#1A0026",
    borderRadius: 8,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  label: {
    color: "#AAA",
    fontWeight: "bold",
  },
  value: {
    color: "#FFF",
    fontWeight: "bold",
  },
  deltaNumeric: {
    marginTop: 5,
  },
  // --- Linha de Baixo (NOVA) ---
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  // --- Gráficos de Pneus (NOVO) ---
  tireGraphicsBlock: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    padding: 10,
    marginRight: 10,
  },
  tireGraphicContainer: {
    alignItems: 'center',
  },
  tireGraphicLabel: {
    color: '#AAA',
    fontWeight: 'bold',
    marginBottom: 5,
  },
  tireGraphicWear: {
    fontWeight: 'bold',
    marginTop: 5,
  },
  unitToggle: {
    position: 'absolute',
    top: 5,
    right: 10,
  },
  // --- Blocos de Info (NOVO) ---
  infoBlock: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
    padding: 10,
    flex: 1,
    marginHorizontal: 5,
  },
  blockTitle: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 5,
  },
  infoBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  infoLabel: {
    color: "#AAA",
    fontWeight: "bold",
  },
  infoValue: {
    fontWeight: "bold",
  },
});