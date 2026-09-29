import { useSyncExternalStore } from "react";
import { normalizeLocale, translate, type BenchLocalLocale } from "@/shared/i18n";

export type { BenchLocalLocale };

const LOCALE_STORAGE_KEY = "benchlocal.locale";

let currentLocale: BenchLocalLocale = "zh-CN";
try {
  currentLocale = normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
} catch {
  currentLocale = "zh-CN";
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getLocale(): BenchLocalLocale {
  return currentLocale;
}

export function setLocale(locale: BenchLocalLocale | string): void {
  const next = normalizeLocale(locale);
  if (next === currentLocale) {
    return;
  }
  currentLocale = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    // localStorage 不可用时忽略持久化
  }
  emit();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 翻译函数：key 为中文原文，args 填充 {0}、{1} 占位符。 */
export function t(key: string, ...args: unknown[]): string {
  return translate(currentLocale, key, ...args);
}

/** 在组件中订阅语言变化（订阅后语言切换会触发重渲染）。 */
export function useLocale(): BenchLocalLocale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}
