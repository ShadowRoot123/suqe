import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { theme } from "@/ui/theme";
import { makeUuid } from "@/util/uuid";

export type ToastKind = "success" | "error" | "info";

export type ToastOptions = {
  kind?: ToastKind;
  title?: string;
  message: string;
  durationMs?: number;
};

type ToastItem = {
  id: string;
  kind: ToastKind;
  title?: string;
  message: string;
  expiresAt: number;
};

type ToastContextValue = {
  show: (opts: ToastOptions) => void;
  dismiss: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider(props: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback((opts: ToastOptions) => {
    const now = Date.now();
    const durationMs = Math.max(1500, Math.min(opts.durationMs ?? 3500, 15000));
    const item: ToastItem = {
      id: makeUuid(),
      kind: opts.kind ?? "info",
      title: opts.title,
      message: opts.message,
      expiresAt: now + durationMs,
    };
    setToasts((prev) => [item, ...prev].slice(0, 3));
  }, []);

  React.useEffect(() => {
    if (toasts.length === 0) return;
    const nextExpiry = Math.min(...toasts.map((t) => t.expiresAt));
    const delay = Math.max(0, nextExpiry - Date.now());
    const handle = setTimeout(() => {
      const now = Date.now();
      setToasts((prev) => prev.filter((t) => t.expiresAt > now));
    }, delay + 10);
    return () => clearTimeout(handle);
  }, [toasts]);

  const value = React.useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
        <View
          pointerEvents="box-none"
          style={{
            paddingLeft: theme.spacing.md,
            paddingRight: theme.spacing.md,
            paddingBottom: Math.max(theme.spacing.md, insets.bottom + theme.spacing.sm),
            gap: theme.spacing.sm,
          }}
        >
          {toasts.map((t) => {
            const colors =
              t.kind === "error"
                ? { bg: theme.colors.dangerBg, border: theme.colors.danger, text: theme.colors.danger }
                : t.kind === "success"
                  ? { bg: theme.colors.successBg, border: theme.colors.success, text: theme.colors.success }
                  : { bg: theme.colors.surfaceAlt, border: theme.colors.border, text: theme.colors.text };

            return (
              <Pressable
                key={t.id}
                onPress={() => dismiss(t.id)}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.bg,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: theme.radii.md,
                    paddingVertical: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.md,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                {t.title ? <Text style={{ fontWeight: "700", marginBottom: 2, color: colors.text }}>{t.title}</Text> : null}
                <Text style={{ color: colors.text }}>{t.message}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = React.useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return {
    show: value.show,
    dismiss: value.dismiss,
    success: (message: string, opts?: Omit<ToastOptions, "kind" | "message">) =>
      value.show({ kind: "success", message, ...opts }),
    error: (message: string, opts?: Omit<ToastOptions, "kind" | "message">) => value.show({ kind: "error", message, ...opts }),
    info: (message: string, opts?: Omit<ToastOptions, "kind" | "message">) => value.show({ kind: "info", message, ...opts }),
  };
}

