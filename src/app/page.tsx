"use client";

import { redirect } from "next/navigation";

export default function DefaultPage() {
  redirect("/mitgliederliste");
  return null;
}
