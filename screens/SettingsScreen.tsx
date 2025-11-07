import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>⚙️ Configurações</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0014", alignItems: "center", justifyContent: "center" },
  text: { color: "#E0AAFF", fontSize: 18 },
});
