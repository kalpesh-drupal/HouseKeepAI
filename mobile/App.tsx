import { StatusBar } from "expo-status-bar";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

const LOGIN_PATH = "/login?mobile=1&callbackUrl=/m";

function buildUrls() {
  const urls: string[] = [];
  const add = (base?: string) => {
    if (!base) return;
    const trimmed = base.replace(/\/$/, "");
    const full = trimmed.includes("/login") ? trimmed : `${trimmed}${LOGIN_PATH}`;
    if (!urls.includes(full)) urls.push(full);
  };
  add(process.env.EXPO_PUBLIC_APP_URL);
  add(process.env.EXPO_PUBLIC_LAN_URL);
  return urls;
}

const URLS = buildUrls();

export default function App() {
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const url = URLS[index] || URLS[0];

  const source = useMemo(() => {
    if (!url) return { uri: "about:blank" };
    const headers: Record<string, string> = {};
    if (url.includes("loca.lt")) {
      headers["Bypass-Tunnel-Reminder"] = "true";
    }
    return { uri: url, headers };
  }, [url, nonce]);

  function fail(description?: string) {
    if (index < URLS.length - 1) {
      setIndex((i) => i + 1);
      setError(null);
      return;
    }
    setError(description || "Could not reach the hotel app");
  }

  if (!url) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.title}>Missing app URL</Text>
          <Text style={styles.body}>
            Set EXPO_PUBLIC_APP_URL in mobile/.env, then restart Expo (npx expo start --tunnel).
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.title}>Could not load HouseKeepAI</Text>
          <Text style={styles.body}>{error}</Text>
          <Text style={styles.body}>{url}</Text>
          <Text style={styles.hint}>
            Make sure Next.js is running on port 3006 and the tunnel URL in mobile/.env is current.
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => {
              setError(null);
              setIndex(0);
              setNonce((n) => n + 1);
            }}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          key={`${url}-${nonce}`}
          source={source}
          style={styles.webview}
          originWhitelist={["*"]}
          allowsBackForwardNavigationGestures
          startInLoadingState
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          onError={(e) => fail(e.nativeEvent.description)}
          onHttpError={(e) => {
            if (e.nativeEvent.statusCode >= 500) fail(`HTTP ${e.nativeEvent.statusCode}`);
          }}
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={styles.body}>Opening login…</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 48,
  },
  webview: {
    flex: 1,
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginTop: 6,
  },
  hint: {
    fontSize: 12,
    color: "#888",
    textAlign: "center",
    marginTop: 12,
    paddingHorizontal: 8,
  },
  button: {
    marginTop: 20,
    backgroundColor: "#1e40af",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
