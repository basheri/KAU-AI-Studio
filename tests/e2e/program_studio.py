"""E2E (signed-in): guided, upload and redevelopment intake; confirm assumptions; architecture with
alignment; Arabic RTL and English LTR with keyboard. Creates and removes a throwaway user.
Run: python3 tests/e2e/program_studio.py (dev server on :8080)."""
import asyncio, json, os, subprocess, sys, tempfile
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE = os.path.join(tempfile.gettempdir(), "e2e_program_studio.json")
STORAGE_KEY = "sb-lgpmzzyanugnveoaipnj-auth-token"

def helper(cmd):
    env = {**os.environ, "NODE_PATH": os.path.join(ROOT, "node_modules")}
    subprocess.run(["bun", os.path.join(ROOT, "tests/e2e/throwaway.ts"), cmd, STATE], check=True, env=env, cwd=ROOT)

async def main() -> int:
    failures = []
    helper("create")
    d = json.load(open(STATE))
    shots = os.path.join(tempfile.gettempdir(), "e2e_shots"); os.makedirs(shots, exist_ok=True)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(headless=True)
            page = await (await b.new_context(viewport={"width": 1280, "height": 1800})).new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            await page.goto(BASE)
            await page.evaluate("([k,v]) => { localStorage.setItem(k, v); localStorage.setItem('kau-studio-locale','en'); }",
                                [STORAGE_KEY, json.dumps(d["session"])])
            await page.goto(f"{BASE}/program-architect")
            await page.get_by_role("heading", name="New program brief").wait_for(timeout=20000)
            if await page.get_attribute("html", "dir") != "ltr": failures.append("english not ltr")

            # 1. Guided idea, keyboard only for the title and submit
            await page.get_by_label("Title (English)").focus()
            await page.keyboard.type("Applied Data Science")
            await page.get_by_role("button", name="Create brief").focus()
            await page.keyboard.press("Enter")
            await page.get_by_role("heading", name="Applied Data Science").wait_for(timeout=15000)

            # 2. Upload: invalid type rejected explicitly, then a text proposal is read
            await page.get_by_role("radio", name="Proposal or document upload").check()
            await page.get_by_label("Title (English)").fill("Uploaded proposal")
            png = os.path.join(tempfile.gettempdir(), "bad.png"); open(png, "wb").write(b"\x89PNG")
            await page.set_input_files("#in-file", png)
            await page.get_by_role("button", name="Create brief").click()
            if "not accepted" not in (await page.get_by_role("alert").first.inner_text()): failures.append("bad type not rejected")
            txt = os.path.join(tempfile.gettempdir(), "proposal.txt")
            open(txt, "w").write("Rationale: Regional demand for analytics\nRisks: Faculty capacity\n")
            await page.set_input_files("#in-file", txt)
            await page.get_by_role("button", name="Create brief").click()
            await page.get_by_text("Fields read from the file").wait_for(timeout=20000)
            if await page.locator("#bf-rationale-en").input_value() != "Regional demand for analytics": failures.append("extracted value missing")

            # 3. Redevelopment preserves source
            await page.get_by_role("radio", name="Existing program redevelopment").check()
            await page.get_by_label("Title (English)").fill("BSc Statistics redevelopment")
            await page.get_by_label("Existing program source").fill("Title: BSc Statistics\nAssumptions: Same credit load")
            await page.get_by_role("button", name="Create brief").click()
            await page.get_by_text("Original source (read-only)").wait_for(timeout=15000)

            # Confirm assumptions and start architecture
            await page.get_by_role("button", name="Confirm assumptions").click()
            await page.get_by_text("Assumptions confirmed").wait_for(timeout=15000)
            await page.get_by_role("button", name="Start program architecture").click()
            await page.get_by_role("heading", name="Program outcomes").wait_for(timeout=15000)

            # Build a small aligned architecture
            add = lambda i: page.get_by_role("button", name="Add").nth(i)
            await add(0).click()  # program outcome
            await page.locator("input[id^='c-n-']").first.fill("PLO1")
            await page.locator("input[id^='e-n-']").first.fill("Analyse data")
            await page.get_by_role("button", name="Add").nth(1).click()  # course
            await page.locator("input[id^='c-n-']").nth(1).fill("STAT101")
            await page.locator("input[id^='e-n-']").nth(1).fill("Statistics")
            for i in (2, 3):  # course outcome, activity
                await page.get_by_role("button", name="Add").nth(i).click()
            await page.locator("input[id^='c-n-']").nth(2).fill("CLO1"); await page.locator("input[id^='e-n-']").nth(2).fill("Apply tests")
            await page.locator("input[id^='c-n-']").nth(3).fill("A1"); await page.locator("input[id^='e-n-']").nth(3).fill("Lab")
            await page.get_by_role("button", name="Add").nth(4).click()  # assessment
            await page.locator("input[id^='c-n-']").nth(4).fill("E1"); await page.locator("input[id^='e-n-']").nth(4).fill("Exam")
            if "without assessment" not in await page.locator("[aria-live=polite]").inner_text(): failures.append("defects not shown")
            plo = page.locator("li").filter(has=page.locator("input[value='PLO1']"))
            await plo.get_by_role("checkbox", name="STAT101").check(); await plo.get_by_role("checkbox", name="CLO1").check()
            clo = page.locator("li").filter(has=page.locator("input[value='CLO1']"))
            await clo.get_by_role("checkbox", name="A1").check()
            act = page.locator("li").filter(has=page.locator("input[value='A1']"))
            await act.get_by_role("checkbox", name="E1").check()
            await page.get_by_text("Fully aligned").wait_for()
            await page.get_by_role("button", name="Save draft").click()
            await page.get_by_text("Unsaved changes").wait_for(state="detached", timeout=15000)
            await page.screenshot(path=os.path.join(shots, "en.png"))

            # Arabic RTL
            await page.get_by_role("button", name="Switch language to Arabic").click() if await page.get_by_role("button", name="Switch language to Arabic").count() else None
            await page.evaluate("localStorage.setItem('kau-studio-locale','ar')"); await page.reload()
            await page.get_by_role("heading", name="موجز برنامج جديد").wait_for(timeout=20000)
            if await page.get_attribute("html", "dir") != "rtl": failures.append("arabic not rtl")
            await page.get_by_role("radio", name="فكرة موجّهة").focus()
            await page.keyboard.press("ArrowRight")
            await page.screenshot(path=os.path.join(shots, "ar.png"))
            if errors: failures.append(f"page errors: {errors}")
            await b.close()
    finally:
        helper("cleanup")
    for f in failures: print("FAIL:", f)
    print("PASS" if not failures else f"{len(failures)} failure(s)")
    return 1 if failures else 0

sys.exit(asyncio.run(main()))
