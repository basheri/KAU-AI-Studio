"""E2E (signed-in): aligned architecture -> course content -> blocks -> autosave -> learner preview;
English LTR, Arabic RTL, keyboard, and a phone-sized viewport. Creates and removes a throwaway user.
Run: python3 tests/e2e/course_studio.py (dev server on :8080)."""
import asyncio, json, os, subprocess, sys, tempfile
from playwright.async_api import async_playwright

BASE = os.environ.get("E2E_BASE_URL", "http://localhost:8080")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATE = os.path.join(tempfile.gettempdir(), "e2e_course_studio.json")
# supabase-js keeps the session under sb-<project ref>-auth-token; the ref is the first label of the URL host.
_SB_URL = os.environ.get("VITE_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
STORAGE_KEY = "sb-" + (_SB_URL.split("//")[-1].split(".")[0] or "local") + "-auth-token"

def helper(cmd):
    env = {**os.environ, "NODE_PATH": os.path.join(ROOT, "node_modules")}
    subprocess.run(["bun", os.path.join(ROOT, "tests/e2e/throwaway.ts"), cmd, STATE], check=True, env=env, cwd=ROOT)

async def build_architecture(page):
    await page.goto(f"{BASE}/program-architect")
    await page.get_by_role("heading", name="New program brief").wait_for(timeout=20000)
    await page.get_by_label("Title (English)").fill("Applied Statistics")
    await page.get_by_role("button", name="Create brief").click()
    await page.get_by_role("heading", name="Applied Statistics").wait_for(timeout=15000)
    await page.locator("#bf-assumptions-en").fill("Cohort of 30")
    await page.get_by_role("button", name="Save draft").click()
    await page.get_by_text("Unsaved changes").wait_for(state="detached", timeout=15000)
    await page.get_by_role("button", name="Confirm assumptions").click()
    await page.get_by_text("Assumptions confirmed").wait_for(timeout=15000)
    await page.get_by_role("button", name="Start program architecture").click()
    await page.get_by_role("heading", name="Program outcomes").wait_for(timeout=15000)
    vals = [("PLO1", "Analyse data"), ("STAT101", "Statistics"), ("CLO1", "Apply tests"), ("A1", "Lab"), ("E1", "Exam")]
    for i, (c, l) in enumerate(vals):
        await page.get_by_role("button", name="Add").nth(i).click()
        await page.locator("input[id^='c-n-']").nth(i).fill(c)
        await page.locator("input[id^='e-n-']").nth(i).fill(l)
    plo = page.locator("li").filter(has=page.locator("input[value='PLO1']"))
    await plo.get_by_role("checkbox", name="STAT101").check(); await plo.get_by_role("checkbox", name="CLO1").check()
    await page.locator("li").filter(has=page.locator("input[value='CLO1']")).get_by_role("checkbox", name="A1").check()
    await page.locator("li").filter(has=page.locator("input[value='A1']")).get_by_role("checkbox", name="E1").check()
    await page.get_by_text("Fully aligned").wait_for()
    await page.get_by_role("button", name="Save draft").click()
    await page.get_by_text("Unsaved changes").wait_for(state="detached", timeout=15000)

async def main() -> int:
    failures = []
    helper("create")
    d = json.load(open(STATE))
    shots = os.path.join(tempfile.gettempdir(), "e2e_shots"); os.makedirs(shots, exist_ok=True)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(headless=True)
            ctx = await b.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            await page.goto(BASE)
            await page.evaluate("([k,v]) => { localStorage.setItem(k, v); localStorage.setItem('kau-studio-locale','en'); }",
                                [STORAGE_KEY, json.dumps(d["session"])])
            await build_architecture(page)

            await page.goto(f"{BASE}/course-studio")
            await page.get_by_role("button", name="Create course content").wait_for(timeout=20000)
            await page.get_by_role("button", name="Create course content").click()
            await page.get_by_role("button", name="Add module").wait_for(timeout=15000)
            if await page.get_attribute("html", "dir") != "ltr": failures.append("english not ltr")

            await page.get_by_role("button", name="Add module").click()
            await page.get_by_label("Module 1 · English").fill("Foundations")
            await page.get_by_label("Lesson · English").fill("Why test hypotheses")
            # keyboard: choose block type and add with Enter
            await page.get_by_label("Block type").select_option("rich_text")
            await page.get_by_role("button", name="Add block").focus(); await page.keyboard.press("Enter")
            await page.get_by_label("Text", exact=True).first.fill("### Overview\nWe compare **two means**.\n- sample\n- test")
            await page.get_by_label("Block type").select_option("knowledge_check")
            await page.get_by_role("button", name="Add block").click()
            await page.get_by_label("Question", exact=True).fill("Which test compares two means?")
            await page.get_by_label("Choice", exact=True).nth(0).fill("t-test"); await page.get_by_label("Choice", exact=True).nth(1).fill("chi-square")
            await page.get_by_role("radio", name="Correct answer 1").check()
            await page.get_by_label("Feedback when correct").fill("Correct.")
            await page.get_by_label("Feedback when incorrect").fill("Review the overview.")
            await page.get_by_label("Linked outcome").select_option("CLO1")
            await page.get_by_label("Block type").select_option("embed")
            await page.get_by_role("button", name="Add block").click()
            await page.get_by_label("Embed address (https, approved sites only)").fill("https://evil.example/x")
            await page.get_by_label("Embed title").fill("Bad embed")
            if "Embed site is not approved" not in await page.get_by_role("region", name="Content validation").inner_text():
                failures.append("embed defect not shown")
            # delete with accessible confirmation
            await page.get_by_role("button", name="Delete: Approved embed 3").click()
            await page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
            await page.get_by_role("alertdialog").wait_for(state="detached")
            # reorder: move knowledge check up then back down
            await page.get_by_role("button", name="Move up: Knowledge check 2").click()
            await page.get_by_role("button", name="Move down: Knowledge check 1").click()
            await page.get_by_text("All changes saved").wait_for(timeout=20000)
            if "No critical problems" not in await page.get_by_role("region", name="Content validation").inner_text():
                failures.append("valid course still has critical defects")

            # reload: content persisted
            await page.reload()
            await page.locator("button", has_text="Course: STAT101").first.click(timeout=20000)
            await page.get_by_label("Question", exact=True).wait_for(timeout=15000)
            if await page.get_by_label("Question", exact=True).input_value() != "Which test compares two means?": failures.append("not persisted")

            # learner preview
            await page.get_by_role("button", name="Learner preview").click()
            prev = page.get_by_test_id("learner-preview")
            await prev.get_by_role("heading", level=2, name="Why test hypotheses").wait_for()
            await prev.get_by_role("heading", level=3, name="Overview").wait_for()
            await prev.get_by_role("radio", name="t-test").check()
            await prev.get_by_role("button", name="Check answer").click()
            await prev.get_by_text("Correct.").wait_for()
            if not await prev.get_by_role("button", name="Previous lesson").is_disabled(): failures.append("prev not disabled")
            await page.screenshot(path=os.path.join(shots, "course_en.png"))

            # Arabic RTL
            await page.evaluate("localStorage.setItem('kau-studio-locale','ar')"); await page.reload()
            await page.locator("button", has_text="Course: STAT101").first.click(timeout=20000)
            await page.get_by_role("button", name="معاينة المتعلم").click()
            if await page.get_attribute("html", "dir") != "rtl": failures.append("arabic not rtl")
            if not await page.get_by_role("button", name="الدرس السابق").count(): failures.append("arabic prev label missing")
            await page.screenshot(path=os.path.join(shots, "course_ar.png"))

            # phone viewport smoke
            mob = await (await b.new_context(viewport={"width": 390, "height": 844})).new_page()
            mob.on("pageerror", lambda e: errors.append(str(e)))
            await mob.goto(BASE)
            await mob.evaluate("([k,v]) => { localStorage.setItem(k, v); localStorage.setItem('kau-studio-locale','en'); }",
                               [STORAGE_KEY, json.dumps(d["session"])])
            await mob.goto(f"{BASE}/course-studio")
            await mob.locator("button", has_text="Course: STAT101").first.click(timeout=20000)
            await mob.get_by_role("button", name="Add block").wait_for(timeout=15000)
            overflow = await mob.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            if overflow > 2:
                wide = await mob.evaluate("""[...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 2 && r.width > 200; }).slice(0, 12).map(e => e.tagName + '.' + (e.className||'').toString().slice(0,50) + '#' + (e.id||'') + ' w' + Math.round(e.getBoundingClientRect().width))""")
                failures.append(f"mobile horizontal overflow {overflow}px: {wide}")
            await mob.screenshot(path=os.path.join(shots, "course_mobile.png"))
            if errors: failures.append(f"page errors: {errors}")
            await b.close()
    finally:
        helper("cleanup")
    for f in failures: print("FAIL:", f)
    print("PASS" if not failures else f"{len(failures)} failure(s)")
    return 1 if failures else 0

sys.exit(asyncio.run(main()))
