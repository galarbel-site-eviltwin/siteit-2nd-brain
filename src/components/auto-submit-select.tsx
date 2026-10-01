"use client";

import type { ComponentProps } from "react";

// A select that saves its form as soon as it changes, so there is no separate "Save" to wonder about.
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}
