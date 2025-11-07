import React, { useEffect, useState } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";

interface Driver {
  id: number;
  name: string;
  x: number;
  y: number;
  color: string;
}

export default function MapScreen() {
  const [drivers, setDrivers] = useState<Driver[]>([
    { id: 1, name: "Car 01", x: 40, y: 60, color: "#FF0000" },
    { id: 2, name: "Car 02", x: 80, y: 160, color: "#00FF00" },
    { id: 3, name: "Car 03", x: 200, y: 120, color: "#00BFFF" },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDrivers((prev) =>
        prev.map((d) => ({
          ...d,
          x: (d.x + Math.random() * 15) % 300,
          y: (d.y + Math.random() * 10) % 200,
        }))
      );
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <Svg height="250" width="350">
        <Rect x="10" y="10" width="330" height="230" stroke="#fff" strokeWidth="2" fill="none" />
        {drivers.map((d) => (
          <TouchableOpacity key={d.id} onPress={() => alert(`${d.name} 🚗`)}>
            <Circle cx={d.x} cy={d.y} r={8} fill={d.color} />
            <SvgText x={d.x + 12} y={d.y - 8} fill="#fff" fontSize="12" fontWeight="bold">
              {d.name}
            </SvgText>
          </TouchableOpacity>
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0014",
    alignItems: "center",
    justifyContent: "center",
  },
});
