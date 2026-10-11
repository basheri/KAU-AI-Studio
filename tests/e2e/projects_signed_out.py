"""E2E: signed-out Projects page shows the KAU OTP entry and blocks non-KAU emails
before any OTP request leaves the browser. Run: bun run test:e2e (dev server on :8080)."""
import asyncio
import os
import sys
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")


async def main() -> int:
    failures = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})
        otp_requests = []
        page.on("request", lambda r: otp_requests.append(r.url) if "/auth/v1/otp" in r.url else None)
        await page.route("**/auth/v1/otp**", lambda route: route.fulfill(status=200, body="{}", content_type="application/json"))

        await page.goto(f"{BASE}/projects", wait_until="networkidle")
        if await page.get_attribute("html", "dir") != "rtl":
            failures.append("default direction is not rtl")
        email = page.get_by_label("البريد الجامعي")
        await email.wait_for(timeout=15000)
        if await page.get_by_label("عنوان المشروع").count():
            failures.append("signed-out user sees project creation form")

        await email.fill("someone@gmail.com")
        await page.get_by_role("button", name="إرسال الرمز").click()
        await page.get_by_role("alert").wait_for()
        await page.wait_for_timeout(500)
        if otp_requests:
            failures.append("OTP requested for non-KAU email")

        await email.fill(" Test.User@KAU.edu.sa ")
        await page.get_by_role("button", name="إرسال الرمز").click()
        await page.get_by_label("رمز التحقق").wait_for(timeout=10000)
        if len(otp_requests) != 1:
            failures.append(f"expected one OTP request for KAU email, got {len(otp_requests)}")

        await page.get_by_role("button", name="English").click()
        if await page.get_attribute("html", "dir") != "ltr":
            failures.append("English did not switch to ltr")
        await browser.close()

    for f in failures:
        print("FAIL:", f)
    print("E2E PASSED" if not failures else "E2E FAILED")
    return 1 if failures else 0


sys.exit(asyncio.run(main()))
