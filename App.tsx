import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as ScreenOrientation from "expo-screen-orientation";

import DashboardScreen from "./screens/DashboardScreen";
import MapScreen from "./screens/MapScreen";
import TelemetryScreen from "./screens/TelemetryScreen";
import SettingsScreen from "./screens/SettingsScreen";

const Tab = createMaterialTopTabNavigator();

export default function App() {
  useEffect(() => {
    // Força orientação horizontal
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    );
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Tab.Navigator
          // ADICIONE ESTA LINHA:
          initialRouteName="Telemetry" 
          
          screenOptions={{
            tabBarShowLabel: false,
            tabBarIndicatorStyle: { backgroundColor: "#E9D8FD" },
            swipeEnabled: true,
            lazy: true,
          }}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="Map" component={MapScreen} />
          <Tab.Screen name="Telemetry" component={TelemetryScreen} />
          <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
        <StatusBar style="light" />
      </NavigationContainer>
    </GestureHandlerRootView>
  );
}