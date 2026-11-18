import { useSyncExternalStore } from "react";

// The same condition as the phone media query in styles.css: a narrow
// portrait phone or a short landscape phone.
export const PHONE_LAYOUT_QUERY = "(max-width: 650px), (max-height: 500px)";

export const matchesPhoneLayout = (): boolean =>
  window.matchMedia(PHONE_LAYOUT_QUERY).matches;

const subscribe = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(PHONE_LAYOUT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export const usePhoneLayout = (): boolean =>
  useSyncExternalStore(subscribe, matchesPhoneLayout);
