# Usability test plan — KAU AI Studio

**Goal:** confirm that a first-time faculty user can take a program from idea to "review requested" without help, and find the screens that need fixing.
**Decision it informs:** go / no-go for the pilot, and the top 3 fixes before it.

## 1. Participants (5 people, 60 minutes each)
| # | Profile | Why |
|---|---|---|
| 1–2 | Faculty member who designs courses, never used the platform | Main user; first-time experience |
| 3 | Program coordinator / head of department | Reviews and approves |
| 4 | Quality / accreditation officer | Compliance and exceptions |
| 5 | Faculty member who works mainly in English | Tests the English (LTR) path |

Five users find most usability problems; add a second round of 5 after fixes rather than a larger first round.

## 2. Setup (before each session)
1. Test project with the participant as **contributor**, plus a second account as **reviewer** (needed for the independent-approval rule).
2. One active compliance ruleset with 2 rules; one pending documented exception.
3. AI assistance **on** for sessions 1–3, **off** for 4–5 (the product must work without AI).
4. Screen and voice recording with consent; Arabic interface by default, participant may switch.

## 3. Tasks (read aloud; do not show the path)
| # | Task | Success when | Target time |
|---|---|---|---|
| T1 | "Start a new program brief for a micro-credential in data literacy." | Brief created | 3 min |
| T2 | "Complete the brief and confirm its assumptions." (AI on: accept the AI drafts) | Assumptions confirmed, no pending AI text | 10 min |
| T3 | "Build the program structure: 2 outcomes and 1 course with its outcomes and assessment." | Architecture saved, no alignment defects | 12 min |
| T4 | "Fill in the course description and learning outcomes." | Course specification saved; references verified | 8 min |
| T5 | "Find out what is still needed before you can send this program for review." | Participant reads the journey tracker or readiness checklist correctly | 2 min |
| T6 | "Send the program for review." | Review requested | 3 min |
| T7 (reviewer) | "Check what is waiting for you today and act on it." | Opens My work and decides the review | 5 min |
| T8 (quality) | "Approve the pending exception." | Exception approved with a comment | 4 min |

## 4. What to measure
| Measure | How | Pass mark |
|---|---|---|
| Task success | Completed without help | ≥ 80% per task |
| Time on task | From reading the task to success | ≤ target time |
| Errors | Wrong screen, wrong button, error message shown | ≤ 2 per task |
| Help requests | Participant asks the moderator | 0 on T1, T5, T6, T7 |
| Error message clarity | After each error: "What do you think went wrong?" | Participant explains it correctly |
| SUS (System Usability Scale) | 10-item questionnaire at the end (Arabic version) | ≥ 70 |
| Single Ease Question | 1–7 after each task | ≥ 5 average |

## 5. Moderator script (short)
1. "We are testing the system, not you. Think aloud."
2. Read each task; do not point or explain. If stuck for 2 minutes, give one hint and record it.
3. After each task: Single Ease Question.
4. At the end: SUS, then "What was the most confusing moment?" and "What would you remove?"

## 6. Watch for (known risks from this increment)
- Do participants notice **autosave** ("All changes saved"), or look for a Save button?
- Do they use the **Go** button on the journey tracker, or navigate by the menu?
- Do they understand **why** "Request review" is disabled from the checklist alone?
- Does the **independent approver** rule confuse single-person teams?
- Is the **AI draft** label understood as "you must accept this"?

## 7. Analysis and report (within 1 week)
1. List every problem with: task, how many participants hit it, severity (1 cosmetic – 4 blocks the task).
2. Fix severity 3–4 first; retest with 5 new participants.
3. Report: success rate per task, SUS score, top 5 problems, decision (pilot / fix first).

## 8. Ethics and data
- Consent form; recordings kept on university storage, deleted after the report.
- Use a test project only; no student or staff personal data typed into the platform or AI tools.
