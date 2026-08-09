import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Image, StyleSheet, Text, View } from "react-native";

import brandLogo from "../../assets/brand-logo.png";
import type { RootStackParamList } from "../navigation";
import { Button, Screen, typography } from "../ui";

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

export function HomeScreen({ navigation }: Props) {
  return (
    <Screen>
      <View style={styles.content}>
        <Image
          accessibilityLabel="Logo do Moments Forever"
          resizeMode="contain"
          source={brandLogo}
          style={styles.brandLogo}
        />
        <Text style={typography.eyebrow}>Suas histórias, sempre por perto</Text>
        <Text style={typography.title}>Colecione momentos, não coisas.</Text>
        <Text style={typography.body}>
          Um espaço privado para guardar viagens e reviver o que realmente
          importa.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button onPress={() => navigation.navigate("Collection")}>
          Abrir minha coleção
        </Button>
        <Button secondary onPress={() => navigation.navigate("Login")}>
          Entrar ou criar conta
        </Button>
        <Button secondary onPress={() => navigation.navigate("Settings")}>
          Ajustes
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
  },
  brandLogo: {
    width: "100%",
    maxWidth: 360,
    aspectRatio: 1,
    alignSelf: "center",
    marginBottom: 24,
  },
  actions: {
    gap: 12,
    paddingTop: 28,
  },
});
