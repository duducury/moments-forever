import { colors } from "@moments-forever/config";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { AuthProvider } from "./src/auth/auth-provider";
import { getLazyScreen } from "./src/lazy-screens";
import type { RootStackParamList } from "./src/navigation";
import { HomeScreen } from "./src/screens/home-screen";

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.paper,
    card: colors.paper,
    text: colors.ink,
    border: colors.border,
    primary: colors.accent,
  },
};

SplashScreen.setOptions({
  duration: 350,
  fade: true,
});

function AppNavigation() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="dark" />
      <Stack.Navigator
        screenOptions={{
          headerBackTitle: "Voltar",
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="Login"
          options={{ title: "Conta" }}
          getComponent={() => getLazyScreen("Login")}
        />
        <Stack.Screen
          name="Collection"
          options={{ title: "Coleção" }}
          getComponent={() => getLazyScreen("Collection")}
        />
        <Stack.Screen
          name="CreateMemory"
          options={{ title: "Nova memória" }}
          getComponent={() => getLazyScreen("CreateMemory")}
        />
        <Stack.Screen
          name="Settings"
          options={{ title: "Ajustes" }}
          getComponent={() => getLazyScreen("Settings")}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppNavigation />
    </AuthProvider>
  );
}
