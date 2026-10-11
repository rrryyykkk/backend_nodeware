/**
 * tests/security.test.ts
 * Unit tests: Security utilities (isSafeRedirect, magic byte detection, rate limit key format)
 */
import { describe, expect, test } from "bun:test";
import { isSafeRedirect } from "../src/middleware/security.middleware";

describe("Open Redirect Prevention (isSafeRedirect)", () => {
  const OLD_ENV = process.env.FRONTEND_URL;

  test("relative path / aman", () => {
    expect(isSafeRedirect("/dashboard")).toBe(true);
  });

  test("relative path /auth/callback aman", () => {
    expect(isSafeRedirect("/auth/callback?code=abc")).toBe(true);
  });

  test("protocol-relative // tidak aman", () => {
    expect(isSafeRedirect("//evil.com")).toBe(false);
  });

  test("absolute URL ke domain lain tidak aman", () => {
    expect(isSafeRedirect("https://evil.com/phishing")).toBe(false);
  });

  test("javascript: scheme tidak aman", () => {
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
  });

  test("data: URI tidak aman", () => {
    expect(isSafeRedirect("data:text/html,<script>alert(1)</script>")).toBe(false);
  });
});