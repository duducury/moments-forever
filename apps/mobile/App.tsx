import { colors } from "@moments-forever/config";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "./src/auth/auth-provider";
import type { RootStackParamList } from "./src/navigation";
import { CollectionScreen } from "./src/screens/collection-screen";
import { CreateMemoryScreen } from "./src/screens/create-memory-screen";
import { HomeScreen } from "./src/screens/home-screen";
import { LoginScreen } from "./src/screens/login-screen";
import { SettingsScreen } from "./src/screens/settings-screen";

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

export default function App() {
  return (
    <AuthProvider>
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
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Conta" }} />
          <Stack.Screen
            name="Collection"
            component={CollectionScreen}
            options={{ title: "Coleção" }}
          />
          <Stack.Screen
            name="CreateMemory"
            component={CreateMemoryScreen}
            options={{ title: "Nova memória" }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: "Ajustes" }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );
}
