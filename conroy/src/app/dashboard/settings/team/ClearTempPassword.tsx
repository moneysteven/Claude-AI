"use client";

import { useEffect } from "react";
import { clearTempPasswordAction } from "./actions";

/** Deletes the one-time password cookie as soon as the page has shown it. */
export function ClearTempPassword() {
  useEffect(() => {
    void clearTempPasswordAction();
  }, []);
  return null;
}
